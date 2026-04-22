import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Type } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { Document, Types } from 'mongoose';
import * as uniqueValidator from 'mongoose-unique-validator';
import { Category } from 'src/category/category.schema';
import { CommonSchema } from 'src/common/common.schema';
import { SearchModel } from 'src/common/validators';
import { EntityType } from 'src/shared/interfaces/common.interface';

@Schema({ timestamps: true })
export class Article extends CommonSchema {
    @Prop({ required: true, unique: true, dropDups: true })
    title: string;

    @Prop({ unique: true, dropDups: true })
    slug: string;

    @Prop({ required: true })
    content: string;

    @Prop({ required: true })
    excerpt: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'Image' })
    featuredImage: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Image' }] })
    images: Types.ObjectId[];

    @Prop({ required: true, type: Types.ObjectId, ref: 'Category' })
    category: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    likes: Types.ObjectId[];

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Comment' }], default: [] })
    comments: Types.ObjectId[];

    @Prop({ required: true })
    isDisabled: boolean;

    relatedArticles: Article[];

    type = EntityType.ARTICLE;
}

export type IArticle = Pick<Article, keyof Article>;

export interface IArticleSingle extends Pick<IArticle, Exclude<keyof IArticle, 'category'>> {
    category: Category;
}

export type ArticleDocument = Article & Document;

export const ArticleSchema = SchemaFactory.createForClass(Article);
ArticleSchema.index({ slug: 1, createdAt: 1 });
ArticleSchema.index({ category: 1 });
ArticleSchema.index({ content: 1 });
ArticleSchema.index({ isDisabled: 1 });
ArticleSchema.plugin(uniqueValidator);

export class ArticleSearchModel extends SearchModel {
    @IsOptional()
    @Type(() => String)
    category?: string;
}
