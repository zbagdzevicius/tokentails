import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
    DEFAULT_GOAL,
    DEFAULT_NAP,
    DEFAULT_VOTE,
    eventsOf,
    goalAmount,
    napEarned,
    resolveDefs,
    rotationFeatured,
    rotationTwist,
    TWIST_INFO,
    WEEKLY_TWISTS,
    utcDay,
} from './liveops.defaults';
import { applyCommunityGoal, setCommunityGoalSink } from './liveops-live';
import { LiveopsService } from './liveops.service';

/*
 * Live ops (docs/plans/moba/LIVEOPS.md): the config defaults and fallback, the goal counter moving only inside /live,
 * the idempotent claims, one vote per account and the Winter Nap no-reset rule on UTC days.
 */

// ------------------------------------------------------------------ a tiny in-memory Mongo model

type Doc = Record<string, any>;
const get = (d: Doc, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d as any);
const set = (d: Doc, path: string, v: unknown) => {
    const ks = path.split('.');
    let o = d;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    o[ks[ks.length - 1]] = v;
};
function matches(d: Doc, filter: Doc): boolean {
    return Object.entries(filter).every(([k, cond]) => {
        const v = get(d, k);
        if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
            if ('$exists' in cond) return (v !== undefined) === cond.$exists;
            if ('$ne' in cond) return Array.isArray(v) ? !v.includes(cond.$ne) : v !== cond.$ne;
            if ('$in' in cond) return cond.$in.includes(v);
        }
        return v === cond;
    });
}
class FakeModel {
    docs = new Map<string, Doc>();
    writes = 0;
    constructor(private readonly defaults: Doc = {}) {}
    private q<T>(v: T) {
        return { lean: async () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) };
    }
    findById(id: string) {
        return this.q(this.docs.get(id));
    }
    find(filter: Doc) {
        return this.q([...this.docs.values()].filter(d => matches(d, filter)));
    }
    async updateOne(filter: Doc, update: Doc, opts: { upsert?: boolean } = {}) {
        this.writes++;
        const hit = [...this.docs.values()].find(d => matches(d, filter));
        let doc: Doc = hit as Doc;
        if (!doc) {
            if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
            if (this.docs.has(filter._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
            doc = { _id: filter._id, ...JSON.parse(JSON.stringify(this.defaults)) };
            this.docs.set(filter._id, doc);
        }
        for (const [k, v] of Object.entries(update.$inc ?? {})) set(doc, k, (get(doc, k) ?? 0) + (v as number));
        for (const [k, v] of Object.entries(update.$set ?? {})) set(doc, k, v);
        for (const [k, v] of Object.entries(update.$addToSet ?? {})) {
            const arr: unknown[] = get(doc, k) ?? [];
            const add = v && typeof v === 'object' && '$each' in (v as Doc) ? (v as Doc).$each : [v];
            for (const x of add) if (!arr.includes(x)) arr.push(x);
            set(doc, k, arr);
        }
        return hit
            ? { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
            : { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
}

const at = (iso: string) => new Date(iso);

function make(nowIso: string, configDoc?: Doc) {
    const clock = {
        t: at(nowIso),
        now() {
            return this.t;
        },
    };
    const configs = new FakeModel();
    if (configDoc) configs.docs.set('live', { _id: 'live', ...configDoc });
    const counts = new FakeModel({ n: 0 });
    const accounts = new FakeModel({ napDays: [], napClaimed: 0, goals: [], votes: {}, items: [] });
    const svc = new LiveopsService(configs as any, counts as any, accounts as any, clock);
    return { svc, clock, configs, counts, accounts };
}

afterEach(() => setCommunityGoalSink(null));

// ------------------------------------------------------------------ config defaults and fallback

describe('liveops config', () => {
    it('answers the code defaults with no config doc', async () => {
        const { svc } = make('2026-11-20T10:00:00Z');
        const c = await svc.config();
        expect(c.v).toBe(1);
        expect(c.goal).toMatchObject({ id: DEFAULT_GOAL.id, target: DEFAULT_GOAL.target, progress: 0, reached: false });
        expect(c.vote).toMatchObject({ id: DEFAULT_VOTE.id, open: true, tallies: { a: 0, b: 0 } });
        expect(c.nap).toMatchObject({ id: DEFAULT_NAP.id, open: false });
        // sim v27: the week's twist is the featured mode by default
        expect(c.featuredMode?.id).toBe('twist');
        expect(c.twist && (WEEKLY_TWISTS as readonly string[])).toContain(c.twist!.id);
        expect(c.featuredMode!.endsAt).toBe(c.twist!.endsAt);
        expect(c.events.map(e => e.kind).sort()).toEqual(['goal', 'mode', 'nap', 'vote']);
    });

    it('takes valid doc fields, keeps the default for a bad one, and null turns a piece off', () => {
        const now = at('2026-11-20T10:00:00Z');
        const defs = resolveDefs(
            {
                goal: { ...DEFAULT_GOAL, id: 'g2', target: 50, rewardItem: 'coat.sage.loop.moss' },
                vote: { id: 'bad id!', question: 'x', options: [] },
                nap: null,
                featuredMode: { id: 'classic', endsAt: '2026-11-27T00:00:00Z' },
                featuredQuests: ['Win 2 Classic matches', 7, ''],
            },
            now
        );
        expect(defs.goal).toMatchObject({ id: 'g2', target: 50, rewardItem: 'coat.sage.loop.moss' });
        expect(defs.vote).toEqual(DEFAULT_VOTE);
        expect(defs.nap).toBeNull();
        expect(defs.featuredMode).toEqual({ id: 'classic', endsAt: '2026-11-27T00:00:00.000Z' });
        expect(defs.featuredQuests).toEqual(['Win 2 Classic matches']);
    });

    it('never features Ranked or a mode that is not live, and refuses a non-coat reward', () => {
        const now = at('2026-11-20T10:00:00Z');
        const defs = resolveDefs(
            {
                featuredMode: { id: 'ranked', endsAt: '2026-11-27T00:00:00Z' },
                goal: { ...DEFAULT_GOAL, rewardItem: 'champ.lambo' },
            },
            now
        );
        expect(defs.featuredMode).toEqual({ id: 'twist', endsAt: rotationTwist(now).endsAt });
        expect(defs.goal).toEqual(DEFAULT_GOAL);
    });

    it('falls back to the defaults when the config doc cannot be read', async () => {
        const { svc, configs } = make('2026-11-20T10:00:00Z');
        (configs as any).findById = () => ({ lean: async () => Promise.reject(new Error('down')) });
        const c = await svc.config();
        expect(c.goal?.id).toBe(DEFAULT_GOAL.id);
    });

    it('rotates the featured mode weekly and ends it on Monday 00:00 UTC', () => {
        const a = rotationFeatured(at('2026-11-18T12:00:00Z'));
        const b = rotationFeatured(at('2026-11-25T12:00:00Z'));
        expect(a.endsAt).toBe('2026-11-23T00:00:00.000Z');
        expect(b.endsAt).toBe('2026-11-30T00:00:00.000Z');
        expect(a.id).not.toBe(b.id);
        // the game's copy (pawlegends/src/meta/liveops.ts, tests/unit/liveops.test.ts) pins the same weeks
        expect(rotationFeatured(at('2026-11-13T12:00:00Z'))).toEqual({
            id: 'blitz',
            endsAt: '2026-11-16T00:00:00.000Z',
        });
        expect(a.id).toBe('skirmish');
        // Sunday 23:59 is still the same week
        expect(rotationFeatured(at('2026-11-22T23:59:00Z'))).toEqual(a);
    });

    it('sim v27: rotates the weekly twist, takes a doc twist, and null brings the mode rotation back', () => {
        const a = rotationTwist(at('2026-11-18T12:00:00Z'));
        const b = rotationTwist(at('2026-11-25T12:00:00Z'));
        const c = rotationTwist(at('2026-12-02T12:00:00Z'));
        expect(new Set([a.id, b.id, c.id]).size).toBe(3);
        expect(a.endsAt).toBe('2026-11-23T00:00:00.000Z');
        expect(a.name).toBe(TWIST_INFO[a.id].name);
        const now = at('2026-11-20T10:00:00Z');
        const doc = resolveDefs({ twist: { id: 'bounty', endsAt: '2026-11-22T00:00:00Z' } }, now);
        expect(doc.twist).toMatchObject({ id: 'bounty', name: 'Bounty Hunt', endsAt: '2026-11-22T00:00:00.000Z' });
        expect(doc.featuredMode).toEqual({ id: 'twist', endsAt: '2026-11-22T00:00:00.000Z' });
        expect(eventsOf(doc, now).find(e => e.kind === 'mode')?.title).toBe('Weekly Twist: Bounty Hunt');
        // an unknown or ended twist keeps the rotation's
        expect(resolveDefs({ twist: { id: 'giants', endsAt: '2026-11-22T00:00:00Z' } }, now).twist?.id).toBe(rotationTwist(now).id);
        const off = resolveDefs({ twist: null }, now);
        expect(off.twist).toBeNull();
        expect(off.featuredMode).toEqual(rotationFeatured(now));
        // a doc may still feature a mode over the twist
        expect(resolveDefs({ featuredMode: { id: 'classic', endsAt: '2026-11-27T00:00:00Z' } }, now).featuredMode?.id).toBe('classic');
    });

    it('drops past windows from the calendar', () => {
        const now = at('2027-01-10T00:00:00Z');
        const ev = eventsOf(resolveDefs(null, now), now);
        expect(ev.map(e => e.kind)).toEqual(['mode']);
    });
});

// ------------------------------------------------------------------ the counter moves only inside /live

describe('community goal counter', () => {
    it('grows by the verified match share through applyCommunityGoal, once per call, never on a forfeit', async () => {
        const { svc, counts } = make('2026-11-20T10:00:00Z');
        svc.onModuleInit();
        const now = at('2026-11-20T10:00:00Z');
        await applyCommunityGoal({ accountId: 'u1', won: true, forfeit: false, takedowns: 4, now });
        await applyCommunityGoal({ accountId: 'u2', won: false, forfeit: false, takedowns: 0, now });
        await applyCommunityGoal({ accountId: 'u3', won: false, forfeit: true, takedowns: 0, now });
        expect(counts.docs.get(`goal:${DEFAULT_GOAL.id}`)?.n).toBe(2);
    });

    it('does not count outside the goal window', async () => {
        const { svc, counts } = make('2026-12-20T10:00:00Z');
        svc.onModuleInit();
        await applyCommunityGoal({
            accountId: 'u1',
            won: true,
            forfeit: false,
            takedowns: 4,
            now: at('2026-12-20T10:00:00Z'),
        });
        expect(counts.docs.get(`goal:${DEFAULT_GOAL.id}`)).toBeUndefined();
    });

    it('never fails a save, and is a no-op without the service', async () => {
        await expect(
            applyCommunityGoal({ accountId: 'u1', won: true, forfeit: false, takedowns: 1, now: new Date() })
        ).resolves.toBeUndefined();
        setCommunityGoalSink({ recordMatch: async () => Promise.reject(new Error('mongo down')) });
        await expect(
            applyCommunityGoal({ accountId: 'u1', won: true, forfeit: false, takedowns: 1, now: new Date() })
        ).resolves.toBeUndefined();
    });

    it('the routes (config, me, claims, vote) never move the goal counter', async () => {
        const { svc, counts } = make('2026-11-20T10:00:00Z');
        await svc.config();
        await svc.me('u1');
        await expect(svc.claimGoal('u1')).rejects.toBeTruthy();
        await svc.claimNap('u1').catch(() => undefined);
        await svc.vote('u1', 'a');
        expect(counts.docs.get(`goal:${DEFAULT_GOAL.id}`)).toBeUndefined();
    });

    it('in the source, only the two /live saves call applyCommunityGoal and only recordMatch increments a goal', () => {
        const SRC = join(__dirname, '..', '..');
        const files = (dir: string): string[] =>
            readdirSync(dir).flatMap(name => {
                const p = join(dir, name);
                if (statSync(p).isDirectory()) return name === 'vendor' || name === 'node_modules' ? [] : files(p);
                return name.endsWith('.ts') && !name.endsWith('spec.ts') ? [p] : [];
            });
        const code = (p: string) =>
            readFileSync(p, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
        const callers = files(SRC)
            .filter(p => /applyCommunityGoal\(/.test(code(p)) && !p.endsWith('liveops-live.ts'))
            .map(p => relative(SRC, p).split('\\').join('/'))
            .sort();
        expect(callers).toEqual(['pawlegends/pawlegends-live.ts', 'pawlegends/pawlegends-party-live.ts']);
        const svc = code(join(__dirname, 'liveops.service.ts'));
        const goalIncs = svc.match(/`goal:\$\{[^}]+\}`\s*\},\s*\{\s*\$inc/g) ?? [];
        expect(goalIncs).toHaveLength(1);
        const recordMatch = svc.slice(svc.indexOf('async recordMatch('), svc.indexOf('private async account('));
        expect(recordMatch).toMatch(/goal:\$\{defs\.goal\.id\}`\s*\},\s*\{\s*\$inc/);
    });

    it('goalAmount: matches, wins and capped takedowns', () => {
        expect(goalAmount('matches', { won: false, forfeit: false, takedowns: 0 })).toBe(1);
        expect(goalAmount('wins', { won: false, forfeit: false, takedowns: 9 })).toBe(0);
        expect(goalAmount('takedowns', { won: true, forfeit: false, takedowns: 999 })).toBe(60);
        expect(goalAmount('takedowns', { won: true, forfeit: true, takedowns: 9 })).toBe(0);
    });
});

// ------------------------------------------------------------------ claim

describe('goal claim', () => {
    it('refuses before the target, then grants the coat once (idempotent), guests too', async () => {
        const { svc, counts, accounts } = make('2026-11-20T10:00:00Z', {
            goal: { ...DEFAULT_GOAL, target: 2 },
        });
        await expect(svc.claimGoal('guest1')).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_GOAL_NOT_REACHED' },
        });
        counts.docs.set(`goal:${DEFAULT_GOAL.id}`, { _id: `goal:${DEFAULT_GOAL.id}`, n: 2 });
        const first = await svc.claimGoal('guest1');
        expect(first.granted).toEqual([DEFAULT_GOAL.rewardItem]);
        expect(first.goal).toEqual({ id: DEFAULT_GOAL.id, claimed: true });
        expect(first.items).toEqual([DEFAULT_GOAL.rewardItem]);
        const again = await svc.claimGoal('guest1');
        expect(again.granted).toEqual([]);
        expect(again.items).toEqual([DEFAULT_GOAL.rewardItem]);
        expect(accounts.docs.get('guest1')?.goals).toEqual([DEFAULT_GOAL.id]);
    });
});

// ------------------------------------------------------------------ vote

describe('fan vote', () => {
    it('counts one vote per account; a second vote changes nothing', async () => {
        const { svc, counts } = make('2026-11-20T10:00:00Z');
        const a = await svc.vote('u1', 'a');
        expect(a.counted).toBe(true);
        expect(a.vote).toEqual({ id: DEFAULT_VOTE.id, choice: 'a' });
        expect(a.tallies).toEqual({ a: 1, b: 0 });
        const b = await svc.vote('u1', 'b');
        expect(b.counted).toBe(false);
        expect(b.vote?.choice).toBe('a');
        await svc.vote('u2', 'b');
        expect(counts.docs.get(`vote:${DEFAULT_VOTE.id}:a`)?.n).toBe(1);
        expect(counts.docs.get(`vote:${DEFAULT_VOTE.id}:b`)?.n).toBe(1);
    });

    it('a vote on an existing account doc (one that played Winter Nap) still counts once', async () => {
        const { svc, accounts } = make('2026-11-20T10:00:00Z');
        accounts.docs.set('u1', { _id: 'u1', napDays: [], napClaimed: 0, goals: [], votes: {}, items: [] });
        expect((await svc.vote('u1', 'b')).counted).toBe(true);
        expect((await svc.vote('u1', 'b')).counted).toBe(false);
    });

    it('refuses a bad option and a closed vote', async () => {
        const { svc, clock } = make('2026-11-20T10:00:00Z');
        await expect(svc.vote('u1', 'c')).rejects.toMatchObject({ response: { code: 'PAWLEGENDS_INVALID' } });
        clock.t = at('2026-12-20T00:00:00Z');
        svc.resetCache();
        await expect(svc.vote('u1', 'a')).rejects.toMatchObject({ response: { code: 'PAWLEGENDS_VOTE_CLOSED' } });
    });
});

// ------------------------------------------------------------------ Winter Nap

describe('Winter Nap', () => {
    it('counts distinct UTC days played inside Dec 15 – Jan 4, with no reset for a missed day', () => {
        expect(napEarned(DEFAULT_NAP, [])).toBe(0);
        // Dec 14 is before, Jan 5 after; Dec 15 twice is one day; a gap of a week loses nothing
        expect(
            napEarned(DEFAULT_NAP, ['2026-12-14', '2026-12-15', '2026-12-15', '2026-12-22', '2027-01-04', '2027-01-05'])
        ).toBe(3);
        const all = Array.from({ length: 21 }, (_, i) => utcDay(new Date(Date.UTC(2026, 11, 15 + i))));
        expect(napEarned(DEFAULT_NAP, all)).toBe(DEFAULT_NAP.gifts.length);
    });

    it('logs the UTC day from /live (23:30 UTC on Dec 15 is Dec 15, 00:30 UTC on Dec 16 is Dec 16)', async () => {
        const { svc, accounts } = make('2026-12-15T23:30:00Z');
        svc.onModuleInit();
        await applyCommunityGoal({
            accountId: 'u1',
            won: false,
            forfeit: false,
            takedowns: 0,
            now: at('2026-12-15T23:30:00Z'),
        });
        await applyCommunityGoal({
            accountId: 'u1',
            won: false,
            forfeit: false,
            takedowns: 0,
            now: at('2026-12-15T23:59:59Z'),
        });
        await applyCommunityGoal({
            accountId: 'u1',
            won: false,
            forfeit: false,
            takedowns: 0,
            now: at('2026-12-16T00:30:00Z'),
        });
        expect(accounts.docs.get('u1')?.napDays).toEqual(['2026-12-15', '2026-12-16']);
        // a forfeit still counts as a day played (it is a match), and nothing is logged outside the window
        await applyCommunityGoal({
            accountId: 'u2',
            won: false,
            forfeit: false,
            takedowns: 0,
            now: at('2026-12-14T23:59:59Z'),
        });
        expect(accounts.docs.get('u2')).toBeUndefined();
    });

    it('claims each earned gift once, keeps earned days after a missed day, and grants palette coats only', async () => {
        const { svc, accounts, clock } = make('2026-12-18T12:00:00Z');
        accounts.docs.set('u1', {
            _id: 'u1',
            napDays: ['2026-12-15', '2026-12-16'],
            napClaimed: 0,
            goals: [],
            votes: {},
            items: [],
        });
        const first = await svc.claimNap('u1');
        expect(first.granted).toEqual([DEFAULT_NAP.gifts[0].item, DEFAULT_NAP.gifts[1].item]);
        expect(first.nap).toMatchObject({ days: 2, earned: 2, claimed: 2, playedToday: false });
        expect((await svc.claimNap('u1')).granted).toEqual([]);
        // a week missed, then one more day: gift 3, nothing lost
        clock.t = at('2026-12-26T09:00:00Z');
        svc.resetCache();
        accounts.docs.get('u1')!.napDays.push('2026-12-26');
        const third = await svc.claimNap('u1');
        expect(third.granted).toEqual([DEFAULT_NAP.gifts[2].item]);
        expect(third.nap).toMatchObject({ earned: 3, claimed: 3, playedToday: true });
        for (const g of DEFAULT_NAP.gifts) expect(g.item).toMatch(/^coat\.[a-z]+\.[a-z0-9._-]+$/);
    });

    it('two claims at once grant the gifts once', async () => {
        const { svc, accounts } = make('2026-12-18T12:00:00Z');
        accounts.docs.set('u1', { _id: 'u1', napDays: ['2026-12-15'], napClaimed: 0, goals: [], votes: {}, items: [] });
        const [a, b] = await Promise.all([svc.claimNap('u1'), svc.claimNap('u1')]);
        expect([...a.granted, ...b.granted]).toEqual([DEFAULT_NAP.gifts[0].item]);
        expect(accounts.docs.get('u1')?.napClaimed).toBe(1);
    });
});
