import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { IOrder, Order, OrderDocument, OrderStatus } from './order.schema';

export const HASH_ALREADY_USED = 'This payment has already been used for an order';

function isDuplicateHashError(error: any): boolean {
    if (error?.code !== 11000) {
        return false;
    }
    const keys = { ...(error.keyPattern || {}), ...(error.keyValue || {}) };
    return 'hash' in keys || /hash/.test(String(error.message));
}

@Injectable()
export class OrderRepository extends BaseRepository<OrderDocument> {
    constructor(
        @InjectModel(Order.name)
        protected collectionModel: Model<OrderDocument>
    ) {
        super(collectionModel);
    }

    /** Maps a duplicate `hash` (unique index `hash_unique`) to a 409 instead of a 500. */
    async create(object: Partial<OrderDocument>): Promise<OrderDocument> {
        try {
            return await super.create(object);
        } catch (error) {
            if (isDuplicateHashError(error)) {
                throw new ConflictException(HASH_ALREADY_USED);
            }
            throw error;
        }
    }

    /** Every order holding `hash`, newest first. */
    async findByHash(hash: string): Promise<IOrder[]> {
        return this.collectionModel.find({ hash }).sort({ createdAt: -1 }).lean() as unknown as Promise<IOrder[]>;
    }

    /**
     * Marks an order FAILED and moves its hash to `failedHash`, so the unique index no longer
     * blocks a retry with the same transaction.
     */
    async releaseHash(id: Types.ObjectId | string, hash: string, reason: string): Promise<void> {
        await this.collectionModel.updateOne(
            { _id: id, hash },
            { $set: { status: OrderStatus.FAILED, failedHash: hash, failureReason: reason }, $unset: { hash: 1 } }
        );
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
