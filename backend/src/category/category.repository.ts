import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Category, CategoryDocument } from './category.schema';

@Injectable()
export class CategoryRepository extends BaseRepository<CategoryDocument> {
    constructor(
        @InjectModel(Category.name)
        protected collectionModel: Model<CategoryDocument>
    ) {
        super(collectionModel);
    }
}
