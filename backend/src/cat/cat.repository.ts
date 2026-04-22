import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Cat, CatDocument } from './cat.schema';

@Injectable()
export class CatRepository extends BaseRepository<CatDocument> {
    constructor(
        @InjectModel(Cat.name)
        protected collectionModel: Model<CatDocument>
    ) {
        super(collectionModel);
    }
}
