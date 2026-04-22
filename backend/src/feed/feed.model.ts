import { IArticle } from 'src/article/article.schema';
import { EntityType } from 'src/shared/interfaces/common.interface';

export type IFeedEntity = IArticle & { type: EntityType };
