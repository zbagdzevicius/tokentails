import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cat } from 'src/cat/cat.schema';
import { User } from 'src/user/user.schema';
import { countryOf, shownFlag, type FlagRow } from '../flags/flags';
import { PawlegendsFlag } from '../flags/flags.schema';
import { visibleFlags } from '../flags/flags.service';
import { playerCodes } from '../social/player-codes';
import { PawlegendsMatchHistory, PawlegendsMatchStats } from '../history/history.schema';
import { seasonAt, statsId } from '../history/history.model';
import { playedOf } from '../mm/rating.schema';
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
import { ownSideWins, sideCounterIds, winningSide, type SideRow } from './sides';

/*
 * The Leaderboards window (founder Nov 20: "top by Account Level (global), top in my country, Cats VS Dogs total wins
 * visual cool representation, Top Ranked"), docs/plans/moba/LEADERBOARDS.md. Ranked stays RankedService's `global`
 * board; this service answers the other three:
 * - `level`: registered accounts by verified finished matches (the account level's own count), the earliest to reach
 *   them first; the top 100, 20 a page. Guests, deleted and board-excluded accounts and sanctions in force are left out.
 * - `country`: the same board kept to the players whose flag shows the caller's country (a hidden flag never shows;
 *   a caller who hid theirs, or whose country is unknown, gets `local` saying why and no rows).
 * - `sides`: Cats vs Dogs wins this season, all time and this week (and last week, for the trend), plus, signed in,
 *   the caller's own wins this season by the species of their champion.
 * Every public answer is cached 60 s per key. Reads never write; the rows grow only through leaderboard-live.ts.
 *
 * The one-time backfill (`backfill`, started ~60 s after boot): Level rows from every registered account's
 * `pawlegendsMatches`, and Cats vs Dogs from every stored history row. Safe to run again and from several instances at
 * once: Level rows only `$max` up, and a match is counted only by the instance that inserts its guard row
 * (`pawlegendssidematches`, `_id` = match id), the same guard a live save takes. A marker row per part
 * (`backfill:*:v1` in `pawlegendssidewins`) records that it finished; a crashed run's lock lapses after 30 minutes and
 * the next boot finishes it.
 */

type AnyModel = any;

/** Places ranked on the Level and Country boards. */
export const LEVEL_TOP = 100;
/** Rows per page on the Level and Country boards. */
export const LEVEL_PAGE = 20;
/** Country board: up to this many shown flags of a country, its Level rows are read by id (one query each). */
export const COUNTRY_IDS_MAX = 20_000;
/** Country board, a bigger country: level rows read per step and at most in all. */
export const COUNTRY_SCAN_STEP = 500;
export const COUNTRY_SCAN_MAX = 20_000;
/** Public answers live this long. */
export const LEADERBOARD_CACHE_MS = 60_000;
/** The backfill: rows per batch, and how long a run holds its lock. */
export const BACKFILL_BATCH = 500;
export const BACKFILL_LOCK_MS = 30 * 60_000;
export const BACKFILL_DELAY_MS = 60_000;
export const BACKFILL_KEYS = Object.freeze({ levels: 'backfill:levels:v1', sides: 'backfill:sides:v1' });

export interface LevelRowView {
    rank: number;
    name: string;
    /** The account level. */
    value: number;
    /** Finished matches. */
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
    /** Country board: below its top 100 (rank is then LEVEL_TOP + 1, shown as "100+"). */
    over?: true;
    name?: string;
    av?: AvatarView;
    cc?: string;
}

export interface LevelAnswer {
    period: 'all';
    page: number;
    pages: number;
    rows: LevelRowView[];
    me?: LevelMe | null;
    /** Country board: the caller's country (their own only) and whether they hid their flag. */
    local?: { cc: string | null; hidden: boolean };
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

const isDup = (e: unknown) => (e as { code?: unknown })?.code === 11000;

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
        // the one-time backfill, off the boot path (jest never boots it: specs call `backfill` themselves)
        if (process.env.JEST_WORKER_ID) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.backfill().catch(e => this.log.warn(`backfill failed: ${(e as Error)?.message ?? e}`));
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
    // writes (leaderboard-live.ts and the backfill only)

    /** The account's Level row from its verified `pawlegendsMatches` (never lowered; gone for a guest or a deleted account). */
    async syncLevel(accountId: string): Promise<void> {
        const user = (await this.users
            .findById(accountId)
            .select({ pawlegendsMatches: 1, isGuest: 1, deletedAt: 1, boardExcludedAt: 1 })
            .lean()) as Record<string, any> | null;
        if (!user) return;
        if (user.isGuest || user.deletedAt || user.boardExcludedAt) {
            await this.levels.deleteOne({ _id: accountId });
            return;
        }
        const m = playedOf(user.pawlegendsMatches).matches;
        if (m <= 0) return;
        const row = (await this.levels.findById(accountId).lean()) as LevelDoc | null;
        if (row && row.m >= m) return;
        const at = this.now();
        if (row) await this.levels.updateOne({ _id: accountId, m: { $lt: m } }, { $set: { m, at } });
        else {
            try {
                await this.levels.updateOne(
                    { _id: accountId },
                    { $max: { m }, $setOnInsert: { at } },
                    { upsert: true }
                );
            } catch (e) {
                if (!isDup(e)) throw e;
            }
        }
    }

    /** Count one stored match for the side that won it, once per match id. True when this call counted it. */
    async countSides(row: SideRow): Promise<boolean> {
        const side = winningSide(row);
        if (!side) return false;
        const at = row.at instanceof Date ? row.at : new Date(row.at);
        try {
            await this.sideMatches.create({ _id: row.matchId, s: side, at });
        } catch (e) {
            if (isDup(e)) return false;
            throw e;
        }
        for (const id of sideCounterIds(row))
            await this.sideWins.updateOne({ _id: id }, { $inc: { [side]: 1 } }, { upsert: true });
        return true;
    }

    /** Take a backfill part's lock: false when it finished already or another run holds it. */
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

    /** The one-time backfill of both parts (see the header). Returns what each part did. */
    async backfill(): Promise<{ levels: number | 'skipped'; sides: number | 'skipped' }> {
        const out: { levels: number | 'skipped'; sides: number | 'skipped' } = { levels: 'skipped', sides: 'skipped' };
        if (await this.claim(BACKFILL_KEYS.levels)) {
            out.levels = await this.backfillLevels();
            await this.finish(BACKFILL_KEYS.levels, out.levels);
            this.log.log(`backfill levels done: rows=${out.levels}`);
        }
        if (await this.claim(BACKFILL_KEYS.sides)) {
            out.sides = await this.backfillSides();
            await this.finish(BACKFILL_KEYS.sides, out.sides);
            this.log.log(`backfill sides done: counted=${out.sides}`);
        }
        return out;
    }

    private async backfillLevels(): Promise<number> {
        let last: unknown = null;
        let n = 0;
        for (;;) {
            const batch = (await this.users
                .find({
                    pawlegendsMatches: { $exists: true },
                    isGuest: { $ne: true },
                    deletedAt: { $exists: false },
                    boardExcludedAt: { $exists: false },
                    ...(last !== null ? { _id: { $gt: last } } : {}),
                })
                .sort({ _id: 1 })
                .limit(BACKFILL_BATCH)
                .select({ pawlegendsMatches: 1, lastPlayedAt: 1 })
                .lean()) as Array<{ _id: unknown; pawlegendsMatches?: Record<string, unknown>; lastPlayedAt?: Date }>;
            if (!batch.length) break;
            last = batch[batch.length - 1]._id;
            const ops = batch
                .map(u => ({ id: String(u._id), m: playedOf(u.pawlegendsMatches).matches, at: u.lastPlayedAt }))
                .filter(u => u.m > 0)
                .map(u => ({
                    updateOne: {
                        filter: { _id: u.id },
                        update: { $max: { m: u.m }, $setOnInsert: { at: u.at ? new Date(u.at) : this.now() } },
                        upsert: true,
                    },
                }));
            if (ops.length) await this.levels.bulkWrite(ops, { ordered: false });
            n += ops.length;
            if (batch.length < BACKFILL_BATCH) break;
            await new Promise(r => setImmediate(r));
        }
        return n;
    }

    private async backfillSides(): Promise<number> {
        let last: unknown = null;
        let n = 0;
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
            for (const row of batch) {
                if (seen.has(row.matchId)) continue;
                seen.add(row.matchId);
                if (await this.countSides(row)) n++;
            }
            if (seen.size > 200_000) seen.clear();
            if (batch.length < BACKFILL_BATCH) break;
            await new Promise(r => setImmediate(r));
        }
        return n;
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
    private async keep(rows: LevelDoc[]): Promise<LevelDoc[]> {
        if (!rows.length) return rows;
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
                .lean()) as Array<{ _id: unknown; isGuest?: boolean; deletedAt?: Date; boardExcludedAt?: Date }>;
            const live = new Set(
                users.filter(u => !u.isGuest && !u.deletedAt && !u.boardExcludedAt).map(u => String(u._id))
            );
            for (const id of ids) if (!live.has(id)) out.add(id);
        } catch {
            // the users read failed: the sanctions alone decide (a stale row shows until the next sync)
        }
        return rows.filter(r => !out.has(r._id));
    }

    /** The Level board's kept order (top 100), cached. */
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

    /** The Country board's kept order (top 100 showing `cc`), cached per country. */
    private countryOrder(cc: string): Promise<LevelDoc[]> {
        return this.cached(`country|${cc}`, async () => {
            if (!this.flagRows) return [];
            // the country's shown flags first (index `cc, off`): every player of a small country is found, however low
            const flagIds = (await this.flagRows
                .find({ cc, off: { $ne: true } })
                .select({ _id: 1 })
                .limit(COUNTRY_IDS_MAX + 1)
                .lean()) as Array<{ _id: string }>;
            if (flagIds.length <= COUNTRY_IDS_MAX) {
                if (!flagIds.length) return [];
                const raw = (await this.levels
                    .find({ _id: { $in: flagIds.map(f => String(f._id)) } })
                    .sort({ m: -1, at: 1, _id: 1 })
                    .limit(LEVEL_TOP + 60)
                    .lean()) as LevelDoc[];
                return (await this.keep(raw)).slice(0, LEVEL_TOP);
            }
            // a big country: walk the Level order and keep its flags
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
            return out.slice(0, LEVEL_TOP);
        });
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

    /** `GET boards/level[/me]`: the top 100 by account level; signed in, the caller's own row too. */
    async levelBoard(pageIn: number, caller: string | null): Promise<LevelAnswer> {
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
        const at = order.findIndex(r => r._id === caller);
        let me: LevelMe | null = null;
        if (at >= 0) me = { rank: at + 1, value: levelOf(order[at].m), m: order[at].m };
        else {
            const mine = (await this.levels.findById(caller).lean()) as LevelDoc | null;
            if (mine && (await this.keep([mine])).length) {
                const above = await this.levels.countDocuments({
                    $or: [{ m: { $gt: mine.m } }, { m: mine.m, at: { $lt: mine.at } }],
                });
                me = { rank: Math.max(LEVEL_TOP + 1, above + 1), value: levelOf(mine.m), m: mine.m };
            }
        }
        answer.me = me ? await this.dress(caller, me) : null;
        return answer;
    }

    /** `GET boards/country/me`: the Level board kept to the caller's country (from their shown flag). */
    async countryBoard(pageIn: number, caller: string): Promise<LevelAnswer> {
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
        if (!cc) return { period: 'all', page: 0, pages: 1, rows: [], me: null, local };
        const order = await this.countryOrder(cc);
        const out = await this.page(`country|${cc}`, order, pageIn);
        const rows = out.rows.map((r, i) => (out.accs[i] === caller ? { ...r, me: true } : r));
        const at = order.findIndex(r => r._id === caller);
        let me: LevelMe | null = null;
        if (at >= 0) me = { rank: at + 1, value: levelOf(order[at].m), m: order[at].m };
        else {
            const mine = (await this.levels.findById(caller).lean()) as LevelDoc | null;
            if (mine) me = { rank: LEVEL_TOP + 1, value: levelOf(mine.m), m: mine.m, over: true };
        }
        return {
            period: 'all',
            page: Math.min(pageIn, out.pages - 1),
            pages: out.pages,
            rows,
            me: me ? await this.dress(caller, me) : null,
            local,
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
