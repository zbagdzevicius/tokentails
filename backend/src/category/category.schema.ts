import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { CommonSchema } from 'src/common/common.schema';

@Schema({ timestamps: true })
export class Category extends CommonSchema {
    @Prop({ required: true, unique: true, dropDups: true })
    name: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Image' })
    image: string;

    @Prop({ required: true })
    description: string;

    @Prop({ required: true, unique: true, dropDups: true })
    slug: string;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Article' }], default: [] })
    articles: Types.ObjectId[];

    @Prop({ default: 0 })
    articlesCount: number;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Quiz' }], default: [] })
    quizes: Types.ObjectId[];

    @Prop({ default: 0 })
    quizesCount: number;
}

export type CategoryDocument = Category & Document;

export type ICategory = Pick<Category, keyof Category>;

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ slug: 1, articlesCount: 1 });
CategorySchema.plugin(uniqueValidator);
