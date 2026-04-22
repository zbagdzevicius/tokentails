import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Comment, CommentDocument } from './comment.schema';

@Injectable()
export class CommentRepository extends BaseRepository<CommentDocument> {
    constructor(
        @InjectModel(Comment.name)
        protected collectionModel: Model<CommentDocument>
    ) {
        super(collectionModel);
    }
}
