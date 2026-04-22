import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Article, ArticleDocument } from './article.schema';

@Injectable()
export class ArticleRepository extends BaseRepository<ArticleDocument> {
    constructor(
        @InjectModel(Article.name)
        protected collectionModel: Model<ArticleDocument>
    ) {
        super(collectionModel);
    }
}
