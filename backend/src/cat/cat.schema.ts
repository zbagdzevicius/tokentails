import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import { PackType } from 'src/web3/order.schema';

export enum StatusType {
    EAT = 'EAT',
}
export type IStatusValue = 0 | 1 | 2 | 3 | 4 | number;

export type IStatus = Partial<Record<StatusType, IStatusValue>>;

export enum Tier {
    COMMON = 'COMMON',
    RARE = 'RARE',
    EPIC = 'EPIC',
    LEGENDARY = 'LEGENDARY',
}

export enum CatOriginType {
    BLACK = 'BLACK',
    GREY = 'GREY',
    PINKIE = 'PINKIE',
    SIAMESE = 'SIAMESE',
    YELLOW = 'YELLOW',
    WHITE = 'WHITE',
    MAINE = 'MAINE',
    PEACHES = 'PEACHES',
    OREO = 'OREO',
    MIST = 'MIST', //SIAMESE LIKE CAT
    FOLD = 'FOLD', //WHITE ORANGE CTA WITH FOLDED EARS
    OBSIDIAN = 'OBSIDIAN', //BLACK CAT WITH COLOUR EYES
    SAVANHAN = 'SAVANHAN', // BROWN CAT WITH ORANGE LIEK STRIPES
    BALINESE = 'BALINESE', //SIAMESE LIKE CAT
    OBI = 'OBI', // FULY BROWN CAT
    OLIVE = 'OLIVE', //LIGHT GRAY CAT WITH GRAY STRIPES
    PICKLES = 'PICKLES', //GRAY CAT WITH DARK GRAY STRIPES
    RASCAL = 'RASCAL', //ORNAGE CAT WITH WHITE
    SABLE = 'SABLE', //DARK BROWN CAT WITH WHITE
    FICUS = 'FICUS', //DARK CAT WITH WHITE
    MERLOT = 'MERLOT', //MAINE COONE LIKE CAT
    TROUFAS = 'TROUFAS', //FULL BLACK CAT
}

export enum CatAbilityType {
    ICE = 'ICE',
    ELECTRIC = 'ELECTRIC',
    FIRE = 'FIRE',
    WIND = 'WIND',
    DARK = 'DARK',
    WATER = 'WATER',
    GRASS = 'GRASS',
    SAND = 'SAND',
    FAIRY = 'FAIRY',
    STELLAR = 'STELLAR',
}

export const CatAbilityTypes = [
    CatAbilityType.ICE,
    CatAbilityType.ELECTRIC,
    CatAbilityType.FIRE,
    CatAbilityType.WIND,
    CatAbilityType.DARK,
    CatAbilityType.WATER,
    CatAbilityType.GRASS,
    CatAbilityType.SAND,
    CatAbilityType.FAIRY,
    CatAbilityType.STELLAR,
];

export enum EmoteType {
    DIGGING = 'DIGGING',
    GROOMING = 'GROOMING',
    HIT = 'HIT',
    IDLE = 'IDLE',
    JUMPING = 'JUMPING',
    LOAF = 'LOAF',
    RUNNING = 'RUNNING',
    SITTING = 'SITTING',
    SLEEP = 'SLEEP',
    WALKING = 'WALKING',
}

export const catAbilityTypes = Object.values(CatAbilityType);

export const MAX_CAT_STATUS = 4;

@Schema({ _id: false, versionKey: false })
export class CatStatus {
    @Prop({ required: true })
    EAT: number;
}

export interface IMintedNFTs {
    stellar?: string;
    sei?: string;
}

@Schema({ timestamps: true })
export class Cat extends CommonSchema {
    @Prop({ required: true })
    name: string;

    @Prop({ required: false })
    packed: boolean;

    @Prop({ required: false })
    resqueStory: string;

    @Prop({ required: true })
    type: CatAbilityType;

    @Prop({ required: true })
    tier: Tier;

    @Prop({ required: false })
    packType: PackType;

    @Prop({ required: false, default: false })
    isBlueprint: boolean;

    // full path to sprites img
    @Prop({ required: true })
    spriteImg: string;

    // full path to GIF img
    @Prop({ required: true })
    catImg: string;

    @Prop({ required: false })
    staked?: Date;

    @Prop({ required: true, type: CatStatus })
    status: CatStatus;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    owner?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Blessing' })
    blessing: Types.ObjectId;

    @Prop({ required: false })
    tokenId?: number;

    @Prop({ type: Types.ObjectId, ref: 'Shelter' })
    shelter?: Types.ObjectId;

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    token?: Partial<IMintedNFTs>;
}

export type CatDocument = Cat & Document;

export type ICat = Pick<Cat, keyof Cat>;

export const CatSchema = SchemaFactory.createForClass(Cat);
CatSchema.index({ tokenId: 1 });
CatSchema.index({ nftId: 1 });
CatSchema.index({ name: 1 });
CatSchema.index({ packed: 1 });
CatSchema.index({ updatedAt: -1 });
CatSchema.index({ isBlueprint: 1 });
CatSchema.index({ blessing: 1, owner: 1 });
CatSchema.plugin(uniqueValidator);
