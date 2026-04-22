import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Quest, QuestDocument } from './quest.schema';

@Injectable()
export class QuestRepository extends BaseRepository<QuestDocument> {
    constructor(
        @InjectModel(Quest.name)
        protected collectionModel: Model<QuestDocument>
    ) {
        super(collectionModel);
    }
}
