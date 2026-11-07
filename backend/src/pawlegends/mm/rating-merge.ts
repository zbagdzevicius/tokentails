/*
 * Guest merge of the hidden Quick Play rating (docs/plans/moba/M1A-IMPL.md §4.2): a re-key, never a score write. The
 * row with the lower RD wins (ties: more games) and ends up under the target account; the guest's row is deleted.
 * Called once from user/guest/guest-lifecycle.ts next to the Pawlegends merge step. Idempotent.
 */
import { ratingId, type MmRatingRow } from './rating.schema';

/** The few model calls the merge needs (a Mongoose Model satisfies it). */
export interface RatingMergeModel {
    findById(id: string): { lean(): Promise<unknown> } | Promise<unknown>;
    replaceOne(
        filter: Record<string, unknown>,
        doc: Record<string, unknown>,
        opts: { upsert: boolean }
    ): Promise<unknown>;
    deleteOne(filter: Record<string, unknown>): Promise<unknown>;
}

const read = async (ratings: RatingMergeModel, id: string): Promise<MmRatingRow | null> => {
    const q = ratings.findById(id) as { lean?: () => Promise<unknown> };
    return ((typeof q.lean === 'function' ? await q.lean() : await q) as MmRatingRow | null) ?? null;
};

/** Which row survives: the lower RD, ties more games, then the target's own. */
export function survivor(guest: MmRatingRow | null, target: MmRatingRow | null): 'guest' | 'target' | null {
    if (!guest) return target ? 'target' : null;
    if (!target) return 'guest';
    if (guest.rd !== target.rd) return guest.rd < target.rd ? 'guest' : 'target';
    return guest.games > target.games ? 'guest' : 'target';
}

export async function mergeRating(
    ratings: RatingMergeModel,
    guestId: string,
    targetId: string
): Promise<'guest' | 'target' | null> {
    if (!guestId || !targetId || guestId === targetId) return null;
    const guest = await read(ratings, ratingId(guestId));
    if (!guest) return null;
    const target = await read(ratings, ratingId(targetId));
    const keep = survivor(guest, target);
    if (keep === 'guest') {
        const { _id: _drop, ...rest } = guest;
        void _drop;
        await ratings.replaceOne(
            { _id: ratingId(targetId) },
            { ...rest, _id: ratingId(targetId), accountId: targetId, v: (target?.v ?? 0) + 1 },
            { upsert: true }
        );
    }
    await ratings.deleteOne({ _id: ratingId(guestId) });
    return keep;
}

/**
 * The rating model next to the user model (one Mongoose connection), or null when it is not registered: the guest
 * merge needs no new constructor parameter in the user service.
 */
export function ratingModelBesides(users: unknown): RatingMergeModel | null {
    const models = (users as { db?: { models?: Record<string, unknown> } } | null)?.db?.models;
    return (models?.PawlegendsRating as RatingMergeModel | undefined) ?? null;
}
