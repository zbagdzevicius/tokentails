import { ConflictException, Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { GUEST_TAILS_LIFETIME_CAP } from 'src/shared-contracts/caps';
import { GuestMergeState } from '../user.schema';
import { earnTailsInc } from '../tails-ledger';
import { IFirebaseIdentity } from './firebase-identity';
import { GUEST_IDLE_MS, GUEST_MERGE_COOLDOWN_MS, MERGE_RESUME_AFTER_MS } from './identity-config';
import { tooManyRequests } from './ip-throttle';
import { arrayGuardPipeline, dottedArrayFields } from '../utils/live-game';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';

/*
 * Guest lifecycle without transactions (plan G1, F5.5): the resumable merge, the explicit erase and
 * the idle cleanup. Every step is idempotent or guarded by a conditional write, so a crash or a
 * parallel retry at any point never double counts.
 *
 * Merge states on the GUEST document: started -> gamesMoved -> bestsMerged -> done.
 * - started:     Game rows re-parented to the target with one updateMany (the only Game write; no
 *                row is created, so POST /user/catbassadors/live stays the only score writer).
 * - gamesMoved:  per-level bests merged with `$max` and the codex with an elementwise max (both
 *                idempotent), then the target's totals re-derived through `recomputeGameTotals`,
 *                the same code /live uses, so caps can never be exceeded. Bests end up equal to
 *                the elementwise max.
 * - bestsMerged: pending Tails credited once, capped by GUEST_TAILS_LIFETIME_CAP. Exactly-once
 *                through `mergedGuestIds` on the target.
 * - done:        guest starter dropped (decision #8), guest Firebase user and guest doc deleted.
 *
 * Every step re-reads the guest as a guest still claimed by this target and stops otherwise, and
 * promotion refuses a guest with `mergedInto` set, so a promotion in another tab can never have its
 * Game rows moved or its starter and Firebase user deleted by a merge.
 */

type AnyModel = Model<any>;

export interface IGuestLifecycleDeps {
    users: AnyModel;
    cats: AnyModel;
    games: AnyModel;
    firebase: IFirebaseIdentity;
    /** Re-derives a user's capped per-level arrays and counts (utils/live-game.ts). */
    recomputeTotals: (userId: string) => Promise<unknown>;
    now?: () => Date;
    logger?: Pick<Logger, 'log' | 'warn' | 'error'>;
}

export interface IGuestMergeResult {
    state: GuestMergeState;
    gamesMoved: number;
    tailsCredited: number;
}

// Per-level best arrays that `recomputeGameTotals` re-derives (and turns back into arrays) after the
// `$max`. The codex is merged separately (`mergeCodex`): nothing re-derives it, and a `$max` on
// `codex.3` of a target without a codex would store an object, not an array.
const SCORE_ARRAYS = ['catnipChaos', 'seasonEvent', 'match3', 'match3Score'] as const;

const sameId = (a: unknown, b: unknown) => !!a && !!b && a.toString() === b.toString();
const clock = (deps: IGuestLifecycleDeps) => (deps.now ? deps.now() : new Date());

const mergeConflict = () =>
    new ConflictException({
        statusCode: 409,
        message: 'This guest progress is already being saved to another account',
    });

/**
 * Claims a guest for `targetId` and takes the target's merge slot (one merge per 30 days). Returns
 * the guest doc to run, or null when no guest doc exists (never created, or already merged and
 * deleted). A guest already claimed by this target resumes without a new slot.
 */
export async function startGuestMerge(
    deps: IGuestLifecycleDeps,
    guestId: Types.ObjectId,
    targetId: Types.ObjectId
): Promise<any | null> {
    if (sameId(guestId, targetId)) {
        throw new ConflictException({ statusCode: 409, message: 'An account cannot merge into itself' });
    }
    const guest = await deps.users.findOne({ _id: guestId, isGuest: true }).lean();
    if (!guest) {
        return null;
    }
    if (guest.mergedInto) {
        if (!sameId(guest.mergedInto, targetId)) {
            throw mergeConflict();
        }
        return guest;
    }

    const claimed = await deps.users
        .findOneAndUpdate(
            { _id: guestId, isGuest: true, mergedInto: { $exists: false } },
            { $set: { mergedInto: targetId, mergeState: 'started' } },
            { new: true }
        )
        .lean();
    if (!claimed) {
        // A parallel request claimed it first.
        const current = await deps.users.findOne({ _id: guestId, isGuest: true }).lean();
        if (current && sameId(current.mergedInto, targetId)) {
            return current;
        }
        if (!current) {
            return null;
        }
        throw mergeConflict();
    }

    const now = clock(deps);
    const cutoff = new Date(now.getTime() - GUEST_MERGE_COOLDOWN_MS);
    const slot = await deps.users
        .findOneAndUpdate(
            {
                _id: targetId,
                isGuest: { $ne: true },
                $or: [{ lastGuestMergeAt: null }, { lastGuestMergeAt: { $lt: cutoff } }],
            },
            { $set: { lastGuestMergeAt: now } }
        )
        .lean();
    if (!slot) {
        // Release the claim so the guest can keep playing or try again later.
        await deps.users.updateOne(
            { _id: guestId, mergedInto: targetId, mergeState: 'started' },
            { $unset: { mergedInto: 1, mergeState: 1 } }
        );
        throw tooManyRequests('This account already saved guest progress in the last 30 days');
    }
    return claimed;
}

async function advance(deps: IGuestLifecycleDeps, guestId: Types.ObjectId, from: GuestMergeState, to: GuestMergeState) {
    await deps.users.updateOne({ _id: guestId, mergeState: from }, { $set: { mergeState: to } });
    const current = await deps.users.findOne({ _id: guestId }, { mergeState: 1 }).lean();
    // Deleted by a parallel run that already finished: treat as done.
    return (current?.mergeState as GuestMergeState) || 'done';
}

/** `$max` of every positive per-level value of the guest into the target (idempotent). */
export function bestsUpdate(guest: Record<string, any>): Record<string, number | Date> {
    const max: Record<string, number | Date> = {};
    for (const field of SCORE_ARRAYS) {
        const values = guest[field];
        const entries: [string, unknown][] = Array.isArray(values)
            ? values.map((value, index) => [String(index), value])
            : values && typeof values === 'object'
            ? Object.entries(values)
            : [];
        for (const [key, value] of entries) {
            const index = Number(key);
            const numeric = Number(value);
            if (Number.isInteger(index) && index >= 0 && Number.isFinite(numeric) && numeric > 0) {
                max[`${field}.${index}`] = Math.floor(numeric);
            }
        }
    }
    if (guest.lastPlayedAt instanceof Date || typeof guest.lastPlayedAt === 'string') {
        max.lastPlayedAt = new Date(guest.lastPlayedAt);
    }
    return max;
}

/**
 * A dotted `$max` into a null array fails ("Cannot create field '3' in element {catnipChaos: null}"),
 * which would leave the merge stuck at gamesMoved for good. Same guard as /live: a touched score
 * array stored as null gets the conditional `arrayGuardPipeline` first (null becomes [], and the
 * `$max` pads it with nulls, which every reader and `recomputeGameTotals` count as 0, as after a
 * first /live save). A missing array is left alone: the `$max` stores an index map and
 * `recomputeGameTotals` rewrites it whole. A no-op on the common path.
 */
async function guardScoreArrays(deps: IGuestLifecycleDeps, targetId: Types.ObjectId, max: Record<string, unknown>) {
    const touched = dottedArrayFields(max).filter(field => (SCORE_ARRAYS as readonly string[]).includes(field));
    if (!touched.length) return;
    const target = await deps.users
        .findOne({ _id: targetId }, Object.fromEntries(touched.map(field => [field, 1])))
        .lean();
    const unsafe = touched.filter(field => target && target[field] === null);
    if (unsafe.length) {
        await deps.users.updateOne({ _id: targetId }, arrayGuardPipeline(unsafe));
    }
}

/** Elementwise max of two codex arrays (0/1 per season phase). Non-numeric entries count as 0. */
export function mergedCodex(target: unknown, guest: unknown): number[] {
    const list = (value: unknown) => (Array.isArray(value) ? value : []);
    const a = list(target);
    const b = list(guest);
    return Array.from({ length: Math.max(a.length, b.length) }, (_value, index) => {
        const best = Math.max(Number(a[index]) || 0, Number(b[index]) || 0);
        return Number.isFinite(best) && best > 0 ? Math.floor(best) : 0;
    });
}

/**
 * Merges the guest's codex into the target's as a real array (idempotent: the max of a max is the
 * same). The write is conditional on the codex read, so a codex update that lands in between is
 * re-read, never overwritten.
 */
export async function mergeCodex(deps: IGuestLifecycleDeps, guest: any, targetId: Types.ObjectId): Promise<void> {
    if (!Array.isArray(guest?.codex) || !guest.codex.some((value: unknown) => Number(value) > 0)) {
        return;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const target = await deps.users.findOne({ _id: targetId }, { codex: 1 }).lean();
        if (!target) {
            return;
        }
        const merged = mergedCodex(target.codex, guest.codex);
        const unchanged =
            Array.isArray(target.codex) &&
            target.codex.length === merged.length &&
            merged.every((value, index) => Number(target.codex[index]) === value);
        if (unchanged) {
            return;
        }
        const result = await deps.users.updateOne(
            { _id: targetId, codex: target.codex === undefined ? { $exists: false } : target.codex },
            { $set: { codex: merged } }
        );
        if ((result as { modifiedCount?: number }).modifiedCount) {
            return;
        }
    }
    throw new ConflictException({ statusCode: 409, message: 'Guest codex could not be merged, retry' });
}

/** Credits the guest's pending Tails into the target once. Returns the amount credited now. */
export async function creditPendingTails(deps: IGuestLifecycleDeps, guest: any, targetId: Types.ObjectId) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const target = await deps.users.findOne({ _id: targetId }, { guestMergedTails: 1, mergedGuestIds: 1 }).lean();
        if (!target) {
            return 0;
        }
        if ((target.mergedGuestIds || []).some((id: unknown) => sameId(id, guest._id))) {
            return 0;
        }
        const alreadyMerged = Number(target.guestMergedTails) || 0;
        const pending = Math.max(0, Math.floor(Number(guest.pendingTails) || 0));
        const credit = Math.max(0, Math.min(pending, GUEST_TAILS_LIFETIME_CAP - alreadyMerged));
        const result = await deps.users.updateOne(
            {
                _id: targetId,
                mergedGuestIds: { $ne: guest._id },
                // Unchanged since the read, so two credits can never both use the same headroom.
                guestMergedTails: target.guestMergedTails ?? null,
            },
            {
                $addToSet: { mergedGuestIds: guest._id },
                $inc: { ...earnTailsInc(credit), monthTails: credit, guestMergedTails: credit },
            }
        );
        if ((result as { modifiedCount?: number }).modifiedCount) {
            return credit;
        }
    }
    throw new ConflictException({ statusCode: 409, message: 'Guest Tails could not be credited, retry' });
}

/**
 * The guest doc, only while it is still a guest claimed by `targetId`. Null when it is gone (a
 * parallel run finished the merge). Throws 409 when it stopped being a guest or was re-claimed:
 * the merge must not touch it any more.
 */
async function claimedGuestDoc(deps: IGuestLifecycleDeps, guestId: Types.ObjectId, targetId: Types.ObjectId) {
    const guest = await deps.users.findOne({ _id: guestId }).lean();
    if (!guest) {
        return null;
    }
    if (!guest.isGuest || !sameId(guest.mergedInto, targetId)) {
        throw new ConflictException({ statusCode: 409, message: 'This guest is no longer being merged' });
    }
    return guest;
}

/**
 * Re-parents the guest's Game rows. One updateMany; if a unique Game index (for example a Heist
 * replay dedupe) rejects a row the target already has, the rows are moved one by one and each
 * duplicate guest row is deleted, so the merge never stays stuck in `started`.
 */
async function moveGames(deps: IGuestLifecycleDeps, guestId: Types.ObjectId, set: Record<string, unknown>) {
    try {
        const result = await deps.games.updateMany({ user: guestId }, { $set: set });
        return (result as { modifiedCount?: number }).modifiedCount || 0;
    } catch (error) {
        if (!isDuplicateKeyError(error)) {
            throw error;
        }
    }
    let moved = 0;
    const rows = await deps.games.find({ user: guestId }, { _id: 1 }).lean();
    for (const row of rows) {
        try {
            const result = await deps.games.updateOne({ _id: row._id, user: guestId }, { $set: set });
            moved += (result as { modifiedCount?: number }).modifiedCount || 0;
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            await deps.games.deleteOne({ _id: row._id, user: guestId });
        }
    }
    deps.logger?.warn(`guest merge: moved Game rows one by one after a duplicate key (${rows.length} rows)`);
    return moved;
}

/** Runs (or resumes) the merge of a claimed guest doc to the end. Safe to call again at any state. */
export async function runGuestMerge(deps: IGuestLifecycleDeps, claimedGuest: any): Promise<IGuestMergeResult> {
    const guestId: Types.ObjectId = claimedGuest._id;
    const targetId: Types.ObjectId = claimedGuest.mergedInto;
    let state: GuestMergeState = claimedGuest.mergeState || 'started';
    let gamesMoved = 0;
    let tailsCredited = 0;

    if (state === 'started') {
        if (await claimedGuestDoc(deps, guestId, targetId)) {
            const target = await deps.users.findOne({ _id: targetId }, { cat: 1 }).lean();
            gamesMoved = await moveGames(deps, guestId, {
                user: targetId,
                ...(target?.cat ? { cat: target.cat } : {}),
            });
        }
        state = await advance(deps, guestId, 'started', 'gamesMoved');
    }

    if (state === 'gamesMoved') {
        const guest = await claimedGuestDoc(deps, guestId, targetId);
        if (guest) {
            const max = bestsUpdate(guest);
            if (Object.keys(max).length) {
                await guardScoreArrays(deps, targetId, max);
                await deps.users.updateOne({ _id: targetId }, { $max: max });
            }
            await mergeCodex(deps, guest, targetId);
            await deps.recomputeTotals(targetId.toString());
        }
        state = await advance(deps, guestId, 'gamesMoved', 'bestsMerged');
    }

    if (state === 'bestsMerged') {
        const guest = await claimedGuestDoc(deps, guestId, targetId);
        if (guest) {
            tailsCredited = await creditPendingTails(deps, guest, targetId);
        }
        state = await advance(deps, guestId, 'bestsMerged', 'done');
    }

    if (state === 'done') {
        // Only while the doc is still this finished guest merge: never an account's cats or uids.
        const guest = await deps.users
            .findOne({ _id: guestId, isGuest: true, mergedInto: targetId, mergeState: 'done' }, { firebaseUids: 1 })
            .lean();
        if (guest) {
            // Decision #8: the guest starter is dropped; a guest owns nothing else.
            await deps.cats.deleteMany({ owner: guestId });
            if (guest.firebaseUids?.length) {
                await deps.firebase.deleteAnonymousUsers(guest.firebaseUids);
            }
            await deps.users.deleteOne({ _id: guestId, isGuest: true, mergeState: 'done' });
        }
    }

    return { state, gamesMoved, tailsCredited };
}

/** Leased cron body: finishes merges that stopped half way (client gone, crash). */
export async function resumeGuestMerges(deps: IGuestLifecycleDeps, limit = 100): Promise<number> {
    const cutoff = new Date(clock(deps).getTime() - MERGE_RESUME_AFTER_MS);
    const stuck = await deps.users
        .find({ isGuest: true, mergedInto: { $exists: true }, updatedAt: { $lt: cutoff } })
        .limit(limit)
        .lean();
    let finished = 0;
    for (const guest of stuck) {
        try {
            await runGuestMerge(deps, guest);
            finished += 1;
        } catch (error) {
            deps.logger?.error(`guest merge resume failed: ${(error as Error)?.message}`);
        }
    }
    return finished;
}

/**
 * `DELETE /user/guest` ("Erase guest progress"): the guest doc, its starter, its Game rows and its
 * anonymous Firebase user. A guest in the middle of a merge is not erased (409).
 */
export async function eraseGuest(deps: IGuestLifecycleDeps, guestId: Types.ObjectId | null, uids: string[]) {
    if (guestId) {
        const guest = await deps.users.findOne({ _id: guestId }, { isGuest: 1, mergedInto: 1 }).lean();
        if (guest && !guest.isGuest) {
            throw new ConflictException({ statusCode: 409, message: 'Only guest progress can be erased here' });
        }
        if (guest?.mergedInto) {
            throw mergeConflict();
        }
        if (guest) {
            await deps.games.deleteMany({ user: guestId });
            await deps.cats.deleteMany({ owner: guestId });
            await deps.users.deleteOne({ _id: guestId, isGuest: true });
        }
    }
    await deps.firebase.deleteAnonymousUsers(uids);
}

/** Filter of guests idle for more than 30 days (decision #11) and not in a merge. */
export function idleGuestFilter(now: Date) {
    const cutoff = new Date(now.getTime() - GUEST_IDLE_MS);
    return {
        isGuest: true,
        mergedInto: { $exists: false },
        $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: { $exists: false }, createdAt: { $lt: cutoff } }],
    };
}

/**
 * Leased daily cron body: deletes guests idle for more than 30 days, their starter cats and their
 * anonymous Firebase users. Game rows stay (they are the play history; `user` then points nowhere,
 * like any deleted account). Registered users are never matched: the filter requires isGuest true.
 */
export async function cleanupIdleGuests(deps: IGuestLifecycleDeps, batch = 500): Promise<number> {
    const filter = idleGuestFilter(clock(deps));
    let deleted = 0;
    for (let round = 0; round < 20; round += 1) {
        const guests = await deps.users.find(filter, { _id: 1, firebaseUids: 1 }).limit(batch).lean();
        if (!guests.length) {
            break;
        }
        const ids = guests.map((guest: any) => guest._id);
        await deps.cats.deleteMany({ owner: { $in: ids } });
        const result = await deps.users.deleteMany({ ...filter, _id: { $in: ids } });
        deleted += (result as { deletedCount?: number }).deletedCount || 0;
        await deps.firebase.deleteAnonymousUsers(guests.flatMap((guest: any) => guest.firebaseUids || []));
        if (guests.length < batch) {
            break;
        }
    }
    return deleted;
}
