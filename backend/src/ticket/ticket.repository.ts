import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Ticket, TicketDocument } from './ticket.schema';

@Injectable()
export class TicketRepository extends BaseRepository<TicketDocument> {
    constructor(
        @InjectModel(Ticket.name)
        protected collectionModel: Model<TicketDocument>
    ) {
        super(collectionModel);
    }
}
