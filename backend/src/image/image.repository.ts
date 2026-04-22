import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Image, ImageDocument } from './image.schema';

@Injectable()
export class ImageRepository extends BaseRepository<ImageDocument> {
    constructor(
        @InjectModel(Image.name)
        protected collectionModel: Model<ImageDocument>
    ) {
        super(collectionModel);
    }
}
