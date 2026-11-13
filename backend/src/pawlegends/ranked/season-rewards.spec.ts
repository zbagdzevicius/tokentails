import { rankedRewardItems, RankedSeasonRewardsService, RANKED_SEASON_REWARDS } from './season-rewards';
import { SEASONS } from '../pawlegends-catalog';

/*
 * Ranked season rewards (gap plan P4, SOCIAL-RANKED.md §7.10): existing cosmetics from the recorded peak, granted by a
 * leased job after the season ends, once (the items are upserts, the peak flips rewarded false → true).
 */

const S1_END = new Date(SEASONS.find(s => s.id === 's1')!.endsAt);
const AFTER = new Date(S1_END.getTime() + 3_600_000);
const BEFORE = new Date(S1_END.getTime() - 3_600_000);

type Doc = Record<string, any>;

/** The few query shapes the job sends, on plain arrays. */
function matches(doc: Doc, f: Record<string, any>): boolean {
    return Object.entries(f).every(([k, v]) => {
        if (k === '$or') return (v as Doc[]).some(x => matches(doc, x));
        if (k === 'peaks.season') return !(doc.peaks ?? []).some((p: Doc) => p.season === v.$ne);
        if (k === 'peaks' && v.$elemMatch)
            return (doc.peaks ?? []).some((p: Doc) => Object.entries(v.$elemMatch).every(([a, b]) => p[a] === b));
        if (k === 'revokedAt') return v.$exists ? doc.revokedAt !== undefined : doc.revokedAt === undefined;
        if (v && typeof v === 'object' && '$nin' in v) return !(v.$nin as unknown[]).includes(doc[k]);
        return doc[k] === v;
    });
}

function fakes(rows: Doc[], ownedRows: Doc[] = []) {
    const writes: string[] = [];
    const ratings = {
        docs: rows,
        find: (f: Doc) => ({
            limit: (n: number) => ({ lean: async () => rows.filter(d => matches(d, f)).slice(0, n) }),
        }),
        updateOne: async (f: Doc, u: Doc) => {
            const d = rows.find(x => matches(x, f));
            if (!d) return { modifiedCount: 0 };
            writes.push(String(d._id));
            if (u.$set?.['peaks.$.rewarded']) {
                const p = d.peaks.find((x: Doc) => Object.entries(f.peaks.$elemMatch).every(([a, b]) => x[a] === b));
                p.rewarded = true;
            }
            if (u.$push?.peaks) d.peaks = [...(d.peaks ?? []), u.$push.peaks];
            if (u.$inc?.v) d.v = (d.v ?? 0) + u.$inc.v;
            return { modifiedCount: 1 };
        },
    };
    const owned = {
        docs: ownedRows,
        updateOne: async (f: Doc, u: Doc, o?: Doc) => {
            const d = ownedRows.find(x => matches(x, f));
            if (d) {
                if (u.$unset?.revokedAt !== undefined) delete d.revokedAt;
                if (u.$set) Object.assign(d, u.$set);
                return { modifiedCount: 1 };
            }
            if (o?.upsert) ownedRows.push({ ...u.$setOnInsert });
            return { modifiedCount: 0 };
        },
    };
    return { ratings, owned, writes };
}

const row = (id: string, over: Doc = {}): Doc => ({
    _id: `${id}:ranked`,
    accountId: id,
    queue: 'ranked',
    season: 's1',
    placementsLeft: 0,
    tierIdx: 7,
    peakIdx: 8,
    peaks: [],
    v: 3,
    ...over,
});

const service = (f: ReturnType<typeof fakes>, now: Date) =>
    new RankedSeasonRewardsService(f.ratings as any, f.owned as any, { now: () => now });

describe('ranked season rewards', () => {
    it('each tier up to the peak earns its frame; Alley and above also the season coat', () => {
        const t = RANKED_SEASON_REWARDS.s1;
        expect(rankedRewardItems('s1', 0)).toEqual([t.frames[0]]);
        expect(rankedRewardItems('s1', 5)).toEqual([t.frames[0], t.frames[1]]);
        expect(rankedRewardItems('s1', 6)).toEqual([t.frames[0], t.frames[1], t.frames[2], t.coat]);
        expect(rankedRewardItems('s1', 12)).toEqual([...t.frames, t.coat]);
        expect(rankedRewardItems('s9', 12)).toEqual([]);
    });

    it('rewards are existing season items (frames and a coat that ship already)', () => {
        const known = new Set(SEASONS.flatMap(s => [...s.free, ...s.premium].map(r => r.item)));
        const t = RANKED_SEASON_REWARDS.s1;
        for (const item of [...t.frames, t.coat]) expect(known.has(item)).toBe(true);
    });

    it('nothing before the season ends', async () => {
        const f = fakes([row('a')]);
        expect(await service(f, BEFORE).run()).toEqual({ granted: 0, rows: 0 });
        expect(f.owned.docs).toHaveLength(0);
    });

    it('after the end: grants from the peak, records it rewarded, and a second run grants nothing (idempotent)', async () => {
        const f = fakes([row('a'), row('b', { peakIdx: 1, tierIdx: 1 }), row('c', { placementsLeft: 2 })]);
        const first = await service(f, AFTER).run();
        expect(first).toEqual({ granted: 4 + 1, rows: 2 });
        expect(
            f.owned.docs
                .filter(d => d.accountId === 'a')
                .map(d => d.item)
                .sort()
        ).toEqual(['frame.s1.sprout', 'frame.s1.harvest', 'frame.s1.lantern', 'coat.clem.s1_starlight'].sort());
        expect(f.owned.docs.every(d => d.source === 'ranked')).toBe(true);
        expect(f.ratings.docs[0].peaks).toEqual([{ season: 's1', peakIdx: 8, finalIdx: 7, rewarded: true }]);
        // an unplaced player earns nothing
        expect(f.owned.docs.some(d => d.accountId === 'c')).toBe(false);
        const owned = f.owned.docs.length;
        expect(await service(f, AFTER).run()).toEqual({ granted: 0, rows: 0 });
        expect(f.owned.docs).toHaveLength(owned);
    });

    it('a peak the lazy soft reset recorded (rewarded false) flips to true; an owned item is left as it is', async () => {
        const f = fakes(
            [
                row('a', {
                    season: 's2',
                    tierIdx: 3,
                    peakIdx: 3,
                    peaks: [{ season: 's1', peakIdx: 2, finalIdx: 2, rewarded: false }],
                }),
            ],
            [{ accountId: 'a', item: 'frame.s1.sprout', source: 'pass' }]
        );
        expect(await service(f, AFTER).run()).toEqual({ granted: 1, rows: 1 });
        expect(f.ratings.docs[0].peaks[0].rewarded).toBe(true);
        expect(f.owned.docs).toEqual([{ accountId: 'a', item: 'frame.s1.sprout', source: 'pass' }]);
        expect(await service(f, AFTER).run()).toEqual({ granted: 0, rows: 0 });
    });

    it('a revoked item is restored as a ranked reward', async () => {
        const f = fakes(
            [row('a', { peakIdx: 0, tierIdx: 0 })],
            [{ accountId: 'a', item: 'frame.s1.sprout', source: 'purchase', revokedAt: BEFORE }]
        );
        await service(f, AFTER).run();
        expect(f.owned.docs).toEqual([
            { accountId: 'a', item: 'frame.s1.sprout', source: 'ranked', claim: 'ranked:s1:kitten' },
        ]);
    });
});
