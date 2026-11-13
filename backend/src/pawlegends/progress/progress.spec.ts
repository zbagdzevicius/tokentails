import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { FailedReplayCache } from 'src/user/heist/failed-replay-cache';
import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { ReplayQueue } from 'src/user/heist/replay-queue';
import { PawlegendsReplayRecord, PawlegendsVerifyResult, SIM_VERSION } from 'src/vendor/pawlegends-sim';
import { PAWLEGENDS_REPLAY_QUEUE, pawlegendsDigest, savePawlegendsMatch } from '../pawlegends-live';
import {
    DAILY_TREAT_XP,
    drawLucky,
    LUCKY_DUP_XP,
    LUCKY_FLOOR,
    LUCKY_ODDS,
    LUCKY_POOL,
    LUCKY_RARITIES,
    luckyOddsFor,
    rarityFor,
} from './lucky';
import { MASTERY_STEPS, masteryLevel, masteryView } from './mastery';
import { emptyBlob, mergeBlobs, sanitizeBlob, TREAT_STEP } from './progress-merge';
import { parseBlob, PROGRESS_BLOB_MAX } from './progress.controller';
import { GRANTS_KEPT, PawlegendsProgressService, ProgressDoc, ProgressGrant, ProgressRepo } from './progress.service';
import { WELCOME_DAYS, WELCOME_PATH, welcomeGrant } from './welcome';

/*
 * Gap plan P2 `rewards-cloud`: the account progress blob (max-merge), the Lucky Treat (drawn only inside /live, odds sum
 * to 100 %, every 10th at least Rare, no draw for the under-16 band, one a day), the Welcome Path and champion mastery
 * (verified matches only).
 */

/** An in-memory ProgressRepo with Mongo's single-document atomicity (each call yields once, then applies at once). */
class MemoryRepo implements ProgressRepo {
    docs = new Map<string, Required<ProgressDoc>>();
    bands = new Map<string, string>();
    private tick = () => new Promise<void>(r => setImmediate(r));
    async find(id: string) {
        await this.tick();
        const d = this.docs.get(id);
        return d ? JSON.parse(JSON.stringify(d)) : null;
    }
    async ensure(id: string) {
        await this.tick();
        if (!this.docs.has(id))
            this.docs.set(id, {
                _id: id,
                blob: {},
                rev: 0,
                luckyDay: '',
                luckyN: 0,
                welcomeDays: [],
                mastery: {},
                grants: [],
            });
    }
    async casBlob(id: string, rev: number, blob: unknown) {
        await this.tick();
        const d = this.docs.get(id);
        if (!d || d.rev !== rev) return false;
        d.blob = JSON.parse(JSON.stringify(blob));
        d.rev++;
        return true;
    }
    async claimLucky(id: string, day: string) {
        await this.tick();
        const d = this.docs.get(id);
        if (!d || d.luckyDay === day) return null;
        d.luckyDay = day;
        d.luckyN++;
        return d.luckyN;
    }
    async claimWelcome(id: string, day: string) {
        await this.tick();
        const d = this.docs.get(id);
        if (!d || d.welcomeDays.includes(day) || d.welcomeDays.length >= WELCOME_DAYS) return null;
        d.welcomeDays.push(day);
        return d.welcomeDays.length;
    }
    async pushGrant(id: string, g: ProgressGrant) {
        await this.tick();
        const d = this.docs.get(id)!;
        d.grants = [...d.grants, g].slice(-GRANTS_KEPT);
    }
    async incMastery(id: string, hero: string, won: boolean) {
        await this.tick();
        const d = this.docs.get(id)!;
        const m = (d.mastery as Record<string, { m: number; w: number }>)[hero] ?? { m: 0, w: 0 };
        (d.mastery as Record<string, { m: number; w: number }>)[hero] = { m: m.m + 1, w: m.w + (won ? 1 : 0) };
    }
    async ageBand(id: string) {
        return this.bands.get(id) ?? null;
    }
}

const at = (iso: string) => () => new Date(iso);
const service = (iso = '2026-11-13T10:00:00Z') => {
    const repo = new MemoryRepo();
    let now = new Date(iso);
    const s = PawlegendsProgressService.forRepo(repo, () => now);
    return { repo, s, setNow: (x: string) => (now = new Date(x)) };
};
const grantsOf = (repo: MemoryRepo, id: string) => (repo.docs.get(id)?.grants ?? []) as ProgressGrant[];

describe('progress blob: max-merge, progress only goes up', () => {
    it('takes the larger number, the later day, the union of ids and the newer settings', () => {
        const a = sanitizeBlob({
            treats: { xp: 900, chests: 3, winDay: '2026-11-12' },
            quests: { day: '2026-11-13', progress: { play2: 1, win: 0 }, done: ['pudding'] },
            counts: { matches: 9, wins: 4, firstWin: 1, heroMatches: { clem: 5, sage: 1 } },
            unlocks: ['emote.wave', 'coat.clem.marmalade'],
            applied: ['welcome:1'],
            prefs: { at: 100, data: { tipsOff: true } },
        });
        const b = sanitizeBlob({
            treats: { xp: 700, chests: 2, winDay: '2026-11-13' },
            quests: { day: '2026-11-13', progress: { play2: 2 }, done: ['play2'] },
            counts: { matches: 12, wins: 3, heroMatches: { clem: 2, brutus: 7 } },
            unlocks: ['coat.sage.midnight', 'emote.wave'],
            applied: ['lucky:2026-11-13'],
            prefs: { at: 200, data: { tipsOff: false, numbers: true } },
        });
        const m = mergeBlobs(a, b);
        expect(m.treats).toEqual({ xp: 900, chests: 3, winDay: '2026-11-13' });
        expect(m.quests).toEqual({ day: '2026-11-13', progress: { play2: 2, win: 0 }, done: ['pudding', 'play2'] });
        expect(m.counts).toEqual({ matches: 12, wins: 4, firstWin: 1, heroMatches: { clem: 5, sage: 1, brutus: 7 } });
        expect(m.unlocks.sort()).toEqual(['coat.clem.marmalade', 'coat.sage.midnight', 'emote.wave']);
        expect(m.applied.sort()).toEqual(['lucky:2026-11-13', 'welcome:1']);
        expect(m.prefs).toEqual({ at: 200, data: { tipsOff: false, numbers: true } });
        // either order: the same progress (prefs follow the newer `at`)
        expect(mergeBlobs(b, a)).toEqual({
            ...m,
            unlocks: expect.any(Array),
            applied: expect.any(Array),
            quests: expect.any(Object),
        });
        expect(mergeBlobs(b, a).quests.progress).toEqual(m.quests.progress);
    });

    it('never lowers anything: merging an empty or older blob keeps every field', () => {
        const full = sanitizeBlob({
            treats: { xp: 1500, chests: 5 },
            counts: { matches: 3, wins: 1 },
            unlocks: ['emote.wave'],
        });
        expect(mergeBlobs(full, emptyBlob())).toEqual(full);
        expect(mergeBlobs(emptyBlob(), full)).toEqual(full);
        // an older quest day is dropped for the newer one, never mixed into it
        const old = sanitizeBlob({ quests: { day: '2026-11-01', progress: { play2: 2 }, done: ['play2'] } });
        const today = sanitizeBlob({ quests: { day: '2026-11-13', progress: { win: 1 }, done: [] } });
        expect(mergeBlobs(old, today).quests).toEqual({ day: '2026-11-13', progress: { win: 1 }, done: [] });
    });

    it('sanitizes untrusted input: chests never run ahead of XP, junk ids and huge settings dropped', () => {
        const b = sanitizeBlob({
            treats: { xp: 650, chests: 99, winDay: 'yesterday' },
            quests: { day: '2026-11-13', progress: { 'bad key': 3, ok: -4 }, done: ['$where', 'ok'] },
            counts: { matches: 2, wins: 5, heroMatches: { 'a.b': 9, clem: 2 } },
            unlocks: ['coat.clem.marmalade', '<script>', 42],
            applied: ['lucky:2026-11-13', 'evil:1'],
            prefs: { at: 5, data: { big: 'x'.repeat(5000), ok: 1, nested: { a: { b: { c: { d: { e: 1 } } } } } } },
        });
        expect(b.treats).toEqual({ xp: 650, chests: Math.floor(650 / TREAT_STEP), winDay: null });
        expect(b.quests).toEqual({ day: '2026-11-13', progress: { ok: 0 }, done: ['ok'] });
        expect(b.counts).toEqual({ matches: 2, wins: 2, firstWin: 0, heroMatches: { clem: 2 } });
        expect(b.unlocks).toEqual(['coat.clem.marmalade']);
        expect(b.applied).toEqual(['lucky:2026-11-13']);
        expect(b.prefs.data).toEqual({ ok: 1, nested: { a: { b: { c: {} } } } });
        expect(sanitizeBlob('nope')).toEqual(emptyBlob());
    });

    it('the route takes an object or its JSON string, and refuses a huge or broken one', () => {
        expect(parseBlob({ v: 1 })).toEqual({ v: 1 });
        expect(parseBlob('{"v":1}')).toEqual({ v: 1 });
        expect(() => parseBlob('{nope')).toThrow();
        expect(() => parseBlob('x'.repeat(PROGRESS_BLOB_MAX + 1))).toThrow();
        expect(() => parseBlob(undefined)).toThrow();
    });

    it('sync stores the merge and answers it; two devices end up with the same Treat Track', async () => {
        const { s } = service();
        await s.sync('acc', { treats: { xp: 600, chests: 2 }, unlocks: ['emote.wave'] });
        const second = await s.sync('acc', { treats: { xp: 300, chests: 1 }, unlocks: ['coat.sage.midnight'] });
        expect(second.blob.treats.xp).toBe(600);
        expect(second.blob.treats.chests).toBe(2);
        expect([...second.blob.unlocks].sort()).toEqual(['coat.sage.midnight', 'emote.wave']);
        const first = await s.view('acc');
        expect(first.blob).toEqual(second.blob);
        expect(first.rev).toBe(2);
    });

    it('concurrent syncs never lose a field (optimistic rev, retried)', async () => {
        const { s } = service();
        await Promise.all([
            s.sync('acc', { unlocks: ['a.one'], treats: { xp: 300, chests: 1 } }),
            s.sync('acc', { unlocks: ['b.two'], counts: { matches: 4 } }),
        ]);
        const v = await s.view('acc');
        expect(v.blob.unlocks.sort()).toEqual(['a.one', 'b.two']);
        expect(v.blob.treats.xp).toBe(300);
        expect(v.blob.counts.matches).toBe(4);
    });
});

describe('Lucky Treat', () => {
    it('the published odds sum to 100 %, the floor odds too, and every tier has items', () => {
        expect(LUCKY_RARITIES.reduce((n, r) => n + LUCKY_ODDS[r], 0)).toBe(100);
        const floor = luckyOddsFor(LUCKY_FLOOR);
        expect(Math.round(LUCKY_RARITIES.reduce((n, r) => n + floor[r], 0) * 1e9) / 1e9).toBe(100);
        expect(floor.common).toBe(0);
        for (const r of LUCKY_RARITIES) expect(LUCKY_POOL[r].length).toBeGreaterThan(0);
        // no id in two tiers, and cosmetics only (coats, an emote, frames, titles)
        const all = LUCKY_RARITIES.flatMap(r => LUCKY_POOL[r]);
        expect(new Set(all).size).toBe(all.length);
        for (const id of all) expect(id).toMatch(/^(coat|emote|frame|title)\./);
    });

    it('draws follow the table (10,000 seeded draws within 2 points of each published odd)', () => {
        const counts = { common: 0, rare: 0, epic: 0 };
        for (let i = 0; i < 10_000; i++) counts[drawLucky(`acc${i}`, '2026-11-13', 1, new Set()).rarity]++;
        for (const r of LUCKY_RARITIES) expect(Math.abs(counts[r] / 100 - LUCKY_ODDS[r])).toBeLessThan(2);
        expect(rarityFor(0, LUCKY_ODDS)).toBe('common');
        expect(rarityFor(0.999999, LUCKY_ODDS)).toBe('epic');
    });

    it('every 10th Lucky Treat is at least Rare', () => {
        for (let a = 0; a < 200; a++)
            for (let n = LUCKY_FLOOR; n <= 100; n += LUCKY_FLOOR) {
                const d = drawLucky(`acc${a}`, '2026-11-13', n, new Set());
                expect(d.rarity).not.toBe('common');
                expect(d.floor).toBe(true);
            }
    });

    it('never draws an owned cosmetic; a fully owned tier pays its Treat XP', () => {
        const owned = new Set(LUCKY_POOL.common.slice(1));
        const roll = Array.from({ length: 300 }, (_, i) => drawLucky(`x${i}`, '2026-11-13', 1, owned)).filter(
            d => d.rarity === 'common'
        );
        expect(roll.length).toBeGreaterThan(0);
        for (const d of roll) expect(d.item).toBe(LUCKY_POOL.common[0]);
        const all = new Set(LUCKY_RARITIES.flatMap(r => LUCKY_POOL[r]));
        const d = drawLucky('acc', '2026-11-13', 1, all);
        expect(d.item).toBeUndefined();
        expect(d.xp).toBe(LUCKY_DUP_XP[d.rarity]);
    });

    it('is drawn only inside /live: syncing a winning-looking blob never draws', async () => {
        const { s, repo } = service();
        const v = await s.sync('acc', {
            treats: { xp: 5000, chests: 16, winDay: '2026-11-13' },
            counts: { matches: 50, wins: 40 },
        });
        expect(grantsOf(repo, 'acc')).toEqual([]);
        expect(v.lucky.n).toBe(0);
        await s.view('acc');
        expect(grantsOf(repo, 'acc')).toEqual([]);
        // a verified win through the /live hook draws
        const r = await s.applyLive('acc', { won: true, hero: 'clem' });
        expect(r.lucky?.kind).toBe('lucky');
        expect(grantsOf(repo, 'acc').filter(g => g.kind === 'lucky')).toHaveLength(1);
    });

    it('static: only the /live save calls applyLive; only the service draws', () => {
        const root = join(__dirname, '..', '..');
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const f of readdirSync(dir)) {
                const p = join(dir, f);
                if (statSync(p).isDirectory()) {
                    if (f !== 'node_modules' && f !== 'vendor') walk(p);
                } else if (f.endsWith('.ts') && !f.endsWith('spec.ts')) files.push(p);
            }
        };
        walk(root);
        const rel = (p: string) => p.slice(root.length + 1);
        const calling = files
            .filter(f => /\.applyLive\(/.test(readFileSync(f, 'utf8')))
            .map(rel)
            .sort();
        expect(calling).toEqual(['pawlegends/pawlegends-live.ts', 'pawlegends/pawlegends-party-live.ts']);
        const drawing = files
            .filter(f => /\bdrawLucky\(/.test(readFileSync(f, 'utf8')))
            .map(rel)
            .sort();
        expect(drawing).toEqual(['pawlegends/progress/lucky.ts', 'pawlegends/progress/progress.service.ts']);
        // the controller never reaches applyLive
        expect(readFileSync(join(__dirname, 'progress.controller.ts'), 'utf8')).not.toMatch(
            /applyLive|applyLuckyTreat/
        );
    });

    it('the under-16 band never draws: it gets the fixed Daily Treat', async () => {
        const { s, repo } = service();
        repo.bands.set('kid', 'under16');
        const r = await s.applyLive('kid', { won: true, hero: 'clem' });
        expect(r.lucky).toMatchObject({ kind: 'treat', id: 'treat:2026-11-13', xp: DAILY_TREAT_XP });
        expect(r.lucky?.item).toBeUndefined();
        expect(r.lucky?.rarity).toBeUndefined();
        expect(grantsOf(repo, 'kid').some(g => g.kind === 'lucky')).toBe(false);
        expect((await s.view('kid')).lucky.eligible).toBe(false);
    });

    it('one per account per UTC day, also when two wins save at once; a loss never draws', async () => {
        const { s, repo, setNow } = service('2026-11-13T23:00:00Z');
        expect((await s.applyLive('acc', { won: false, hero: 'sage' })).lucky).toBeNull();
        const [a, b] = await Promise.all([
            s.applyLive('acc', { won: true, hero: 'sage' }),
            s.applyLive('acc', { won: true, hero: 'sage' }),
        ]);
        expect([a.lucky, b.lucky].filter(Boolean)).toHaveLength(1);
        expect((await s.applyLive('acc', { won: true, hero: 'sage' })).lucky).toBeNull();
        setNow('2026-11-14T00:30:00Z');
        const next = await s.applyLive('acc', { won: true, hero: 'sage' });
        expect(next.lucky?.id).toBe('lucky:2026-11-14');
        expect(next.lucky?.n).toBe(2);
        expect(
            grantsOf(repo, 'acc')
                .filter(g => g.kind === 'lucky')
                .map(g => g.id)
        ).toEqual(['lucky:2026-11-13', 'lucky:2026-11-14']);
    });

    it('a draw skips what the account owns (its unlocks and unapplied grants)', async () => {
        const { s, repo } = service();
        const allButOne = [...LUCKY_POOL.common.slice(1), ...LUCKY_POOL.rare, ...LUCKY_POOL.epic];
        await s.sync('acc', { unlocks: allButOne.slice(0, 400) });
        const blobUnlocks = new Set((await s.view('acc')).blob.unlocks);
        const g = (await s.applyLive('acc', { won: true, hero: 'clem' })).lucky!;
        if (g.item) expect(blobUnlocks.has(g.item)).toBe(false);
        expect(grantsOf(repo, 'acc').length).toBeGreaterThan(0);
    });
});

describe('Welcome Path', () => {
    it('one gift per day of play, seven days, never reset by a missed day', async () => {
        const { s, setNow } = service('2026-11-01T12:00:00Z');
        const days: (number | null)[] = [];
        for (const d of ['01', '01', '03', '09', '10', '11', '20', '21', '22']) {
            setNow(`2026-11-${d}T12:00:00Z`);
            days.push((await s.applyLive('acc', { won: false, hero: 'clem' })).welcome);
        }
        expect(days).toEqual([1, null, 2, 3, 4, 5, 6, 7, null]);
        const v = await s.view('acc');
        expect(v.welcome.days).toBe(WELCOME_DAYS);
        expect(v.grants.filter(g => g.kind === 'welcome').map(g => g.id)).toEqual(
            [1, 2, 3, 4, 5, 6, 7].map(n => `welcome:${n}`)
        );
    });

    it('gifts are Treat XP or existing cosmetics (owned: the XP instead), never an offer', () => {
        expect(WELCOME_PATH).toHaveLength(WELCOME_DAYS);
        for (const g of WELCOME_PATH) {
            expect(g.xp).toBeGreaterThan(0);
            if (g.item) expect(LUCKY_RARITIES.flatMap(r => LUCKY_POOL[r])).toContain(g.item);
            expect(Object.keys(g).sort()).toEqual(g.item ? ['day', 'item', 'xp'] : ['day', 'xp']);
        }
        expect(welcomeGrant(2, new Set())).toEqual({ item: 'emote.wave' });
        expect(welcomeGrant(2, new Set(['emote.wave']))).toEqual({ xp: 150 });
        expect(welcomeGrant(8, new Set())).toBeNull();
    });
});

describe('champion mastery', () => {
    it('levels M1..M7 from matches plus wins', () => {
        expect(masteryLevel(0, 0)).toBe(0);
        expect(masteryLevel(1, 0)).toBe(1);
        expect(masteryLevel(3, 2)).toBe(2);
        expect(masteryLevel(80, 40)).toBe(7);
        expect(MASTERY_STEPS).toHaveLength(7);
        expect(masteryView({ clem: { m: 3, w: 9 }, 'a.b': { m: 1 }, sage: { m: 0 } })).toEqual({
            clem: { m: 3, w: 3, level: 2 },
        });
    });

    it('counts only verified matches: the /live hook counts, a sync never does', async () => {
        const { s } = service();
        await s.applyLive('acc', { won: true, hero: 'clem' });
        await s.applyLive('acc', { won: false, hero: 'clem' });
        await s.sync('acc', {
            counts: { matches: 999, wins: 999, heroMatches: { clem: 999 } },
            mastery: { clem: { m: 999 } },
        });
        await s.applyLive('acc', { won: true, hero: '$bad' });
        expect((await s.view('acc')).mastery).toEqual({ clem: { m: 2, w: 1, level: masteryLevel(2, 1) } });
    });

    it('the solo /live save calls the hook once for a verified match, never for a rejected or duplicate one', async () => {
        const users = new FakeUsers();
        const games = new FakeGames();
        const userId = users.add({});
        const record: PawlegendsReplayRecord = {
            v: 1,
            simVersion: SIM_VERSION,
            seed: 777,
            difficulty: 'easy',
            hero: 'sage',
            trick: 'pounce',
            ticks: 14_000,
            inputs: 'AQIDBA==',
            outcome: 'won',
            finalHash: '0badc0de',
        };
        const verify = jest.fn(
            async (r: PawlegendsReplayRecord): Promise<PawlegendsVerifyResult> =>
                pawlegendsDigest(r) === pawlegendsDigest(record)
                    ? { ok: true, outcome: r.outcome, finalHash: r.finalHash, ticks: r.ticks, stats: [] }
                    : { ok: false, code: 'PAWLEGENDS_HASH_MISMATCH', message: 'no' }
        );
        const applyLive = jest.fn(async () => ({}));
        const deps = {
            users,
            games,
            verify,
            queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
            failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
            now: at('2026-11-13T10:00:00Z'),
            rewards: { applyLive },
        };
        await expect(
            savePawlegendsMatch(deps as any, userId, { pawlegends: { ...record, finalHash: 'deadbeef' } as any })
        ).rejects.toBeTruthy();
        expect(applyLive).not.toHaveBeenCalled();
        await savePawlegendsMatch(deps as any, userId, { pawlegends: record as any });
        expect(applyLive).toHaveBeenCalledTimes(1);
        expect(applyLive).toHaveBeenCalledWith(String(userId), { won: true, hero: 'sage' });
        await expect(savePawlegendsMatch(deps as any, userId, { pawlegends: record as any })).rejects.toBeTruthy();
        expect(applyLive).toHaveBeenCalledTimes(1);
    });

    it('a failing progress store never fails the save', async () => {
        const repo = new MemoryRepo();
        repo.ensure = async () => {
            throw new Error('down');
        };
        const s = PawlegendsProgressService.forRepo(repo);
        await expect(s.applyLive('acc', { won: true, hero: 'clem' })).resolves.toEqual({
            mastery: false,
            welcome: null,
            lucky: null,
        });
    });
});
