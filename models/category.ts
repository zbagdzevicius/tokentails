import { IArticle } from './article';

export interface ICategory {
    name: string;
    slug: string;
}

export interface ICategoryArticles extends ICategory {
    articles: IArticle[];
}
