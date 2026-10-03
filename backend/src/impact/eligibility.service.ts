import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { guestForbidden } from 'src/common/guards/auth-errors';
import { Game, GameDocument } from 'src/game/game.schema';
import { ErrorCode } from 'src/shared-contracts/errors';
import { accountFactsOf, EligibilityResult, INSTANT_TREAT_MIN_GAMES, instantTreatPolicy } from './eligibility';

/**
 * Code for a registered, verified account that does not meet the treat policy yet (too new, or no
 * saved game). Part of the shared F5.6 list; the body also carries `reason` and `eligibleAt`.
 */
export const DONATE_NOT_ELIGIBLE = ErrorCode.DONATE_NOT_ELIGIBLE;

export const DONATE_NOT_ELIGIBLE_MESSAGE = 'Play a game with your cat first. Treats open a day after you join.';
export const DONATE_EMAIL_UNVERIFIED_MESSAGE = 'Verify your email to send a treat.';

/** Loads the facts the F7.5 policies need and applies them. Reads only; never writes. */
@Injectable()
export class ImpactEligibilityService {
    constructor(@InjectModel(Game.name) private gameModel: Model<GameDocument>) {}

    /**
     * Saved `/live` rows, counted up to `cap` (the policies never need more). Every game type counts,
     * Catnip Heist included: F7.5 applies one rule to both treat sources (`page`, `heist`), and a Heist
     * save is replay-verified on `/live`, so a Heist-only player can send the win-screen treat.
     */
    async savedGames(userId: unknown, cap: number): Promise<number> {
        if (!userId || !Types.ObjectId.isValid(String(userId))) {
            return 0;
        }
        return this.gameModel.countDocuments({ user: new Types.ObjectId(String(userId)) }).limit(cap);
    }

    async instantTreat(
        user: Record<string, any> | null | undefined,
        now: Date = new Date()
    ): Promise<EligibilityResult> {
        const facts = accountFactsOf(user);
        if (facts.isGuest) {
            return instantTreatPolicy({ ...facts, savedGames: 0 }, now);
        }
        const savedGames = await this.savedGames(user?._id, INSTANT_TREAT_MIN_GAMES);
        return instantTreatPolicy({ ...facts, savedGames }, now);
    }

    /** Throws the matching F5.6 error when the instant-treat policy says no. */
    async assertInstantTreat(user: Record<string, any> | null | undefined, now: Date = new Date()) {
        const result = await this.instantTreat(user, now);
        if (result.eligible) {
            return result;
        }
        if (result.reason === 'guest') {
            throw guestForbidden();
        }
        if (result.reason === 'email-unverified') {
            throw new ForbiddenException({
                statusCode: 403,
                code: ErrorCode.EMAIL_UNVERIFIED,
                message: DONATE_EMAIL_UNVERIFIED_MESSAGE,
            });
        }
        throw new ForbiddenException({
            statusCode: 403,
            code: DONATE_NOT_ELIGIBLE,
            reason: result.reason,
            eligibleAt: result.eligibleAt ?? null,
            message: DONATE_NOT_ELIGIBLE_MESSAGE,
        });
    }
}
