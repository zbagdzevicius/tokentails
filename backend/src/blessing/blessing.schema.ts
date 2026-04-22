import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { ICat } from 'src/cat/cat.schema';
import { CommonSchema } from 'src/common/common.schema';

export enum BlessingStatus {
    WAITING = 'WAITING',
    RECOVERING = 'RECOVERING',
    ADOPTED = 'ADOPTED',
    HEAVEN = 'HEAVEN',
}

export interface IMintedNFTs {
    stellar?: string;
    evm?: string;
}

export type ICustomBlessing = Pick<
    IBlessing,
    '_id' | 'shelter' | 'image' | 'status' | 'instagram' | 'name' | 'description' | 'catAvatar' | 'savior'
> &
    Pick<ICat, 'type' | 'resqueStory' | 'spriteImg' | 'catImg'>;

@Schema({ timestamps: true })
export class Blessing extends CommonSchema {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    description: string;

    @Prop({ required: true })
    status: BlessingStatus;

    @Prop({ required: false, type: Types.ObjectId, ref: 'Image' })
    savior: Types.ObjectId;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Image' })
    image: Types.ObjectId;

    @Prop({ required: false })
    instagram?: string;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    creator?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Cat' })
    cat?: Types.ObjectId;

    @Prop({ required: false, type: Types.ObjectId, ref: 'Image' })
    catAvatar?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Shelter' })
    shelter?: Types.ObjectId;

    @Prop({ required: false })
    tokenId?: number;

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    token?: Partial<IMintedNFTs>;
}

export type BlessingDocument = Blessing & Document;

export type IBlessing = Pick<Blessing, keyof Blessing>;

export const BlessingSchema = SchemaFactory.createForClass(Blessing);
BlessingSchema.index({ shelter: 1 });
BlessingSchema.index({ nftId: 1 });
BlessingSchema.plugin(uniqueValidator);
