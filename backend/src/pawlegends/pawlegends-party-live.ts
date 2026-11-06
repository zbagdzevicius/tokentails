import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { GamePlatform, GameType } from 'src/game/game.schema';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS, PAWLEGENDS_TICK_HZ } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { ILiveGameRow, recomputeCatnipCount } from 'src/user/utils/live-game';
import { simFor } from 'src/vendor/pawlegends-sim';
import { AFK_REASONS } from './party/room';
import type { StoredRoom } from './party/room-store';
import { PawlegendsPartyResultDto } from './pawlegends-replay.dto';
import {
    IPawlegendsLiveDeps,
    PAWLEGENDS_CATNIP_FIELD,
    PAWLEGENDS_MATCHES_FIELD,
    pawlegendsDuplicate,
    pawlegendsError,
} from './pawlegends-live';

/*
 * Party play scoring (docs/plans/moba/MULTIPLAYER.md §6, lane N8): the `v: 2` branch of the PAWLEGENDS save on
 * `POST /user/catbassadors/live`, still the one score writer (D7). The relay never writes a score: it stores the room
 * log and, at the end, the referee's verdict, verified three ways (the raw TURN log re-simmed, the PartyReplayRecord
 * from the referee's post-gate logs, verifyPartyReplay) before `verdict.verified` is set.
 *
 * Checks, in order: simVersion >= PARTY_SINCE; the room exists, ended, verified, scored; the posted ticks, outcome and
 * hash equal the verdict; the caller holds that slot; the AFK rule (drop + away + afk pilot ticks <= 50%; late, desync,
 * restore and open never count); one save per room and slot (digest sha256('party:room:slot') in the unique digest
 * index). Catnip follows the solo first-win rule of the difficulty, one tier lower when an open seat stayed empty past
 * tick 1,800 (S5); never a fastest win from a party (v1); at most 30 scored party matches per account per UTC day
 * (over it the match counts, no catnip).
 */

export const PARTY_DAILY_CAP = 30;

export interface IPartyLiveDeps extends Pick<IPawlegendsLiveDeps, 'users' | 'games' | 'now' | 'logger'> {
    rooms: {
        get(id: string): Promise<StoredRoom | null>;
        countEnded(accountId: string, since: Date): Promise<number>;
    };
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
    if (v.ticks !== r.ticks || v.outcome !== r.outcome || v.finalHash !== r.finalHash) {
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
    const saved = await deps.games.findOne({ searchObject: { replayDigest: digest }, projection: '_id' });
    if (saved) throw pawlegendsDuplicate();

    const user = await deps.users.findOne({
        searchObject: { _id: userId },
        projection: `cat ${PAWLEGENDS_CATNIP_FIELD} ${PAWLEGENDS_MATCHES_FIELD}`,
    });
    if (!user) throw new BadRequestException('User not found');
    const now = (deps.now || (() => new Date()))();
    const difficulty = PAWLEGENDS_LEVELS[index];
    // S5: an open seat nobody claimed by tick 1,800 pays one tier lower (the lowest tier stays)
    const catnipIndex = room.openUnclaimedAt1800 ? Math.max(0, index - 1) : index;
    const catnipDifficulty = PAWLEGENDS_LEVELS[catnipIndex];
    const daily = (await deps.rooms.countEnded(String(userId), utcDayStart(now))) > PARTY_DAILY_CAP;
    const won = v.outcome === 'won';
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
    return {
        party: true,
        difficulty,
        catnipDifficulty,
        outcome: v.outcome as 'won' | 'lost',
        ticks: v.ticks,
        finalHash: v.finalHash,
        catnipPaid,
        catnipCount,
        ...(daily ? { why: 'daily' as const } : {}),
    };
}

/** Is this `/live` PAWLEGENDS body a party result (v: 2)? */
export const isPartyResult = (body: { pawlegends?: { v?: unknown } }): boolean => body.pawlegends?.v === 2;

export { ConflictException };
