import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';

export interface ISave {
    type: EntityType;
    entity: Types.ObjectId;
}

export interface ISaved {
    type: EntityType;
    entity: Types.ObjectId;
    isLiked: boolean;
}

export enum QUEST {
    FOLLOW_TG_CHANNEL = 'FOLLOW_TG_CHANNEL',
    FOLLOW_TG_GROUP = 'FOLLOW_TG_GROUP',
    FOLLOW_X = 'FOLLOW_X',
    FOLLOW_X_FOUNDER = 'FOLLOW_X_FOUNDER',
    FOLLOW_DISCORD = 'FOLLOW_DISCORD',
    FOLLOW_IG = 'FOLLOW_IG',
    FOLLOW_TIKTOK = 'FOLLOW_TIKTOK',
    FOLLOW_LINKEDIN = 'FOLLOW_LINKEDIN',
    REACH_TAILS_1k = 'REACH_TAILS_1k',
    REACH_TAILS_10k = 'REACH_TAILS_10k',
    REACH_TAILS_50k = 'REACH_TAILS_50k',
    REACH_TAILS_100k = 'REACH_TAILS_100k',
    INVITE_FRIENDS_10 = 'INVITE_FRIENDS_10',
    INVITE_FRIENDS_50 = 'INVITE_FRIENDS_35',
    INVITE_FRIENDS_100 = 'INVITE_FRIENDS_100',
    CATNIP_CHAOS_1 = 'CATNIP_CHAOS_1',
    CATNIP_CHAOS_2 = 'CATNIP_CHAOS_2',
    CATNIP_CHAOS_3 = 'CATNIP_CHAOS_3',
    CATNIP_CHAOS_4 = 'CATNIP_CHAOS_4',
    CATNIP_CHAOS_5 = 'CATNIP_CHAOS_5',
    CATNIP_CHAOS_6 = 'CATNIP_CHAOS_6',
    CATNIP_CHAOS_7 = 'CATNIP_CHAOS_7',
    CATNIP_CHAOS_8 = 'CATNIP_CHAOS_8',
    CATNIP_CHAOS_9 = 'CATNIP_CHAOS_9',
    CATNIP_CHAOS_10 = 'CATNIP_CHAOS_10',
    CATNIP_CHAOS_11 = 'CATNIP_CHAOS_11',
    CATNIP_CHAOS_12 = 'CATNIP_CHAOS_12',
    CATNIP_CHAOS_13 = 'CATNIP_CHAOS_13',
    CATNIP_CHAOS_14 = 'CATNIP_CHAOS_14',
    CATNIP_CHAOS_15 = 'CATNIP_CHAOS_15',
    CATNIP_CHAOS_16 = 'CATNIP_CHAOS_16',
    CATNIP_CHAOS_17 = 'CATNIP_CHAOS_17',
    CATNIP_CHAOS_18 = 'CATNIP_CHAOS_18',
    CATNIP_CHAOS_19 = 'CATNIP_CHAOS_19',
    CATNIP_CHAOS_20 = 'CATNIP_CHAOS_20',
    PIXEL_RESCUE_LEVEL = 'PIXEL_RESCUE_LEVEL',
}

export const QuestTypeReward: Record<
    QUEST,
    {
        tails?: number;
        requirements?: { tails?: number; referrals?: number };
        boxes?: number;
        cats?: string[];
    }
> = {
    [QUEST.FOLLOW_TG_CHANNEL]: { tails: 10 },
    [QUEST.FOLLOW_TG_GROUP]: { tails: 10 },
    [QUEST.FOLLOW_X]: { tails: 10 },
    [QUEST.FOLLOW_X_FOUNDER]: { tails: 50 },
    [QUEST.FOLLOW_DISCORD]: { tails: 10 },
    [QUEST.FOLLOW_IG]: { tails: 10 },
    [QUEST.FOLLOW_TIKTOK]: { tails: 10 },
    [QUEST.FOLLOW_LINKEDIN]: { tails: 10 },
    [QUEST.REACH_TAILS_1k]: { tails: 100, requirements: { tails: 1000 } },
    [QUEST.REACH_TAILS_10k]: { tails: 1000, requirements: { tails: 10000 } },
    [QUEST.REACH_TAILS_50k]: { tails: 5000, requirements: { tails: 50000 } },
    [QUEST.REACH_TAILS_100k]: { tails: 10000, requirements: { tails: 100000 } },
    [QUEST.INVITE_FRIENDS_10]: { tails: 100, requirements: { referrals: 10 } },
    [QUEST.INVITE_FRIENDS_50]: { tails: 500, requirements: { referrals: 50 } },
    [QUEST.INVITE_FRIENDS_100]: { tails: 1000, requirements: { referrals: 100 } },
    [QUEST.PIXEL_RESCUE_LEVEL]: { tails: 10000 },
    [QUEST.CATNIP_CHAOS_1]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_2]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_3]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_4]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_5]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_6]: { boxes: 1, cats: ['689485502d20b2a537804e65'] },
    [QUEST.CATNIP_CHAOS_7]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_8]: {
        boxes: 1,
        cats: ['68fe604fd7487b331d8c590d', '68fe63a5d7487b331d8c60f7', '68fe646ad7487b331d8c63de'],
    },
    [QUEST.CATNIP_CHAOS_9]: {
        boxes: 1,
        cats: ['6907a5c4db326c19979c13f1'],
    },
    [QUEST.CATNIP_CHAOS_10]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_11]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_12]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_13]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_14]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_15]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_16]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_17]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_18]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_19]: { boxes: 1 },
    [QUEST.CATNIP_CHAOS_20]: { boxes: 1 },
};

export interface IEncryptedMessage {
    iv: string;
    content: string;
}

export interface IWallet {
    walletAddress: string;
    walletPrivateKey: IEncryptedMessage;
}

export interface IUserWallets {
    stellar: IWallet;
    evm: IWallet;
}

@Schema({ timestamps: true })
export class User extends CommonSchema {
    @Prop({ required: true })
    name: string;

    @Prop({ required: false })
    email: string;

    @Prop({ required: false })
    telegramId: string;

    @Prop({ required: false })
    twitter: string;

    @Prop({ required: false })
    discount: string;

    // HOW MUCH USER EARNED FROM AFFILIATE PROGRAM
    @Prop({ required: false, default: 0 })
    affiliated: number;

    @Prop({ required: false })
    discord: string;

    @Prop({ required: false })
    telegramUsername: string;

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    wallets: IUserWallets;

    @Prop({ required: false, default: [] })
    quests: (QUEST | string)[];

    @Prop({ required: false, default: 0 })
    streak: number;

    @Prop({ required: false, default: 0 })
    tails: number;

    @Prop({ required: false, default: 0 })
    catnipCount: number;

    @Prop({ required: false, default: [] })
    catnipChaos: number[];

    @Prop({ required: false, default: 0 })
    catnipChaosCount: number;

    @Prop({ required: false, default: [] })
    seasonEvent: number[];

    @Prop({ required: false, default: 0 })
    seasonEventCount: number;

    @Prop({ required: false, default: [] })
    match3: number[];

    @Prop({ required: false, default: 0 })
    match3Count: number;

    @Prop({ required: false, default: [] })
    match3Score: number[];

    @Prop({ required: false, default: 0 })
    match3ScoreCount: number;

    @Prop({ required: false, default: 0 })
    monthPacks: number;

    @Prop({ required: false, default: 0 })
    boxes: number;

    @Prop({ required: false, default: 0 })
    spent: number;

    @Prop({ required: false, default: true })
    canRedeemLives: boolean;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    referrals: string[];

    @Prop({ required: false, default: 0 })
    referralsCount: number;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    referredBy: string;

    @Prop({ default: PERMISSION_LEVEL.USER })
    permission: PERMISSION_LEVEL;

    @Prop({
        _id: false,
        type: [
            {
                entity: { type: Types.ObjectId, required: true },
                type: { type: String, required: true },
            },
        ],
    })
    likes: ISave[];

    @Prop({ type: Types.ObjectId, ref: 'Cat' })
    cat?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Shelter' })
    shelter?: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Cat' }], default: [] })
    cats?: Types.ObjectId[];

    @Prop({ required: false, type: Date })
    interactedAt?: Date;

    @Prop({ required: false, default: 0 })
    monthTails: number;
    @Prop({ required: false, default: 0 })
    monthCatsAdopted: number;
    @Prop({ required: false, default: 0 })
    monthBoxes: number;
    @Prop({ required: false, default: 0 })
    monthSpent: number;
    @Prop({ required: false, default: 0 })
    monthFeeded: number;
    @Prop({ required: false, default: 0 })
    monthStreak: number;
    @Prop({ required: false, default: 0 })
    monthReferrals: number;
    @Prop({ required: false, default: 0 })
    monthTailsCrafted: number;
    @Prop({ required: false, default: 0 })
    portraitPurchases: number;
    @Prop({ required: false, default: 0 })
    monthPortraitPurchases: number;
    @Prop({ required: false })
    codex: number[];
    @Prop({ required: false, default: [] })
    airdropRewardsClaimed: string[];
    @Prop({ required: false, default: [] })
    airdropChallengesClaimed: string[];
    @Prop({ required: false, default: [] })
    airdropMilestonesClaimed: string[];
}

export interface IMealPlan {
    date: Date | string;
    meals: Types.ObjectId[];
}

export type UserDocument = User & Document;

export type IUser = Pick<User, keyof User>;

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ likes: 1 });
UserSchema.index({ shelter: 1 });
UserSchema.index({ cat: 1 });
UserSchema.index({ twitter: 1 });
UserSchema.index({ spent: 1 });
UserSchema.index({ discount: 1 });
UserSchema.index({ telegramId: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ tails: 1 });
UserSchema.index({ catnipCount: 1 });
UserSchema.index({ canRedeemLives: 1 });
UserSchema.plugin(uniqueValidator);
