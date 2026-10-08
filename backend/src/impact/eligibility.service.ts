import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Game, GameDocument } from 'src/game/game.schema';
import { ErrorCode } from 'src/shared-contracts/errors';
import { EligibilityResult, instantTreatPolicy } from './eligibility';

/**
 * Kept in the shared F5.6 list for older clients; POST /shelter/donate no longer answers with it
 * (the instant-treat policy is open to everyone since Oct 8, 2026).
 */
export const DONATE_NOT_ELIGIBLE = ErrorCode.DONATE_NOT_ELIGIBLE;

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

    /** Open to everyone (Oct 8, 2026): no account, age or saved-game rule; see `instantTreatPolicy`. */
    async instantTreat(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _user?: Record<string, any> | null,
        now: Date = new Date()
    ): Promise<EligibilityResult> {
        return instantTreatPolicy(undefined, now);
    }
}
