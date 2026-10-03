import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    MAX_MATCH3_SCORE_PER_LEVEL,
    catnipChaosLevelCatnipCaps,
    catnipChaosLevels,
    GamePlatform,
    GameType,
    match3LevelCatnipCaps,
    match3Levels,
    ScoredGameType,
    seasonEventLevelPointCaps,
    seasonEventLevels,
} from 'src/game/game.schema';
import { CATNIP_CHAOS_ENDLESS_LEVEL, HEIST_LEVEL_CAPS, HEIST_LEVELS, HEIST_STAR_MASK } from 'src/shared-contracts/caps';
import { LiveGameOutcome } from 'src/shared-contracts/enums';
import { LiveGameDto } from '../dto/live-game.dto';
import { buildCatnipAccountingSnapshot, buildCatnipSanitizationUpdate } from './catnip-accounting';

export interface ILiveGameLevels {
    /** Level keys in save order; index `i` is slot `i` of every per-level array. */
    levels: string[];
    /** Per-level point cap. */
    caps: number[];
    /** User array of the best points per level. */
    field: string;
    /** User array of 0/1 cleared flags per level (plan G10, decision #67). */
    clearedField: string;
    /** Levels that are never cleared (the INFINITE endless run, decision #69). */
    infiniteLevels: string[];
}

/** Per type: the level keys, the per-level point caps, and the user arrays the run goes to. */
export const LIVE_GAME_LEVELS: Record<ScoredGameType, ILiveGameLevels> = {
    [GameType.CATNIP_CHAOS]: {
        levels: catnipChaosLevels,
        caps: catnipChaosLevelCatnipCaps,
        field: 'catnipChaos',
        clearedField: 'catnipChaosCleared',
        infiniteLevels: [CATNIP_CHAOS_ENDLESS_LEVEL],
    },
    [GameType.PIXEL_RESCUE]: {
        levels: seasonEventLevels,
        caps: seasonEventLevelPointCaps,
        field: 'seasonEvent',
        clearedField: 'seasonEventCleared',
        infiniteLevels: [],
    },
    [GameType.MATCH_3]: {
        levels: match3Levels,
        caps: match3LevelCatnipCaps,
        field: 'match3',
        clearedField: 'match3Cleared',
        infiniteLevels: [],
    },
};

/** The sanitized `Game` row, before the server adds `user` and `cat`. */
export interface ILiveGameRow {
    type: GameType;
    level: string;
    points: number;
    score?: number;
    time: number;
    platform: GamePlatform;
    outcome?: LiveGameOutcome;
    /** Heist rows only (`src/user/heist/heist-live.ts`). */
    replayDigest?: string;
    /** Heist rows only: the stars bitmask of the run. */
    stars?: number;
}

export interface ILiveGame {
    row: ILiveGameRow;
    /** `$max` update for the caller's per-level best-score and cleared arrays. */
    best: Record<string, number>;
}

/** Arrays a dotted `$max` (or `$bit`) of `update` writes into: `catnipChaos.3` -> `catnipChaos`. */
export const dottedArrayFields = (update: Record<string, unknown>): string[] =>
    Array.from(new Set(Object.keys(update).map(key => key.split('.')[0])));

/**
 * Checks a validated `/live` body against the level table and per-level cap of its type, and
 * returns the only fields that are stored. Throws 400 before anything is written.
 *
 * A `won` outcome on a level that is not INFINITE also marks it cleared (`${clearedField}.${i}`,
 * `$max` to 1), in the same update as the best score (plan F6, G10). Other outcomes and a missing
 * outcome (older clients) clear nothing; the grandfathering migration covered levels played before.
 */
export const resolveLiveGame = (game: LiveGameDto): ILiveGame => {
    if (game.type === GameType.CATNIP_HEIST || game.replay !== undefined) {
        // Heist runs take the replay branch (src/user/heist/heist-live.ts); a replay on any other
        // type is a malformed request.
        throw new BadRequestException(`A replay is only accepted with ${GameType.CATNIP_HEIST}`);
    }
    const { levels, caps, field, clearedField, infiniteLevels } = LIVE_GAME_LEVELS[game.type];
    const levelIndex = game.level === undefined ? -1 : levels.indexOf(game.level);
    if (levelIndex < 0) {
        throw new BadRequestException(`Invalid level for ${game.type}`);
    }
    if (game.points > caps[levelIndex]) {
        throw new BadRequestException('Artificial request is detected');
    }

    const row: ILiveGameRow = {
        type: game.type,
        level: levels[levelIndex],
        points: game.points,
        time: Math.max(0, game.time ?? 0),
        platform: game.platform ?? GamePlatform.WEB,
    };
    if (game.outcome) {
        row.outcome = game.outcome;
    }
    const best: Record<string, number> = { [`${field}.${levelIndex}`]: game.points };
    if (game.type === GameType.MATCH_3) {
        // Paw Match keeps a raw score next to catnip; old clients sent points only.
        row.score = game.score ?? game.points;
        best[`match3Score.${levelIndex}`] = row.score;
    }
    if (game.outcome === 'won' && !infiniteLevels.includes(row.level)) {
        best[`${clearedField}.${levelIndex}`] = 1;
    }

    return { row, best };
};

/** Every 0/1 cleared array a user can hold, with the level list it is indexed by. */
export const CLEARED_FIELDS = Object.values(LIVE_GAME_LEVELS).map(({ clearedField, levels, infiniteLevels }) => ({
    field: clearedField,
    levels,
    infiniteLevels,
}));

/** Heist per-level arrays (plan G2 layer 2): best score (`$max`) and stars bitmask (`$bit or`). */
export const HEIST_SCORE_FIELD = 'heistScore';
export const HEIST_STARS_FIELD = 'heistStars';

/**
 * Update pipeline that turns a missing (or null) array into one before a dotted `$max` or `$bit`
 * writes into it (plan F6 array safety). Without it MongoDB stores `{ "3": x }`, a sub-document.
 *
 * - `maxFields` (dotted `$max`): missing or null becomes `[]`. `$max` pads the array with nulls up
 *   to the index; `recomputeGameTotals` later rewrites them as 0.
 * - `bitFields` (dotted `$bit`): `$bit` refuses null, so the array becomes `length` integers with
 *   every missing or non-numeric slot 0, whatever was there. An object-shaped legacy value is kept
 *   (the normalisers read it as an index map) and only missing/null/array values are rewritten.
 *
 * It is conditional by construction ($ifNull / $cond), so running it on a healthy document is a
 * no-op and two parallel first saves cannot fight.
 */
export function arrayGuardPipeline(maxFields: string[], bitFields: { field: string; length: number }[] = []) {
    const set: Record<string, unknown> = {};
    for (const field of maxFields) {
        set[field] = { $ifNull: [`$${field}`, []] };
    }
    for (const { field, length } of bitFields) {
        const value = `$${field}`;
        set[field] = {
            $switch: {
                branches: [
                    {
                        case: { $isArray: value },
                        then: {
                            $map: {
                                input: { $range: [0, { $max: [length, { $size: value }] }] },
                                as: 'i',
                                in: {
                                    $let: {
                                        vars: { v: { $arrayElemAt: [value, '$$i'] } },
                                        in: { $cond: [{ $isNumber: '$$v' }, { $toInt: '$$v' }, 0] },
                                    },
                                },
                            },
                        },
                    },
                    { case: { $eq: [{ $type: value }, 'object'] }, then: value },
                ],
                default: Array.from({ length }, () => 0),
            },
        };
    }
    return [{ $set: set }];
}

/**
 * True when `value` is already a safe target for dotted writes: an array, and for `$bit` targets
 * one of at least `minLength` integers. Used to skip the guard on the common path.
 */
export const isSafeArray = (value: unknown, integerSlots = 0): boolean => {
    if (!Array.isArray(value)) {
        return false;
    }
    if (!integerSlots) {
        return true;
    }
    if (value.length < integerSlots) {
        return false;
    }
    return value.every(entry => Number.isInteger(entry));
};

const toLevelValueArray = (values: unknown[] | Record<string, unknown> | undefined | null): unknown[] => {
    if (Array.isArray(values)) {
        return values;
    }
    if (!values || typeof values !== 'object') {
        return [];
    }

    const mapped: unknown[] = [];
    Object.entries(values).forEach(([key, value]) => {
        const index = Number(key);
        if (Number.isInteger(index) && index >= 0) {
            mapped[index] = value;
        }
    });

    return mapped;
};

export const normalizeSeasonEventScores = (values: unknown[] | undefined | null): number[] => {
    const rawValues = toLevelValueArray(values);
    return seasonEventLevels.map((_level, index) => {
        const numeric = Number(rawValues[index]);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 0;
        }
        return Math.min(seasonEventLevelPointCaps[index], Math.floor(numeric));
    });
};

export const normalizeMatch3Scores = (values: unknown[] | undefined | null): number[] => {
    const rawValues = toLevelValueArray(values);
    return match3Levels.map((_level, index) => {
        const numeric = Number(rawValues[index]);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 0;
        }
        return Math.min(MAX_MATCH3_SCORE_PER_LEVEL, Math.floor(numeric));
    });
};

/** 0/1 per level of `levels`; INFINITE slots are always 0 (they are never cleared). */
export const normalizeClearedFlags = (
    values: unknown[] | Record<string, unknown> | undefined | null,
    levels: string[],
    infiniteLevels: string[] = []
): number[] => {
    const rawValues = toLevelValueArray(values);
    return levels.map((level, index) => (!infiniteLevels.includes(level) && Number(rawValues[index]) > 0 ? 1 : 0));
};

/** Best Heist score per level, clamped to the level's cap (`HEIST_LEVEL_CAPS`). */
export const normalizeHeistScores = (values: unknown[] | Record<string, unknown> | undefined | null): number[] => {
    const rawValues = toLevelValueArray(values);
    return HEIST_LEVELS.map((_level, index) => {
        const numeric = Number(rawValues[index]);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 0;
        }
        return Math.min(HEIST_LEVEL_CAPS[index], Math.floor(numeric));
    });
};

/** Heist stars bitmask per level (win 1, every coin 2, clean and quick 4). */
export const normalizeHeistStars = (values: unknown[] | Record<string, unknown> | undefined | null): number[] => {
    const rawValues = toLevelValueArray(values);
    return HEIST_LEVELS.map((_level, index) => {
        const numeric = Number(rawValues[index]);
        return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) & HEIST_STAR_MASK : 0;
    });
};

/** Per-slot update operators for the progress arrays (see `normalizeProgressArrays`). */
export interface IProgressArrayOps {
    $set: Record<string, unknown>;
    $max: Record<string, number>;
    $min: Record<string, number>;
    $bit: Record<string, { and: number }>;
}

const emptyProgressOps = (): IProgressArrayOps => ({ $set: {}, $max: {}, $min: {}, $bit: {} });

/** The non-empty operators of `ops`, ready to merge into an update document. */
export function progressOpsUpdate(ops: IProgressArrayOps): Record<string, Record<string, unknown>> {
    return Object.fromEntries(Object.entries(ops).filter(([, fields]) => Object.keys(fields).length));
}

/**
 * The cleared and Heist arrays of a user, normalised, plus the per-slot operators that store them
 * so. Every repair is a commutative per-slot operator, never a whole-array `$set` computed from a
 * read, so a concurrent `/live` save (a `won` flag, a Heist `$max`/`$bit`) can never be overwritten
 * by a stale snapshot (review 3b finding 5):
 *
 * - a missing or null slot (the padding a dotted `$max` leaves) gets `$max 0`: null sorts below
 *   every number, and a value written meanwhile stays;
 * - a value above its cap (a score over the cap, a flag on an INFINITE level, a flag above 1) gets
 *   `$min` to the normalised value; stray star bits get `$bit {and: mask}`;
 * - a non-numeric slot (or a fractional star mask, which `$bit` refuses) gets a dotted `$set`.
 *
 * A field that is missing (or null) is left alone: the normalised zeros are returned, and nothing
 * is written for a field no request has written yet (review 3b finding 6). A legacy object-shaped
 * value (`{ "3": x }`) is the one case still replaced whole.
 */
export function normalizeProgressArrays(latest: Record<string, any>, fields: string[]) {
    const values: Record<string, number[]> = {};
    const ops = emptyProgressOps();
    for (const field of fields) {
        const cleared = CLEARED_FIELDS.find(entry => entry.field === field);
        const isStars = field === HEIST_STARS_FIELD;
        const raw = latest[field];
        const normalized = cleared
            ? normalizeClearedFlags(raw, cleared.levels, cleared.infiniteLevels)
            : field === HEIST_SCORE_FIELD
            ? normalizeHeistScores(raw)
            : normalizeHeistStars(raw);
        values[field] = normalized;
        if (raw === undefined || raw === null) {
            continue;
        }
        if (!Array.isArray(raw)) {
            ops.$set[field] = normalized;
            continue;
        }
        normalized.forEach((target, index) => {
            const current = raw[index];
            const path = `${field}.${index}`;
            if (typeof current === 'number' && current === target) {
                return;
            }
            if (current === undefined || current === null) {
                ops.$max[path] = target;
            } else if (
                typeof current !== 'number' ||
                !Number.isFinite(current) ||
                (isStars && !Number.isInteger(current))
            ) {
                ops.$set[path] = target;
            } else if (current < target) {
                ops.$max[path] = target;
            } else if (isStars && current > 0) {
                ops.$bit[path] = { and: HEIST_STAR_MASK };
            } else {
                ops.$min[path] = target;
            }
        });
    }
    return { values, ops };
}

export const CLEARED_FIELD_NAMES = CLEARED_FIELDS.map(entry => entry.field);
export const HEIST_FIELD_NAMES = [HEIST_SCORE_FIELD, HEIST_STARS_FIELD];

/** The capped per-level arrays and counts, as `/live` returns them. */
export interface IGameTotals {
    catnipChaos: number[];
    catnipChaosCount: number;
    catnipCount: number;
    seasonEvent: number[];
    seasonEventCount: number;
    match3: number[];
    match3Count: number;
    match3Score: number[];
    match3ScoreCount: number;
    /** 0/1 per level (plan G10). */
    catnipChaosCleared: number[];
    seasonEventCleared: number[];
    match3Cleared: number[];
    /** Heist best score and stars per level (plan G2). */
    heistScore: number[];
    heistStars: number[];
}

/** The Heist part of the totals, as the replay branch of `/live` returns it. */
export interface IHeistTotals {
    heistScore: number[];
    heistStars: number[];
}

/** The two repository calls the recompute needs (UserRepository fits). */
export interface IGameTotalsRepository {
    findOne(params: { searchObject: Record<string, unknown>; projection?: string }): Promise<any>;
    update(id: string, update: Record<string, unknown>): Promise<unknown>;
}

export const GAME_TOTALS_PROJECTION =
    'catnipChaos catnipChaosCount catnipCount seasonEvent seasonEventCount match3 match3Count match3Score match3ScoreCount catnipChaosCleared seasonEventCleared match3Cleared heistScore heistStars';

/**
 * Re-derives a user's per-level best arrays and totals from what is stored: every value is clamped
 * to its level cap, missing arrays become arrays, and every count is the sum of its capped array.
 * Shared by `POST /user/catbassadors/live` (after its `$max`) and the guest merge (after it `$max`es
 * the guest's bests into the target), so neither can ever exceed a cap (plan G1, F6). The cleared
 * flags and the Heist arrays are normalised too (full length, 0/1 and capped), so an object-shaped
 * or null-padded value left by a dotted write never survives the request that made it.
 *
 * Throws 400 when the user does not exist.
 */
export async function recomputeGameTotals(repository: IGameTotalsRepository, userId: string): Promise<IGameTotals> {
    const latest = await repository.findOne({
        searchObject: { _id: userId },
        projection: GAME_TOTALS_PROJECTION,
    });
    if (!latest) {
        throw new BadRequestException('User not found');
    }

    const catnipSnapshot = buildCatnipAccountingSnapshot(latest.catnipChaos, latest.match3);
    const catnipSanitization = buildCatnipSanitizationUpdate(latest.catnipChaos, latest.match3);
    const normalizedSeasonEvent = normalizeSeasonEventScores(latest.seasonEvent);
    const seasonEventCount = normalizedSeasonEvent.reduce((acc, curr) => acc + curr, 0);
    const normalizedMatch3Score = normalizeMatch3Scores(latest.match3Score);
    const match3ScoreCount = normalizedMatch3Score.reduce((acc, curr) => acc + curr, 0);

    const setUpdate: Record<string, unknown> = { ...catnipSanitization.set };
    const unsetUpdate: Record<string, ''> = { ...catnipSanitization.unset };

    // A `$max` on `catnipChaos.3` of a doc without the array stores `{ "3": x }`. The whole array is
    // then rewritten, and the per-index entries for it are dropped: MongoDB rejects `catnipChaos`
    // and `catnipChaos.3` in one update as a path conflict.
    const replaceWhole = (field: string, value: number[]) => {
        setUpdate[field] = value;
        [setUpdate, unsetUpdate].forEach(update =>
            Object.keys(update)
                .filter(key => key.startsWith(`${field}.`))
                .forEach(key => delete update[key])
        );
    };
    if (!Array.isArray(latest.catnipChaos)) {
        replaceWhole('catnipChaos', catnipSnapshot.catnipChaos);
    }
    if (!Array.isArray(latest.match3)) {
        replaceWhole('match3', catnipSnapshot.match3);
    }
    if (!Array.isArray(latest.seasonEvent)) {
        setUpdate.seasonEvent = normalizedSeasonEvent;
    }
    if (!Array.isArray(latest.match3Score)) {
        setUpdate.match3Score = normalizedMatch3Score;
    }

    if ((latest.catnipChaosCount || 0) !== catnipSnapshot.catnipChaosCount) {
        setUpdate.catnipChaosCount = catnipSnapshot.catnipChaosCount;
    }
    if ((latest.match3Count || 0) !== catnipSnapshot.match3Count) {
        setUpdate.match3Count = catnipSnapshot.match3Count;
    }
    if ((latest.catnipCount || 0) !== catnipSnapshot.catnipCount) {
        setUpdate.catnipCount = catnipSnapshot.catnipCount;
    }
    if ((latest.seasonEventCount || 0) !== seasonEventCount) {
        setUpdate.seasonEventCount = seasonEventCount;
    }
    if ((latest.match3ScoreCount || 0) !== match3ScoreCount) {
        setUpdate.match3ScoreCount = match3ScoreCount;
    }

    const rawSeasonEvent = Array.isArray(latest.seasonEvent) ? latest.seasonEvent : [];
    for (let index = 0; index < rawSeasonEvent.length; index += 1) {
        if (index >= normalizedSeasonEvent.length) {
            unsetUpdate[`seasonEvent.${index}`] = '';
            continue;
        }
        const normalizedValue = normalizedSeasonEvent[index];
        const currentValue = Number(rawSeasonEvent[index]);
        if (!Number.isFinite(currentValue) || currentValue !== normalizedValue) {
            setUpdate[`seasonEvent.${index}`] = normalizedValue;
        }
    }

    const rawMatch3Score = Array.isArray(latest.match3Score) ? latest.match3Score : [];
    for (let index = 0; index < rawMatch3Score.length; index += 1) {
        if (index >= normalizedMatch3Score.length) {
            unsetUpdate[`match3Score.${index}`] = '';
            continue;
        }
        const normalizedValue = normalizedMatch3Score[index];
        const currentValue = Number(rawMatch3Score[index]);
        if (!Number.isFinite(currentValue) || currentValue !== normalizedValue) {
            setUpdate[`match3Score.${index}`] = normalizedValue;
        }
    }

    const progress = normalizeProgressArrays(latest, [...CLEARED_FIELD_NAMES, ...HEIST_FIELD_NAMES]);
    // Different fields from everything above, so the per-slot operators cannot conflict with them.
    Object.assign(setUpdate, progress.ops.$set);

    const updateQuery: Record<string, unknown> = progressOpsUpdate({ ...progress.ops, $set: setUpdate });
    if (Object.keys(unsetUpdate).length) {
        updateQuery.$unset = unsetUpdate;
    }
    if (Object.keys(updateQuery).length) {
        await repository.update(userId, updateQuery);
    }

    return {
        catnipChaos: catnipSnapshot.catnipChaos,
        catnipChaosCount: catnipSnapshot.catnipChaosCount,
        catnipCount: catnipSnapshot.catnipCount,
        seasonEvent: normalizedSeasonEvent,
        seasonEventCount,
        match3: catnipSnapshot.match3,
        match3Count: catnipSnapshot.match3Count,
        match3Score: normalizedMatch3Score,
        match3ScoreCount,
        catnipChaosCleared: progress.values.catnipChaosCleared,
        seasonEventCleared: progress.values.seasonEventCleared,
        match3Cleared: progress.values.match3Cleared,
        heistScore: progress.values.heistScore,
        heistStars: progress.values.heistStars,
    };
}

/**
 * The Heist counterpart of `recomputeGameTotals` for the replay branch: normalises only
 * `heistScore` and `heistStars`. It reads and writes nothing else, so a Heist save can never touch
 * `catnipCount`, the catnip arrays or anything the loot-drop export reads (decision #14).
 */
export async function recomputeHeistTotals(repository: IGameTotalsRepository, userId: string): Promise<IHeistTotals> {
    const latest = await repository.findOne({ searchObject: { _id: userId }, projection: HEIST_FIELD_NAMES.join(' ') });
    if (!latest) {
        throw new BadRequestException('User not found');
    }
    const progress = normalizeProgressArrays(latest, HEIST_FIELD_NAMES);
    const update = progressOpsUpdate(progress.ops);
    if (Object.keys(update).length) {
        await repository.update(userId, update);
    }
    return { heistScore: progress.values.heistScore, heistStars: progress.values.heistStars };
}

/** Every progress array the guest merge must carry over besides the per-level bests. */
export const GUEST_PROGRESS_FIELDS = [...CLEARED_FIELD_NAMES, ...HEIST_FIELD_NAMES];

/**
 * The update that carries a guest's server progress into an account (plan G1 merge, G10, G2): the
 * cleared flags and `heistScore` with `$max` (0/1 flags and best scores), `heistStars` with
 * `$bit {or}` (a `$max` of bitmasks would lose stars: 5 vs 3). Only set slots are written, every
 * value normalised first (INFINITE never cleared, scores capped, stars masked), so the update is
 * idempotent and can never exceed a cap. Null when the guest has nothing to carry.
 */
export function guestProgressUpdate(guest: Record<string, any>): Record<string, Record<string, unknown>> | null {
    const { values } = normalizeProgressArrays(guest, GUEST_PROGRESS_FIELDS);
    const max: Record<string, number> = {};
    const bit: Record<string, { or: number }> = {};
    for (const field of GUEST_PROGRESS_FIELDS) {
        values[field].forEach((value, index) => {
            if (value <= 0) {
                return;
            }
            if (field === HEIST_STARS_FIELD) {
                bit[`${field}.${index}`] = { or: value };
            } else {
                max[`${field}.${index}`] = value;
            }
        });
    }
    const update: Record<string, Record<string, unknown>> = {};
    if (Object.keys(max).length) {
        update.$max = max;
    }
    if (Object.keys(bit).length) {
        update.$bit = bit;
    }
    return Object.keys(update).length ? update : null;
}

/**
 * Merges a guest's cleared flags and Heist progress into `targetId` (see `guestProgressUpdate`).
 * Missing or null target arrays are made arrays first (the F6 guard), because a dotted write into a
 * missing field stores a sub-document and `$bit` refuses null. Returns whether anything was written.
 */
export async function mergeGuestProgress(
    repository: IGameTotalsRepository,
    guest: Record<string, any>,
    targetId: string
): Promise<boolean> {
    const update = guestProgressUpdate(guest);
    if (!update) {
        return false;
    }
    const target = await repository.findOne({
        searchObject: { _id: targetId },
        projection: GUEST_PROGRESS_FIELDS.join(' '),
    });
    if (!target) {
        throw new BadRequestException('User not found');
    }
    const slots = HEIST_LEVELS.length;
    const maxFields = GUEST_PROGRESS_FIELDS.filter(field => field !== HEIST_STARS_FIELD);
    if (maxFields.some(field => !isSafeArray(target[field])) || !isSafeArray(target[HEIST_STARS_FIELD], slots)) {
        await repository.update(
            targetId,
            arrayGuardPipeline(maxFields, [{ field: HEIST_STARS_FIELD, length: slots }]) as any
        );
    }
    await repository.update(targetId, update);
    return true;
}

/** The raw users model calls `recomputeAfterGuestMerge` needs (Mongoose `Model.find(...).lean()`). */
export interface IMergingGuestFinder {
    find(filter: Record<string, unknown>, projection?: Record<string, number>): { lean(): PromiseLike<any[]> };
}

/**
 * The `recomputeTotals` callback for the guest merge (`IGuestLifecycleDeps`). The merge calls it in
 * the `gamesMoved` step, after `$max`ing the per-level bests; this first carries over the guests
 * being merged into `targetId` at that step (their cleared flags, `heistScore` and `heistStars`,
 * which the merge's own best list does not hold) and then re-derives the totals. Idempotent, so a
 * resumed merge, or a merge that later carries these fields itself, never double counts.
 *
 * Without it a guest who won levels and then signed in would find them locked again (#69, server
 * cleared state), and their Heist progress gone while the moved rows' digests make a resent log 409.
 */
export function recomputeAfterGuestMerge(repository: IGameTotalsRepository, users: IMergingGuestFinder) {
    return async (targetId: string): Promise<IGameTotals> => {
        const projection = Object.fromEntries(GUEST_PROGRESS_FIELDS.map(field => [field, 1]));
        const merging = await users
            .find(
                { isGuest: true, mergedInto: new Types.ObjectId(String(targetId)), mergeState: 'gamesMoved' },
                projection
            )
            .lean();
        for (const guest of merging || []) {
            await mergeGuestProgress(repository, guest, String(targetId));
        }
        return recomputeGameTotals(repository, String(targetId));
    };
}
