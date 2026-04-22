import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';

export enum ImageStyle {
    HIGHNESS = 'highness',
    MONARCH = 'monarch',
    ARISTOCRAT = 'aristocrat',
    COMMANDER = 'commander',
}

@Schema({ timestamps: true })
export class Image extends CommonSchema {
    @Prop()
    title: string;

    @Prop()
    name: string;

    @Prop()
    caption: string;

    @Prop({ default: false })
    isTemporary: boolean;

    @Prop({ required: true })
    url: string;

    @Prop({ required: false })
    aiUrl: string;

    @Prop({ required: false })
    style: ImageStyle;
}

export type IImage = Pick<Image, keyof Image>;

export type IImageSingle = IImage;

export type ImageDocument = Image & Document;

export const ImageSchema = SchemaFactory.createForClass(Image);
ImageSchema.index({ createdAt: 1 });
ImageSchema.plugin(uniqueValidator);
