import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { NameReport, NameReportDocument } from './name-report.schema';

@Injectable()
export class NameReportRepository extends BaseRepository<NameReportDocument> {
    constructor(
        @InjectModel(NameReport.name)
        protected collectionModel: Model<NameReportDocument>
    ) {
        super(collectionModel);
    }
}
