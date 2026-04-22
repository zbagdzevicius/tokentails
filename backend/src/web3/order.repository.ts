import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { Order, OrderDocument } from './order.schema';

@Injectable()
export class OrderRepository extends BaseRepository<OrderDocument> {
    constructor(
        @InjectModel(Order.name)
        protected collectionModel: Model<OrderDocument>
    ) {
        super(collectionModel);
    }

    async weeklyCount(): Promise<Array<{ [key: string]: number }>> {
        const startDate = new Date('2025-04-14');
        const currentDate = new Date();

        // Use MongoDB aggregation to get weekly counts in a single query
        const results = await this.collectionModel.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: currentDate },
                    status: 'COMPLETE',
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
