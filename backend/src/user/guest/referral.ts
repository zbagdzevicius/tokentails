import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { REWARDS } from 'src/shared-contracts/caps';
import { isIdentityBackfillDone } from 'src/common/decorators/auth-user.decorator';
import { canonicalEmail, sameInbox } from './canonical-email';
import { REFERRAL_WINDOW_MS } from './identity-config';
import { earnTailsInc } from '../tails-ledger';

/*
 * Referral rule (decision #12, G1): a referral pays once per referred account, ever, and only if it
 * is claimed within 7 days of that account's promotion (guest -> registered, or first sign-in).
 * `referredBy` is set once and never overwritten. Accounts referred several times by the old GET
 * route stay as they are (no clawback).
 *
 * Aliases of one inbox (Gmail dots and +tags, guest/canonical-email.ts) are one person (2a review
 * finding #5): a referral between two of them is refused, and once IDENTITY_BACKFILL_DONE=true (the
 * `email_canonical` index exists) so is a second referral of the same inbox under another alias.
 *
 * The claim is one conditional write on the REFERRED account (`referredBy: null`), so parallel calls
 * pay once. The referrer is credited after it; a crash in between loses that one credit, never
 * doubles it.
 */

export interface IReferralResult {
    success: true;
    tails: number;
}

const referralError = (message: string) => new BadRequestException(message);

/** When the referral window of an account starts: its promotion, or its creation for older accounts. */
export function referralWindowStart(user: { promotedAt?: Date | string; createdAt?: Date | string }): Date | null {
    const start = user?.promotedAt || user?.createdAt;
    if (!start) {
        return null;
    }
    const date = new Date(start);
    return Number.isNaN(date.getTime()) ? null : date;
}

export async function applyReferral(
    users: Model<any>,
    referredId: string,
    referrerId: string,
    now: Date = new Date()
): Promise<IReferralResult> {
    if (!Types.ObjectId.isValid(referrerId)) {
        throw referralError('Such user does not exist');
    }
    if (referredId?.toString() === referrerId.toString()) {
        throw referralError('You can not add yourself as referral');
    }
    const referrerObjectId = new Types.ObjectId(referrerId);
    const referredObjectId = new Types.ObjectId(referredId);

    const [referrer, referred] = await Promise.all([
        users.findOne({ _id: referrerObjectId }, { _id: 1, isGuest: 1, deletedAt: 1, email: 1 }).lean(),
        users
            .findOne(
                { _id: referredObjectId },
                { referredBy: 1, promotedAt: 1, createdAt: 1, isGuest: 1, email: 1, emailCanonical: 1 }
            )
            .lean(),
    ]);
    if (!referrer || referrer.isGuest || referrer.deletedAt) {
        throw referralError('Such user does not exist');
    }
    if (!referred || referred.isGuest) {
        throw new ForbiddenException('Create an account to use a referral');
    }
    if (referred.referredBy) {
        throw new ConflictException('This account was already referred');
    }
    const start = referralWindowStart(referred);
    if (!start || now.getTime() - start.getTime() > REFERRAL_WINDOW_MS) {
        throw new ForbiddenException('Referrals can only be used in the first 7 days of an account');
    }
    if (sameInbox(referrer.email, referred.email)) {
        throw referralError('You can not add yourself as referral');
    }
    const inbox = referred.emailCanonical || canonicalEmail(referred.email);
    if (inbox && isIdentityBackfillDone()) {
        const aliasReferred = await users
            .findOne({ emailCanonical: inbox, _id: { $ne: referredObjectId }, referredBy: { $ne: null } }, { _id: 1 })
            .lean();
        if (aliasReferred) {
            throw new ConflictException('This account was already referred');
        }
    }

    const claimed = await users.updateOne(
        { _id: referredObjectId, referredBy: null, isGuest: { $ne: true } },
        { $set: { referredBy: referrerObjectId }, $inc: earnTailsInc(REWARDS.INVITE_FRIEND) }
    );
    if (!(claimed as { modifiedCount?: number }).modifiedCount) {
        throw new ConflictException('This account was already referred');
    }
    await users.updateOne(
        { _id: referrerObjectId },
        {
            $push: { referrals: { $each: [referredObjectId], $position: 0 } },
            $inc: { ...earnTailsInc(REWARDS.INVITE_FRIEND), monthReferrals: 1, referralsCount: 1 },
        }
    );
    return { success: true, tails: REWARDS.INVITE_FRIEND };
}
