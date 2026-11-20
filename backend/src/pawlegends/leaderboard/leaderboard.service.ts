import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cat } from 'src/cat/cat.schema';
import { User } from 'src/user/user.schema';
import { ACCOUNT_LEVEL_PROJECTION, accountMatchesOf, legacyCredit, playedOf } from '../account-level';
import { countryOf, shownFlag, type FlagRow } from '../flags/flags';
import { PawlegendsFlag } from '../flags/flags.schema';
import { visibleFlags } from '../flags/flags.service';
import { playerCodes } from '../social/player-codes';
import { PawlegendsMatchHistory, PawlegendsMatchStats } from '../history/history.schema';
import { seasonAt, statsId } from '../history/history.model';
import { levelOf } from '../mode-unlocks';
import { CURRENT_SEASON_ID, SEASONS } from '../pawlegends-catalog';
import { PawlegendsOwned } from '../pawlegends.schema';
import { PawlegendsProgress } from '../progress/progress.schema';
import { isoWeek } from '../ranked/boards';
import { liveHeroIds, resolveAvatars } from '../social/avatar';
import { displayNames } from '../social/display-name';
import { PawlegendsSanction, PawlegendsSocial } from '../social/social.schema';
import type { AvatarView } from '../../shared-contracts/chat';
import { setLeaderboardSink, type LeaderboardSink } from './leaderboard-live';
import { PawlegendsLevel, PawlegendsSideMatch, PawlegendsSideWins } from './leaderboard.schema';
import { ownSideWins, sideCounterIds, winningSide, type Side, type SideRow } from './sides';

/*
 * The Leaderboards window (founder Nov 20: "top by Account Level (global), top in my country, Cats VS Dogs total wins
 * visual cool representation, Top Ranked"; then "let's show Global ... Country to see which country is #1 OR what's my #
 * in my country"), docs/plans/moba/LEADERBOARDS.md. Ranked stays RankedService's `global` board; this service answers:
 * - `level` (the Global tab): registered accounts by the account level's matches (account-level.ts, the same number
 *   the player's own Home and Profile show), the earliest to reach them first; the top 100, 20 a page. Guests, deleted
 *   and board-excluded accounts and sanctions in force are left out.
 * - `country`: "My country", the same board kept to the players whose flag shows the caller's country (a hidden flag
 *   never shows), with the caller's exact rank; and "Top countries", every country ranked by the sum of its shown
 *   players' account levels. A caller who hid their flag, or whose country is unknown, gets `local` saying why.
 * - `sides`: Cats vs Dogs wins this season, all time and this week (and last week, for the trend), plus, signed in,
 *   the caller's own wins this season by the species of their champion.
 * Every public answer is cached 60 s per key. The rows grow through leaderboard-live.ts; a signed-in board read heals
 * the caller's own Level row (a sign-in, a merge or a lifted exclusion shows at once).
 *
 * The repair (`backfill`, started ~60 s after boot), in versioned parts; bumping a part's key re-runs it on the next
 * boot (BACKFILL_KEYS):
 * 1. `legacy`: freezes each account's legacy credit ONCE (account-level.ts). Never bumped.
 * 2. `levels`: recomputes every Level row EXACTLY from the account level's matches (raises, lowers, creates the
 *    missing, removes guests, deleted and excluded), so a wrong or missing row is corrected, never kept.
 * 3. `sides`: rebuilds the Cats vs Dogs guard rows from the match history (side and season), then sets every counter
 *    from the guard rows. A win a crash dropped between its guard and its counters comes back.
 * Each part is idempotent and safe on several instances at once (a lock row per part in `pawlegendssidewins`, marked
 * `done`; a crashed run's lock lapses after 30 minutes and the next boot finishes it).
 */

type AnyModel = any;

/** Places ranked on the Global and My country boards. */
export const LEVEL_TOP = 100;
/** Rows per page on the Global and My country boards. */
export const LEVEL_PAGE = 20;
/** Country board: up to this many shown flags of a country, its Level rows are read by id (exact rank). */
export const COUNTRY_IDS_MAX = 20_000;
/** Country board, a bigger country: level rows read per step and at most in all. */
export const COUNTRY_SCAN_STEP = 500;
export const COUNTRY_SCAN_MAX = 20_000;
/** Top countries: countries listed, and Level rows read at most to build them. */
export const COUNTRIES_TOP = 50;
export const COUNTRIES_SCAN_MAX = 50_000;
/** Public answers live this long. */
export const LEADERBOARD_CACHE_MS = 60_000;
/** The repair: rows per batch, and how long a run holds its lock. */
export const BACKFILL_BATCH = 500;
export const BACKFILL_LOCK_MS = 30 * 60_000;
export const BACKFILL_DELAY_MS = 60_000;
/**
 * The repair parts' marker rows (in `pawlegendssidewins`). Bump `levels` or `sides` (v3, ...) to recompute them on the
 * next boot; `legacy` is frozen once and must never be bumped (it would credit accounts again).
 */
export const BACKFILL_KEYS = Object.freeze({
    legacy: 'backfill:legacy:v1',
    levels: 'backfill:levels:v2',
    sides: 'backfill:sides:v2',
});
/** Rows checked per `keep` query. */
const KEEP_BATCH = 1000;

export interface LevelRowView {
    rank: number;
    name: string;
    /** The account level. */
    value: number;
    /** The account level's matches. */
    m: number;
    me?: boolean;
    av?: AvatarView;
    cc?: string;
    /** The player's code (the Player Card); only on a signed-in caller's board. */
    code?: string;
}

export interface LevelMe {
    rank: number;
    value: number;
    m: number;
    /** A very big country only: below what the board scanned (rank is then LEVEL_TOP + 1, shown as "100+"). */
    over?: true;
    name?: string;
    av?: AvatarView;
    cc?: string;
}

/** Top countries: one country's place. */
export interface CountryRowView {
    rank: number;
    cc: string;
    /** Players showing the flag who are on the Global board. */
    players: number;
    /** The sum of their account levels (the ranking). */
    levels: number;
    /** The caller's own country. */
    me?: boolean;
}

export interface LevelAnswer {
    period: 'all';
    page: number;
    pages: number;
    rows: LevelRowView[];
    me?: LevelMe | null;
    /** Country board: the caller's country (their own only) and whether they hid their flag. */
    local?: { cc: string | null; hidden: boolean };
    /** Country board: Top countries (the first COUNTRIES_TOP), the caller's country when below them, and the count. */
    countries?: { rows: CountryRowView[]; mine: CountryRowView | null; total: number };
}

export interface SidesAnswer {
    season: { id: string; name: string; cat: number; dog: number };
    all: { cat: number; dog: number };
    week: { id: string; cat: number; dog: number };
    lastWeek: { id: string; cat: number; dog: number };
    /** Signed in: the caller's own wins this season by their champion's species. */
    mine?: { cat: number; dog: number };
}

interface LevelDoc {
    _id: string;
    m: number;
    at: Date;
}

interface Cached<T> {
    atMs: number;
    value: T;
}

interface BoardUser {
    _id: unknown;
    pawlegendsMatches?: Record<string, unknown>;
    pawlegendsLegacyMatches?: number;
    isGuest?: boolean;
    deletedAt?: Date;
    boardExcludedAt?: Date;
    lastPlayedAt?: Date;
}

const isDup = (e: unknown) => (e as { code?: unknown })?.code === 11000;
const onBoard = (u: BoardUser | null | undefined): u is BoardUser =>
    !!u && !u.isGuest && !u.deletedAt && !u.boardExcludedAt;
const BOARD_USER_FIELDS = Object.freeze({
    ...ACCOUNT_LEVEL_PROJECTION,
    isGuest: 1,
    deletedAt: 1,
    boardExcludedAt: 1,
    lastPlayedAt: 1,
});
const tick = () => new Promise(r => setImmediate(r));

/** Top countries from the kept Level rows and their shown flags: the sum of levels, then players, then the code. Pure. */
export function rankCountries(
    rows: ReadonlyArray<{ m: number; cc: string | null | undefined }>
): Array<Omit<CountryRowView, 'me'>> {
    const by = new Map<string, { players: number; levels: number }>();
    for (const r of rows) {
        if (!r.cc) continue;
        const c = by.get(r.cc) ?? { players: 0, levels: 0 };
        c.players++;
        c.levels += levelOf(r.m);
        by.set(r.cc, c);
    }
    return [...by.entries()]
        .sort(([a, x], [b, y]) => y.levels - x.levels || y.players - x.players || (a < b ? -1 : a > b ? 1 : 0))
        .map(([cc, c], i) => ({ rank: i + 1, cc, players: c.players, levels: c.levels }));
}

@Injectable()
export class LeaderboardService implements LeaderboardSink, OnModuleInit, OnModuleDestroy {
    private readonly cache = new Map<string, Cached<unknown>>();
    private readonly log = new Logger('PawlegendsLeaderboard');
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        @InjectModel(PawlegendsLevel.name) private readonly levels: AnyModel,
        @InjectModel(PawlegendsSideWins.name) private readonly sideWins: AnyModel,
        @InjectModel(PawlegendsSideMatch.name) private readonly sideMatches: AnyModel,
        @InjectModel(User.name) private readonly users: AnyModel,
        @InjectModel(PawlegendsMatchHistory.name) private readonly history: AnyModel,
        @InjectModel(PawlegendsMatchStats.name) private readonly stats: AnyModel,
        @InjectModel(PawlegendsSanction.name) private readonly sanctions: AnyModel,
        @InjectModel(PawlegendsSocial.name) private readonly social: AnyModel,
        @Optional() @InjectModel(PawlegendsFlag.name) private readonly flagRows?: AnyModel,
        @Optional() @InjectModel(Cat.name) private readonly cats?: AnyModel,
        @Optional() @InjectModel(PawlegendsOwned.name) private readonly owned?: AnyModel,
        @Optional() @InjectModel(PawlegendsProgress.name) private readonly progress?: AnyModel,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    onModuleInit(): void {
        setLeaderboardSink(this);
        // the versioned repair, off the boot path (jest never boots it: specs call `backfill` themselves)
        if (process.env.JEST_WORKER_ID) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.backfill().catch(e => this.log.warn(`repair failed: ${(e as Error)?.message ?? e}`));
        }, BACKFILL_DELAY_MS);
        this.timer.unref?.();
    }

    onModuleDestroy(): void {
        setLeaderboardSink(null);
        if (this.timer) clearTimeout(this.timer);
    }

    private now(): Date {
        return this.clock?.now() ?? new Date();
    }

    // -----------------------------------------------------------------------------------------------------------
    // writes (leaderboard-live.ts, a signed-in read's own row, and the repair only)

    /**
     * The account's Level row, exactly the account level's matches (account-level.ts): raised (with `at` = now),
     * lowered, created, or removed for a guest, a deleted or an excluded account and an account with no match. True when
     * it changed the row.
     */
    async syncLevel(accountId: string): Promise<boolean> {
        const [user, row] = await Promise.all([
            this.users.findById(accountId).select(BOARD_USER_FIELDS).lean() as Promise<BoardUser | null>,
            this.levels.findById(accountId).lean() as Promise<LevelDoc | null>,
        ]);
        const m = onBoard(user) ? accountMatchesOf(user) : 0;
        if (m <= 0) {
            if (!row) return false;
            await this.levels.deleteOne({ _id: accountId });
            return true;
        }
        if (row && row.m === m) return false;
        const at = this.now();
        if (row) {
            await this.levels.updateOne({ _id: accountId, m: row.m }, { $set: { m, ...(m > row.m ? { at } : {}) } });
            return true;
        }
        try {
            await this.levels.updateOne({ _id: accountId }, { $set: { m }, $setOnInsert: { at } }, { upsert: true });
        } catch (e) {
            if (!isDup(e)) throw e;
        }
        return true;
    }

    /**
     * Count one stored match for the side that won it, once per match id. True when this call counted it. The guard row
     * keeps the side and season, so the repair can rebuild the counters from it if an increment below is lost.
     */
    async countSides(row: SideRow): Promise<boolean> {
        const side = winningSide(row);
        if (!side) return false;
        const at = row.at instanceof Date ? row.at : new Date(row.at);
        try {
            await this.sideMatches.create({ _id: row.matchId, s: side, se: row.season || seasonAt(at), at });
        } catch (e) {
            if (isDup(e)) return false;
            throw e;
        }
        for (const id of sideCounterIds(row))
            await this.sideWins.updateOne({ _id: id }, { $inc: { [side]: 1 } }, { upsert: true });
        return true;
    }

    /** Take a repair part's lock: false when it finished already or another run holds it. */
    private async claim(key: string): Promise<boolean> {
        const now = this.now();
        try {
            await this.sideWins.updateOne(
                {
                    _id: key,
                    done: { $ne: true },
                    $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lt: now } }],
                },
                { $set: { lockUntil: new Date(now.getTime() + BACKFILL_LOCK_MS), startedAt: now } },
                { upsert: true }
            );
            return true;
        } catch (e) {
            if (isDup(e)) return false;
            throw e;
        }
    }

    private async finish(key: string, n: number): Promise<void> {
        await this.sideWins.updateOne(
            { _id: key },
            { $set: { done: true, doneAt: this.now(), n }, $unset: { lockUntil: 1 } }
        );
    }

    /** The versioned repair (see the header). Returns what each part changed, or 'skipped'. */
    async backfill(): Promise<{
        legacy: number | 'skipped';
        levels: number | 'skipped';
        sides: number | 'skipped';
    }> {
        const out: { legacy: number | 'skipped'; levels: number | 'skipped'; sides: number | 'skipped' } = {
            legacy: 'skipped',
            levels: 'skipped',
            sides: 'skipped',
        };
        const part = async (k: keyof typeof BACKFILL_KEYS, run: () => Promise<number>) => {
            if (!(await this.claim(BACKFILL_KEYS[k]))) return;
            const n = await run();
            out[k] = n;
            await this.finish(BACKFILL_KEYS[k], n);
            this.log.log(`repair ${k} done: changed=${n}`);
        };
        // the credit first: the Level rows are computed with it
        await part('legacy', () => this.freezeLegacy());
        await part('levels', () => this.repairLevels());
        await part('sides', () => this.repairSides());
        if (out.levels !== 'skipped' || out.sides !== 'skipped') this.cache.clear();
        return out;
    }

    /**
     * `legacy`: each account with a synced progress row and no credit yet gets `pawlegendsLegacyMatches` = its synced
     * device count above its saved count (account-level.ts legacyCredit). Writes only a credit above 0, only where the
     * field is missing. Returns the accounts credited.
     */
    private async freezeLegacy(): Promise<number> {
        if (!this.progress) return 0;
        let last: unknown = null;
        let n = 0;
        for (;;) {
            const batch = (await this.progress
                .find(last !== null ? { _id: { $gt: last } } : {})
                .sort({ _id: 1 })
                .limit(BACKFILL_BATCH)
                .select({ blob: 1 })
                .lean()) as Array<{ _id: string; blob?: { counts?: { matches?: unknown } } }>;
            if (!batch.length) break;
            last = batch[batch.length - 1]._id;
            let users: BoardUser[] = [];
            try {
                users = (await this.users
                    .find({ _id: { $in: batch.map(b => String(b._id)) } })
                    .select(ACCOUNT_LEVEL_PROJECTION)
                    .lean()) as BoardUser[];
            } catch (e) {
                this.log.warn(`repair legacy: a batch was skipped (${(e as Error)?.message ?? e})`);
            }
            const byId = new Map(users.map(u => [String(u._id), u]));
            for (const b of batch) {
                const u = byId.get(String(b._id));
                if (!u || u.pawlegendsLegacyMatches !== undefined) continue;
                const credit = legacyCredit(b.blob?.counts?.matches, playedOf(u.pawlegendsMatches).matches);
                if (credit <= 0) continue;
                await this.users.updateOne(
                    { _id: u._id, pawlegendsLegacyMatches: { $exists: false } },
                    { $set: { pawlegendsLegacyMatches: credit } }
                );
                n++;
            }
            if (batch.length < BACKFILL_BATCH) break;
            await tick();
        }
        return n;
    }

    /** `levels`: every Level row recomputed exactly (see syncLevel), and every row that should not exist removed. */
    private async repairLevels(): Promise<number> {
        let n = 0;
        // 1. every account with matches: create, raise or lower its row
        let last: unknown = null;
        for (;;) {
            const batch = (await this.users
                .find({
                    $or: [{ pawlegendsMatches: { $exists: true } }, { pawlegendsLegacyMatches: { $gt: 0 } }],
                    isGuest: { $ne: true },
                    deletedAt: { $exists: false },
                    boardExcludedAt: { $exists: false },
                    ...(last !== null ? { _id: { $gt: last } } : {}),
                })
                .sort({ _id: 1 })
                .limit(BACKFILL_BATCH)
                .select(BOARD_USER_FIELDS)
                .lean()) as BoardUser[];
            if (!batch.length) break;
            last = batch[batch.length - 1]._id;
            const ids = batch.map(u => String(u._id));
            const rows = (await this.levels.find({ _id: { $in: ids } }).lean()) as LevelDoc[];
            const have = new Map(rows.map(r => [String(r._id), r]));
            const ops: unknown[] = [];
            const drop: string[] = [];
            for (const u of batch) {
                const id = String(u._id);
                const m = accountMatchesOf(u);
                const row = have.get(id);
                const at = u.lastPlayedAt ? new Date(u.lastPlayedAt) : this.now();
                if (m <= 0) {
                    if (row) drop.push(id);
                } else if (!row)
                    ops.push({
                        updateOne: { filter: { _id: id }, update: { $set: { m }, $setOnInsert: { at } }, upsert: true },
                    });
                else if (row.m !== m)
                    ops.push({
                        updateOne: { filter: { _id: id }, update: { $set: { m, ...(m > row.m ? { at } : {}) } } },
                    });
            }
            if (ops.length) await this.levels.bulkWrite(ops, { ordered: false });
            if (drop.length) await this.levels.deleteMany({ _id: { $in: drop } });
            n += ops.length + drop.length;
            if (batch.length < BACKFILL_BATCH) break;
            await tick();
        }
        // 2. every row: gone when its account is gone, a guest, deleted or excluded
        last = null;
        for (;;) {
            const rows = (await this.levels
                .find(last !== null ? { _id: { $gt: last } } : {})
                .sort({ _id: 1 })
                .limit(BACKFILL_BATCH)
                .select({ _id: 1 })
                .lean()) as Array<{ _id: string }>;
            if (!rows.length) break;
            last = rows[rows.length - 1]._id;
            const ids = rows.map(r => String(r._id));
            const users = (await this.users
                .find({ _id: { $in: ids } })
                .select({ isGuest: 1, deletedAt: 1, boardExcludedAt: 1 })
                .lean()) as BoardUser[];
            const live = new Set(users.filter(onBoard).map(u => String(u._id)));
            const drop = ids.filter(id => !live.has(id));
            if (drop.length) await this.levels.deleteMany({ _id: { $in: drop } });
            n += drop.length;
            if (rows.length < BACKFILL_BATCH) break;
            await tick();
        }
        return n;
    }

    /** `sides`: guard rows from the history (side, season), then every counter set from the guard rows. */
    private async repairSides(): Promise<number> {
        // 1. a guard per counted match of the stored history (a live save's guard is kept; its side and season set)
        let last: unknown = null;
        const seen = new Set<string>();
        for (;;) {
            const batch = (await this.history
                .find(last !== null ? { _id: { $gt: last } } : {})
                .sort({ _id: 1 })
                .limit(BACKFILL_BATCH)
                .select({ matchId: 1, at: 1, season: 1, mode: 1, reason: 1, winner: 1, players: 1 })
                .lean()) as Array<SideRow & { _id: unknown }>;
            if (!batch.length) break;
            last = batch[batch.length - 1]._id;
            const ops: unknown[] = [];
            for (const row of batch) {
                if (seen.has(row.matchId)) continue;
                seen.add(row.matchId);
                const side = winningSide(row);
                if (!side) continue;
                const at = row.at instanceof Date ? row.at : new Date(row.at);
                if (!Number.isFinite(at.getTime())) continue;
                ops.push({
                    updateOne: {
                        filter: { _id: row.matchId },
                        update: { $set: { s: side, se: row.season || seasonAt(at) }, $setOnInsert: { at } },
                        upsert: true,
                    },
                });
            }
            if (ops.length) await this.sideMatches.bulkWrite(ops, { ordered: false });
            if (seen.size > 200_000) seen.clear();
            if (batch.length < BACKFILL_BATCH) break;
            await tick();
        }
        // 2. the counters from the guard rows alone
        const tally = new Map<string, { cat: number; dog: number }>();
        let counted = 0;
        last = null;
        for (;;) {
            const guards = (await this.sideMatches
                .find(last !== null ? { _id: { $gt: last } } : {})
                .sort({ _id: 1 })
                .limit(BACKFILL_BATCH * 2)
                .lean()) as Array<{ _id: string; s?: string; se?: string; at?: Date }>;
            if (!guards.length) break;
            last = guards[guards.length - 1]._id;
            for (const g of guards) {
                if (g.s !== 'cat' && g.s !== 'dog') continue;
                const at = g.at ? new Date(g.at) : null;
                if (!at || !Number.isFinite(at.getTime())) continue;
                counted++;
                for (const id of sideCounterIds({ at, season: g.se || seasonAt(at) } as SideRow)) {
                    const c = tally.get(id) ?? { cat: 0, dog: 0 };
                    c[g.s as Side]++;
                    tally.set(id, c);
                }
            }
            if (guards.length < BACKFILL_BATCH * 2) break;
            await tick();
        }
        const existing = (await this.sideWins.find({}).select({ _id: 1 }).lean()) as Array<{ _id: string }>;
        for (const { _id } of existing)
            if (/^(all$|season:|week:)/.test(String(_id)) && !tally.has(String(_id)))
                tally.set(String(_id), { cat: 0, dog: 0 });
        for (const [id, c] of tally)
            await this.sideWins.updateOne({ _id: id }, { $set: { cat: c.cat, dog: c.dog } }, { upsert: true });
        return counted;
    }

    // -----------------------------------------------------------------------------------------------------------
    // reads

    private async cached<T>(key: string, build: () => Promise<T>): Promise<T> {
        const now = this.now().getTime();
        const hit = this.cache.get(key) as Cached<T> | undefined;
        if (hit && now - hit.atMs < LEADERBOARD_CACHE_MS) return hit.value;
        const value = await build();
        this.cache.set(key, { atMs: now, value });
        if (this.cache.size > 400) for (const k of [...this.cache.keys()].slice(0, 100)) this.cache.delete(k);
        return value;
    }

    /** A signed-in read heals the caller's own row first; a change drops the cached boards. Never fails the read. */
    private async healOwn(caller: string): Promise<void> {
        try {
            if (await this.syncLevel(caller)) this.cache.clear();
        } catch {
            // the board still shows
        }
    }

    private async avatars(ids: readonly string[]): Promise<Map<string, AvatarView>> {
        try {
            return await resolveAvatars(
                {
                    social: this.social,
                    owned: this.owned ?? null,
                    progress: this.progress ?? null,
                    cats: this.cats ?? null,
                    heroes: liveHeroIds(),
                },
                ids
            );
        } catch {
            return new Map();
        }
    }

    /** Level rows that may show: no sanction in force, a registered account that is not deleted or excluded. */
    private async keep<T extends { _id: string }>(rows: T[]): Promise<T[]> {
        if (!rows.length) return rows;
        if (rows.length > KEEP_BATCH) {
            const out: T[] = [];
            for (let i = 0; i < rows.length; i += KEEP_BATCH)
                out.push(...(await this.keep(rows.slice(i, i + KEEP_BATCH))));
            return out;
        }
        const ids = rows.map(r => r._id);
        const now = this.now();
        const banned = (await this.sanctions
            .find({
                accountId: { $in: ids },
                kind: { $in: ['board_exclude', 'pvp_ban'] },
                $or: [{ until: null }, { until: { $gt: now } }],
            })
            .lean()) as Array<{ accountId: string }>;
        const out = new Set(banned.map(b => b.accountId));
        try {
            const users = (await this.users
                .find({ _id: { $in: ids } })
                .select({ isGuest: 1, deletedAt: 1, boardExcludedAt: 1 })
                .lean()) as BoardUser[];
            const live = new Set(users.filter(onBoard).map(u => String(u._id)));
            for (const id of ids) if (!live.has(id)) out.add(id);
        } catch {
            // the users read failed: the sanctions alone decide (a stale row shows until the next sync)
        }
        return rows.filter(r => !out.has(r._id));
    }

    /** The Global board's kept order (top 100), cached. */
    private levelOrder(): Promise<LevelDoc[]> {
        return this.cached('level', async () => {
            const raw = (await this.levels
                .find({})
                .sort({ m: -1, at: 1, _id: 1 })
                .limit(LEVEL_TOP + 60)
                .lean()) as LevelDoc[];
            return (await this.keep(raw)).slice(0, LEVEL_TOP);
        });
    }

    /**
     * My country's kept order, cached per country: every shown row of a country up to COUNTRY_IDS_MAX flags (so my rank
     * is exact however low), else the top 100 found by walking the Global order (`full` false).
     */
    private countryOrder(cc: string): Promise<{ rows: LevelDoc[]; full: boolean }> {
        return this.cached(`country|${cc}`, async () => {
            if (!this.flagRows) return { rows: [], full: true };
            // the country's shown flags first (index `cc, off`): every player of a small country is found, however low
            const flagIds = (await this.flagRows
                .find({ cc, off: { $ne: true } })
                .select({ _id: 1 })
                .limit(COUNTRY_IDS_MAX + 1)
                .lean()) as Array<{ _id: string }>;
            if (flagIds.length <= COUNTRY_IDS_MAX) {
                if (!flagIds.length) return { rows: [], full: true };
                const raw = (await this.levels
                    .find({ _id: { $in: flagIds.map(f => String(f._id)) } })
                    .sort({ m: -1, at: 1, _id: 1 })
                    .lean()) as LevelDoc[];
                return { rows: await this.keep(raw), full: true };
            }
            // a big country: walk the Global order and keep its flags
            const out: LevelDoc[] = [];
            for (let skip = 0; skip < COUNTRY_SCAN_MAX && out.length < LEVEL_TOP; skip += COUNTRY_SCAN_STEP) {
                const raw = (await this.levels
                    .find({})
                    .sort({ m: -1, at: 1, _id: 1 })
                    .skip(skip)
                    .limit(COUNTRY_SCAN_STEP)
                    .lean()) as LevelDoc[];
                if (!raw.length) break;
                const here = (await this.flagRows
                    .find({ _id: { $in: raw.map(r => r._id) }, cc, off: { $ne: true } })
                    .select({ _id: 1 })
                    .lean()) as Array<{ _id: string }>;
                const set = new Set(here.map(h => String(h._id)));
                out.push(...(await this.keep(raw.filter(r => set.has(r._id)))));
                if (raw.length < COUNTRY_SCAN_STEP) break;
            }
            return { rows: out.slice(0, LEVEL_TOP), full: false };
        });
    }

    /**
     * Top countries, cached: every kept Level row (up to COUNTRIES_SCAN_MAX, in the Global order) with a shown flag, by
     * country: the sum of their account levels, then players, then the code.
     */
    private countryRanking(): Promise<Array<Omit<CountryRowView, 'me'>>> {
        return this.cached('countries', async () => {
            if (!this.flagRows) return [];
            const rows: Array<{ m: number; cc: string | null }> = [];
            for (let skip = 0; skip < COUNTRIES_SCAN_MAX; skip += KEEP_BATCH) {
                const raw = (await this.levels
                    .find({})
                    .sort({ m: -1, at: 1, _id: 1 })
                    .skip(skip)
                    .limit(KEEP_BATCH)
                    .lean()) as LevelDoc[];
                if (!raw.length) break;
                const kept = await this.keep(raw);
                const flags = kept.length
                    ? ((await this.flagRows
                          .find({ _id: { $in: kept.map(r => r._id) } })
                          .select({ cc: 1, off: 1 })
                          .lean()) as Array<FlagRow & { _id: string }>)
                    : [];
                const cc = new Map(flags.map(f => [String(f._id), shownFlag(f)]));
                for (const r of kept) rows.push({ m: r.m, cc: cc.get(r._id) ?? null });
                if (raw.length < KEEP_BATCH) break;
            }
            return rankCountries(rows);
        });
    }

    /** The caller's exact place: in the kept order, else every kept row above theirs (never inside the top 100). */
    private async exactRank(mine: LevelDoc, order: LevelDoc[]): Promise<number> {
        const at = order.findIndex(r => r._id === mine._id);
        if (at >= 0) return at + 1;
        const above = (await this.levels
            .find({
                $or: [
                    { m: { $gt: mine.m } },
                    { m: mine.m, at: { $lt: mine.at } },
                    { m: mine.m, at: mine.at, _id: { $lt: mine._id } },
                ],
            })
            .select({ _id: 1, m: 1, at: 1 })
            .limit(COUNTRY_SCAN_MAX)
            .lean()) as LevelDoc[];
        return Math.max(order.length + 1, (await this.keep(above)).length + 1);
    }

    /** One dressed page of an order (names, avatars, visible flags), cached with the order's key. */
    private async page(
        key: string,
        order: LevelDoc[],
        page: number
    ): Promise<{ rows: LevelRowView[]; accs: string[]; pages: number }> {
        const pages = Math.max(1, Math.ceil(order.length / LEVEL_PAGE));
        const p = Math.min(page, pages - 1);
        return this.cached(`${key}|p${p}`, async () => {
            const slice = order.slice(p * LEVEL_PAGE, p * LEVEL_PAGE + LEVEL_PAGE);
            const ids = slice.map(r => r._id);
            const [names, avs, ccs, codes] = await Promise.all([
                displayNames({ social: this.social, cats: this.cats }, ids),
                this.avatars(ids),
                visibleFlags(this.flagRows, ids),
                playerCodes(this.social, ids).catch(() => new Map<string, string>()),
            ]);
            return {
                pages,
                accs: ids,
                rows: slice.map((r, i) => ({
                    rank: p * LEVEL_PAGE + i + 1,
                    name: names.get(r._id) ?? '',
                    value: levelOf(r.m),
                    m: r.m,
                    ...(avs.get(r._id) ? { av: avs.get(r._id) } : {}),
                    ...(ccs.get(r._id) ? { cc: ccs.get(r._id) } : {}),
                    // the Player Card (PLAYER-CARD.md): signed-in callers only (the public route drops it)
                    ...(codes.get(r._id) ? { code: codes.get(r._id) } : {}),
                })),
            };
        });
    }

    private async dress(caller: string, me: LevelMe): Promise<LevelMe> {
        const [names, avs, ccs] = await Promise.all([
            displayNames({ social: this.social, cats: this.cats }, [caller]),
            this.avatars([caller]),
            visibleFlags(this.flagRows, [caller]),
        ]);
        return {
            ...me,
            ...(names.get(caller) ? { name: names.get(caller) } : {}),
            ...(avs.get(caller) ? { av: avs.get(caller) } : {}),
            ...(ccs.get(caller) ? { cc: ccs.get(caller) } : {}),
        };
    }

    /** The caller's kept Level row, or null (not on the boards). */
    private async ownRow(caller: string): Promise<LevelDoc | null> {
        const mine = (await this.levels.findById(caller).lean()) as LevelDoc | null;
        return mine && (await this.keep([mine])).length ? mine : null;
    }

    /** `GET boards/level[/me]` (the Global tab): the top 100 by account level; signed in, the caller's own row too. */
    async levelBoard(pageIn: number, caller: string | null): Promise<LevelAnswer> {
        if (caller) await this.healOwn(caller);
        const order = await this.levelOrder();
        const out = await this.page('level', order, pageIn);
        const answer: LevelAnswer = {
            period: 'all',
            page: Math.min(pageIn, out.pages - 1),
            pages: out.pages,
            rows: out.rows,
        };
        if (!caller) return answer;
        answer.rows = out.rows.map((r, i) => (out.accs[i] === caller ? { ...r, me: true } : r));
        const mine = await this.ownRow(caller);
        const me: LevelMe | null = mine
            ? { rank: await this.exactRank(mine, order), value: levelOf(mine.m), m: mine.m }
            : null;
        answer.me = me ? await this.dress(caller, me) : null;
        return answer;
    }

    /**
     * `GET boards/country/me`: My country (the Global board kept to the caller's shown flag, with the caller's exact
     * rank) and Top countries (every country by the sum of its players' account levels).
     */
    async countryBoard(pageIn: number, caller: string): Promise<LevelAnswer> {
        await this.healOwn(caller);
        let flag: FlagRow | null = null;
        try {
            flag = this.flagRows
                ? ((await this.flagRows.findById(caller).select({ cc: 1, off: 1 }).lean()) as FlagRow | null) ?? null
                : null;
        } catch {
            flag = null;
        }
        const cc = shownFlag(flag);
        const local = { cc: cc ?? countryOf(flag?.cc), hidden: !!flag?.off };
        const ranking = await this.countryRanking().catch(() => [] as Array<Omit<CountryRowView, 'me'>>);
        const mineAt = cc ? ranking.findIndex(r => r.cc === cc) : -1;
        const countries = {
            rows: ranking.slice(0, COUNTRIES_TOP).map(r => (r.cc === cc ? { ...r, me: true } : r)),
            mine: mineAt >= COUNTRIES_TOP ? { ...ranking[mineAt], me: true } : null,
            total: ranking.length,
        };
        if (!cc) return { period: 'all', page: 0, pages: 1, rows: [], me: null, local, countries };
        const { rows: full, full: exact } = await this.countryOrder(cc);
        const order = full.slice(0, LEVEL_TOP);
        const out = await this.page(`country|${cc}`, order, pageIn);
        const rows = out.rows.map((r, i) => (out.accs[i] === caller ? { ...r, me: true } : r));
        let me: LevelMe | null = null;
        const at = full.findIndex(r => r._id === caller);
        if (at >= 0) me = { rank: at + 1, value: levelOf(full[at].m), m: full[at].m };
        else if (!exact) {
            const mine = await this.ownRow(caller);
            if (mine) me = { rank: LEVEL_TOP + 1, value: levelOf(mine.m), m: mine.m, over: true };
        }
        return {
            period: 'all',
            page: Math.min(pageIn, out.pages - 1),
            pages: out.pages,
            rows,
            me: me ? await this.dress(caller, me) : null,
            local,
            countries,
        };
    }

    /**
     * `GET boards/countries` (public, guests too; founder Nov 20 "yes"): Top countries alone, every country by the sum of
     * its shown players' account levels. Only the country code, the rank, the players count and the level total: no
     * player, id or code. Cached 60 s (the same ranking the signed-in Country board reads).
     */
    async countriesBoard(): Promise<{ countries: { rows: CountryRowView[]; mine: null; total: number } }> {
        const ranking = await this.countryRanking().catch(() => [] as Array<Omit<CountryRowView, 'me'>>);
        return {
            countries: {
                rows: ranking
                    .slice(0, COUNTRIES_TOP)
                    .map(r => ({ rank: r.rank, cc: r.cc, players: r.players, levels: r.levels })),
                mine: null,
                total: ranking.length,
            },
        };
    }

    /** `GET boards/sides[/me]`: Cats vs Dogs wins (season, all time, this and last week); signed in, mine too. */
    async sidesBoard(caller: string | null): Promise<SidesAnswer> {
        const now = this.now();
        const week = isoWeek(now);
        const lastWeek = isoWeek(new Date(now.getTime() - 7 * 86_400_000));
        // the season the match history files a match under now (history.model seasonAt), so the counter and `mine` match
        const seasonId = seasonAt(now);
        const season = SEASONS.find(s => s.id === seasonId) ?? SEASONS.find(s => s.id === CURRENT_SEASON_ID)!;
        const shared = await this.cached(`sides|${season.id}|${week}`, async () => {
            const ids = ['all', `season:${season.id}`, `week:${week}`, `week:${lastWeek}`];
            const rows = (await this.sideWins.find({ _id: { $in: ids } }).lean()) as Array<{
                _id: string;
                cat?: number;
                dog?: number;
            }>;
            const of = (id: string) => {
                const r = rows.find(x => x._id === id);
                return { cat: Math.max(0, Number(r?.cat) || 0), dog: Math.max(0, Number(r?.dog) || 0) };
            };
            return {
                season: { id: season.id, name: season.name, ...of(`season:${season.id}`) },
                all: of('all'),
                week: { id: week, ...of(`week:${week}`) },
                lastWeek: { id: lastWeek, ...of(`week:${lastWeek}`) },
            } as SidesAnswer;
        });
        if (!caller) return shared;
        let mine: { cat: number; dog: number } = { cat: 0, dog: 0 };
        try {
            const doc = (await this.stats.findById(statsId(caller, season.id)).lean()) as {
                heroes?: Record<string, { w?: number }>;
            } | null;
            mine = ownSideWins(doc?.heroes);
        } catch {
            // no own split: the board still shows
        }
        return { ...shared, mine };
    }
}
