import { NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { PORTRAIT_SHELTER_ID } from 'src/blessing/blessing.schema';
import { AppleRevokeOutcome, revokeAppleAuthorization } from './apple-revoke';
import { IFirebaseIdentity } from './firebase-identity';
import { DELETED_ACCOUNT_NAME } from './identity-config';

/*
 * `DELETE /user/me` (G9, Apple 5.1.1(v), decision #4): anonymise the backend record, delete the
 * Firebase users, release the cats (rescue cats back to the shelter pool), write an audit record, and revoke the Sign in
 * with Apple token when the client sends a fresh authorization code.
 *
 * The user document is kept (anonymised) so Game rows, orders, payouts and boards that reference
 * its `_id` keep rendering; its name becomes "Deleted player". Personal fields are removed. The
 * custodial wallet stays attached to the record: it can hold NFTs and funds, and deleting its key
 * would destroy them. Removing it is a manual support step.
 */

export const ACCOUNT_DELETIONS_COLLECTION = 'accountdeletions';

/** Fields removed from the anonymised record. */
export const PERSONAL_FIELDS = [
    'email',
    'emailCanonical',
    'emailVerifiedAt',
    'firebaseUids',
    'twitter',
    'discord',
    'discount',
    'likes',
    'following',
    'referredBy',
    'onboarding',
    'pendingTails',
    'promotionUnnotified',
    'cat',
] as const;

/**
 * Board and balance fields zeroed on deletion, so an anonymised account never ranks on a
 * leaderboard or a position, and never earns the weekly top-200 Tails again.
 */
export const BOARD_FIELD_RESET = {
    tails: 0,
    monthTails: 0,
    catnipCount: 0,
    catnipChaos: [],
    catnipChaosCount: 0,
    match3: [],
    match3Count: 0,
    match3Score: [],
    match3ScoreCount: 0,
    seasonEvent: [],
    seasonEventCount: 0,
    // Heist board and cleared levels (2a review fix #6): a "Deleted player" never ranks on a Heist
    // board and never shows cleared levels.
    heistScore: [],
    heistStars: [],
    catnipChaosCleared: [],
    seasonEventCleared: [],
    match3Cleared: [],
} as const;

/** A rescue cat of a real shelter (not a paid pet portrait): the kind GET /cat/sale lists. */
export function isShelterPoolCat(cat: { blessing?: unknown; origin?: unknown; shelter?: unknown }): boolean {
    return !!cat.blessing && cat.origin !== 'portrait' && String(cat.shelter ?? '') !== PORTRAIT_SHELTER_ID;
}

export interface IAccountDeletionDeps {
    users: Model<any>;
    cats: Model<any>;
    firebase: IFirebaseIdentity;
    audit: { insertOne(doc: Record<string, unknown>): Promise<unknown> };
    revokeApple?: (code: string | undefined) => Promise<AppleRevokeOutcome>;
    now?: () => Date;
}

export interface IAccountDeletionResult {
    success: true;
    catsReleased: number;
    /** Of `catsReleased`, the rescue cats that went back to GET /cat/sale. */
    catsToShelterPool: number;
    firebaseUsersDeleted: number;
    apple: AppleRevokeOutcome;
}

export async function deleteAccount(
    deps: IAccountDeletionDeps,
    userId: string,
    appleAuthorizationCode?: string
): Promise<IAccountDeletionResult> {
    const now = deps.now ? deps.now() : new Date();
    const _id = new Types.ObjectId(userId);
    const user = await deps.users.findOne({ _id }, { firebaseUids: 1, isGuest: 1, deletedAt: 1 }).lean();
    if (!user || user.isGuest) {
        throw new NotFoundException('Account not found');
    }

    // First, while the client's authorization code is fresh (it expires in minutes).
    const apple = await (deps.revokeApple || revokeAppleAuthorization)(appleAuthorizationCode);

    const unset = Object.fromEntries(PERSONAL_FIELDS.map(field => [field, 1]));
    await deps.users.updateOne(
        { _id },
        {
            $set: { ...BOARD_FIELD_RESET, name: DELETED_ACCOUNT_NAME, cats: [], deletedAt: user.deletedAt || now },
            $unset: unset,
        }
    );

    // Starters are virtual companions of this account: removed. Every other cat is released.
    await deps.cats.deleteMany({ owner: _id, isStarter: true });
    const { catsReleased, catsToShelterPool } = await releaseCats(deps.cats, _id, now);

    const firebaseUsersDeleted = user.firebaseUids?.length ? await deps.firebase.deleteUsers(user.firebaseUids) : 0;

    // No personal data in the audit record: the account id, counts and outcomes only.
    await deps.audit.insertOne({
        user: _id,
        deletedAt: now,
        catsReleased,
        catsToShelterPool,
        firebaseUsersDeleted,
        apple,
        repeated: !!user.deletedAt,
    });

    return { success: true, catsReleased, catsToShelterPool, firebaseUsersDeleted, apple };
}

/**
 * Releases the cats of a deleted account (decision #4, 2a review fix #6). Deletions are rare and an
 * account owns few cats, so this goes cat by cat.
 *
 * - A rescue cat whose blessing has no adoptable cat in the pool (`owner` missing) goes back to the
 *   pool: `owner` is unset, so GET /cat/sale lists it again.
 * - Every other cat (a copy whose catalogue cat is still adoptable, a pack cat without a blessing,
 *   a paid pet portrait) is detached with `owner: null`: the rescue is already adoptable through its
 *   catalogue cat, and a second listing would show the same rescue twice.
 *
 * `sourceCat` moves to `releasedSourceCat`, because the unique `copy_per_owner_source` index treats
 * a missing and a null owner alike: two released copies of one catalogue cat would collide, and the
 * deletion of the second account would stop half way with E11000.
 *
 * NFTs held by the account's custodial wallet stay there (the wallet is kept on the record);
 * moving them is a manual support step.
 */
async function releaseCats(
    cats: Model<any>,
    owner: Types.ObjectId,
    now: Date
): Promise<{ catsReleased: number; catsToShelterPool: number }> {
    const owned: any[] = await cats
        .find({ owner }, { _id: 1, blessing: 1, sourceCat: 1, origin: 1, shelter: 1 })
        .lean();
    let catsReleased = 0;
    let catsToShelterPool = 0;
    for (const cat of owned) {
        const toPool =
            isShelterPoolCat(cat) &&
            !(await cats.findOne({ blessing: cat.blessing, owner: { $exists: false } }, { _id: 1 }).lean());
        const set: Record<string, unknown> = { releasedAt: now };
        const unset: Record<string, 1> = { staked: 1 };
        if (toPool) {
            unset.owner = 1;
        } else {
            set.owner = null;
        }
        if (cat.sourceCat) {
            set.releasedSourceCat = cat.sourceCat;
            unset.sourceCat = 1;
        }
        const result = await cats.updateOne({ _id: cat._id, owner }, { $set: set, $unset: unset });
        if ((result as { modifiedCount?: number }).modifiedCount) {
            catsReleased += 1;
            catsToShelterPool += toPool ? 1 : 0;
        }
    }
    return { catsReleased, catsToShelterPool };
}
