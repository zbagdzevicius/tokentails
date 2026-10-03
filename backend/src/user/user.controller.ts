import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    Header,
    Headers,
    Logger,
    Param,
    Post,
    Put,
    Query,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Throttle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { CatRepository } from 'src/cat/cat.repository';
import { Tier } from 'src/cat/cat.schema';
import { CatService } from 'src/cat/cat.service';
import { BaseRepository } from 'src/common/base.repository';
import { getPhase, isLessThan2hoursLeft } from 'src/common/utils';
import { pickSearchParams, SearchModel } from 'src/common/validators';
import { GameRepository } from 'src/game/game.repository';
import { GameType, match3Levels, totalCatnipCap } from 'src/game/game.schema';
import { ImageRepository } from 'src/image/image.repository';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { EntityType, IMessage } from 'src/shared/interfaces/common.interface';
import { OrderRepository } from 'src/web3/order.repository';
import { OrderStatus } from 'src/web3/order.schema';
import { ArticleRepository } from '../article/article.repository';
import { CommentRepository } from '../comment/comment.repository';
import { buildAirdropProgression, IAirdropProgressionResponse } from './airdrop-progression';
import { LIVE_GAME_THROTTLE, LiveGameDto, liveGamePipe } from './dto/live-game.dto';
import { LiveGameUserThrottleGuard } from './live-game-throttle.guard';
import { ProfileWriteDto, profileWritePipe } from './dto/profile-write.dto';
import {
    CODEX_RESET_CRON,
    CODEX_RESET_JOB_NAME,
    CODEX_RESET_TIMEZONE,
    JOB_RUNS_COLLECTION,
    MONTHLY_COUNTER_RESET,
    runCodexReset,
} from './codex-reset';
import { PERMISSION_LEVEL } from './models/user.model';
import {
    arrayGuardPipeline,
    dottedArrayFields,
    isSafeArray,
    normalizeMatch3Scores,
    recomputeAfterGuestMerge,
    recomputeGameTotals,
    resolveLiveGame,
} from './utils/live-game';
import { HeistReplayIpThrottleGuard } from './heist/heist-ip-throttle.guard';
import { saveHeistRun } from './heist/heist-live';
import { HEIST_SIM_INFO, IHeistSimInfo } from './heist/heist-sim-info';
import { heistReplayQueue, ReplayQueueFullException } from './heist/replay-queue';
import { UserRepository } from './user.repository';
import { ISave, ISaved, IUser, User } from './user.schema';
import { UserService } from './user.service';
import { users } from './users';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AUTH_USER, IAuthUser, isGuestUser, notGuestFilter } from 'src/common/decorators/auth-user.decorator';
import { ILeaseCollection, runLeased } from 'src/shared/jobs/lease';
import { canonicalEmail } from './guest/canonical-email';
import { ACCOUNT_DELETIONS_COLLECTION, deleteAccount, IAccountDeletionResult } from './guest/account-deletion';
import { DeleteAccountDto, guestBodyPipe, ReferralDto } from './guest/dto';
import { firebaseIdentity, firebaseTokenFromHeader, IFirebaseIdentity } from './guest/firebase-identity';
import {
    cleanupIdleGuests,
    eraseGuest,
    IGuestLifecycleDeps,
    IGuestMergeResult,
    resumeGuestMerges,
    runGuestMerge,
    startGuestMerge,
} from './guest/guest-lifecycle';
import { identityConfig } from './guest/identity-config';
import { requestIp } from './guest/ip-throttle';
import { applyReferral, IReferralResult } from './guest/referral';
import { ANONYMOUS_PROVIDER } from './user.service';
import { earnedBoardField, earnedTails, earnTailsInc } from './tails-ledger';
import { boardFilter, boardSort, boardTop, isBoardExcluded, rescuerField, rescuerPeriod } from './boards';
import { drawWheel, IWheelOdds, wheelOdds } from './wheel';
import { ITokenStatus, TOKEN_STATUS_CACHE_CONTROL, tokenStatus } from './token-status';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { tailsRewardMessage } from 'src/shared-contracts/copy';

const twitters: string[] = [];
const MAX_LEGIT_CATNIP_SCORE = totalCatnipCap;
const PAW_MATCH_LEADERBOARD_DEFAULT_TOP = 120;
const PAW_MATCH_LEADERBOARD_MAX_TOP = 500;
const PAW_MATCH_LEADERBOARD_CACHE_TTL_MS = 15000;
/** Per-user limit on the Tails reward routes (plan G5 P4): far above honest use, far below a script. */
export const REWARD_USER_THROTTLE = { limit: 10, ttl: 60000 };
/** Weekly top-N Tails reward (the earned-Tails board, flagged accounts excluded). */
export const WEEKLY_TOP_REWARD = { top: 200, tails: 200 };
// Fields the manager-only GET /user/profile/:id returns: exactly what the CMS user form reads,
// plus the social handles. No wallets, secrets or balances.
export const PROFILE_ADMIN_PROJECTION = 'name email discount permission shelter twitter discord';

const isAdmin = (authUser: IAuthUser | undefined) => Number(authUser?.permission) >= PERMISSION_LEVEL.ADMIN;
// The CMS sends '' for an empty number field and 0 for a user without a stored permission.
const permissionValue = (value: unknown) => (value === '' || value === undefined || value === null ? 0 : Number(value));
const emailValue = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/**
 * A board position. Guests are never on a board, so for them it is the place they WOULD have among
 * registered players ("you would be #N", G1); `wouldBe` tells the client to phrase it that way.
 * An account kept off the boards (flagged for staking abuse, or deleted) has no rank: `position` is
 * null and `excluded` is set (4e review fix #3), so it is never told "#3" while on no board.
 */
export interface IBoardPosition {
    position: number | null;
    wouldBe?: true;
    excluded?: true;
}

const BOARD_EXCLUSION_PROJECTION = 'boardExcludedAt deletedAt';

const boardPosition = (
    position: number,
    authUser?: IAuthUser,
    user?: { boardExcludedAt?: unknown; deletedAt?: unknown } | null
): IBoardPosition => {
    if (isBoardExcluded(user)) {
        return { position: null, excluded: true };
    }
    return isGuestUser(authUser) ? { position, wouldBe: true } : { position };
};

type IAirdropClaimResponse = IMessage & {
    tierId?: string;
    challengeId?: string;
    milestoneId?: string;
    progression?: IAirdropProgressionResponse;
};

/** Leased cron jobs of this controller (F8). One `jobruns` document each. */
export const USER_JOBS = {
    CHECK_IN_RESET: 'user-check-in-reset',
    STATUS_RESET: 'user-status-reset',
    WEEKLY_TOP_REWARDS: 'weekly-top-rewards',
    GUEST_CLEANUP: 'guest-cleanup',
    GUEST_MERGE_RESUME: 'guest-merge-resume',
} as const;
// Longer than a run plus clock skew, far shorter than the daily and weekly intervals.
export const USER_JOB_LEASE_MS = 60 * 60 * 1000;
// Shorter than the 10-minute merge-resume interval.
export const GUEST_MERGE_RESUME_LEASE_MS = 5 * 60 * 1000;

/** Fields of GET /user/profile (and of the guest session response). No secrets. */
export const PROFILE_PROJECTION =
    'name codex boxes discord affiliated tails tailsEarned tailsGiven goalsHelped monthTailsGiven monthGoalsHelped discount spent monthSpent email permission seasonEvent seasonEventCount match3 match3Count match3Score match3ScoreCount catnipChaos catnipChaosCount catnipCount twitter shelter cat canRedeemLives quests referralsCount wallets.stellar.walletAddress streak monthPacks monthStreak monthFeeded monthCatsAdopted monthBoxes monthTails monthReferrals monthTailsCrafted portraitPurchases monthPortraitPurchases airdropRewardsClaimed airdropChallengesClaimed airdropMilestonesClaimed isGuest onboarding pendingTails guestMergedTails following emailVerifiedAt promotedAt catnipChaosCleared seasonEventCleared match3Cleared heistScore heistStars';

const guestOnlyConflict = (message: string) => new ConflictException({ statusCode: 409, message });

@Controller('user')
export class UserController {
    private readonly logger = new Logger(UserController.name);
    private pawMatchLeaderboardCache = new Map<string, { expiresAt: number; rows: any[] }>();
    /** Firebase Admin calls of the guest lifecycle; replaced in specs. */
    firebase: IFirebaseIdentity = firebaseIdentity;

    entityTypeRepository: Record<EntityType, BaseRepository<any>> = {
        [EntityType.ARTICLE]: this.articleRepository,
        [EntityType.COMMENT]: this.commentRepository,
        [EntityType.CAT]: this.catRepository,
        [EntityType.BLESSING]: this.catRepository,
        [EntityType.PACK]: this.catRepository,
        [EntityType.IMAGE]: this.imageRepository,
    };

    constructor(
        private repository: UserRepository,
        private articleRepository: ArticleRepository,
        private commentRepository: CommentRepository,
        private catRepository: CatRepository,
        private userService: UserService,
        private gameRepository: GameRepository,
        private orderRepository: OrderRepository,
        private catService: CatService,
        private imageRepository: ImageRepository
    ) {
        // this.getUsers();
        // this.getTwitters();
        // this.giveTails();
        // this.giveCat();
        // this.resetCodex();
        // this.giveTailsToWinners();
        // this.giveLootBoxes();
        // this.giveLootBoxesToTailsGuards();
        // this.giveCat();
    }

    private async getAirdropProgression(userId: string): Promise<IAirdropProgressionResponse> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection:
                'tails tailsEarned tailsGiven goalsHelped monthTailsGiven monthGoalsHelped streak quests cats portraitPurchases airdropRewardsClaimed airdropChallengesClaimed airdropMilestonesClaimed',
            populate: [{ path: 'cats', select: 'tier' }],
        });
        if (!user) {
            throw new BadRequestException('User does not exist');
        }

        const userObjectId = new Types.ObjectId(userId);
        const [packPurchases, portraitOrdersCount] = await Promise.all([
            this.orderRepository.count({
                user: userObjectId,
                entityType: EntityType.PACK,
                status: OrderStatus.COMPLETE,
            }),
            this.orderRepository.count({
                user: userObjectId,
                entityType: EntityType.IMAGE,
                status: OrderStatus.COMPLETE,
            }),
        ]);

        const catTiers = ((user.cats as unknown as Array<{ tier?: Tier }>) || [])
            .map(cat => cat?.tier)
            .filter((tier): tier is Tier => !!tier && Object.values(Tier).includes(tier));

        return buildAirdropProgression({
            catTiers,
            questsCompleted: user.quests?.length || 0,
            streak: user.streak || 0,
            // Earned, never the balance: giving to a goal never lowers progress (G5).
            tailsEarned: earnedTails(user),
            tailsGiven: user.tailsGiven || 0,
            goalsHelped: user.goalsHelped || 0,
            monthTailsGiven: user.monthTailsGiven || 0,
            monthGoalsHelped: user.monthGoalsHelped || 0,
            packPurchases,
            portraitPurchases: Math.max(user.portraitPurchases || 0, portraitOrdersCount),
            claimedRewards: user.airdropRewardsClaimed || [],
            claimedChallenges: user.airdropChallengesClaimed || [],
            claimedMilestones: user.airdropMilestonesClaimed || [],
        });
    }

    async giveCat() {
        const catReward = await this.catRepository.findOne({ searchObject: { _id: '68ac2683a62f37ec2495e588' } });

        const users = await this.repository.find({
            projection: 'twitter',
            searchObject: {
                twitter: { $in: twitters.map(user => user.toLowerCase()), $exists: true },
            },
            page: 0,
            perPage: 20000,
        });
        for (const user of users) {
            await this.catService.adopt(catReward._id!, user._id!);
        }
    }

    async giveTails() {
        await this.repository.model.updateMany(
            { catnipCount: { $gt: 299 }, ...notGuestFilter() },
            { $inc: { ...earnTailsInc(690), monthTails: 690 } }
        );
        // await this.repository.model.updateMany({}, { $set: { boxes: 1 } });
        console.log('updated 1');
    }

    async giveTailsToWinners() {
        const u = await this.repository.find({
            projection: 'twitter',
            searchObject: {
                twitter: { $in: users.map(user => user.username.toLowerCase()), $exists: true },
            },
            page: 0,
            perPage: 20000,
        });
        console.log(u.length);
        await this.repository.model.bulkWrite(
            u.map(user => ({
                updateOne: {
                    filter: { _id: user._id },
                    update: {
                        $inc: earnTailsInc(
                            (users.find(u => u.username.toLowerCase() === user.twitter.toLowerCase())!
                                .totalScoreAugust || 20) * 15
                        ),
                    },
                },
            }))
        );
    }

    async giveLootBoxes() {
        await this.repository.model.updateMany(
            {
                discord: { $in: twitters.map(user => user.toLowerCase()), $exists: true },
            },
            { $inc: { boxes: 1 } }
        );
        console.log('loot boxes distributed');
    }

    async giveLootBoxesToTailsGuards() {
        const u = await this.repository.find({
            projection: 'codex',
            searchObject: {
                codex: { $exists: true, $ne: [] },
            },
            page: 0,
            perPage: 200000,
        });
        await this.repository.model.bulkWrite(
            u.map(user => ({
                updateOne: {
                    filter: { _id: user._id },
                    update: {
                        $inc: earnTailsInc(user.codex.reduce((a, b) => a + b, 0) * 300),
                    },
                },
            }))
        );
    }

    async getTwitters() {
        const u = await this.repository.find({
            projection: 'twitter',
            searchObject: {
                twitter: { $in: twitters.map(user => user.toLowerCase()) },
            },
        });
        console.log(u.length);

        const missing = twitters.filter(user => !u.find(u => u.twitter.toLowerCase() === user.toLowerCase()));
        console.log(missing.length);
        console.log(missing);
    }

    private jobRuns() {
        return this.repository.model.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection;
    }

    // The crons below are leased (F8): each runs once per tick however many replicas fire it.
    // The daily resets touch registered users only (G1): guests never spin, and skipping them keeps
    // the write set bounded however many guest sessions exist.
    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async resetCheckIn() {
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: USER_JOBS.CHECK_IN_RESET,
            ttlMs: USER_JOB_LEASE_MS,
            logger: this.logger,
            run: () =>
                this.repository.updateAll(
                    {
                        canRedeemLives: true,
                    },
                    notGuestFilter()
                ),
        });
    }

    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async saveLinkedArticlesCount() {
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: USER_JOBS.STATUS_RESET,
            ttlMs: USER_JOB_LEASE_MS,
            logger: this.logger,
            run: () =>
                this.repository.updateAll(
                    {
                        status: {
                            EAT: 0,
                        },
                    },
                    notGuestFilter()
                ),
        });
    }

    private guestCronsOffLogged = false;

    /** identityConfig().cronsEnabled, with one log line per process when the crons are off. */
    private guestCronsEnabled() {
        const enabled = identityConfig().cronsEnabled;
        if (!enabled && !this.guestCronsOffLogged) {
            this.guestCronsOffLogged = true;
            this.logger.warn('guest crons off: set CRONS_ENABLED=true (or NODE_ENV=production) to run them');
        }
        return enabled;
    }

    /** Deletes guests idle for more than 30 days (decision #11). Never touches registered users. */
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async cleanupGuests() {
        if (!this.guestCronsEnabled()) {
            return;
        }
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: USER_JOBS.GUEST_CLEANUP,
            ttlMs: USER_JOB_LEASE_MS,
            logger: this.logger,
            run: async () => {
                const deleted = await cleanupIdleGuests(this.guestDeps());
                this.logger.log(`guest cleanup: ${deleted} idle guests deleted`);
            },
        });
    }

    /** Finishes guest merges that stopped half way (G1 resumable merge). */
    @Cron(CronExpression.EVERY_10_MINUTES)
    async resumeMerges() {
        if (!this.guestCronsEnabled()) {
            return;
        }
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: USER_JOBS.GUEST_MERGE_RESUME,
            ttlMs: GUEST_MERGE_RESUME_LEASE_MS,
            logger: this.logger,
            run: () => resumeGuestMerges(this.guestDeps()),
        });
    }

    @Cron(CronExpression.EVERY_WEEK)
    async giveWeeklyTopRewards() {
        return runLeased({
            jobRuns: this.jobRuns(),
            jobName: USER_JOBS.WEEKLY_TOP_REWARDS,
            ttlMs: USER_JOB_LEASE_MS,
            logger: this.logger,
            run: async () => {
                // The earned-Tails board: guests and flagged accounts are not on it (G5, #35).
                const top = await this.leaderboard(WEEKLY_TOP_REWARD.top);
                await this.repository.model.updateMany(
                    { _id: { $in: top.map(user => user._id) } },
                    { $inc: earnTailsInc(WEEKLY_TOP_REWARD.tails) }
                );
            },
        });
    }

    @Cron(CODEX_RESET_CRON, { name: CODEX_RESET_JOB_NAME, timeZone: CODEX_RESET_TIMEZONE })
    async resetCodex() {
        return runCodexReset({
            jobRuns: this.repository.model.db.collection(JOB_RUNS_COLLECTION),
            payGuards: () => this.giveLootBoxesToTailsGuards(),
            resetCounters: () => this.repository.updateAll(MONTHLY_COUNTER_RESET),
        });
    }

    private guestDeps(): IGuestLifecycleDeps {
        return {
            users: this.repository.model,
            cats: this.catRepository.model,
            games: this.gameRepository.model,
            firebase: this.firebase,
            // Also carries the guest's cleared flags and Heist progress (utils/live-game.ts).
            recomputeTotals: recomputeAfterGuestMerge(this.repository, this.repository.model),
            logger: this.logger,
        };
    }

    private async loadProfile(userId: string): Promise<User> {
        return this.repository.findOne({
            searchObject: { _id: userId },
            projection: PROFILE_PROJECTION,
            populate: [
                {
                    path: 'cat',
                    select: '-code',
                    populate: [
                        { path: 'blessing', populate: { path: 'image', select: 'url' } },
                        { path: 'shelter', select: 'country name image', populate: [{ path: 'image', select: 'url' }] },
                    ],
                },
            ],
        });
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest({ transient: true })
    @Get('profile')
    async profile(@USER_ID() userId: string, @AUTH_USER() authUser?: IAuthUser): Promise<User> {
        // A transient guest has no document yet (F5.2): its request user is the template profile,
        // with `onboarding: pending` so Meet your cat shows before anything is written.
        if (authUser?.transient) {
            return authUser as unknown as User;
        }
        // Never query without an id, which findOne would turn into {} and match any user.
        if (!userId) {
            throw new UnauthorizedException();
        }
        const user = await this.loadProfile(userId);
        // F5.2 step 1e: the promotion is reported once (the client then sends tt.pendingRef), by the
        // first profile read after it, whichever request promoted (`/live`, a poll, this one).
        const promotedNow = await this.userService.claimPromotionNotice(authUser as any);
        if (user && (promotedNow || authUser?.promotedNow)) {
            return { ...(user as any), promotedNow: true };
        }

        return user;
    }

    /**
     * F5.5: creates (idempotently) the guest doc and guest starter for an anonymous Firebase user.
     * A registered token gets 409. App Check (`x-firebase-appcheck`) is verified when sent and
     * required when APP_CHECK_ENFORCE=true. Throttled per IP.
     */
    @UseGuards(AppAuthGuard)
    @AllowGuest({ transient: true })
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Post('guest/session')
    async guestSession(
        @AUTH_USER() authUser: IAuthUser,
        @Req() req: any,
        @Headers('x-firebase-appcheck') appCheckToken?: string
    ): Promise<User> {
        if (!isGuestUser(authUser)) {
            throw guestOnlyConflict('Already signed in with an account');
        }
        await this.verifyAppCheck(appCheckToken);
        const uid = authUser.transient ? authUser.firebaseUid : authUser.firebaseUids?.[0];
        const guest = await this.userService.createGuestSession(uid as string, requestIp(req));
        return this.loadProfile(guest._id.toString());
    }

    private async verifyAppCheck(token?: string): Promise<void> {
        const enforce = identityConfig().appCheckEnforce;
        if (!token) {
            if (enforce) {
                throw new UnauthorizedException('App Check token required');
            }
            return;
        }
        try {
            await this.firebase.verifyAppCheck(token);
        } catch (error) {
            if (enforce) {
                throw new UnauthorizedException('App Check token is invalid');
            }
            this.logger.warn(
                `guest session with an invalid App Check token (not enforced): ${(error as Error)?.message}`
            );
        }
    }

    /**
     * G1: merges a guest (identified by its anonymous token in `x-guest-token`, `fb`-prefixed) into
     * the signed-in account. Resumable: calling it again continues where it stopped. At most one
     * merge per target account per 30 days. The guest starter is dropped (decision #8).
     */
    @UseGuards(AppAuthGuard)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Post('guest/merge')
    async mergeGuest(
        @USER_ID() userId: string,
        @Headers('x-guest-token') guestTokenHeader?: string
    ): Promise<IGuestMergeResult & { success: true; merged: boolean }> {
        const guestToken = firebaseTokenFromHeader(guestTokenHeader);
        if (!guestToken) {
            throw new BadRequestException('x-guest-token is required');
        }
        let decoded: { uid: string; firebase?: { sign_in_provider?: string } };
        try {
            decoded = await this.firebase.verifyIdToken(guestToken);
        } catch {
            throw new UnauthorizedException('Guest token is invalid or expired');
        }
        if (decoded?.firebase?.sign_in_provider !== ANONYMOUS_PROVIDER || !decoded.uid) {
            throw new BadRequestException('x-guest-token must be a guest token');
        }

        const guest = await this.repository.model.findOne({ firebaseUids: decoded.uid }, { _id: 1, isGuest: 1 }).lean();
        if (guest && !(guest as any).isGuest) {
            throw guestOnlyConflict('That token belongs to an account, not a guest');
        }
        const deps = this.guestDeps();
        const claimed = guest ? await startGuestMerge(deps, guest._id, new Types.ObjectId(userId)) : null;
        if (!claimed) {
            // Nothing persisted (a transient guest) or already merged and deleted: clean up the
            // anonymous Firebase user and report done.
            await this.firebase.deleteAnonymousUsers([decoded.uid]);
            return { success: true, merged: false, state: 'done', gamesMoved: 0, tailsCredited: 0 };
        }
        const result = await runGuestMerge(deps, claimed);
        this.pawMatchLeaderboardCache.clear();
        return { success: true, merged: true, ...result };
    }

    /** G1 guest menu "Erase guest progress": the guest doc, starter, Game rows and anonymous user. */
    @UseGuards(AppAuthGuard)
    @AllowGuest({ transient: true })
    @Delete('guest')
    async deleteGuest(@AUTH_USER() authUser: IAuthUser): Promise<{ success: true }> {
        if (!isGuestUser(authUser)) {
            throw guestOnlyConflict('Only guest progress can be erased here');
        }
        const uids = authUser.transient ? [authUser.firebaseUid as string] : authUser.firebaseUids || [];
        const guestId = authUser.transient ? null : new Types.ObjectId(authUser._id as string);
        await eraseGuest(this.guestDeps(), guestId, uids.filter(Boolean));
        return { success: true };
    }

    /**
     * G9, Apple 5.1.1(v), decision #4: deletes the caller's account. The record is anonymised (not
     * removed), Firebase users are deleted, cats are released to the shelter pool, an audit record is
     * written, and Sign in with Apple is revoked when `appleAuthorizationCode` is sent.
     */
    @UseGuards(AppAuthGuard)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Delete('me')
    async deleteMe(
        @USER_ID() userId: string,
        @Body(guestBodyPipe) body: DeleteAccountDto
    ): Promise<IAccountDeletionResult> {
        const result = await deleteAccount(
            {
                users: this.repository.model,
                cats: this.catRepository.model,
                firebase: this.firebase,
                audit: this.repository.model.db.collection(ACCOUNT_DELETIONS_COLLECTION) as any,
            },
            userId,
            body?.appleAuthorizationCode
        );
        this.pawMatchLeaderboardCache.clear();
        this.logger.log(
            `account deleted (cats released: ${result.catsReleased}, to the shelter pool: ${result.catsToShelterPool}, apple: ${result.apple})`
        );
        return result;
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('airdrop/progression')
    async airdropProgression(@USER_ID() userId: string): Promise<IAirdropProgressionResponse> {
        return this.getAirdropProgression(userId);
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(REWARD_USER_THROTTLE)
    @Post('airdrop/claim/:tierId')
    async claimAirdropTier(@USER_ID() userId: string, @Param('tierId') tierId: string): Promise<IAirdropClaimResponse> {
        const progression = await this.getAirdropProgression(userId);
        if (!progression.eligible) {
            return { success: false, message: 'Complete eligibility criteria before claiming tier rewards' };
        }
        const normalizedTierId = tierId.toUpperCase();
        const tier = progression.tiers.find(item => item.id === normalizedTierId);
        if (!tier) {
            return { success: false, message: 'Tier does not exist' };
        }
        if (!tier.unlocked) {
            return { success: false, message: 'Tier is not unlocked yet' };
        }
        if (tier.claimed) {
            return { success: false, message: 'Tier reward is already claimed' };
        }

        const updateResult = await this.repository.model.findOneAndUpdate(
            {
                _id: new Types.ObjectId(userId),
                airdropRewardsClaimed: { $ne: tier.id },
            },
            {
                $addToSet: { airdropRewardsClaimed: tier.id },
                $inc: { ...earnTailsInc(tier.reward.tails), monthTails: tier.reward.tails },
            },
            { new: true }
        );

        if (!updateResult) {
            return { success: false, message: 'Tier reward is already claimed' };
        }

        return {
            success: true,
            message: tailsRewardMessage(tier.reward.tails, tier.name),
            tails: tier.reward.tails,
            tierId: tier.id,
            progression: await this.getAirdropProgression(userId),
        };
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(REWARD_USER_THROTTLE)
    @Post('airdrop/challenge/claim/:challengeId')
    async claimAirdropChallenge(
        @USER_ID() userId: string,
        @Param('challengeId') challengeId: string
    ): Promise<IAirdropClaimResponse> {
        const progression = await this.getAirdropProgression(userId);
        const normalizedChallengeId = challengeId.toUpperCase();
        const challenge = progression.gamification.dailyChallenges.find(item => item.id === normalizedChallengeId);
        if (!challenge) {
            return { success: false, message: 'Challenge does not exist' };
        }
        if (challenge.claimed) {
            return { success: false, message: 'Challenge reward is already claimed' };
        }
        if (!challenge.completed) {
            return { success: false, message: 'Challenge is not completed yet' };
        }

        const updateResult = await this.repository.model.findOneAndUpdate(
            {
                _id: new Types.ObjectId(userId),
                airdropChallengesClaimed: { $ne: challenge.id },
            },
            {
                $addToSet: { airdropChallengesClaimed: challenge.id },
                $inc: { ...earnTailsInc(challenge.rewardTails), monthTails: challenge.rewardTails },
            },
            { new: true }
        );

        if (!updateResult) {
            return { success: false, message: 'Challenge reward is already claimed' };
        }

        return {
            success: true,
            message: tailsRewardMessage(challenge.rewardTails, challenge.label),
            tails: challenge.rewardTails,
            challengeId: challenge.id,
            progression: await this.getAirdropProgression(userId),
        };
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(REWARD_USER_THROTTLE)
    @Post('airdrop/milestone/claim/:milestoneId')
    async claimAirdropMilestone(
        @USER_ID() userId: string,
        @Param('milestoneId') milestoneId: string
    ): Promise<IAirdropClaimResponse> {
        const progression = await this.getAirdropProgression(userId);
        const normalizedMilestoneId = milestoneId.toUpperCase();
        const milestone = progression.gamification.milestones.find(item => item.id === normalizedMilestoneId);
        if (!milestone) {
            return { success: false, message: 'Milestone does not exist' };
        }
        if (milestone.claimed) {
            return { success: false, message: 'Milestone reward is already claimed' };
        }
        if (!milestone.reached) {
            return { success: false, message: 'Milestone is not reached yet' };
        }

        const updateResult = await this.repository.model.findOneAndUpdate(
            {
                _id: new Types.ObjectId(userId),
                airdropMilestonesClaimed: { $ne: milestone.id },
            },
            {
                $addToSet: { airdropMilestonesClaimed: milestone.id },
                $inc: { ...earnTailsInc(milestone.rewardTails), monthTails: milestone.rewardTails },
            },
            { new: true }
        );

        if (!updateResult) {
            return { success: false, message: 'Milestone reward is already claimed' };
        }

        return {
            success: true,
            message: tailsRewardMessage(milestone.rewardTails, milestone.label),
            tails: milestone.rewardTails,
            milestoneId: milestone.id,
            progression: await this.getAirdropProgression(userId),
        };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Post('loot/twitter')
    async giveLootBoxToTwitter(@Body() { twitter }: { twitter: string[] }): Promise<IMessage> {
        await this.repository.model.updateMany(
            {
                twitter: { $in: twitter.map(user => user.toLowerCase()), $exists: true },
            },
            { $inc: { boxes: 1 } }
        );
        return { success: true, message: 'Loot box given' };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.EDITOR))
    @Post('loot/discord')
    async giveLootBoxToDiscord(@Body() { discord }: { discord: string[] }): Promise<IMessage> {
        await this.repository.model.updateMany(
            {
                discord: { $in: discord.map(user => user.toLowerCase()), $exists: true },
            },
            { $inc: { boxes: 1 } }
        );
        return { success: true, message: 'Loot box given' };
    }

    @UseGuards(AppAuthGuard)
    @Get('codex')
    async codex(@USER_ID() userId: string): Promise<User> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection:
                'codex monthTails monthStreak monthFeeded monthCatsAdopted monthBoxes monthReferrals monthTailsCrafted',
        });

        const phase = getPhase();
        if (isLessThan2hoursLeft()) {
            return user;
        }
        // Fill user codex array with zeroes if the length is not equal to phase number
        if (!user.codex || user.codex.length < phase) {
            const currentCodex = user.codex || [];
            const newCodex = [...currentCodex];

            // Add zeroes until the array length matches the phase number
            while (newCodex.length < phase) {
                newCodex.push(0);
            }

            // Update the user's codex in the database
            await this.repository.update(userId, { codex: newCodex });
            user.codex = newCodex;
        }

        const eligible: boolean[] = [
            (user?.monthTails || 0) >= 100,
            (user?.monthBoxes || 0) >= 2,
            (user?.monthFeeded || 0) >= 1,
            (user?.monthStreak || 0) >= 10,
            (user?.monthReferrals || 0) >= 1,
            (user?.monthTailsCrafted || 0) >= 100,
            (user?.monthPacks || 0) >= 1,
        ];
        if (eligible.every(Boolean)) {
            const codex = user.codex || [];
            codex[phase - 1] = 1;
            await this.repository.update(userId, { $set: { codex: codex } });
        }

        return user;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('search')
    public async search(@Body() params: SearchModel): Promise<IUser[]> {
        let searchObject: any = {};
        if (params.query?.length) {
            searchObject = {
                $search: {
                    index: 'users',
                    autocomplete: {
                        query: params.query,
                        path: 'name',
                    },
                },
            };
        }

        return this.repository.find({
            searchObject,
            ...pickSearchParams(params),
            projection: 'name email streak permission',
        });
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('cats')
    async cats(@USER_ID() userId: string): Promise<any[]> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: 'cats',
            populate: [
                {
                    path: 'cats',
                    select: '-code',
                    populate: [
                        {
                            path: 'blessing',
                            populate: [
                                { path: 'image', select: 'url' },
                                { path: 'catAvatar', select: 'url' },
                            ],
                        },
                        { path: 'shelter', select: 'country name image', populate: [{ path: 'image', select: 'url' }] },
                    ],
                },
            ],
        });

        return user.cats!;
    }

    @UseGuards(AppAuthGuard)
    @Get('opened-pack/:catId')
    async confirmCat(@Param('catId') catId: string): Promise<IMessage> {
        await this.catRepository.update(catId, { $set: { packed: false } });
        return { success: true, message: 'Cat confirmed' };
    }

    /**
     * The Tails board, ranked by lifetime EARNED Tails (G5): giving to a goal never costs a place.
     * `tails` in each row is the ranked value (earned), so shipped clients keep showing the right
     * number. Not a route parameter: `top` is set only by the weekly reward cron.
     */
    @Get('leaderboard')
    async leaderboard(top?: number): Promise<User[]> {
        return this.earnedBoard(top || 50);
    }

    private async earnedBoard(top: number): Promise<User[]> {
        const field = earnedBoardField();
        const users = await this.repository.find({
            projection: 'name tails tailsEarned tailsGiven',
            page: 0,
            perPage: top,
            // Ties broken by `_id`, so the top-N cut-off (weekly top-200) is stable (review fix #5).
            pipelineStages: [boardSort(field)],
            searchObject: { ...boardFilter() },
        });

        // `find` aggregates, so rows are plain objects.
        return (users || []).map(user => {
            const earned = earnedTails(user);
            return { _id: user._id, name: user.name, tails: earned, tailsEarned: earned } as unknown as User;
        });
    }

    /**
     * The rescuers board (G5): ranked by Tails given to shelter goals, lifetime (default) or this
     * season (`?period=season`). Only players who gave anything are listed.
     */
    @Get('leaderboard/rescuers')
    async leaderboardRescuers(
        @Query('period') period?: string,
        @Query('top') top?: string
    ): Promise<Array<{ _id: unknown; name: string; tailsGiven: number; goalsHelped: number }>> {
        const field = rescuerField(rescuerPeriod(period));
        const users = await this.repository.find({
            projection: `name ${field} goalsHelped monthGoalsHelped`,
            page: 0,
            perPage: boardTop(top),
            // Ties (often 0 or round numbers) broken by `_id`, so `top=N` is stable (review fix #5).
            pipelineStages: [boardSort(field)],
            searchObject: { [field]: { $gt: 0 }, ...boardFilter() },
        });

        return (users || []).map((user: any) => ({
            _id: user._id,
            name: user.name,
            tailsGiven: Number(user[field]) || 0,
            goalsHelped: Number(field === 'monthTailsGiven' ? user.monthGoalsHelped : user.goalsHelped) || 0,
        }));
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('leaderboard/rescuers/position')
    async positionRescuers(
        @USER_ID() userId: string,
        @AUTH_USER() authUser?: IAuthUser,
        @Query('period') period?: string
    ): Promise<IBoardPosition & { tailsGiven: number }> {
        const field = rescuerField(rescuerPeriod(period));
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: `${field} ${BOARD_EXCLUSION_PROJECTION}`,
        });
        const given = Number((user as any)?.[field]) || 0;
        if (isBoardExcluded(user)) {
            return { ...boardPosition(0, authUser, user), tailsGiven: given };
        }
        const ahead = await this.repository.count({ [field]: { $gt: given }, ...boardFilter() });

        return { ...boardPosition(ahead + 1, authUser), tailsGiven: given };
    }

    @Get('leaderboard/catnip')
    async leaderboardCatnip(top?: number): Promise<User[]> {
        const users = await this.repository.find({
            projection: 'name catnipCount catnipChaosCount match3Count catnipChaos match3',
            page: 0,
            perPage: top || 50,
            sort: { sortBy: 'catnipCount', isAscending: false },
            searchObject: { catnipCount: { $lte: MAX_LEGIT_CATNIP_SCORE }, ...boardFilter() },
        });

        return users;
    }

    @Get('leaderboard/paw-match/:level')
    async leaderboardPawMatch(@Param('level') level: string, @Query('top') top?: string): Promise<any[]> {
        const index = match3Levels.findIndex(match3Level => match3Level === level);
        if (index < 0) {
            throw new BadRequestException('Invalid level for MATCH_3 leaderboard');
        }

        const parsedTop = Number(top);
        const topLimit = Number.isFinite(parsedTop)
            ? Math.max(1, Math.min(PAW_MATCH_LEADERBOARD_MAX_TOP, Math.floor(parsedTop)))
            : PAW_MATCH_LEADERBOARD_DEFAULT_TOP;
        const cacheKey = `${level}:${topLimit}`;
        const now = Date.now();
        this.pawMatchLeaderboardCache.forEach((value, key) => {
            if (value.expiresAt <= now) {
                this.pawMatchLeaderboardCache.delete(key);
            }
        });
        const cached = this.pawMatchLeaderboardCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.rows;
        }

        const levelScorePath = `match3Score.${index}`;
        const fetchLimit = Math.max(topLimit, Math.min(PAW_MATCH_LEADERBOARD_MAX_TOP * 4, topLimit * 4));
        const rawRows = await this.repository.model
            .find(
                {
                    [levelScorePath]: { $gt: 0 },
                    ...boardFilter(),
                },
                {
                    name: 1,
                    match3Score: 1,
                }
            )
            .sort({
                [levelScorePath]: -1,
                name: 1,
            })
            .limit(fetchLimit)
            .maxTimeMS(600000)
            .lean()
            .exec();

        const rows = rawRows
            .map((row: any) => {
                const scoreArray = normalizeMatch3Scores(row.match3Score);
                const levelScore = scoreArray[index] || 0;
                const match3ScoreCount = scoreArray.reduce((sum, value) => sum + value, 0);
                return {
                    _id: row._id?.toString?.() || row._id,
                    name: row.name,
                    levelScore,
                    match3ScoreCount,
                };
            })
            .filter((row: any) => row.levelScore > 0)
            .sort(
                (a: any, b: any) =>
                    b.levelScore - a.levelScore ||
                    b.match3ScoreCount - a.match3ScoreCount ||
                    `${a.name || ''}`.localeCompare(`${b.name || ''}`)
            )
            .slice(0, topLimit);

        this.pawMatchLeaderboardCache.set(cacheKey, {
            expiresAt: now + PAW_MATCH_LEADERBOARD_CACHE_TTL_MS,
            rows,
        });

        return rows;
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('leaderboard/paw-match/:level/position')
    async leaderboardPawMatchPosition(
        @Param('level') level: string,
        @USER_ID() userId: string,
        @AUTH_USER() authUser?: IAuthUser
    ): Promise<{
        position: number | null;
        levelScore: number;
        match3ScoreCount: number;
        wouldBe?: true;
        excluded?: true;
    }> {
        const index = match3Levels.findIndex(match3Level => match3Level === level);
        if (index < 0) {
            throw new BadRequestException('Invalid level for MATCH_3 leaderboard');
        }

        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: `name match3Score match3ScoreCount ${BOARD_EXCLUSION_PROJECTION}`,
        });
        if (!user) {
            throw new BadRequestException('User does not exist');
        }

        const myScores = normalizeMatch3Scores((user as any).match3Score);
        const myLevelScore = myScores[index] || 0;
        const myTotalScore = myScores.reduce((sum, value) => sum + value, 0);

        if (isBoardExcluded(user)) {
            return { position: null, excluded: true, levelScore: myLevelScore, match3ScoreCount: myTotalScore };
        }

        if (myLevelScore <= 0) {
            return {
                position: null,
                levelScore: 0,
                match3ScoreCount: myTotalScore,
            };
        }

        const levelScorePath = `match3Score.${index}`;
        const userName = typeof user.name === 'string' ? user.name : 'You';
        const betterLevelScoreCount = await this.repository.model
            .countDocuments({ [levelScorePath]: { $gt: myLevelScore }, ...boardFilter() })
            .maxTimeMS(600000)
            .exec();
        const sameLevelRows = await this.repository.model
            .find(
                { [levelScorePath]: myLevelScore, ...boardFilter() },
                {
                    name: 1,
                    match3Score: 1,
                }
            )
            .maxTimeMS(600000)
            .lean()
            .exec();

        const betterTieBreakCount = sameLevelRows.reduce((count: number, row: any) => {
            const rowId = row._id?.toString?.() || row._id;
            if (rowId === userId) {
                return count;
            }

            const scoreArray = normalizeMatch3Scores(row.match3Score);
            const totalScore = scoreArray.reduce((sum, value) => sum + value, 0);
            if (totalScore > myTotalScore) {
                return count + 1;
            }
            if (totalScore < myTotalScore) {
                return count;
            }

            const rowName = typeof row.name === 'string' ? row.name : '';
            if (rowName < userName) {
                return count + 1;
            }

            return count;
        }, 0);

        return {
            position: betterLevelScoreCount + betterTieBreakCount + 1,
            levelScore: myLevelScore,
            match3ScoreCount: myTotalScore,
            ...(isGuestUser(authUser) ? { wouldBe: true as const } : {}),
        };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('profile/:id')
    async profileIndividual(@Param('id') id: string): Promise<User> {
        const user = await this.repository.findOne({
            searchObject: { _id: id },
            projection: PROFILE_ADMIN_PROJECTION,
        });

        return user;
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('leaderboard/position')
    async position(@USER_ID() userId: string, @AUTH_USER() authUser?: IAuthUser): Promise<IBoardPosition> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: `tails tailsEarned tailsGiven ${BOARD_EXCLUSION_PROJECTION}`,
        });
        if (isBoardExcluded(user)) {
            return boardPosition(0, authUser, user);
        }
        // Earned Tails, the value the board ranks by (G5). Before the backfill the board field is
        // `tails`, so the count uses the balance too: the two agree until the first pledge.
        const field = earnedBoardField();
        const userScore = field === 'tailsEarned' ? earnedTails(user) : Number(user?.tails) || 0;
        const position = await this.repository.count({ [field]: { $gt: userScore }, ...boardFilter() });

        return boardPosition(position + 1, authUser);
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('leaderboard/catnip/position')
    async positionCatnip(@USER_ID() userId: string, @AUTH_USER() authUser?: IAuthUser): Promise<IBoardPosition> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: `catnipCount ${BOARD_EXCLUSION_PROJECTION}`,
        });
        if (isBoardExcluded(user)) {
            return boardPosition(0, authUser, user);
        }
        const userScore = user.catnipCount > MAX_LEGIT_CATNIP_SCORE ? 0 : user.catnipCount;
        const position = await this.repository.count({
            catnipCount: { $gt: userScore, $lte: MAX_LEGIT_CATNIP_SCORE },
            ...boardFilter(),
        });

        return boardPosition(position + 1, authUser);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('profile')
    async createProfile(
        @Body(profileWritePipe) params: ProfileWriteDto,
        @AUTH_USER() authUser?: IAuthUser
    ): Promise<any> {
        // Only an ADMIN grants a role above USER (G4, decision #33); a manager could mint an admin.
        if (!isAdmin(authUser) && permissionValue(params.permission) > PERMISSION_LEVEL.USER) {
            throw new ForbiddenException('Only an admin can grant a role above user');
        }
        const wallets = this.userService.generateWallets();

        const catId = new Types.ObjectId();
        const userId = new Types.ObjectId();
        await this.userService.generateACat(catId, userId);
        // Manager-created accounts never onboard (G3): no `onboarding`, and generateACat gives them
        // a locked starter. The schema lowercases the email.
        return this.repository.create({
            _id: userId,
            name: params.name,
            email: params.email,
            emailCanonical: canonicalEmail(params.email) || undefined,
            isGuest: false,
            canRedeemLives: true,
            // '' is the CMS form's empty number field; leave it to the schema default.
            permission: params.permission === '' ? undefined : params.permission,
            discount: params.discount,
            wallets,
            cat: catId,
            cats: [catId],
        });
    }

    @UseGuards(AppAuthGuard)
    @Put('profile/:id/twitter')
    async updateProfileTwitter(@Body() params: User, @Param('id') id: string, @USER_ID() userId: string): Promise<any> {
        if (userId.toString() !== id) {
            throw new BadRequestException('You are not allowed to update this profile twitter');
        }
        if (params.twitter?.length) {
            await this.repository.update(id, { twitter: params.twitter.replace('@', '').trim().toLowerCase() });
        }
        if (params.discord?.length) {
            await this.repository.update(id, { discord: params.discord.replace('@', '').trim().toLowerCase() });
        }

        return {};
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Put('profile/:id')
    async updateProfile(
        @Body(profileWritePipe) params: ProfileWriteDto,
        @Param('id') id: string,
        @AUTH_USER() authUser?: IAuthUser
    ): Promise<any> {
        // Changing `email` or `permission` is ADMIN only (decision #33). A verified sign-in binds by
        // email (W1-HF d), so a manager who could repoint a victim's email could take the account and
        // its wallets; a manager could also grant themselves ADMIN. The CMS form sends both fields on
        // every save, so an unchanged value is accepted.
        if (!isAdmin(authUser) && (params.email !== undefined || params.permission !== undefined)) {
            const target = await this.repository.findOne({
                searchObject: { _id: id },
                projection: 'email permission',
            });
            if (!target) {
                throw new BadRequestException('User does not exist');
            }
            if (params.email !== undefined && emailValue(params.email) !== emailValue(target.email)) {
                throw new ForbiddenException('Only an admin can change a user email');
            }
            if (
                params.permission !== undefined &&
                permissionValue(params.permission) !== permissionValue(target.permission)
            ) {
                throw new ForbiddenException('Only an admin can change a user role');
            }
        }
        await this.repository.update(id, params);
        // The abuse-check inbox follows the email (2a review finding #5).
        const canonical = params.email !== undefined ? canonicalEmail(params.email) : null;
        if (canonical) {
            await this.repository.update(id, { emailCanonical: canonical });
        }

        return {};
    }

    @UseGuards(AppAuthGuard)
    @Post('entity-metadata')
    async isLiked(@USER_ID() userId: string, @Body() params: ISave[]): Promise<ISaved[]> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: 'likes',
        });

        return params.map(param => ({
            ...param,
            isLiked: !!user.likes?.find(like => like.entity?.toString() === param.entity?.toString()),
        }));
    }

    /**
     * The daily wheel. The odds are the published table (`GET /user/catbassadors/lives/odds`,
     * src/user/wheel.ts). One spin a day: the claim is one conditional write on `canRedeemLives`, so
     * parallel spins pay once.
     */
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(REWARD_USER_THROTTLE)
    @Get('catbassadors/lives/redeem')
    async Tredeem(@USER_ID() userId: string): Promise<object> {
        const tails = drawWheel();
        const spun = await this.repository.model
            .findOneAndUpdate(
                { _id: new Types.ObjectId(userId), canRedeemLives: true },
                {
                    $inc: { ...earnTailsInc(tails), monthTails: tails, streak: 1, monthStreak: 1 },
                    $set: { canRedeemLives: false },
                },
                { projection: { _id: 1 } }
            )
            .lean();
        if (spun) {
            return { tails };
        }

        throw new BadRequestException('Already redeemed');
    }

    /** The wheel's published odds (G5). Public; the same table the spin draws from. */
    @Get('catbassadors/lives/odds')
    @Header('Cache-Control', 'public, max-age=3600')
    wheelOdds(): IWheelOdds {
        return wheelOdds();
    }

    /**
     * Vault status (G5, decision #39): `{mode, tgeAt}`. POINTS unless TAILS_TOKEN_MODE=TOKEN; no
     * date is exposed in POINTS mode. Public and cached; app builds never call it.
     */
    @Get('token-status')
    @Header('Cache-Control', TOKEN_STATUS_CACHE_CONTROL)
    tokenStatus(): ITokenStatus {
        return tokenStatus();
    }

    /**
     * Decision #12: the referred (signed-in) account claims its referrer once, ever, within 7 days of
     * its promotion. Sent by the client when promotion returns `promotedNow: true` (F5.7).
     */
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(REWARD_USER_THROTTLE)
    @Post('catbassadors/referral')
    async referral(@USER_ID() userId: string, @Body(guestBodyPipe) body: ReferralDto): Promise<IReferralResult> {
        return applyReferral(this.repository.model, userId.toString(), body.referrerId);
    }

    /**
     * @deprecated Side-effecting GET kept for shipped clients; use `POST /user/catbassadors/referral`.
     * Same rules now: `referredBy` is checked and set once, and the 7-day window applies (decision
     * #12). To be removed once no client calls it.
     */
    @UseGuards(AppAuthGuard)
    @Header('Deprecation', 'true')
    @Get('catbassadors/referralw/:referralId')
    async TreferralWeb(@USER_ID() userId: string, @Param('referralId') referralId: string): Promise<object> {
        await applyReferral(this.repository.model, userId?.toString(), referralId);
        return {};
    }

    /**
     * The only write path for game scores (CLAUDE.md, plan F6). Plain modes are checked against
     * their level table and caps; CATNIP_HEIST takes the replay-verified branch
     * (`src/user/heist/heist-live.ts`, plan G2 layer 2). Guards, in order: auth (first, as on every
     * route), the per-IP Heist replay bucket (counts replay requests only), the per-player bucket.
     * The body is parsed by a 64 KB route parser (`src/user/heist/live-body-limit.ts`).
     */
    @UseGuards(AppAuthGuard, HeistReplayIpThrottleGuard, LiveGameUserThrottleGuard)
    @AllowGuest()
    @Throttle({ default: LIVE_GAME_THROTTLE })
    @Post('catbassadors/live')
    async Tcatbassadors(
        @USER_ID() userId: string,
        @Body(liveGamePipe) body: LiveGameDto,
        @Req() req?: { res?: { setHeader(name: string, value: string): void } }
    ): Promise<any> {
        if (body.type === GameType.CATNIP_HEIST) {
            try {
                return await saveHeistRun(
                    { users: this.repository, games: this.gameRepository, queue: heistReplayQueue },
                    userId,
                    body
                );
            } catch (error) {
                if (error instanceof ReplayQueueFullException) {
                    req?.res?.setHeader('Retry-After', String(error.retryAfterSeconds));
                }
                throw error;
            }
        }

        // Validates type, level and the per-level cap before anything is written.
        const { row, best } = resolveLiveGame(body);
        const arrays = dottedArrayFields(best);
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: ['cat', ...arrays].join(' '),
        });
        if (!user) {
            throw new BadRequestException('User not found');
        }
        // A dotted `$max` into a missing array would store a sub-document (plan F6 array safety).
        const missing = arrays.filter(field => !isSafeArray((user as any)[field]));
        if (missing.length) {
            await this.repository.update(userId, arrayGuardPipeline(missing) as any);
        }

        await this.gameRepository.create({ ...row, cat: user.cat, user: user._id });
        await this.repository.update(userId, { $max: best, $set: { lastPlayedAt: new Date() } });
        const shouldInvalidatePawMatchLeaderboard = row.type === GameType.MATCH_3;

        // Caps, missing arrays and counts are re-derived by the code the guest merge shares.
        const totals = await recomputeGameTotals(this.repository, userId);

        if (shouldInvalidatePawMatchLeaderboard) {
            this.pawMatchLeaderboardCache.clear();
        }

        return totals;
    }

    /**
     * Read-only: which Heist sim `/live` replays with (sim version, bundle sha256, level ids). The
     * Heist Pages deploy compares it with its own build before publishing (review 3b finding 1;
     * `npm run vendor-sim:check-remote` in catnip-heist/). Writes nothing.
     */
    @Get('catbassadors/heist-sim')
    @Header('Cache-Control', 'public, max-age=60')
    heistSim(): IHeistSimInfo {
        return HEIST_SIM_INFO;
    }

    @Get('catbassadors/leaderboard')
    async Tleaderboard(): Promise<User[]> {
        return this.earnedBoard(10);
    }
}
