import { visibleFlags } from '../flags/flags.service';
import { countryOf, shownFlag, type FlagRow } from '../flags/flags';
import { PawlegendsFlag } from '../flags/flags.schema';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cat } from 'src/cat/cat.schema';
import { User } from 'src/user/user.schema';
import { PawlegendsMmRoom } from '../mm/mm-room.schema';
import type { MmRoomRecord } from '../mm/mm-room.schema';
import { PawlegendsRating, playedOf } from '../mm/rating.schema';
import type { MmRatingRow, RankedFields } from '../mm/rating.schema';
import { CURRENT_SEASON_ID, SEASONS } from '../pawlegends-catalog';
import { pawlegendsError } from '../pawlegends.errors';
import { displayNames } from '../social/display-name';
import { liveHeroIds, resolveAvatars } from '../social/avatar';
import type { AvatarView } from '../../shared-contracts/chat';
import { PawlegendsOwned } from '../pawlegends.schema';
import { PawlegendsProgress } from '../progress/progress.schema';
import { PawlegendsBoard, PawlegendsFriend, PawlegendsSanction, PawlegendsSocial } from '../social/social.schema';
import { BOARD_PAGE, HERO_MIN_GAMES, isoWeek } from './boards';
import { decayedPoints, ladderOf, legendInactive } from './points';
import { pendingRoomsFilter } from './settlement';
import { RankedStatusService } from './status';
import { primeTime } from './windows';
import {
    LEGEND_IDX,
    PLACEMENTS,
    RANKED_BOTS,
    RANKED_MIN_MATCHES,
    RANKED_REGIONS,
    rankedByMatches,
    tierIdOf,
    tierLabel,
} from './tiers';

/*
 * Ranked and board reads (docs/plans/moba/SOCIAL-RANKED.md §6.3, §7.9, §10). Read only: nothing here writes a score, a
 * rating or a board row (`/live` does). Names come from `displayNames` only. Public boards are cached 60 s per key.
 */

type AnyModel = any;

export const BOARD_KINDS = ['global', 'friends', 'hero', 'weekly', 'local'] as const;

/** Local board scan (players of one country on the season's ranked ladder): rows read per step and at most in all. */
export const LOCAL_SCAN_STEP = 500;
export const LOCAL_SCAN_MAX = 20_000;
/** Local board: places ranked (the same top 100 as Global). */
export const LOCAL_TOP = 100;
export type BoardKind = typeof BOARD_KINDS[number];

const badKind = () => pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_BOARD_KIND', 'Unknown board');
export const needAccount = () =>
    pawlegendsError(HttpStatus.FORBIDDEN, 'PAWLEGENDS_NEED_ACCOUNT', 'Sign in to see this');

type RankedRow = MmRatingRow & Partial<RankedFields>;
/** A placed ranked row with its shown (decayed) tier and points. */
type Kept = { row: RankedRow; tierIdx: number; points: number; ladder: number };

export interface BoardAnswer {
    period: string;
    rows: Array<{
        rank: number;
        name: string;
        value: number;
        tier?: string;
        hero?: string;
        winRate?: number;
        me?: boolean;
        /** CHAT-AVATARS §7.3: the player's avatar. */
        av?: AvatarView;
        /** FLAGS.md: the player's visible flag (absent when hidden or unknown). */
        cc?: string;
    }>;
    /** The caller's own row (signed in): their rank and value, plus how their row looks (name, avatar, flag, tier). */
    me?: BoardMe | null;
    page: number;
    pages: number;
    /** Local board: the caller's country (`cc`, only their own) and whether they hid their flag (then no board). */
    local?: { cc: string | null; hidden: boolean };
}

export interface BoardMe {
    rank: number;
    value: number;
    name?: string;
    tier?: string;
    av?: AvatarView;
    cc?: string;
}

/** A cached public page plus the accounts of its rows (never sent), so a caller's own row can be marked `me`. */
interface Cached {
    atMs: number;
    value: BoardAnswer;
    accs: string[];
    /** Local: every kept account in order with its points (the caller's rank comes from here). */
    order?: Array<{ acc: string; points: number; tier: string }>;
}

@Injectable()
export class RankedService {
    private readonly cache = new Map<string, Cached>();

    constructor(
        @InjectModel(PawlegendsRating.name) private readonly ratings: AnyModel,
        @InjectModel(PawlegendsBoard.name) private readonly boards: AnyModel,
        @InjectModel(PawlegendsFriend.name) private readonly friends: AnyModel,
        @InjectModel(PawlegendsSanction.name) private readonly sanctions: AnyModel,
        @InjectModel(PawlegendsSocial.name) private readonly social: AnyModel,
        @InjectModel(PawlegendsMmRoom.name) private readonly rooms: AnyModel,
        @InjectModel(User.name) private readonly users: AnyModel,
        private readonly live: RankedStatusService,
        @Optional() @InjectModel(Cat.name) private readonly cats?: AnyModel,
        @Optional() private readonly clock?: { now(): Date },
        @Optional() @InjectModel(PawlegendsOwned.name) private readonly owned?: AnyModel,
        // FLAGS.md: board rows carry the player's country flag (hidden ones are absent)
        @Optional() @InjectModel(PawlegendsFlag.name) private readonly flagRows?: AnyModel,
        // the Treat Track's champion titles and frames are owned through progress (social/avatar.ts)
        @Optional() @InjectModel(PawlegendsProgress.name) private readonly progress?: AnyModel
    ) {}

    /** Board rows' avatars (CHAT-AVATARS.md §7.3), checked against what each player still owns. Never fails a board. */
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

    private now(): Date {
        return this.clock?.now() ?? new Date();
    }

    private season() {
        const s = SEASONS.find(x => x.id === CURRENT_SEASON_ID)!;
        return { id: s.id, name: s.name, startsAt: s.startsAt, endsAt: s.endsAt };
    }

    /**
     * `GET ranked/status` (SOCIAL-RANKED.md §7.9, §7.11): always open since round 4. The online and searching counts
     * (30 s), Prime Time (the current or next window), the bot rules the game explains and the regions with the path
     * the game times for its ping. `need` stays 0 for older games (they read it only while closed).
     */
    async status() {
        const g = await this.live.read();
        const pt = primeTime(this.now().getTime());
        return {
            open: true,
            online: g.online,
            need: 0,
            searching: g.searching,
            primeTime: { active: pt.active, startsAt: pt.startsAt, endsAt: pt.endsAt },
            bots: { ...RANKED_BOTS },
            regions: RANKED_REGIONS.map(r => ({ ...r })),
            season: this.season(),
        };
    }

    /** Accounts kept off every board now (a sanction in force). */
    private async excluded(ids: string[]): Promise<Set<string>> {
        if (!ids.length) return new Set();
        const now = this.now();
        const rows = (await this.sanctions
            .find({
                accountId: { $in: ids },
                kind: { $in: ['board_exclude', 'pvp_ban'] },
                $or: [{ until: null }, { until: { $gt: now } }],
            })
            .lean()) as Array<{ accountId: string }>;
        return new Set(rows.map(r => r.accountId));
    }

    private shown(row: RankedRow, now: Date) {
        const points = decayedPoints(
            { tierIdx: row.tierIdx ?? 0, points: row.points ?? 0 },
            row.lastRankedAt ?? null,
            now
        );
        return { tierIdx: row.tierIdx ?? 0, points, ladder: ladderOf({ tierIdx: row.tierIdx ?? 0, points }) };
    }

    async board(kind: string, query: Record<string, unknown>, caller: string | null): Promise<BoardAnswer> {
        if (!(BOARD_KINDS as readonly string[]).includes(kind)) throw badKind();
        const page = Math.max(0, Math.min(50, Math.floor(Number(query.page) || 0)));
        if (kind === 'friends') {
            if (!caller) throw needAccount();
            return this.friendsBoard(caller, page);
        }
        const now = this.now();
        const season =
            typeof query.season === 'string' && /^s\d{1,3}$/.test(query.season) ? query.season : CURRENT_SEASON_ID;
        if (kind === 'local') {
            if (!caller) throw needAccount();
            return this.localBoard(caller, season, page, now);
        }
        const week = typeof query.week === 'string' && /^\d{4}-W\d{2}$/.test(query.week) ? query.week : isoWeek(now);
        const hero = typeof query.hero === 'string' && /^[a-z0-9_-]{1,32}$/i.test(query.hero) ? query.hero : null;
        if (kind === 'hero' && !hero)
            throw pawlegendsError(HttpStatus.BAD_REQUEST, 'PAWLEGENDS_BOARD_HERO', 'hero is required');
        const shared = await this.cached(`${kind}|${season}|${week}|${hero}|${page}`, now, () =>
            kind === 'global'
                ? this.globalPage(season, page, now)
                : kind === 'weekly'
                ? this.countPage({ kind: 'w', period: week }, week, page)
                : this.countPage(
                      { kind: 'h', period: season, hero, games: { $gte: HERO_MIN_GAMES } },
                      season,
                      page,
                      hero!
                  )
        );
        if (!caller) return shared.value;
        const me =
            kind === 'global'
                ? await this.globalMe(caller, season, now)
                : await this.countMe(
                      kind === 'weekly' ? `w:${week}:${caller}` : `h:${season}:${hero}:${caller}`,
                      kind === 'weekly'
                          ? { kind: 'w', period: week }
                          : { kind: 'h', period: season, hero, games: { $gte: HERO_MIN_GAMES } }
                  );
        return this.withMe(shared, caller, me);
    }

    /** A public page from the 60 s cache (per key), else built now. */
    private async cached(key: string, now: Date, build: () => Promise<Omit<Cached, 'atMs'>>): Promise<Cached> {
        let shared = this.cache.get(key);
        if (!shared || now.getTime() - shared.atMs >= 60_000) {
            shared = { atMs: now.getTime(), ...(await build()) };
            this.cache.set(key, shared);
            if (this.cache.size > 500) for (const k of [...this.cache.keys()].slice(0, 100)) this.cache.delete(k);
        }
        return shared;
    }

    /**
     * The caller's view of a cached page: their own row marked `me` (so the game shows no second, pinned "You" row
     * when they are already on the page), and `me` carrying how their row looks (name, avatar, visible flag).
     */
    private async withMe(shared: Cached, caller: string, me: BoardMe | null): Promise<BoardAnswer> {
        const rows = shared.value.rows.map((r, i) => (shared.accs[i] === caller ? { ...r, me: true } : r));
        return { ...shared.value, rows, me: me ? await this.dressMe(caller, me) : null };
    }

    private async dressMe(caller: string, me: BoardMe): Promise<BoardMe> {
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

    /** Weekly and hero boards: by wins, then fewer games, then id. */
    private async countPage(
        filter: Record<string, unknown>,
        period: string,
        page: number,
        hero?: string
    ): Promise<Omit<Cached, 'atMs'>> {
        const rows = (await this.boards
            .find(filter)
            .sort({ wins: -1, games: 1, _id: 1 })
            .skip(page * BOARD_PAGE)
            .limit(BOARD_PAGE + 4)
            .lean()) as Array<{ _id: string; acc: string; wins: number; games: number }>;
        const total = await this.boards.countDocuments(filter);
        const out = (await this.withoutExcluded(rows, r => r.acc)).slice(0, BOARD_PAGE);
        const [names, avs, ccs] = await Promise.all([
            displayNames(
                { social: this.social, cats: this.cats },
                out.map(r => r.acc)
            ),
            this.avatars(out.map(r => r.acc)),
            visibleFlags(
                this.flagRows,
                out.map(r => r.acc)
            ),
        ]);
        return {
            accs: out.map(r => r.acc),
            value: {
                period,
                page,
                pages: Math.max(1, Math.ceil(total / BOARD_PAGE)),
                rows: out.map((r, i) => ({
                    rank: page * BOARD_PAGE + i + 1,
                    name: names.get(r.acc) ?? '',
                    value: r.wins,
                    ...(avs.get(r.acc) ? { av: avs.get(r.acc) } : {}),
                    ...(ccs.get(r.acc) ? { cc: ccs.get(r.acc) } : {}),
                    ...(hero ? { hero, winRate: r.games ? Math.round((r.wins / r.games) * 100) : 0 } : {}),
                })),
            },
        };
    }

    private async withoutExcluded<T>(rows: T[], acc: (r: T) => string): Promise<T[]> {
        const ex = await this.excluded(rows.map(acc));
        return rows.filter(r => !ex.has(acc(r)));
    }

    private async countMe(id: string, filter: Record<string, unknown>): Promise<BoardMe | null> {
        const mine = (await this.boards.findById(id).lean()) as { _id: string; wins: number; games: number } | null;
        if (!mine || ('games' in filter && (mine.games ?? 0) < HERO_MIN_GAMES)) return null;
        const above = await this.boards.countDocuments({
            ...filter,
            $or: [
                { wins: { $gt: mine.wins } },
                { wins: mine.wins, games: { $lt: mine.games } },
                { wins: mine.wins, games: mine.games, _id: { $lt: mine._id } },
            ],
        });
        return { rank: above + 1, value: mine.wins };
    }

    /** Placed ranked rows of a season in ladder order with their shown (decayed) points; inactive Legends left out. */
    private ladderKept(raw: RankedRow[], now: Date): Kept[] {
        return raw
            .filter(r => !((r.tierIdx ?? 0) >= LEGEND_IDX && legendInactive(r.lastRankedAt ?? null, now)))
            .map(r => ({ row: r, ...this.shown(r, now) }))
            .sort((a, b) => b.ladder - a.ladder || (a.row._id < b.row._id ? -1 : 1));
    }

    /** One page of a ladder board (Global, Local) from its kept rows, with names, avatars and visible flags. */
    private async ladderPage(
        kept: Array<{ row: RankedRow; tierIdx: number; points: number }>,
        season: string,
        page: number
    ): Promise<Omit<Cached, 'atMs'>> {
        const slice = kept.slice(page * BOARD_PAGE, page * BOARD_PAGE + BOARD_PAGE);
        const ids = slice.map(r => r.row.accountId);
        const [names, avs, ccs] = await Promise.all([
            displayNames({ social: this.social, cats: this.cats }, ids),
            this.avatars(ids),
            visibleFlags(this.flagRows, ids),
        ]);
        return {
            accs: ids,
            value: {
                period: season,
                page,
                pages: Math.max(1, Math.ceil(kept.length / BOARD_PAGE)),
                rows: slice.map((r, i) => ({
                    rank: page * BOARD_PAGE + i + 1,
                    name: names.get(r.row.accountId) ?? '',
                    value: r.points,
                    ...(avs.get(r.row.accountId) ? { av: avs.get(r.row.accountId) } : {}),
                    ...(ccs.get(r.row.accountId) ? { cc: ccs.get(r.row.accountId) } : {}),
                    tier: tierLabel(r.tierIdx, r.points),
                })),
            },
        };
    }

    /** Top 100 of the season's ranked ladder (placed players; inactive Legends hidden until their next match). */
    private async globalPage(season: string, page: number, now: Date): Promise<Omit<Cached, 'atMs'>> {
        const raw = (await this.ratings
            .find({ queue: 'ranked', season, placementsLeft: 0 })
            .sort({ ladder: -1, _id: 1 })
            .limit(160)
            .lean()) as RankedRow[];
        const kept = (await this.withoutExcluded(this.ladderKept(raw, now), r => r.row.accountId)).slice(0, 100);
        return this.ladderPage(kept, season, page);
    }

    private async globalMe(caller: string, season: string, now: Date): Promise<BoardMe | null> {
        const mine = (await this.ratings.findById(`${caller}:ranked`).lean()) as RankedRow | null;
        if (!mine || mine.season !== season || (mine.placementsLeft ?? 1) > 0) return null;
        const shown = this.shown(mine, now);
        const above = await this.ratings.countDocuments({
            queue: 'ranked',
            season,
            placementsLeft: 0,
            ladder: { $gt: shown.ladder },
        });
        return { rank: above + 1, value: shown.points, tier: tierLabel(shown.tierIdx, shown.points) };
    }

    /**
     * Local (players of the caller's country): Global's board (this season's ranked ladder, top 100) kept to the
     * players whose flag shows that country. Privacy: a player who hid their flag is never on it, and a caller who hid
     * theirs (or whose country is unknown) gets no board, only `local` saying why. Their own country is answered only
     * to them. The ladder is read in steps on its index (`ranked_ladder`) and each step's flags by `_id`, so a small
     * country costs a few steps and a large one stops at the top 100; cached 60 s per country and page.
     */
    private async localBoard(caller: string, season: string, page: number, now: Date): Promise<BoardAnswer> {
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
        if (!cc) return { period: season, page: 0, pages: 1, rows: [], me: null, local };
        const shared = await this.cached(`local|${season}|${cc}|${page}`, now, async () => {
            const order = await this.localOrder(season, cc, now);
            const pageOut = await this.ladderPage(order, season, page);
            return {
                ...pageOut,
                order: order.map(o => ({
                    acc: o.row.accountId,
                    points: o.points,
                    tier: tierLabel(o.tierIdx, o.points),
                })),
            };
        });
        const at = shared.order?.findIndex(o => o.acc === caller) ?? -1;
        const mine = at >= 0 ? shared.order![at] : null;
        const answer = await this.withMe(
            shared,
            caller,
            mine ? { rank: at + 1, value: mine.points, tier: mine.tier } : null
        );
        return { ...answer, local };
    }

    /** The kept local rows in ladder order (top `LOCAL_TOP`): ranked rows whose account shows this country's flag. */
    private async localOrder(season: string, cc: string, now: Date) {
        const out: Kept[] = [];
        if (!this.flagRows) return out;
        for (let skip = 0; skip < LOCAL_SCAN_MAX && out.length < LOCAL_TOP; skip += LOCAL_SCAN_STEP) {
            const raw = (await this.ratings
                .find({ queue: 'ranked', season, placementsLeft: 0 })
                .sort({ ladder: -1, _id: 1 })
                .skip(skip)
                .limit(LOCAL_SCAN_STEP)
                .lean()) as RankedRow[];
            if (!raw.length) break;
            const here = (await this.flagRows
                .find({ _id: { $in: raw.map(r => r.accountId) }, cc, off: { $ne: true } })
                .select({ _id: 1 })
                .lean()) as Array<{ _id: string }>;
            const set = new Set(here.map(h => String(h._id)));
            const mine = this.ladderKept(
                raw.filter(r => set.has(r.accountId)),
                now
            );
            out.push(...(await this.withoutExcluded(mine, r => r.row.accountId)));
            if (raw.length < LOCAL_SCAN_STEP) break;
        }
        // decayed points can reorder rows across steps: sort once more, then the top 100
        return out.sort((a, b) => b.ladder - a.ladder || (a.row._id < b.row._id ? -1 : 1)).slice(0, LOCAL_TOP);
    }

    /** The caller and up to 100 friends: ranked tier and this week's PvP wins. */
    private async friendsBoard(caller: string, page: number): Promise<BoardAnswer> {
        const edges = (await this.friends
            .find({ $or: [{ a: caller }, { b: caller }], state: 'accepted' })
            .limit(100)
            .lean()) as Array<{ a: string; b: string }>;
        const ids = [caller, ...edges.map(e => (e.a === caller ? e.b : e.a))];
        const now = this.now();
        const week = isoWeek(now);
        const [ranked, weekly, names] = await Promise.all([
            this.ratings.find({ _id: { $in: ids.map(id => `${id}:ranked`) } }).lean() as Promise<RankedRow[]>,
            this.boards.find({ _id: { $in: ids.map(id => `w:${week}:${id}`) } }).lean() as Promise<
                Array<{ acc: string; wins: number }>
            >,
            displayNames({ social: this.social, cats: this.cats }, ids),
        ]);
        const avs = await this.avatars(ids);
        const ccs = await visibleFlags(this.flagRows, ids);
        const rk = new Map(ranked.filter(r => r.season === CURRENT_SEASON_ID).map(r => [r.accountId, r]));
        const wk = new Map(weekly.map(w => [w.acc, w.wins]));
        const all = ids
            .map(id => {
                const r = rk.get(id);
                const placed = r && (r.placementsLeft ?? 1) === 0;
                const s = placed ? this.shown(r!, now) : null;
                return {
                    id,
                    ladder: s?.ladder ?? -1,
                    tier: s ? tierLabel(s.tierIdx, s.points) : undefined,
                    wins: wk.get(id) ?? 0,
                };
            })
            .sort((a, b) => b.ladder - a.ladder || b.wins - a.wins || (a.id < b.id ? -1 : 1));
        const rows = all.map((x, i) => ({
            rank: i + 1,
            name: names.get(x.id) ?? '',
            value: x.wins,
            ...(avs.get(x.id) ? { av: avs.get(x.id) } : {}),
            ...(ccs.get(x.id) ? { cc: ccs.get(x.id) } : {}),
            ...(x.tier ? { tier: x.tier } : {}),
            ...(x.id === caller ? { me: true } : {}),
        }));
        const meIdx = all.findIndex(x => x.id === caller);
        return {
            period: week,
            page,
            pages: Math.max(1, Math.ceil(rows.length / BOARD_PAGE)),
            rows: rows.slice(page * BOARD_PAGE, page * BOARD_PAGE + BOARD_PAGE),
            me: { rank: meIdx + 1, value: all[meIdx].wins },
        };
    }

    /** The caller's ranked card (§10): tier, decayed points, placements, shield, locks, pending rooms. */
    async me(accountId: string, guest: boolean) {
        const now = this.now();
        const status = await this.status();
        if (guest) return { eligible: false, why: 'sign_in', status };
        const [user, row, locks] = await Promise.all([
            this.users.findById(accountId).select({ pawlegendsMatches: 1 }).lean(),
            this.ratings.findById(`${accountId}:ranked`).lean() as Promise<RankedRow | null>,
            this.sanctions
                .find({
                    accountId,
                    kind: { $in: ['ranked_lock', 'queue_lock', 'pvp_ban'] },
                    $or: [{ until: null }, { until: { $gt: now } }],
                })
                .lean() as Promise<Array<{ kind: string; until: Date | null }>>,
        ]);
        const matches = playedOf(user?.pawlegendsMatches).matches;
        // the same rooms `mm.join ranked` waits for (settlement.ts)
        const pending = (await this.rooms
            .find(pendingRoomsFilter(accountId, row?.appliedRooms ?? [], now))
            .select({ _id: 1 })
            .limit(10)
            .lean()) as Array<Pick<MmRoomRecord, '_id'>>;
        const lock = locks.sort(
            (a, b) =>
                (b.until ? new Date(b.until).getTime() : Infinity) - (a.until ? new Date(a.until).getTime() : Infinity)
        )[0];
        const current = row?.season === CURRENT_SEASON_ID;
        const shown = row && current ? this.shown(row, now) : null;
        const placementsLeft = current
            ? row?.placementsLeft ?? PLACEMENTS.first
            : row
            ? PLACEMENTS.season
            : PLACEMENTS.first;
        // Lv 10 of saved matches, or a ranked row with games (an earned rank is kept, MODE-UNLOCKS.md)
        const why = !rankedByMatches(matches, row?.games)
            ? 'matches'
            : lock
            ? 'locked'
            : pending.length
            ? 'pending'
            : null;
        return {
            eligible: !why,
            why,
            matches: { have: matches, need: RANKED_MIN_MATCHES },
            lock: lock ? { kind: lock.kind, untilMs: lock.until ? new Date(lock.until).getTime() : null } : null,
            pendingRooms: pending.map(p => p._id),
            status,
            ranked: {
                placementsLeft,
                placementsOf: row && row.peaks?.length ? PLACEMENTS.season : PLACEMENTS.first,
                ...(shown && placementsLeft === 0
                    ? {
                          tierIdx: shown.tierIdx,
                          tier: tierIdOf(shown.tierIdx),
                          label: tierLabel(shown.tierIdx, shown.points),
                          points: shown.points,
                          shield: row?.shield ?? 0,
                          peak: tierLabel(row?.peakIdx ?? shown.tierIdx),
                      }
                    : {}),
                // §7.12: the last applied match (the results screen's "S grade kept 8 pts" line), this season only
                ...(current && row?.lastStep
                    ? {
                          last: {
                              room: row.lastStep.room,
                              won: row.lastStep.won,
                              delta: row.lastStep.delta,
                              kind: row.lastStep.kind,
                              ...(row.lastStep.grade ? { grade: row.lastStep.grade } : {}),
                              ...(row.lastStep.saved ? { saved: row.lastStep.saved } : {}),
                          },
                      }
                    : {}),
                pendingRewards: (row?.peaks ?? [])
                    .filter(p => !p.rewarded)
                    .map(p => ({ season: p.season, tier: tierLabel(p.peakIdx) })),
            },
        };
    }

    /**
     * Another player's public card for the Profile screen (founder, Nov 18: a League of Legends style profile): the
     * ranked crest (tier, decayed points, placements, peak), the finished matches the account level counts, the avatar
     * with its owned border and title, and the shown country flag. Nothing private: no locks, rooms, shield or rewards.
     */
    async publicCard(accountId: string): Promise<PublicPlayerCard> {
        const now = this.now();
        const [user, row, avs, ccs] = await Promise.all([
            this.users.findById(accountId).select({ pawlegendsMatches: 1 }).lean(),
            this.ratings.findById(`${accountId}:ranked`).lean() as Promise<RankedRow | null>,
            this.avatars([accountId]),
            visibleFlags(this.flagRows, [accountId]),
        ]);
        const current = row?.season === CURRENT_SEASON_ID;
        const placementsLeft = current
            ? row?.placementsLeft ?? PLACEMENTS.first
            : row
            ? PLACEMENTS.season
            : PLACEMENTS.first;
        const shown = row && current && placementsLeft === 0 ? this.shown(row, now) : null;
        const played = current && row ? (row.peaks?.length ? PLACEMENTS.season : PLACEMENTS.first) - placementsLeft : 0;
        const av = avs.get(accountId);
        const cc = ccs.get(accountId);
        return {
            matches: playedOf(user?.pawlegendsMatches).matches,
            ranked: {
                placementsLeft,
                placementsOf: row && row.peaks?.length ? PLACEMENTS.season : PLACEMENTS.first,
                // never ranked this season and no placement played: the profile shows "Unranked" without advice
                ...(!shown && played <= 0 ? { none: true } : {}),
                ...(shown
                    ? {
                          tierIdx: shown.tierIdx,
                          tier: tierIdOf(shown.tierIdx),
                          label: tierLabel(shown.tierIdx, shown.points),
                          points: shown.points,
                          peak: tierLabel(row?.peakIdx ?? shown.tierIdx),
                      }
                    : {}),
            },
            ...(av ? { av } : {}),
            ...(cc ? { cc } : {}),
        };
    }
}

/** `publicCard`'s answer (attached to another player's `GET /pawlegends/history/u/:code` first page as `player`). */
export interface PublicPlayerCard {
    matches: number;
    ranked: {
        placementsLeft: number;
        placementsOf: number;
        none?: true;
        tierIdx?: number;
        tier?: string;
        label?: string;
        points?: number;
        peak?: string;
    };
    av?: AvatarView;
    cc?: string;
}
