import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { GamePlatform, GameType } from 'src/game/game.schema';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS, PAWLEGENDS_TICK_HZ } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { ILiveGameRow, recomputeCatnipCount } from 'src/user/utils/live-game';
import { simFor } from 'src/vendor/pawlegends-sim';
import { casualRatingStep, coopRatingStep } from './mm/rating-update';
import type { MmRoomRecord } from './mm/mm-room.schema';
import type { MmRatingRow, RankedFields } from './mm/rating.schema';
import { CURRENT_SEASON_ID } from './pawlegends-catalog';
import {
    BOARD_DAILY_WIN_CAP,
    BOARD_ROOMS_KEPT,
    boardEligible,
    HERO_KEEP_DAYS,
    heroId,
    isoWeek,
    WEEKLY_KEEP_DAYS,
    weeklyId,
} from './ranked/boards';
import { decayedPoints, freshPoints, ladderOf, rankedStep, softReset, type RankedMatchKind } from './ranked/points';
import { rankedKindOf, rankedSettleCheck } from './ranked/settlement';
import { DEFAULT_GLICKO } from './mm/glicko2';
import { AFK_REASONS } from './party/room';
import type { StoredRoom } from './party/room-store';
import { PawlegendsPartyResultDto } from './pawlegends-replay.dto';
import { applyInviteProgress } from './growth/apply-invite-progress';
import {
    IPawlegendsLiveDeps,
    IPawlegendsSeasonAnswer,
    PAWLEGENDS_CATNIP_FIELD,
    takedownsOf,
    PAWLEGENDS_MATCHES_FIELD,
    pawlegendsDuplicate,
    pawlegendsError,
} from './pawlegends-live';
import { applyCommunityGoal } from './liveops/liveops-live';

/*
 * Party play scoring (docs/plans/moba/MULTIPLAYER.md §6, lane N8): the `v: 2` branch of the PAWLEGENDS save on
 * `POST /user/catbassadors/live`, still the one score writer (D7). The relay never writes a score: it stores the room
 * log and, at the end, the referee's verdict, verified three ways (the raw TURN log re-simmed, the PartyReplayRecord
 * from the referee's post-gate logs, verifyPartyReplay) before `verdict.verified` is set.
 *
 * Checks, in order: simVersion >= PARTY_SINCE; the room exists, ended, verified, scored; the posted ticks, outcome and
 * hash equal the verdict; the caller holds that slot; the AFK rule (drop + away + afk pilot ticks <= 50%; late, desync,
 * restore and open never count); one save per room and slot (digest sha256('party:room:slot') in the unique digest
 * index), and one per account per room (an account seated twice saves once). Catnip follows the solo first-win rule of the difficulty, one tier lower when an open seat stayed empty past
 * tick 1,800 (S5); never a fastest win from a party (v1); at most 30 scored party matches per account per UTC day
 * (over it the match counts, no catnip).
 *
 * Casual PvP (V16.md §4.5, a room whose config has `mode: 'pvp'`): the same DTO. The sim must be >= PVP_SINCE; the
 * verdict's `outcome` is team 0's view, so the posted `outcome` must equal the slot's own view (`winner` against the
 * slot's team). Catnip is the hard-tier party amount within the same caps (no lower tier for open seats); a voided
 * (remade) room was never `ended`, so it pays and rates nothing; the hidden rating is the `casual` row.
 */

export const PARTY_DAILY_CAP = 30;

export interface IPartyLiveDeps
    extends Pick<IPawlegendsLiveDeps, 'users' | 'games' | 'now' | 'logger' | 'season' | 'growth' | 'rewards'> {
    rooms: {
        get(id: string): Promise<StoredRoom | null>;
        countEnded(accountId: string, since: Date): Promise<number>;
    };
    /**
     * Quick Play (M1A-IMPL.md §4.2): the mm room records and the hidden rating model. This file is the ONE place that
     * writes a rating (mm-no-write.spec.ts), after the Game row exists; a failed write never fails the save.
     */
    mm?: {
        rooms: { get(id: string): Promise<MmRoomRecord | null> };
        ratings: PawlegendsRatingModel;
        /**
         * Leaderboards (SOCIAL-RANKED.md §6): written ONLY here (`writeBoards`), after the Game row exists, from a
         * verified PvP room; a failed write never fails the save.
         */
        boards?: PawlegendsBoardModel;
        /** Sanctions in force (find only): `board_exclude` and `pvp_ban` keep a player off the boards. */
        sanctions?: { countDocuments(filter: Record<string, unknown>): Promise<number> };
    };
    /**
     * Clubs (CLUBS-KUDOS.md §4): the weekly club chest grows ONLY here (`applyClubChest`), after the Game row exists,
     * from a verified win of a registered member; it never fails the save.
     */
    clubs?: {
        applyClubChest(input: {
            accountId: string;
            room: string;
            won: boolean;
            registered: boolean;
            now: Date;
        }): Promise<unknown>;
    };
}

/** The board model calls `writeBoards` needs (a Mongoose Model satisfies it). */
export interface PawlegendsBoardModel {
    findById(id: string): { lean(): Promise<unknown> };
    updateOne(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options?: Record<string, unknown>
    ): Promise<unknown>;
}

/** The rating model calls the update needs (a Mongoose Model satisfies it). */
export interface PawlegendsRatingModel {
    findById(id: string): { lean(): Promise<unknown> };
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount?: number }>;
    create(doc: Record<string, unknown>): Promise<unknown>;
}

export interface IPartyLiveResult {
    party: true;
    difficulty: string;
    /** The tier catnip was computed at (lower than `difficulty` when an open seat stayed empty). */
    catnipDifficulty: string;
    outcome: 'won' | 'lost';
    ticks: number;
    finalHash: string;
    catnipPaid: number;
    catnipCount: number;
    /** Why no catnip was paid when the match counted: 'daily' (over the daily cap). */
    why?: 'daily';
    /** Legends Pass Season XP (0 over the daily cap). */
    season?: IPawlegendsSeasonAnswer;
}

const logger = new Logger('PawlegendsPartyLive');

export const partyDigest = (room: string, slot: number): string =>
    createHash('sha256').update(`party:${room}:${slot}`).digest('hex');

/** The PARTY_SINCE of the vendored sim of `simVersion` (null: not a party-capable bundle). */
function partySince(simVersion: number): number | null {
    const s = simFor(simVersion);
    return s?.party ? s.party.PARTY_SINCE : null;
}

const utcDayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function savePawlegendsPartyMatch(
    deps: IPartyLiveDeps,
    userId: string,
    body: { pawlegends?: PawlegendsPartyResultDto; platform?: GamePlatform }
): Promise<IPartyLiveResult> {
    const r = body.pawlegends;
    const log = deps.logger || logger;
    const reject = (code: string, message: string) => {
        log.warn(`pawlegends party save rejected: code=${code}`);
        return pawlegendsError(code, message);
    };
    if (!r || r.v !== 2) throw reject(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'a party result is required');
    const since = partySince(r.simVersion);
    if (since === null || r.simVersion < since)
        throw reject(ErrorCode.PAWLEGENDS_SIM_VERSION, `party play needs a party sim (simVersion ${r.simVersion})`);
    const room = await deps.rooms.get(r.room);
    if (!room || room.status !== 'ended' || !room.verdict || room.verdict.verified !== true) {
        throw reject(ErrorCode.PAWLEGENDS_PARTY_ROOM, 'no verified party match with this room');
    }
    if (room.simVersion !== r.simVersion)
        throw reject(ErrorCode.PAWLEGENDS_SIM_VERSION, 'simVersion differs from the room');
    const v = room.verdict;
    const pvp = room.config.mode === 'pvp';
    if (pvp) {
        const pvpSince = simFor(r.simVersion)?.party?.PVP_SINCE;
        if (!pvpSince || r.simVersion < pvpSince)
            throw reject(ErrorCode.PAWLEGENDS_SIM_VERSION, `PvP needs simVersion ${pvpSince ?? 'with PvP'}`);
    }
    // PvP: the slot's own view (team 1 won when the verdict, team 0's view, says lost)
    // 5v5 Classic (sim v19, `config.map: 'hearthwood'`): team 1 is slots 5..9
    const teamSize = room.config.map === 'hearthwood' ? 5 : 3;
    const slotOutcome = pvp ? (v.winner === (r.slot >= teamSize ? 1 : 0) ? 'won' : 'lost') : v.outcome;
    if (v.ticks !== r.ticks || slotOutcome !== r.outcome || v.finalHash !== r.finalHash) {
        throw reject(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'the result differs from the verified match');
    }
    const occ = room.occupants.find(o => o.slot === r.slot);
    if (!occ || !occ.accountId || occ.accountId !== String(userId)) {
        throw reject(ErrorCode.PAWLEGENDS_PARTY_SLOT, 'this slot is not yours');
    }
    const ticks = room.pilotTicks[String(r.slot)] ?? {};
    const afk = AFK_REASONS.reduce((n, k) => n + (ticks[k] ?? 0), 0);
    if (afk * 2 > v.ticks) {
        log.warn('pawlegends party save rejected: code=PAWLEGENDS_PARTY_AFK');
        throw new ConflictException({
            statusCode: 409,
            code: ErrorCode.PAWLEGENDS_PARTY_AFK,
            message: 'No rewards: a bot played most of this match',
        });
    }
    const index = PAWLEGENDS_LEVELS.indexOf(room.config.difficulty);
    if (index < 0) throw reject(ErrorCode.PAWLEGENDS_REPLAY_INVALID, 'unknown difficulty');
    const digest = partyDigest(r.room, r.slot);
    // once per account per room: an account that somehow held two seats saves one of them, never both
    const mine = room.occupants.filter(o => o.accountId === String(userId)).map(o => partyDigest(r.room, o.slot));
    for (const d of new Set([digest, ...mine])) {
        const saved = await deps.games.findOne({ searchObject: { replayDigest: d }, projection: '_id' });
        if (saved) throw pawlegendsDuplicate();
    }

    const user = await deps.users.findOne({
        searchObject: { _id: userId },
        projection: `cat isGuest boardExcludedAt deletedAt ${PAWLEGENDS_CATNIP_FIELD} ${PAWLEGENDS_MATCHES_FIELD}`,
    });
    if (!user) throw new BadRequestException('User not found');
    const now = (deps.now || (() => new Date()))();
    const difficulty = PAWLEGENDS_LEVELS[index];
    // S5: an open seat nobody claimed by tick 1,800 pays one tier lower (the lowest tier stays)
    const catnipIndex = room.openUnclaimedAt1800 && !pvp ? Math.max(0, index - 1) : index;
    const catnipDifficulty = PAWLEGENDS_LEVELS[catnipIndex];
    const daily = (await deps.rooms.countEnded(String(userId), utcDayStart(now))) > PARTY_DAILY_CAP;
    const won = slotOutcome === 'won';
    const cap = PAWLEGENDS_LEVEL_CAPS[catnipIndex] ?? 0;
    for (const field of [PAWLEGENDS_CATNIP_FIELD, PAWLEGENDS_MATCHES_FIELD]) {
        const val = user[field];
        if (val !== undefined && (typeof val !== 'object' || Array.isArray(val) || val === null))
            await deps.users.update(userId, { $set: { [field]: {} } });
    }
    const catnipPath = `${PAWLEGENDS_CATNIP_FIELD}.${catnipDifficulty}`;
    const held = Number(user[PAWLEGENDS_CATNIP_FIELD]?.[catnipDifficulty] ?? 0) || 0;
    let claimedFrom: number | null = null;
    if (won && !daily && held < cap) claimedFrom = await deps.users.claimBelowCap(userId, catnipPath, cap);
    const catnipPaid = claimedFrom === null ? 0 : cap - claimedFrom;
    const row: ILiveGameRow = {
        type: GameType.PAWLEGENDS,
        level: difficulty,
        points: catnipPaid,
        score: v.ticks,
        time: Math.round((v.ticks / PAWLEGENDS_TICK_HZ) * 100) / 100,
        platform: body.platform ?? GamePlatform.WEB,
        outcome: won ? 'won' : v.reason === 'forfeit' ? 'quit' : 'died',
        replayDigest: digest,
    };
    try {
        await deps.games.create({ ...row, cat: user.cat, user: user._id });
    } catch (error) {
        if (claimedFrom !== null) await deps.users.update(userId, { $set: { [catnipPath]: claimedFrom } });
        if ((error as { code?: unknown })?.code === 11000) throw pawlegendsDuplicate();
        throw error;
    }
    // party matches never touch the fastest win (v1)
    await deps.users.update(userId, {
        $inc: { [`${PAWLEGENDS_MATCHES_FIELD}.${difficulty}`]: 1 },
        $set: { lastPlayedAt: now },
    });
    const catnipCount = await recomputeCatnipCount(deps.users, userId);
    // Legends Pass Season XP: after the Game row (unique per room and slot); none over the daily cap.
    const season = deps.season
        ? await deps.season.addXp(String(userId), {
              won,
              forfeit: v.reason === 'forfeit',
              takedowns: takedownsOf(v.stats, r.slot),
              capped: daily,
              // CHAMPION-STORE.md: Yarn once per room and slot (the relay checked the hero at the pick, §8.1)
              ref: digest,
          })
        : null;
    // rewards-cloud: mastery, the Welcome Path day and the Lucky Treat (applyLuckyTreat), once per room and slot
    if (deps.rewards) await deps.rewards.applyLive(String(userId), { won, hero: room.config.picks?.[r.slot] ?? null });
    // Live ops (LIVEOPS.md): the community goal and the Winter Nap day, once per room and slot, from the verdict
    await applyCommunityGoal({
        accountId: String(userId),
        won,
        forfeit: v.reason === 'forfeit',
        takedowns: takedownsOf(v.stats, r.slot),
        now,
    });
    if (deps.mm && pvp) {
        const mmRoom = await deps.mm.rooms.get(r.room).catch(() => null);
        if (mmRoom?.queue === 'ranked') {
            // ranked is for registered accounts only: a guest seat (never matched) rates nothing. Settlement (gap plan
            // P4): the verified verdict (the relay's full log re-sim + verifyPvpReplay) and the room record must agree
            // before any point moves
            const settle = rankedSettleCheck(mmRoom, String(userId), r.slot);
            if (!settle.ok) log.warn(`pawlegends ranked settle skipped: why=${settle.why}`);
            else if (!user.isGuest)
                await applyRankedRating(deps.mm, String(userId), r.room, won, now, log, rankedKindOf(mmRoom));
        } else
            await applyCasualRating(
                deps.mm,
                String(userId),
                r.room,
                won,
                now,
                log,
                room.config.map === 'hearthwood' ? 'classic' : 'casual'
            );
        if (mmRoom)
            await writeBoards(deps.mm, {
                mmRoom,
                accountId: String(userId),
                hero: room.config.picks?.[r.slot] ?? null,
                won,
                now,
                registered: !user.isGuest,
                excluded: !!user.boardExcludedAt || !!user.deletedAt,
                log,
            });
    } else if (deps.mm) {
        // SOCIAL-RANKED.md §7.11: a ranked vs AI room is a co-op room in the ranked queue: it settles ranked at the vs
        // AI share (the hidden rating does not move), never the co-op rating
        const mmRoom = await deps.mm.rooms.get(r.room).catch(() => null);
        if (mmRoom?.queue === 'ranked') {
            const settle = rankedSettleCheck(mmRoom, String(userId), r.slot);
            if (!settle.ok) log.warn(`pawlegends ranked settle skipped: why=${settle.why}`);
            else if (!user.isGuest) await applyRankedRating(deps.mm, String(userId), r.room, won, now, log, 'ai');
        } else
            await applyCoopRating(deps.mm, String(userId), r.room, v.outcome as 'won' | 'lost', difficulty, now, log);
    }
    await applyInviteProgress(
        deps.growth,
        String(userId),
        { ref: digest, ticks: v.ticks, forfeit: v.reason === 'forfeit' },
        now
    );
    // CLUBS-KUDOS.md §4: a verified win fills the member's weekly club chest (capped per day, once per room)
    if (deps.clubs)
        await deps.clubs.applyClubChest({
            accountId: String(userId),
            room: r.room,
            won: won && !daily,
            registered: !user.isGuest,
            now,
        });
    return {
        party: true,
        difficulty,
        catnipDifficulty,
        outcome: slotOutcome as 'won' | 'lost',
        ticks: v.ticks,
        finalHash: v.finalHash,
        catnipPaid,
        catnipCount,
        ...(daily ? { why: 'daily' as const } : {}),
        ...(season ? { season } : {}),
    };
}

/**
 * The hidden co-op rating (M1A-IMPL.md §4.2): only for a Quick Play room, once per account per room (`appliedRooms`),
 * with an optimistic version (`v`); insert-then-retry once on a version miss or a duplicate key. Logged, never thrown:
 * the Game row and the catnip are the score, the rating is matchmaking data.
 */
async function applyCoopRating(
    mm: NonNullable<IPartyLiveDeps['mm']>,
    accountId: string,
    roomId: string,
    outcome: 'won' | 'lost',
    difficulty: string,
    now: Date,
    log: Pick<Logger, 'warn'>
): Promise<void> {
    await writeRating(mm, roomId, `${accountId}:coop`, 'coop', log, (room, row) =>
        coopRatingStep({ room, accountId, outcome, difficulty, row, nowMs: now.getTime() })
    );
}

/**
 * The casual PvP rating (V16.md §4.5): as the co-op one, on the `casual` row, from the slot's own result. A 5v5
 * Classic room (Hearthwood) rates the `classic` row (MAP-5V5.md §9.3).
 */
async function applyCasualRating(
    mm: NonNullable<IPartyLiveDeps['mm']>,
    accountId: string,
    roomId: string,
    won: boolean,
    now: Date,
    log: Pick<Logger, 'warn'>,
    queue: 'casual' | 'classic' = 'casual'
): Promise<void> {
    await writeRating(mm, roomId, `${accountId}:${queue}`, queue, log, (room, row) =>
        casualRatingStep({ room, accountId, won, row, nowMs: now.getTime() })
    );
}

/**
 * Ranked (SOCIAL-RANKED.md §7.3–§7.5): the hidden Glicko row stepped like casual (seeded from the casual row at the
 * first placement), plus the visible points, the lazy soft reset at a new season and the lazy Legend decay, all in the
 * one rating write. Guests never get a ranked row. Forgiven and backfill losses skip the write (no points move).
 */
async function applyRankedRating(
    mm: NonNullable<IPartyLiveDeps['mm']>,
    accountId: string,
    roomId: string,
    won: boolean,
    now: Date,
    log: Pick<Logger, 'warn'>,
    kind: RankedMatchKind = 'players'
): Promise<void> {
    const casual = ((await mm.ratings.findById(`${accountId}:casual`).lean()) as MmRatingRow | null) ?? null;
    await writeRating(mm, roomId, `${accountId}:ranked`, 'ranked', log, (room, row) => {
        const prev = row as (MmRatingRow & Partial<RankedFields>) | null;
        const season = room.season || CURRENT_SEASON_ID;
        let base: MmRatingRow | null = prev;
        let points =
            prev?.tierIdx !== undefined
                ? {
                      tierIdx: prev.tierIdx,
                      points: prev.points ?? 0,
                      shield: prev.shield ?? 1,
                      placementsLeft: prev.placementsLeft ?? 0,
                      peakIdx: prev.peakIdx ?? prev.tierIdx,
                      vsPlayers: prev.vsPlayers ?? 0,
                  }
                : freshPoints();
        const peaks = [...(prev?.peaks ?? [])];
        let floorIdx = prev?.floorIdx;
        if (!prev && casual) {
            // the first placement: seeded from the casual row, RD at least 200
            base = {
                ...casual,
                _id: `${accountId}:ranked`,
                queue: 'ranked',
                games: 0,
                wins: 0,
                appliedRooms: [],
                v: 0,
            };
            base.rd = Math.max(base.rd, 200);
        } else if (prev?.season && prev.season !== season) {
            // the lazy soft reset at the first ranked save of a new season (the season reward job may have recorded
            // that season's peak already: it is kept, never doubled)
            if (!peaks.some(p => p.season === prev.season))
                peaks.push({ season: prev.season, peakIdx: points.peakIdx, finalIdx: points.tierIdx, rewarded: false });
            const reset = softReset({ r: prev.r, rd: prev.rd, tierIdx: points.tierIdx });
            base = { ...prev, r: reset.r, rd: reset.rd };
            floorIdx = reset.floorIdx;
            points = { ...freshPoints(reset.placementsLeft), tierIdx: points.tierIdx };
        } else if (prev) {
            // the lazy Legend decay, written before the match applies
            points.points = decayedPoints(points, prev.lastRankedAt ?? null, now);
        }
        const step = casualRatingStep({ room, accountId, won, row: base, nowMs: now.getTime() });
        if (!step.row) return {};
        // §7.11: a vs AI match never moves the hidden rating (only the points, at the vs AI share)
        if (kind === 'ai') {
            const keep = base ?? null;
            step.row = keep
                ? { ...step.row, r: keep.r, rd: keep.rd, sigma: keep.sigma }
                : { ...step.row, ...DEFAULT_GLICKO };
        }
        const next = rankedStep({
            state: points,
            won,
            r: step.row.r,
            firstSeason: !peaks.length,
            floorIdx,
            kind,
        });
        const fields: RankedFields = {
            season,
            ...next.state,
            peaks,
            lastRankedAt: now,
            ladder: ladderOf(next.state),
            dodgesApplied: prev?.dodgesApplied ?? [],
            ...(floorIdx !== undefined && next.state.placementsLeft > 0 ? { floorIdx } : {}),
        };
        // keep the stored row's version (writeRating updates by it)
        return { row: { ...step.row, ...fields, v: (row?.v ?? 0) + 1 } as MmRatingRow };
    });
}

/**
 * The leaderboard rows (SOCIAL-RANKED.md §6.1, §6.2): the weekly PvP board and the per-hero season board. The ONE board
 * write site (social-no-write.spec.ts). Each row remembers its last rooms, so a duplicate save writes nothing; a poster
 * over 25 wins today (UTC) counts nothing more today. Logged, never thrown.
 */
async function writeBoards(
    mm: NonNullable<IPartyLiveDeps['mm']>,
    input: {
        mmRoom: MmRoomRecord;
        accountId: string;
        hero: string | null;
        won: boolean;
        now: Date;
        registered: boolean;
        excluded: boolean;
        log: Pick<Logger, 'warn'>;
    }
): Promise<void> {
    const { mmRoom, accountId, hero, won, now, log } = input;
    if (!mm.boards) return;
    try {
        const sanctioned = mm.sanctions
            ? (await mm.sanctions.countDocuments({
                  accountId,
                  kind: { $in: ['board_exclude', 'pvp_ban'] },
                  $or: [{ until: null }, { until: { $gt: now } }],
              })) > 0
            : false;
        const ok = boardEligible({
            room: mmRoom,
            accountId,
            won,
            registered: input.registered,
            excluded: input.excluded || sanctioned,
            nowMs: now.getTime(),
        });
        if (!ok.ok) return;
        const week = isoWeek(now);
        const day = now.toISOString().slice(0, 10);
        const wid = weeklyId(week, accountId);
        const weekly = (await mm.boards.findById(wid).lean()) as {
            days?: Record<string, number>;
            rooms?: string[];
        } | null;
        if (weekly?.rooms?.includes(mmRoom._id)) return;
        if (won && (weekly?.days?.[day] ?? 0) >= BOARD_DAILY_WIN_CAP) return;
        const DAY = 86_400_000;
        const rows: Array<{ id: string; set: Record<string, unknown>; inc: Record<string, number> }> = [
            {
                id: wid,
                set: {
                    kind: 'w',
                    period: week,
                    acc: accountId,
                    firstAt: now,
                    expireAt: new Date(now.getTime() + WEEKLY_KEEP_DAYS * DAY),
                },
                inc: { games: 1, wins: won ? 1 : 0, [`days.${day}`]: won ? 1 : 0 },
            },
        ];
        if (hero && /^[a-z0-9_-]{1,32}$/i.test(hero)) {
            const season = mmRoom.season || CURRENT_SEASON_ID;
            rows.push({
                id: heroId(season, hero, accountId),
                set: {
                    kind: 'h',
                    period: season,
                    hero,
                    acc: accountId,
                    firstAt: now,
                    expireAt: new Date(now.getTime() + HERO_KEEP_DAYS * DAY),
                },
                inc: { games: 1, wins: won ? 1 : 0 },
            });
        }
        for (const row of rows) {
            try {
                await mm.boards.updateOne(
                    { _id: row.id, rooms: { $ne: mmRoom._id } },
                    {
                        $setOnInsert: row.set,
                        $inc: row.inc,
                        $push: { rooms: { $each: [mmRoom._id], $slice: -BOARD_ROOMS_KEPT } },
                    },
                    { upsert: true }
                );
            } catch (error) {
                // the row already holds this room: the filter missed and the upsert hit the _id
                if ((error as { code?: unknown })?.code !== 11000) throw error;
            }
        }
    } catch (error) {
        log.warn(`pawlegends board write failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
    }
}

/** The one rating write site (mm-no-write.spec.ts): read the row, step it, insert or update by version, retry once. */
async function writeRating(
    mm: NonNullable<IPartyLiveDeps['mm']>,
    roomId: string,
    rowId: string,
    queue: string,
    log: Pick<Logger, 'warn'>,
    stepOf: (room: MmRoomRecord, row: MmRatingRow | null) => { row?: MmRatingRow }
): Promise<void> {
    try {
        const room = await mm.rooms.get(roomId);
        if (!room) return;
        for (let attempt = 0; attempt < 2; attempt++) {
            const row = ((await mm.ratings.findById(rowId).lean()) as MmRatingRow | null) ?? null;
            const step = stepOf(room, row);
            if (!step.row) return;
            const { _id, v, ...fields } = step.row;
            try {
                if (!row) {
                    await mm.ratings.create({ _id, v, ...fields });
                    return;
                }
                const res = await mm.ratings.updateOne({ _id, v: row.v ?? 0 }, { $set: fields, $inc: { v: 1 } });
                if ((res?.modifiedCount ?? 0) === 1) return;
            } catch (error) {
                if ((error as { code?: unknown })?.code !== 11000) throw error;
            }
        }
        log.warn(`pawlegends ${queue} rating: version conflict twice, skipped`);
    } catch (error) {
        log.warn(
            `pawlegends ${queue} rating write failed: ${String((error as Error)?.message || error).slice(0, 200)}`
        );
    }
}

/** Is this `/live` PAWLEGENDS body a party result (v: 2)? */
export const isPartyResult = (body: { pawlegends?: { v?: unknown } }): boolean => body.pawlegends?.v === 2;

export { ConflictException };
