import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    Logger,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import fetch from 'node-fetch';
import { Cat, ICat, MAX_CAT_STATUS } from 'src/cat/cat.schema';
import { IResponse, RESPONSES } from 'src/shared/constants/common';
import { REWARDS } from 'src/shared/constants/rewards';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { currencyRate, CurrencyType } from 'src/shared/interfaces/currency.interface';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { CatRepository } from './cat.repository';
import { CatService, IStorefrontResponse } from './cat.service';
import { CatStakingService, IStakeResponse, IStakeRewardResponse } from './cat-staking.service';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AUTH_USER, IAuthUser, isGuestUser } from 'src/common/decorators/auth-user.decorator';
import { JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { GUEST_TAILS_LIFETIME_CAP } from 'src/shared-contracts/caps';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { CatNameService, INameReportGroup, IRenameResponse } from './cat-name.service';
import { earnTailsInc } from 'src/user/tails-ledger';

export const SELF_ADOPT_RETIRED_MESSAGE =
    'This cat can be adopted through a purchase, a pack, a quest or a redeem code';

/** Renames: a burst limit per IP; the 30-day window is the real limit (decision #22). */
export const CAT_RENAME_THROTTLE = { limit: 10, ttl: 60000 };
/** Name reports: per IP and per reporter. */
export const CAT_REPORT_THROTTLE = { limit: 20, ttl: 60000 };
export const CAT_REPORT_USER_THROTTLE = { limit: 20, ttl: 60 * 60 * 1000 };
/** Cat nap start and collect, per player (G5 P4). */
export const CAT_NAP_USER_THROTTLE = { limit: 20, ttl: 60000 };

const catRedeemCodes = {
    gamenight: '6901f2b47393705e27bc6562',
    impact: '69068b949e82bafcb6e35206',
};

/** Lease for the daily cat hunger reset: once per tick across replicas (F8). */
export const CAT_STATUS_RESET_JOB = 'cat-status-reset';
export const CAT_STATUS_RESET_LEASE_MS = 60 * 60 * 1000;

@Controller('cat')
export class CatController {
    constructor(
        private repository: CatRepository,
        private userRepository: UserRepository,
        private catService: CatService,
        private catStakingService: CatStakingService,
        private catNameService?: CatNameService
    ) {}

    private readonly logger = new Logger(CatController.name);

    // Daily hunger reset. Leased, so it runs once per tick however many replicas fire it (F8).
    // Guest starters are reset too, so a guest can feed daily; their reward is pending and capped.
    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async saveLinkedArticlesCount() {
        return runLeased({
            jobRuns: this.repository.model.db.collection(JOB_RUNS_COLLECTION) as any,
            jobName: CAT_STATUS_RESET_JOB,
            ttlMs: CAT_STATUS_RESET_LEASE_MS,
            logger: this.logger,
            run: () =>
                this.repository.updateAll({
                    status: {
                        EAT: 0,
                    },
                }),
        });
    }

    @Get('rates')
    async getRates(): Promise<Record<CurrencyType, number>> {
        const rates = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=["XLMUSDC"]`).then(res =>
            res.json()
        );

        const ratesObject = rates.reduce(
            (acc: Record<CurrencyType, number>, rate: { price: string; symbol: string }) => {
                const symbol = rate.symbol.replace(/USDC$/, '');
                acc[symbol as CurrencyType] = parseFloat(rate.price);
                return acc;
            },
            { ...currencyRate }
        );

        return ratesObject;
    }

    // Public. Crash-proof for shipped clients: required keys are always arrays (G13 hotfix).
    @Get('sale')
    async cats(): Promise<IStorefrontResponse> {
        return this.catService.storefront();
    }

    /**
     * Retired (3c review, pre-existing hole): this route copied any cat to the caller for free, so a
     * signed-in user could take a paid catalogue cat (an id from the public GET /cat/sale), a quest
     * reward template or another player's paid portrait. No cat is free to self-adopt: rescue
     * catalogue cats are bought (Stripe, Stellar, packs), reward cats come from quests and redeem
     * codes, and gifts are moderator only. No client calls it; the route stays so shipped clients get
     * the usual `{success: false}` answer instead of a 404.
     */
    @UseGuards(AppAuthGuard)
    @Get('adopt/:_id')
    async adopt(): Promise<{ success: boolean; message: string; cat?: ICat }> {
        return { success: false, message: SELF_ADOPT_RETIRED_MESSAGE };
    }

    // The cat nap. Owner-filtered and atomic (G5 P1, W1 security hotfix): another user's cat is 404;
    // at most 3 cats nap at once (G5 P2).
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(CAT_NAP_USER_THROTTLE)
    @Get('stake/:_id')
    async stake(@Param('_id') _id: string, @USER_ID() userId: string): Promise<IStakeResponse> {
        return this.catStakingService.stake(_id, userId);
    }

    // Pays once per finished nap, whatever the number of parallel calls; returns the real reward.
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(CAT_NAP_USER_THROTTLE)
    @Get('stake-reward/:_id')
    async stakeReward(@Param('_id') _id: string, @USER_ID() userId: string): Promise<IStakeRewardResponse> {
        return this.catStakingService.claim(_id, userId);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('gift/:catId/:userId')
    async gift(@Param('catId') catId: string, @Param('userId') userId: string): Promise<IResponse> {
        if (!Types.ObjectId.isValid(catId) || !Types.ObjectId.isValid(userId)) {
            throw new BadRequestException('Entities can not be found');
        }
        // Ownership dedupe lives in CatService.adopt: by blessing or source cat, never by name (G3).
        const adoption = await this.catService.adopt(catId, userId, undefined, undefined, 'adopt');
        if (!adoption.success) {
            if (adoption.message === 'Entities can not be found') {
                throw new BadRequestException(adoption.message);
            }
            return { success: false, message: adoption.message };
        }
        // A gift is not a purchase: `spent` and `monthSpent` are not touched (G4).
        await this.userRepository.update(userId, { $inc: { monthCatsAdopted: 1 } });
        return RESPONSES.success;
    }

    @UseGuards(AppAuthGuard)
    @Get(':_id/activate')
    async activate(@Param('_id') _id: string, @USER_ID() userId: string): Promise<IResponse> {
        const catToActivate = await this.repository.findOne({
            searchObject: { _id },
            projection: '-_id owner',
        });
        if (catToActivate.owner?.toString() !== userId?.toString()) {
            throw new UnauthorizedException('You do not have any rights to take care of this cat');
        }
        await this.userRepository.update(userId, { cat: new Types.ObjectId(_id) });

        return RESPONSES.success;
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('blueprint')
    async getBlueprints(): Promise<Cat[]> {
        return this.repository.find({
            searchObject: { isBlueprint: true },
            projection: '-code',
        });
    }

    /** CMS: open (or resolved) name reports grouped per cat. Never includes reporter ids (G3). */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('name-reports')
    async nameReports(@Query('status') status?: string, @Query('page') page?: string): Promise<INameReportGroup[]> {
        return this.names().listReports(status, page);
    }

    // Public cat page. A guest's starter is private until promotion (G1, decision #13): 404.
    @Get(':id')
    async findOne(@Param('id') _id: string): Promise<Cat> {
        const cat = await this.repository.findOne({
            searchObject: { _id },
            projection: '-code',
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
        });
        if (cat?.isGuestStarter) {
            throw new NotFoundException('Cat does not exist');
        }
        return cat;
    }

    // NFT metadata is fetched by marketplace crawlers from a few shared IPs, so the per-IP global
    // limit would cut them off. Both routes are public, read-only and return fixed fields.
    @SkipThrottle()
    @Get('nft/metadata')
    async nftmetadata(): Promise<{ name: string; description: string; image: string; external_link: string }> {
        return {
            name: 'Token Tails Cat',
            description: 'A collection of real cats linked with a virtual cats',
            image: 'https://tokentails.com/logo/logo.webp',
            external_link: 'https://tokentails.com',
        };
    }

    @UseGuards(AppAuthGuard)
    @Get('redeem/:catCode')
    async redeemCat(
        @USER_ID() userId: string,
        @Param('catCode') catId: string
    ): Promise<{ success: boolean; message: string; cat?: ICat }> {
        if (!catRedeemCodes[catId.toLowerCase() as keyof typeof catRedeemCodes]) {
            return { success: false, message: 'Code is invalid' };
        }
        const adoption = await this.catService.adopt(
            catRedeemCodes[catId.toLowerCase() as keyof typeof catRedeemCodes],
            userId,
            undefined,
            undefined,
            'redeem'
        );
        if (!adoption.success) {
            return { success: false, message: adoption.message };
        }
        return { success: true, message: 'Cat redeemed successfully', cat: adoption.cat! };
    }

    @SkipThrottle()
    @Get('nft/:tokenId')
    async nftId(@Param('tokenId') tokenId: string): Promise<{ name: string; description: string; image: string }> {
        // Guest starters have no token id; the filter keeps any that did out of NFT metadata (G1).
        const cat = await this.repository.findOne({
            searchObject: { tokenId, isGuestStarter: { $ne: true } },
            projection: 'name resqueStory catImg',
        });
        return {
            name: cat?.name,
            description: cat?.resqueStory,
            image: cat?.catImg || 'https://tokentails.com/logo/logo.webp',
        };
    }

    @Get('rate/:CurrencyType')
    async getCurrency(@Param('CurrencyType') currencyType: CurrencyType): Promise<{ symbol: string; price: string }> {
        return (await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${currencyType}USDT`)).json();
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Put(':id')
    async updateStatus(
        @USER_ID() userId: string,
        @Param('id') _id: string,
        @AUTH_USER() authUser?: IAuthUser
    ): Promise<IResponse> {
        if (!Types.ObjectId.isValid(_id)) {
            throw new BadRequestException('Invalid cat id');
        }
        const catId = new Types.ObjectId(_id);
        const ownerId = new Types.ObjectId(userId);

        // One conditional write: only the owner can feed, and only while the cat is below the cap.
        // Concurrent requests race on this filter, so at most one of them matches and pays.
        const fedCat = await this.repository.model
            .findOneAndUpdate(
                { _id: catId, owner: ownerId, 'status.EAT': { $not: { $gte: MAX_CAT_STATUS } } },
                { $set: { status: { EAT: MAX_CAT_STATUS } } },
                { projection: { _id: 1 } }
            )
            .lean();

        if (!fedCat) {
            const cat = await this.repository.findOne({ searchObject: { _id: catId }, projection: 'owner' });
            if (!cat) {
                throw new NotFoundException('Cat does not exist');
            }
            if (cat.owner?.toString() !== ownerId.toString()) {
                throw new ForbiddenException('You can only feed your own cat');
            }
            throw new ConflictException('Cat is already full');
        }

        // Guests earn no spendable Tails (G1, decision #7): the feed reward goes to pendingTails,
        // credited on promotion or merge. Banking stops exactly at the lifetime cap (an update
        // pipeline clamps the sum), so a guest never holds more pending Tails than a promotion pays.
        if (isGuestUser(authUser)) {
            await this.userRepository.model.updateOne(
                { _id: ownerId, isGuest: true, pendingTails: { $not: { $gte: GUEST_TAILS_LIFETIME_CAP } } },
                [
                    {
                        $set: {
                            pendingTails: {
                                $min: [
                                    GUEST_TAILS_LIFETIME_CAP,
                                    { $add: [{ $ifNull: ['$pendingTails', 0] }, REWARDS.FEED] },
                                ],
                            },
                        },
                    },
                ]
            );
            return RESPONSES.success;
        }

        const catMultiplier = 1;
        await this.userRepository.update(userId, {
            $inc: {
                ...earnTailsInc(REWARDS.FEED * catMultiplier),
                monthFeeded: 1,
                monthTails: REWARDS.FEED * catMultiplier,
            },
        });

        return RESPONSES.success;
    }

    /**
     * Renames the caller's own starter (G3): one free rename per 30 days, never once minted, the
     * name checked by the shared `normalizeCatName`. Guests may rename their own starter.
     */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Throttle({ default: CAT_RENAME_THROTTLE })
    @Put(':id/name')
    async rename(
        @Param('id') id: string,
        @Body() body: { name?: unknown },
        @USER_ID() userId: string
    ): Promise<IRenameResponse> {
        return this.names().rename(id, userId, body?.name);
    }

    /** "Keep the name": dismisses the one-time legacy rename offer (decision #20). */
    @UseGuards(AppAuthGuard)
    @Delete(':id/name-offer')
    async dismissRenameOffer(@Param('id') id: string, @USER_ID() userId: string): Promise<{ success: true }> {
        return this.names().dismissRenameOffer(id, userId);
    }

    /** Moderation: reset to the breed name, replace, or dismiss. Resolves the cat's open reports. */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Put(':id/name/moderate')
    async moderateName(
        @Param('id') id: string,
        @Body() body: { action?: unknown; name?: unknown },
        @USER_ID() moderatorId: string
    ) {
        return this.names().moderate(id, moderatorId, body);
    }

    /** Reports a player cat name (App Store 1.2). Registered players only; one open report each. */
    @UseGuards(AppAuthGuard, UserThrottlerGuard)
    @UserThrottle(CAT_REPORT_USER_THROTTLE)
    @Throttle({ default: CAT_REPORT_THROTTLE })
    @Post(':id/report')
    async reportName(
        @Param('id') id: string,
        @Body() body: { reason?: unknown; note?: unknown },
        @USER_ID() userId: string
    ): Promise<{ success: true }> {
        return this.names().report(id, userId, body);
    }

    private names(): CatNameService {
        if (!this.catNameService) {
            throw new Error('CatNameService is not registered');
        }
        return this.catNameService;
    }
}
