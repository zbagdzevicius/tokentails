import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Shelter, ShelterDocument } from './shelter.schema';

@Injectable()
export class ShelterRepository extends BaseRepository<ShelterDocument> {
    constructor(
        @InjectModel(Shelter.name)
        protected collectionModel: Model<ShelterDocument>
    ) {
        super(collectionModel);
    }
}
