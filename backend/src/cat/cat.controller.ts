import { BadRequestException, Controller, Get, Param, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Types } from 'mongoose';
import fetch from 'node-fetch';
import { Cat, CatStatus, ICat, MAX_CAT_STATUS, Tier } from 'src/cat/cat.schema';
import { IResponse, RESPONSES } from 'src/shared/constants/common';
import { REWARDS } from 'src/shared/constants/rewards';
import { USER_ID } from 'src/shared/decorators/user.decorator';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { currencyRate, CurrencyType } from 'src/shared/interfaces/currency.interface';
import { IShelter } from 'src/shelter/shelter.schema';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { UserRepository } from 'src/user/user.repository';
import { CatRepository } from './cat.repository';
import { CatService } from './cat.service';

const catRedeemCodes = {
    gamenight: '6901f2b47393705e27bc6562',
    impact: '69068b949e82bafcb6e35206',
};

const weekInMs = 604800000;

const getTailsCraft = (cat: ICat) => {
    if (!cat.blessing) {
        return 10;
    }
    if (cat.tier === Tier.COMMON) {
        return 100;
    }
    if (cat.tier === Tier.RARE) {
        return 500;
    }
    if (cat.tier === Tier.EPIC) {
        return 2000;
    }
    if (cat.tier === Tier.LEGENDARY) {
        return 10000;
    }
    return 10;
};

@Controller('cat')
export class CatController {
    constructor(
        private repository: CatRepository,
        private userRepository: UserRepository,
        private catService: CatService
    ) {}

    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async saveLinkedArticlesCount() {
        this.repository.updateAll({
            status: {
                EAT: 0,
            },
        });
    }

    @Get('rates')
    async getRates(): Promise<Record<CurrencyType, number>> {
        const rates = await fetch(
            `https://api.binance.com/api/v3/ticker/price?symbols=["BNBUSDC","SOLUSDC","XLMUSDC","SEIUSDC","ETHUSDC"]`
        ).then(res => res.json());

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

    @Get('sale')
    async cats(): Promise<Record<string, ICat[]>> {
        const tokentailsFind = this.repository.find({
            pipelineStages: [{ $sample: { size: 10 } }],
            searchObject: { isBlueprint: true },
            projection: '-code',
        });
        const blessedCatsForSaleFind = this.repository.find({
            searchObject: { blessing: { $exists: true }, owner: { $exists: false } },
            projection: '-code',
            populate: [
                {
                    path: 'blessing',
                    populate: [
                        { path: 'image', select: 'url' },
                        { path: 'catAvatar', select: 'url' },
                    ],
                },
                { path: 'shelter', select: 'country name image slug', populate: [{ path: 'image', select: 'url' }] },
            ],
        });

        const [tokentails, blessedCatsForSale] = await Promise.all([tokentailsFind, blessedCatsForSaleFind]);
        const blessedCatsByShelter = blessedCatsForSale.reduce((acc, cat) => {
            const shelterName = (cat.shelter as unknown as IShelter)?.slug || 'unknown';
            if (!acc[shelterName]) {
                acc[shelterName] = [];
            }
            acc[shelterName].push(cat);
            return acc;
        }, {} as Record<string, ICat[]>);

        return {
            tokentails,
            ...blessedCatsByShelter,
        };
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('adopt/:_id')
    async adopt(
        @Param('_id') _id: string,
        @USER_ID() userId: string
    ): Promise<{ success: boolean; message: string; cat?: ICat }> {
        return this.catService.adopt(_id, userId);
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('stake/:_id')
    async stake(@Param('_id') _id: string): Promise<IResponse> {
        const catToStake = await this.repository.findOne({
            searchObject: { _id },
            projection: '-_id staked',
        });
        if (!catToStake) {
            throw new BadRequestException('Cat not found');
        }
        await this.repository.update(_id, {
            staked: new Date(new Date().getTime() + weekInMs),
        });

        return { success: true, message: "cat successfully staked, you'll be able to redeem $TAILS in a week" };
    }

    @UseGuards(AuthGuard('appauth'))
    @Get('stake-reward/:_id')
    async stakeReward(@Param('_id') _id: string, @USER_ID() userId: string): Promise<IResponse> {
        const catToStake = await this.repository.findOne({
            searchObject: { _id },
            projection: '-_id staked blessing tier',
        });
        if (!catToStake) {
            throw new BadRequestException('Cat not found');
        }
        if (!catToStake.staked) {
            throw new BadRequestException('Cat is not staked');
        }
        if (new Date(catToStake.staked).getTime() > new Date().getTime()) {
            return { success: false, message: 'Cat staking period is running' };
        }
        const tails = getTailsCraft(catToStake);
        await this.userRepository.update(userId, {
            $inc: { tails, monthTailsCrafted: tails, monthTails: tails },
            $unset: { staked: 1 },
        });

        return { success: true, message: `${tails} $tails distributed successfully` };
    }

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('gift/:catId/:userId')
    async gift(@Param('catId') catId: string, @Param('userId') userId: string): Promise<IResponse> {
        const catToAdopt = await this.repository.findOne({
            searchObject: { _id: catId },
            projection: '_id',
        });
        const user = await this.userRepository.findOne({
            searchObject: { _id: userId },
            projection: 'cats',
            populate: [{ path: 'cats', select: 'name' }],
        });
        if (!catToAdopt || !user) {
            throw new BadRequestException('Entities can not be found');
        }

        const isOwned = (user.cats as unknown as ICat[])?.find(cat => cat.name === catToAdopt.name);
        if (isOwned) {
            return { success: false, message: 'User already owns this NFT cat' };
        }

        try {
            await this.catService.adopt(catToAdopt._id!, user._id!);
            await this.userRepository.update(user.id!, { $inc: { monthCatsAdopted: 1, monthSpent: 1, spent: 1 } });
            return RESPONSES.success;
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Something went wrong, please try again later' };
        }
    }

    @UseGuards(AuthGuard('appauth'))
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

    @UseGuards(AuthGuard('appauth'), PermissionGuard(PERMISSION_LEVEL.MODERATOR))
    @Get('blueprint')
    async getBlueprints(): Promise<Cat[]> {
        return this.repository.find({
            searchObject: { isBlueprint: true },
            projection: '-code',
        });
    }

    @Get(':id')
    async findOne(@Param('id') _id: string): Promise<Cat> {
        return this.repository.findOne({
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
    }

    @Get('nft/metadata')
    async nftmetadata(): Promise<{ name: string; description: string; image: string; external_link: string }> {
        return {
            name: 'Token Tails Cat',
            description: 'A collection of real cats linked with a virtual cats',
            image: 'https://tokentails.com/logo/logo.webp',
            external_link: 'https://tokentails.com',
        };
    }

    @UseGuards(AuthGuard('appauth'))
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
            userId
        );
        return { success: true, message: 'Cat redeemed successfully', cat: adoption.cat! };
    }

    @Get('nft/:tokenId')
    async nftId(@Param('tokenId') tokenId: string): Promise<{ name: string; description: string; image: string }> {
        const cat = await this.repository.findOne({
            searchObject: { tokenId },
            projection: 'name resqueStory catImg',
        });
        return {
            name: cat?.name,
            description: cat?.resqueStory,
            image: cat?.catImg || 'https://tokentails.com/logo/logo.webp',
        };
    }

    // MULTIPLE e.g.
    // https://api.binance.com/api/v3/ticker/price?symbols=["BNBUSDT","ETHUSDT","XLMUSDT"]
    @Get('rate/:CurrencyType')
    async getCurrency(@Param('CurrencyType') currencyType: CurrencyType): Promise<{ symbol: string; price: string }> {
        return (await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${currencyType}USDT`)).json();
    }

    @UseGuards(AuthGuard('appauth'))
    @Put(':id')
    async updateStatus(@USER_ID() userId: string, @Param('id') _id: string): Promise<IResponse> {
        const [cat, user] = await Promise.all([
            this.repository.findOne({
                searchObject: { _id },
                projection: 'status tokenId blessing',
            }),
            this.userRepository.findOne({
                searchObject: { _id: new Types.ObjectId(userId) },
                projection: 'wallets',
            }),
        ]);
        if (!cat || !user) {
            throw new BadRequestException('Cat does not exist');
        }
        if (cat.status.EAT >= MAX_CAT_STATUS) {
            throw new BadRequestException('Cat is already full');
        }
        const newStatus: CatStatus = {
            EAT: MAX_CAT_STATUS,
        };
        await this.repository.update(cat._id, { status: newStatus });
        const catMultiplier = 1;
        await this.userRepository.update(userId, {
            $inc: { tails: REWARDS.FEED * catMultiplier, monthFeeded: 1, monthTails: REWARDS.FEED * catMultiplier },
        });

        return RESPONSES.success;
    }
}
