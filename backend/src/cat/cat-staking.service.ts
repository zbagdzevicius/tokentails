import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ICat } from 'src/cat/cat.schema';
import {
    CAT_NAP_DAYS,
    CAT_NAP_LIMIT_MESSAGE,
    CAT_NAP_MAX_CATS,
    CAT_NAP_RUNNING_MESSAGE,
    CAT_NAP_STARTED_MESSAGE,
    CAT_NAP_TAILS,
    catNapPaidMessage,
} from 'src/shared-contracts/copy';
import { earnTailsInc } from 'src/user/tails-ledger';
import { UserRepository } from 'src/user/user.repository';
import { CatRepository } from './cat.repository';

export const STAKE_PERIOD_MS = CAT_NAP_DAYS * 24 * 60 * 60 * 1000; // one week

/**
 * Tails for one finished nap: the flat "cat nap" rule (G5 P2, decision #35), 50 Tails whatever the
 * cat's tier or blessing. It replaces the old tier formula (10 to 10,000 per claim), which made the
 * staking exploit worth up to 10,000 Tails a call. Past earnings are not clawed back.
 */
// The cat is still passed (audits and callers name the cat they price), but no longer changes the amount.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getTailsCraft = (_cat?: Pick<ICat, 'blessing' | 'tier'>) => CAT_NAP_TAILS;

/** The rule a client shows next to the nap button. */
export interface ICatNapRule {
    tails: number;
    maxCats: number;
    days: number;
}

export const CAT_NAP_RULE: ICatNapRule = Object.freeze({
    tails: CAT_NAP_TAILS,
    maxCats: CAT_NAP_MAX_CATS,
    days: CAT_NAP_DAYS,
});

export interface IStakeResponse {
    success: boolean;
    message: string;
    stakedUntil?: Date;
    /** Tails this nap pays when collected. */
    tails?: number;
    /** Cats of this owner napping now, this one included. */
    napping?: number;
    rule?: ICatNapRule;
}

export interface IStakeRewardResponse {
    success: boolean;
    message: string;
    /** The Tails actually credited by this call; 0 when nothing was paid. */
    tails: number;
}

const toObjectId = (id: string | Types.ObjectId, label: string) => {
    if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid ${label} id`);
    }
    return new Types.ObjectId(id);
};

/**
 * Cat staking, shown as the "cat nap" (G5 P1 W1 security hotfix, G5 P2 task 4e).
 *
 * The stake lives on the CAT and every write is one owner-filtered conditional update, so only the
 * owner can stake or claim, and concurrent claims race on the same filter: exactly one of them
 * unsets `staked` and pays. The user document is never given or stripped of a `staked` field.
 */
@Injectable()
export class CatStakingService {
    constructor(private catRepository: CatRepository, private userRepository: UserRepository) {}

    async stake(catId: string, userId: string | Types.ObjectId, now = new Date()): Promise<IStakeResponse> {
        const _id = toObjectId(catId, 'cat');
        const owner = toObjectId(userId, 'user');
        const stakedUntil = new Date(now.getTime() + STAKE_PERIOD_MS);

        // `staked: null` matches a missing field and a stored null alike.
        const staked = await this.catRepository.model
            .findOneAndUpdate(
                { _id, owner, staked: null },
                { $set: { staked: stakedUntil } },
                { projection: { _id: 1 } }
            )
            .lean();
        if (!staked) {
            await this.findOwnedCat(_id, owner);
            throw new ConflictException('Cat is already staked');
        }

        // At most CAT_NAP_MAX_CATS naps at once. Write first, then count: each stake counts after its
        // own write, so the last of any parallel batch sees every nap that is kept, and a stake that
        // sees one too many takes back only its own write. Racing stakes can all be refused (the
        // player taps again); the cap can never be exceeded.
        const napping = await this.catRepository.model.countDocuments({ owner, staked: { $exists: true, $ne: null } });
        if (napping > CAT_NAP_MAX_CATS) {
            await this.catRepository.model.updateOne({ _id, owner, staked: stakedUntil }, { $unset: { staked: 1 } });
            throw new ConflictException({ statusCode: 409, code: 'CAT_NAP_LIMIT', message: CAT_NAP_LIMIT_MESSAGE });
        }

        return {
            success: true,
            message: CAT_NAP_STARTED_MESSAGE,
            stakedUntil,
            tails: CAT_NAP_TAILS,
            napping,
            rule: CAT_NAP_RULE,
        };
    }

    async claim(catId: string, userId: string | Types.ObjectId, now = new Date()): Promise<IStakeRewardResponse> {
        const _id = toObjectId(catId, 'cat');
        const owner = toObjectId(userId, 'user');

        // Claims only a finished stake of the caller's own cat. The pre-update document is returned,
        // so the reward is computed from the stake this call actually consumed.
        const claimed = await this.catRepository.model
            .findOneAndUpdate(
                { _id, owner, staked: { $exists: true, $ne: null, $lte: now } },
                { $unset: { staked: 1 } },
                { projection: { blessing: 1, tier: 1, staked: 1 } }
            )
            .lean();

        if (!claimed) {
            const cat = await this.findOwnedCat(_id, owner);
            if (!cat.staked) {
                throw new BadRequestException('Cat is not staked');
            }
            return { success: false, message: CAT_NAP_RUNNING_MESSAGE, tails: 0 };
        }

        const tails = getTailsCraft(claimed as Pick<ICat, 'blessing' | 'tier'>);
        await this.userRepository.update(owner, {
            $inc: { ...earnTailsInc(tails), monthTailsCrafted: tails, monthTails: tails },
        });

        return { success: true, message: catNapPaidMessage(tails), tails };
    }

    /** 404 for a missing cat and for another user's cat alike, so ownership is not disclosed. */
    private async findOwnedCat(_id: Types.ObjectId, owner: Types.ObjectId): Promise<Pick<ICat, 'staked'>> {
        const cat = await this.catRepository.model.findOne({ _id, owner }, { staked: 1 }).lean();
        if (!cat) {
            throw new NotFoundException('Cat not found');
        }
        return cat as Pick<ICat, 'staked'>;
    }
}
