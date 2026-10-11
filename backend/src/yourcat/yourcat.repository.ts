import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { YourCat, YourCatDocument } from './yourcat.schema';

@Injectable()
export class YourcatRepository extends BaseRepository<YourCatDocument> {
    constructor(
        @InjectModel(YourCat.name)
        protected collectionModel: Model<YourCatDocument>
    ) {
        super(collectionModel);
    }
}
