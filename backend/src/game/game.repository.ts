import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Game, GameDocument } from './game.schema';

@Injectable()
export class GameRepository extends BaseRepository<GameDocument> {
    constructor(
        @InjectModel(Game.name)
        protected collectionModel: Model<GameDocument>
    ) {
        super(collectionModel);
    }
}
