import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';
import { IUserWallets } from 'src/user/user.schema';

@Schema({ timestamps: true })
export class Shelter extends CommonSchema {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    slug: string;

    @Prop({ required: false })
    country: string;

    @Prop({ required: true })
    description: string;

    @Prop({ required: true })
    address: string;

    @Prop({ required: false })
    website: string;

    @Prop({ required: false })
    facebook: string;

    @Prop({ required: false })
    twitter: string;

    @Prop({ required: false })
    tiktok: string;

    @Prop({ required: true })
    foundedAt: Date;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Image' })
    image: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Blessing' }] })
    blessing: Types.ObjectId[];

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
    users: Types.ObjectId[];

    @Prop({
        required: false,
        _id: false,
        type: Object,
    })
    wallets: IUserWallets;
}

export type ShelterDocument = Shelter & Document;

export type IShelter = Pick<Shelter, keyof Shelter>;

export const ShelterSchema = SchemaFactory.createForClass(Shelter);
ShelterSchema.index({ name: 1 });
ShelterSchema.plugin(uniqueValidator);
