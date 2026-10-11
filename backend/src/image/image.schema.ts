import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';

export enum ImageStyle {
    HIGHNESS = 'highness',
    MONARCH = 'monarch',
    ARISTOCRAT = 'aristocrat',
    COMMANDER = 'commander',
}

/**
 * Where an image came from (bet #3). `portrait`: a `POST /image/portrait` preview upload (public).
 * `yourcat`: the record behind a paid `/yourcat` HD portrait; its `url` is the private original
 * (`s3private://`), so it is never served by `GET /image/:id` and never sold through the legacy
 * checkout routes. Older images have no source.
 */
export const IMAGE_SOURCES = ['portrait', 'yourcat'] as const;
export type ImageSource = typeof IMAGE_SOURCES[number];

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

    /**
     * The generated portrait. For a `source: 'portrait'` image it is the private 4K output
     * (`s3private://portraits/<uuid>.png`) until its order is COMPLETE, then a public copy (KI-08); routes
     * serve `previewUrl` in its place before that (image.controller.ts `portraitView`).
     */
    @Prop({ required: false })
    aiUrl: string;

    /** Public, watermarked ~1024 px webp of a `source: 'portrait'` output, shown before payment (KI-08). */
    @Prop({ required: false })
    previewUrl?: string;

    @Prop({ required: false })
    style: ImageStyle;

    // The user (or guest) who uploaded it (bet #3). Absent on images created before; regenerate checks it.
    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    owner?: Types.ObjectId;

    @Prop({ type: String, enum: IMAGE_SOURCES, required: false })
    source?: ImageSource;
}

export type IImage = Pick<Image, keyof Image>;

export type IImageSingle = IImage;

export type ImageDocument = Image & Document;

export const ImageSchema = SchemaFactory.createForClass(Image);
ImageSchema.index({ createdAt: 1 });
ImageSchema.index({ owner: 1 }, { sparse: true });
ImageSchema.plugin(uniqueValidator);
