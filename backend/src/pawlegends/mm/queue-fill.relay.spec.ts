import { createHash } from 'crypto';
import { bootMm, heroesOf, lockAndLoad, nextTick } from './mm-relay.helper-spec';
import { identityHash } from './mm-room.schema';
import type { TestClient } from '../party/relay-test-client.helper-spec';

/*
 * Founder, 2026-11-20: "matchmaking is broken, even though it's filled with bots it's still keep going" and "you haven't
 * implemented showing actual champ + name + country here instead of 'bot'". Over real sockets, the relay's clock skewed:
 * a search with a leaver wait searches (and fills) only once the wait ends, never moving to co-op meanwhile; a cancel
 * and a new search start the trickle again; a side choice is kept; a matched co-op room shows its bot seats as players.
 */

type Boot = Awaited<ReturnType<typeof bootMm>>;

/** A guest whose identity has `left` leaver events in the last day (the 60 s wait from two). */
async function leaver(b: Boot, key: string, left: number): Promise<TestClient> {
    const hash = identityHash(`guest:${createHash('sha256').update(`guest:${key}`).digest('hex').slice(0, 24)}`);
    const at = new Date(Date.now() + b.skew.ms - 86_400_000);
    for (let i = 0; i < left; i++)
        await b.mmRooms.create({
            _id: `left-${key}-${i}`,
            queue: 'casual',
            region: 'eu',
            side: 'cat',
            difficulty: 'normal',
            sim: 'x',
            fill: [],
            queueMs: {},
            members: [
                {
                    slot: 0,
                    identityHash: hash,
                    accountId: null,
                    joinedTick: 0,
                    backfill: false,
                    ratingAtStart: null,
                    event: 'left',
                    eventTick: 10,
                },
            ],
            outcome: 'lost',
            endedAt: at,
            createdAt: at,
        });
    const c = await b.client();
    c.hello({ guestKey: key, hint: { maxDifficulty: 'normal', newbie: false, matches: 12 } });
    await c.until(() => c.last('welcome'));
    return c;
}

/** Accept the found casual match; resolves with the pick view. */
async function accept(c: TestClient): Promise<Record<string, any>> {
    const f = await c.until(() => c.last('mm.found'));
    c.send({ t: 'mm.accept', match: f.match, yes: true });
    return c.until(() => (c.last('party')?.phase === 'pick' ? c.last('party') : null));
}

describe('Quick Play queue fill (founder, 2026-11-20)', () => {
    jest.setTimeout(120_000);

    it('a 60 s leaver wait: the search clock starts when it ends, no co-op switch, a team of bots 15 s later', async () => {
        const b = await bootMm();
        try {
            const c = await leaver(b, `leaver-fill-${process.pid}`, 2);
            c.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            const st = await c.until(() => c.last('mm.status'));
            expect(st).toMatchObject({ queue: 'casual', waitedMs: 0, warn: 'leaver' });
            // the status is computed a moment after the join (a store read): a millisecond may pass in between
            expect(st.lowPriorityMs).toBeGreaterThan(59_000);
            expect(st.lowPriorityMs).toBeLessThanOrEqual(60_000);
            // past the old 40 s switch, inside the wait: no switch, no match, still no search time
            b.skew.ms += 45_000;
            await nextTick();
            await nextTick();
            expect(c.last('mm.found')).toBeUndefined();
            expect(c.json.some(j => j.t === 'mm.status' && j.from === 'casual')).toBe(false);
            expect(c.last('mm.status')).toMatchObject({ queue: 'casual', waitedMs: 0 });
            // the wait ends: the search runs and the team of bots seats it at 15 s
            b.skew.ms += 16_000;
            await nextTick();
            expect(c.last('mm.found')).toBeUndefined();
            // ~73 s after the join (the skew plus the real ticks): ~13 s of search, still short of the 15 s fill
            b.skew.ms += 9000;
            await nextTick();
            expect(c.last('mm.found')).toBeUndefined();
            expect(c.last('mm.status')!.waitedMs).toBeGreaterThanOrEqual(9000);
            b.skew.ms += 3000;
            const found = await c.until(() => c.last('mm.found'));
            expect(found).toMatchObject({ mode: 'casual', humans: 3, bots: 0 });
        } finally {
            await b.stop();
        }
    });

    it('cancel and search again: the trickle starts from the new search, a team of bots at its 15 s', async () => {
        const b = await bootMm();
        try {
            const c = await b.veteran({ hint: { maxDifficulty: 'normal', newbie: false, matches: 12 } });
            c.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            await c.until(() => c.last('mm.status'));
            b.skew.ms += 10_000;
            await nextTick();
            c.send({ t: 'mm.leave' });
            await c.until(() => c.last('mm.cancel'));
            const before = c.json.length;
            c.send({ t: 'mm.join', queue: 'casual', side: 'any' });
            await c.until(() => (c.json.slice(before).some(j => j.t === 'mm.status') ? true : null));
            b.skew.ms += 14_000;
            await nextTick();
            expect(c.last('mm.found')).toBeUndefined();
            b.skew.ms += 1500;
            expect(await c.until(() => c.last('mm.found'))).toMatchObject({ mode: 'casual', humans: 3, bots: 0 });
        } finally {
            await b.stop();
        }
    });

    it.each(['cat', 'dog'] as const)(
        'side %s alone: a team of bots at 15 s, the player on the side asked for',
        async side => {
            const b = await bootMm();
            try {
                const c = await b.veteran({ hint: { maxDifficulty: 'normal', newbie: false, matches: 12 } });
                c.send({ t: 'mm.join', queue: 'casual', side });
                await c.until(() => c.last('mm.status'));
                b.skew.ms += 15_500;
                const view = await accept(c);
                expect(view.mm.side).toBe(side);
                expect(view.mm.fill).toHaveLength(5);
            } finally {
                await b.stop();
            }
        }
    );

    it('a matched co-op room: its bot seats are named players with champions, stored with the room', async () => {
        const b = await bootMm();
        try {
            const c = await b.guest();
            c.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await c.until(() => c.last('mm.status'));
            b.skew.ms += 9000;
            const view = await c.until(() => (c.last('party')?.phase === 'pick' ? c.last('party') : null));
            expect(view.mm.fill.map((x: { slot: number }) => x.slot)).toEqual([1, 2, 3, 4, 5]);
            for (const f of view.mm.fill) expect(f.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
            expect(JSON.stringify(view)).not.toMatch(/"Bot"/);
            const [m] = await lockAndLoad([c]);
            expect(m.personas.map((x: { slot: number }) => x.slot)).toEqual([1, 2, 3, 4, 5]);
            expect(m.names.filter((n: string | null) => n !== null)).toHaveLength(1);
            // each persona plays the champion it showed (a seat the sim fills from the pick's seed)
            const shown = c.last('party')!.mm.fill as { slot: number; hero?: string }[];
            expect(shown.every(f => !!f.hero)).toBe(true);
            for (const f of shown) expect(m.config.picks[f.slot]).toBe(f.hero);
            const room = await b.store.get(m.room);
            expect(room!.personas!.map(x => x.slot)).toEqual([1, 2, 3, 4, 5]);
            expect(heroesOf('cat')).toContain(m.config.picks[0]);
        } finally {
            await b.stop();
        }
    });
});
