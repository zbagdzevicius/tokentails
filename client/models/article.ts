import { ICategory } from './category';
import { IComment } from './comment';
import { IImage } from './image';
import { EntityType } from './save';

export interface IArticleExcerpt {
    _id: string;
    title: string;
    slug: string;
    featuredImage: IImage;
    excerpt: string;
    category: ICategory;
    createdAt: string;
    type: EntityType.ARTICLE;
    comments: IComment[];
}

export interface IArticle extends IArticleExcerpt {
    content: string;
    images: IImage[];
    keyword?: { name: string };
    user: any;
    createdAt: string;
    updatedAt: string;
    relatedArticles: IArticle[];
}
