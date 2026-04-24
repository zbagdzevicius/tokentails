import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { CatRepository } from 'src/cat/cat.repository';
import { Tier } from 'src/cat/cat.schema';
import { CatService } from 'src/cat/cat.service';
import { BaseRepository } from 'src/common/base.repository';
import { getPhase, isLessThan2hoursLeft } from 'src/common/utils';
import { SearchModel } from 'src/common/validators';
import { GameRepository } from 'src/game/game.repository';
import {
    catnipChaosLevelCatnipCaps,
    catnipChaosLevels,
    GameType,
    IGame,
    match3LevelCatnipCaps,
    match3Levels,
    seasonEventLevels,
    totalCatnipCap,
} from 'src/game/game.schema';
import { ImageRepository } from 'src/image/image.repository';
import { REWARDS } from 'src/shared/constants/rewards';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { EntityType, IMessage } from 'src/shared/interfaces/common.interface';
import { OrderRepository } from 'src/web3/order.repository';
import { OrderStatus } from 'src/web3/order.schema';
import { ArticleRepository } from '../article/article.repository';
import { CommentRepository } from '../comment/comment.repository';
import { buildAirdropProgression, IAirdropProgressionResponse } from './airdrop-progression';
import { PERMISSION_LEVEL } from './models/user.model';
import { buildCatnipAccountingSnapshot, buildCatnipSanitizationUpdate } from './utils/catnip-accounting';
import { UserRepository } from './user.repository';
import { ISave, ISaved, IUser, User } from './user.schema';
import { UserService } from './user.service';
import { users } from './users';

const twitters: string[] = [];
const MAX_SEASON_EVENT_POINTS_PER_LEVEL = 420;
const MAX_LEGIT_CATNIP_SCORE = totalCatnipCap;
const MAX_MATCH3_SCORE_PER_LEVEL = 1000000;
const PAW_MATCH_LEADERBOARD_DEFAULT_TOP = 120;
const PAW_MATCH_LEADERBOARD_MAX_TOP = 500;
const PAW_MATCH_LEADERBOARD_CACHE_TTL_MS = 15000;

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

const normalizeSeasonEventScores = (values: unknown[] | undefined | null): number[] => {
    const rawValues = toLevelValueArray(values);
    return seasonEventLevels.map((_level, index) => {
        const numeric = Number(rawValues[index]);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 0;
        }
        return Math.min(MAX_SEASON_EVENT_POINTS_PER_LEVEL, Math.floor(numeric));
    });
};

const normalizeMatch3Scores = (values: unknown[] | undefined | null): number[] => {
    const rawValues = toLevelValueArray(values);
    return match3Levels.map((_level, index) => {
        const numeric = Number(rawValues[index]);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 0;
        }
        return Math.min(MAX_MATCH3_SCORE_PER_LEVEL, Math.floor(numeric));
    });
};

type IAirdropClaimResponse = IMessage & {
    tierId?: string;
    challengeId?: string;
    milestoneId?: string;
    progression?: IAirdropProgressionResponse;
};

@Controller('user')
export class UserController {
    private pawMatchLeaderboardCache = new Map<string, { expiresAt: number; rows: any[] }>();

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
                'tails streak quests cats portraitPurchases airdropRewardsClaimed airdropChallengesClaimed airdropMilestonesClaimed',
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
            tails: user.tails || 0,
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
            { catnipCount: { $gt: 299 } },
            { $inc: { tails: 690, monthTails: 690 } }
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
                        $inc: {
                            tails:
                                (users.find(u => u.username.toLowerCase() === user.twitter.toLowerCase())!
                                    .totalScoreAugust || 20) * 15,
                        },
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
                        $inc: {
                            tails: user.codex.reduce((a, b) => a + b, 0) * 300,
                        },
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

    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async resetCheckIn() {
        await this.repository.updateAll({
            canRedeemLives: true,
        });
    }

    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async saveLinkedArticlesCount() {
        this.repository.updateAll({
            status: {
                EAT: 0,
            },
        });
    }

    @Cron(CronExpression.EVERY_WEEK)
    async giveWeeklyTopRewards() {
        const top = await this.leaderboard(200);
        await this.repository.model.updateMany({ _id: { $in: top.map(user => user._id) } }, { $inc: { tails: 200 } });
    }

    @Cron('0 0 1 * * ')
    async resetCodex() {
        await this.giveLootBoxesToTailsGuards();
        await this.repository.updateAll({
            monthTails: 0,
            monthBoxes: 0,
            monthFeeded: 0,
            monthStreak: 0,
            monthPacks: 0,
            monthReferrals: 0,
            monthTailsCrafted: 0,
            monthPortraitPurchases: 0,
            airdropChallengesClaimed: [],
            airdropMilestonesClaimed: [],
        });
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('profile')
    async profile(@USER_ID() userId: string): Promise<User> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection:
                'name codex boxes discord affiliated tails discount spent monthSpent email permission seasonEvent seasonEventCount match3 match3Count match3Score match3ScoreCount catnipChaos catnipChaosCount catnipCount twitter shelter cat canRedeemLives quests referralsCount wallets.stellar.walletAddress streak monthPacks monthStreak monthFeeded monthCatsAdopted monthBoxes monthTails monthReferrals monthTailsCrafted portraitPurchases monthPortraitPurchases airdropRewardsClaimed airdropChallengesClaimed airdropMilestonesClaimed',
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

        return user;
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('airdrop/progression')
    async airdropProgression(@USER_ID() userId: string): Promise<IAirdropProgressionResponse> {
        return this.getAirdropProgression(userId);
    }

    @UseGuards(AuthGuard('appauth'))
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
                $inc: { tails: tier.reward.tails, monthTails: tier.reward.tails },
            },
            { new: true }
        );

        if (!updateResult) {
            return { success: false, message: 'Tier reward is already claimed' };
        }

        return {
            success: true,
            message: `Claimed ${tier.reward.tails} $TAILS from ${tier.name}`,
            tails: tier.reward.tails,
            tierId: tier.id,
            progression: await this.getAirdropProgression(userId),
        };
    }

    @UseGuards(AuthGuard('appauth'))
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
                $inc: { tails: challenge.rewardTails, monthTails: challenge.rewardTails },
            },
            { new: true }
        );

        if (!updateResult) {
            return { success: false, message: 'Challenge reward is already claimed' };
        }

        return {
            success: true,
            message: `Claimed ${challenge.rewardTails} $TAILS from ${challenge.label}`,
            tails: challenge.rewardTails,
            challengeId: challenge.id,
            progression: await this.getAirdropProgression(userId),
        };
    }

    @UseGuards(AuthGuard('appauth'))
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
                $inc: { tails: milestone.rewardTails, monthTails: milestone.rewardTails },
            },
            { new: true }
        );

        if (!updateResult) {
            return { success: false, message: 'Milestone reward is already claimed' };
        }

        return {
            success: true,
            message: `Claimed ${milestone.rewardTails} $TAILS from ${milestone.label}`,
            tails: milestone.rewardTails,
            milestoneId: milestone.id,
            progression: await this.getAirdropProgression(userId),
        };
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
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

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.EDITOR))
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

    @UseGuards(AuthGuard('appauth'))
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

    @Get('profile/:userId')
    async specificProfile(@Param('userId') userId: string): Promise<User> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection:
                'name email discord discount catnipChaos catnipChaosCount catnipCount match3 match3Count match3Score match3ScoreCount boxes permission twitter shelter cat canRedeemLives quests referrals wallets.stellar.walletAddress streak',
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

        return user;
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
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
            ...params,
            projection: 'name email telegramUsername streak permission',
        });
    }

    @UseGuards(AuthGuard('appauth'))
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

    @UseGuards(AuthGuard('appauth'))
    @Get('opened-pack/:catId')
    async confirmCat(@Param('catId') catId: string): Promise<IMessage> {
        await this.catRepository.update(catId, { $set: { packed: false } });
        return { success: true, message: 'Cat confirmed' };
    }

    @Get('leaderboard')
    async leaderboard(top?: number): Promise<User[]> {
        const users = await this.repository.find({
            projection: 'name tails',
            page: 0,
            perPage: top || 50,
            sort: { sortBy: 'tails', isAscending: false },
        });

        return users;
    }

    @Get('leaderboard/catnip')
    async leaderboardCatnip(top?: number): Promise<User[]> {
        const users = await this.repository.find({
            projection: 'name catnipCount catnipChaosCount match3Count catnipChaos match3',
            page: 0,
            perPage: top || 50,
            sort: { sortBy: 'catnipCount', isAscending: false },
            searchObject: { catnipCount: { $lte: MAX_LEGIT_CATNIP_SCORE } },
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
                    b.levelScore - a.levelScore || b.match3ScoreCount - a.match3ScoreCount || `${a.name || ''}`.localeCompare(`${b.name || ''}`)
            )
            .slice(0, topLimit);

        this.pawMatchLeaderboardCache.set(cacheKey, {
            expiresAt: now + PAW_MATCH_LEADERBOARD_CACHE_TTL_MS,
            rows,
        });

        return rows;
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('leaderboard/paw-match/:level/position')
    async leaderboardPawMatchPosition(
        @Param('level') level: string,
        @USER_ID() userId: string
    ): Promise<{ position: number | null; levelScore: number; match3ScoreCount: number }> {
        const index = match3Levels.findIndex(match3Level => match3Level === level);
        if (index < 0) {
            throw new BadRequestException('Invalid level for MATCH_3 leaderboard');
        }

        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: 'name match3Score match3ScoreCount',
        });
        if (!user) {
            throw new BadRequestException('User does not exist');
        }

        const myScores = normalizeMatch3Scores((user as any).match3Score);
        const myLevelScore = myScores[index] || 0;
        const myTotalScore = myScores.reduce((sum, value) => sum + value, 0);

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
            .countDocuments({ [levelScorePath]: { $gt: myLevelScore } })
            .maxTimeMS(600000)
            .exec();
        const sameLevelRows = await this.repository.model
            .find(
                { [levelScorePath]: myLevelScore },
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
        };
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('profile/:id')
    async profileIndividual(@Param('id') id: string): Promise<User> {
        const user = await this.repository.findOne({
            searchObject: { _id: id },
            projection: 'name email permission shelter twitter discord',
        });

        return user;
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('leaderboard/position')
    async position(@USER_ID() userId: string): Promise<{ position: number }> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: 'tails',
        });
        const userScore = user.tails;
        const position = await this.repository.count({ tails: { $gt: userScore } });

        return {
            position: position + 1,
        };
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('leaderboard/catnip/position')
    async positionCatnip(@USER_ID() userId: string): Promise<{ position: number }> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: 'catnipCount',
        });
        const userScore = user.catnipCount > MAX_LEGIT_CATNIP_SCORE ? 0 : user.catnipCount;
        const position = await this.repository.count({ catnipCount: { $gt: userScore, $lte: MAX_LEGIT_CATNIP_SCORE } });

        return {
            position: position + 1,
        };
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Post('profile')
    async createProfile(@Body() params: User): Promise<any> {
        const wallets = this.userService.generateWallets();

        const catId = new Types.ObjectId();
        const userId = new Types.ObjectId();
        await this.userService.generateACat(catId, userId);
        return this.repository.create({
            _id: userId,
            name: params.name,
            email: params.email,
            shelter: new Types.ObjectId(params.shelter),
            canRedeemLives: true,
            permission: params.permission,
            discount: params.discount,
            wallets,
            cat: catId,
            cats: [catId],
        });
    }

    @UseGuards(AuthGuard('appauth'))
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

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Put('profile/:id')
    async updateProfile(@Body() params: User, @Param('id') id: string): Promise<any> {
        await this.repository.update(id, params);

        return {};
    }

    @UseGuards(AuthGuard('appauth'))
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

    @UseGuards(AuthGuard('appauth'))
    @Get('catbassadors/lives/redeem')
    async Tredeem(@USER_ID() userId: string): Promise<object> {
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: 'canRedeemLives streak',
        });
        if (user.canRedeemLives) {
            // Weighted probabilities: 1000, 250, 100, 50 each have 1%, rest (1, 5, 10, 25) share 96% (24% each)
            const random = Math.random();
            let tails: number;

            if (random < 0.01) {
                tails = 1000;
            } else if (random < 0.02) {
                tails = 250;
            } else if (random < 0.03) {
                tails = 100;
            } else if (random < 0.04) {
                tails = 50;
            } else {
                // Remaining 96% split evenly between 1, 5, 10, 25 (24% each)
                const commonValues = [1, 5, 10, 25];
                const adjustedRandom = (random - 0.04) / 0.96; // Normalize to 0-1 range
                tails = commonValues[Math.floor(adjustedRandom * commonValues.length)];
            }

            await this.repository.update(userId, {
                $inc: {
                    tails: tails,
                    monthTails: tails,
                    streak: 1,
                    monthStreak: 1,
                },
                $set: { canRedeemLives: false },
            });

            return { tails };
        }

        throw new BadRequestException('Already redeemed');
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('catbassadors/referral/:telegramId')
    async Treferral(@USER_ID() userId: string, @Param('telegramId') telegramId: string): Promise<object> {
        const user = await this.repository.findOne({
            searchObject: { telegramId },
            projection: 'referrals',
        });
        if (!user) {
            throw new BadRequestException('Such user does not exist');
        }
        if (userId?.toString() === user._id?.toString()) {
            throw new BadRequestException('You can not add yourself as referral');
        }
        if (user.referrals?.find(ref => ref.toString() === userId?.toString())) {
            throw new BadRequestException('You can not add same referral twice');
        }
        try {
            await this.repository.update(user._id, {
                $push: { referrals: { $each: [new Types.ObjectId(userId)], $position: 0 } },
                $inc: { tails: REWARDS.INVITE_FRIEND, monthReferrals: 1, referralsCount: 1 },
            });
        } catch (e) {}
        try {
            await this.repository.update(userId, {
                $set: { referredBy: user._id },
                $inc: { tails: REWARDS.INVITE_FRIEND },
            });
        } catch (e) {}

        return {};
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('catbassadors/referralw/:referralId')
    async TreferralWeb(@USER_ID() userId: string, @Param('referralId') referralId: string): Promise<object> {
        const user = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(referralId) },
            projection: 'referrals',
        });
        if (!user) {
            throw new BadRequestException('Such user does not exist');
        }
        if (userId?.toString() === user._id?.toString()) {
            throw new BadRequestException('You can not add yourself as referral');
        }
        if (user.referrals?.find(ref => ref.toString() === userId?.toString())) {
            throw new BadRequestException('You can not add same referral twice');
        }
        try {
            await this.repository.update(new Types.ObjectId(referralId), {
                $push: { referrals: { $each: [new Types.ObjectId(userId)], $position: 0 } },
                $inc: { tails: REWARDS.INVITE_FRIEND, monthReferrals: 1, referralsCount: 1 },
            });
        } catch (e) {}
        try {
            await this.repository.update(userId, {
                $set: { referredBy: user._id },
                $inc: { tails: REWARDS.INVITE_FRIEND },
            });
        } catch (e) {}

        return {};
    }

    @UseGuards(AuthGuard('appauth'))
    @Post('catbassadors/live')
    async Tcatbassadors(@USER_ID() userId: string, @Body() game: IGame): Promise<any> {
        const pointsNumber = Number(game.points);
        const normalizedPoints = Math.floor(pointsNumber);
        const scoreNumber = Number(game.score ?? game.points);
        const normalizedScore = Math.floor(scoreNumber);
        const user = await this.repository.findOne({
            searchObject: { _id: userId },
            projection: 'cat',
        });
        if (!user) {
            throw new BadRequestException('User not found');
        }

        const gameMaxPoints: Record<GameType, number> = {
            [GameType.SHELTER]: 420,
            [GameType.HOME]: 420,
            [GameType.PURRQUEST]: 420,
            [GameType.CATBASSADORS]: 420,
            [GameType.CATNIP_CHAOS]: 420,
            [GameType.PIXEL_RESCUE]: 420,
            [GameType.MATCH_3]: 2000,
        };
        const maxPoints = gameMaxPoints[game.type] ?? 420;

        if (!Number.isFinite(pointsNumber) || !Number.isInteger(pointsNumber) || pointsNumber < 0 || pointsNumber > maxPoints) {
            throw new BadRequestException('Artificial request is detected');
        }
        await this.gameRepository.create({
            ...game,
            cat: user.cat,
            user: user._id,
        });

        let shouldInvalidatePawMatchLeaderboard = false;

        if (game.type === GameType.CATNIP_CHAOS) {
            const index = catnipChaosLevels.findIndex(level => level === game.level);
            if (index < 0) {
                throw new BadRequestException('Invalid level for CATNIP_CHAOS');
            }
            const levelCatnipCap = catnipChaosLevelCatnipCaps[index];
            if (!Number.isFinite(levelCatnipCap) || normalizedPoints > levelCatnipCap) {
                throw new BadRequestException('Artificial request is detected');
            }
            await this.repository.update(userId, {
                $max: { [`catnipChaos.${index}`]: normalizedPoints },
            });
        }
        if (game.type === GameType.PIXEL_RESCUE) {
            const index = seasonEventLevels.findIndex(level => level === game.level);
            if (index < 0) {
                throw new BadRequestException('Invalid level for PIXEL_RESCUE');
            }
            await this.repository.update(userId, {
                $max: { [`seasonEvent.${index}`]: normalizedPoints },
            });
        }
        if (game.type === GameType.MATCH_3) {
            const index = match3Levels.findIndex(level => level === game.level);
            if (index < 0) {
                throw new BadRequestException('Invalid level for MATCH_3');
            }
            const levelCatnipCap = match3LevelCatnipCaps[index];
            if (!Number.isFinite(levelCatnipCap) || normalizedPoints > levelCatnipCap) {
                throw new BadRequestException('Artificial request is detected');
            }
            if (
                !Number.isFinite(scoreNumber) ||
                !Number.isInteger(scoreNumber) ||
                scoreNumber < 0 ||
                scoreNumber > MAX_MATCH3_SCORE_PER_LEVEL
            ) {
                throw new BadRequestException('Artificial request is detected');
            }
            await this.repository.update(userId, {
                $max: { [`match3.${index}`]: normalizedPoints, [`match3Score.${index}`]: normalizedScore },
            });
            shouldInvalidatePawMatchLeaderboard = true;
        }

        const latest = await this.repository.findOne({
            searchObject: { _id: userId },
            projection:
                'catnipChaos catnipChaosCount catnipCount seasonEvent seasonEventCount match3 match3Count match3Score match3ScoreCount',
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

        if (!Array.isArray((latest as any).catnipChaos)) {
            setUpdate.catnipChaos = catnipSnapshot.catnipChaos;
        }
        if (!Array.isArray((latest as any).match3)) {
            setUpdate.match3 = catnipSnapshot.match3;
        }
        if (!Array.isArray((latest as any).seasonEvent)) {
            setUpdate.seasonEvent = normalizedSeasonEvent;
        }
        if (!Array.isArray((latest as any).match3Score)) {
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

        if (Object.keys(setUpdate).length || Object.keys(unsetUpdate).length) {
            const updateQuery: Record<string, unknown> = {};
            if (Object.keys(setUpdate).length) {
                updateQuery.$set = setUpdate;
            }
            if (Object.keys(unsetUpdate).length) {
                updateQuery.$unset = unsetUpdate;
            }
            await this.repository.update(userId, updateQuery);
        }

        if (shouldInvalidatePawMatchLeaderboard) {
            this.pawMatchLeaderboardCache.clear();
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
        };
    }

    @Get('catbassadors/leaderboard')
    async Tleaderboard(): Promise<User[]> {
        const users = await this.repository.find({
            projection: 'name tails',
            page: 0,
            perPage: 10,
            sort: { sortBy: 'tails', isAscending: false },
        });

        return users;
    }
}
