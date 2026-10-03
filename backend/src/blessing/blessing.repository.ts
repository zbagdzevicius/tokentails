import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { houseShelterIds } from 'src/impact/impact-public';
import { Blessing, BlessingDocument, rescueBlessingFilter } from './blessing.schema';

@Injectable()
export class BlessingRepository extends BaseRepository<BlessingDocument> {
    constructor(
        @InjectModel(Blessing.name)
        protected collectionModel: Model<BlessingDocument>
    ) {
        super(collectionModel);
    }

    /**
     * The rescue filter for traction figures: rescue blessings only (a paid pet portrait is not a
     * rescued cat, plan G4, F7.8), outside Token Tails' house zones, the same set GET /impact counts.
     */
    private async publicRescueFilter(): Promise<Record<string, unknown>> {
        return rescueBlessingFilter(await houseShelterIds(this.collectionModel.db.collection('shelters')));
    }

    async rescueCount(): Promise<number> {
        return this.collectionModel.countDocuments(await this.publicRescueFilter());
    }

    /** Weekly new rescue blessings. Portraits and house zones are excluded from traction (G4). */
    async weeklyCount(): Promise<Array<{ [key: string]: number }>> {
        const startDate = new Date('2025-04-14');
        const currentDate = new Date();

        // Use MongoDB aggregation to get weekly counts in a single query
        const results = await this.collectionModel.aggregate([
            {
                $match: {
                    ...(await this.publicRescueFilter()),
                    createdAt: { $gte: startDate, $lte: currentDate },
                },
            },
            {
                $addFields: {
                    // Calculate the start of the week for each user
                    weekStart: {
                        $subtract: [
                            { $toDate: '$createdAt' },
                            {
                                $multiply: [{ $dayOfWeek: '$createdAt' }, 24 * 60 * 60 * 1000],
                            },
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$weekStart' } },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { _id: -1 },
            },
        ]);

        // Transform the results to the required format
        return results.map(item => ({ [item._id]: item.count }));
    }
}
