import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    HttpStatus,
    NotFoundException,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { rescueBlessingFilter } from 'src/blessing/blessing.schema';
import { catNameError, CatNameService } from 'src/cat/cat-name.service';
import { CatRepository } from 'src/cat/cat.repository';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { ErrorCode } from 'src/shared-contracts/errors';
import { isOneOf, STARTER_BREEDS, StarterBreed } from 'src/shared-contracts/enums';
import { DEFAULT_STARTER_BREED, STARTER_ART } from './guest/starter';
import { FOLLOWING_LIMIT, IOnboarding, ONBOARDING_VERSION } from './user.schema';
import { UserRepository } from './user.repository';

/** Per IP: a burst bound only. The commit itself can succeed once. */
export const STARTER_THROTTLE = { limit: 10, ttl: 60000 };
/** Per account: retries after a network error are fine, a loop is not. */
export const STARTER_USER_THROTTLE = { limit: 10, ttl: 60000 };
export const FOLLOWING_THROTTLE = { limit: 30, ttl: 60000 };

/** The fields of the committed starter the client needs to render it. */
const STARTER_VIEW = {
    name: 1,
    starterBreed: 1,
    starterLockedAt: 1,
    spriteImg: 1,
    catImg: 1,
    type: 1,
    tier: 1,
    status: 1,
    isStarter: 1,
    isGuestStarter: 1,
};

export interface IStarterCommitBody {
    breed?: unknown;
    name?: unknown;
    skipped?: unknown;
}

export interface IStarterCommitResponse {
    success: true;
    cat: Record<string, unknown>;
    onboarding: IOnboarding;
}

/** 409 STARTER_LOCKED: the starter was committed already (or the account has none to commit). */
export const starterLocked = () =>
    new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.STARTER_LOCKED,
        message: 'Your starter cat is already chosen',
    });

/**
 * Meet your cat (plan G3), server side: the starter commit and following real shelter cats.
 * Its own controller under `/user`, registered in the one AppModule; UserController is untouched.
 */
@Controller('user')
export class StarterController {
    /** Clock, replaceable in specs. */
    now: () => Date = () => new Date();

    constructor(
        private userRepository: UserRepository,
        private catRepository: CatRepository,
        private blessingRepository: BlessingRepository,
        private catNameService: CatNameService
    ) {}

    /**
     * Commits the starter once: breed, look and name, then `onboarding: done`. One conditional write
     * on `{owner, isStarter: true, starterLockedAt: {$exists: false}}`, so ten parallel commits give
     * one update and nine 409 STARTER_LOCKED. It never targets `user.cat` (the active cat may be a
     * different one). Guests may commit once their guest session exists (F5.4).
     *
     * Only an account whose `onboarding.state` is `pending` may commit; any other gets 409, so an
     * existing account never commits a starter that sign-in or a guest merge created for it.
     *
     * `skipped: true` (SKIP in Meet your cat) commits the default breed and name, so the ceremony
     * never shows again. A 409 also marks a still-pending onboarding done, so a retry after a crash
     * between the two writes cannot leave the account stuck in the ceremony.
     */
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @AllowGuest()
    @UserThrottle(STARTER_USER_THROTTLE)
    @Throttle({ default: STARTER_THROTTLE })
    @Post('starter')
    async commitStarter(
        @USER_ID() userId: string,
        @Body() body: IStarterCommitBody = {}
    ): Promise<IStarterCommitResponse> {
        const owner = this.objectId(userId, 'user');
        const skipped = body?.skipped === true;
        const breed = this.breedOf(body?.breed, skipped);
        const art = STARTER_ART[breed];

        // Only an account still in Meet your cat may commit. A legacy account (no `onboarding`, which
        // means done) or a finished one can still own an unlocked starter, for example one that
        // `ensureStarterCat` created on sign-in or on a guest merge; that one must not be committable.
        // Checked before the name, so an existing account always gets 409, whatever it sends.
        const pending = await this.userRepository.model.exists({ _id: owner, 'onboarding.state': 'pending' });
        if (!pending) {
            throw starterLocked();
        }

        // A name that is not a string (for example `123`) is a 400, never a silent breed default.
        const rawName = body?.name;
        if (!skipped && rawName !== undefined && rawName !== null && typeof rawName !== 'string') {
            throw catNameError('NAME_CHARS');
        }
        const hasName = typeof rawName === 'string' && rawName.trim() !== '';
        const name = !skipped && hasName ? await this.catNameService.validName(rawName) : art.name;

        const now = this.now();
        const cat: any = await this.catRepository.model
            .findOneAndUpdate(
                { owner, isStarter: true, starterLockedAt: { $exists: false } },
                {
                    $set: {
                        starterBreed: breed,
                        name,
                        spriteImg: art.spriteImg,
                        catImg: art.catImg,
                        type: art.type,
                        resqueStory: art.resqueStory,
                        origin: 'starter',
                        starterLockedAt: now,
                    },
                },
                { new: true, projection: STARTER_VIEW }
            )
            .lean();

        if (!cat) {
            await this.userRepository.model.updateOne(
                { _id: owner, 'onboarding.state': 'pending' },
                { $set: { 'onboarding.state': 'done', 'onboarding.version': ONBOARDING_VERSION } }
            );
            throw starterLocked();
        }

        const onboarding: IOnboarding = { state: 'done', starterChosenAt: now, skipped, version: ONBOARDING_VERSION };
        await this.userRepository.model.updateOne({ _id: owner }, { $set: { onboarding } });
        // Self-heal only: point user.cat at the starter when it points nowhere.
        await this.userRepository.model.updateOne(
            { _id: owner, $or: [{ cat: { $exists: false } }, { cat: null }] },
            { $set: { cat: cat._id } }
        );
        return { success: true, cat, onboarding };
    }

    /** Follow a real shelter cat (Meet your cat step 6). Idempotent; at most FOLLOWING_LIMIT. */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Throttle({ default: FOLLOWING_THROTTLE })
    @Post('following/:blessingId')
    async follow(
        @USER_ID() userId: string,
        @Param('blessingId') blessingId: string
    ): Promise<{ success: true; following: string[] }> {
        const owner = this.objectId(userId, 'user');
        const blessing = this.objectId(blessingId, 'blessing');
        // Rescue cats only (F7.8): a paid pet portrait is somebody's pet, not a cat to follow.
        const exists = await this.blessingRepository.model.exists({ _id: blessing, ...rescueBlessingFilter() });
        if (!exists) {
            throw new NotFoundException('Cat not found');
        }
        await this.userRepository.model.updateOne(
            { _id: owner, following: { $ne: blessing }, [`following.${FOLLOWING_LIMIT - 1}`]: { $exists: false } },
            { $addToSet: { following: blessing } }
        );
        const following = await this.followingOf(owner);
        if (!following.includes(String(blessing))) {
            throw new ConflictException(`You can follow up to ${FOLLOWING_LIMIT} cats`);
        }
        return { success: true, following };
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Throttle({ default: FOLLOWING_THROTTLE })
    @Delete('following/:blessingId')
    async unfollow(
        @USER_ID() userId: string,
        @Param('blessingId') blessingId: string
    ): Promise<{ success: true; following: string[] }> {
        const owner = this.objectId(userId, 'user');
        const blessing = this.objectId(blessingId, 'blessing');
        await this.userRepository.model.updateOne({ _id: owner }, { $pull: { following: blessing } });
        return { success: true, following: await this.followingOf(owner) };
    }

    private async followingOf(owner: Types.ObjectId): Promise<string[]> {
        const user: any = await this.userRepository.model.findOne({ _id: owner }, { following: 1 }).lean();
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return (user.following || []).map((id: unknown) => String(id));
    }

    private breedOf(value: unknown, skipped: boolean): StarterBreed {
        if (value === undefined || value === null || value === '') {
            if (skipped) {
                return DEFAULT_STARTER_BREED;
            }
            throw new BadRequestException(`breed must be one of ${STARTER_BREEDS.join(', ')}`);
        }
        if (!isOneOf(STARTER_BREEDS, value)) {
            throw new BadRequestException(`breed must be one of ${STARTER_BREEDS.join(', ')}`);
        }
        return value as StarterBreed;
    }

    private objectId(value: unknown, what: string): Types.ObjectId {
        if (!Types.ObjectId.isValid(String(value))) {
            throw new BadRequestException(`Invalid ${what} id`);
        }
        return new Types.ObjectId(String(value));
    }
}
