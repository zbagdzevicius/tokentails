import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base.repository';
import { notGuestFilter } from 'src/common/decorators/auth-user.decorator';
import { UserDocument, User } from './user.schema';

@Injectable()
export class UserRepository extends BaseRepository<UserDocument> {
    constructor(
        @InjectModel(User.name)
        protected collectionModel: Model<UserDocument>
    ) {
        super(collectionModel);
    }

    /**
     * Atomically raises the number at `path` to `cap` when it is below it (or missing). Returns the value it had
     * (0 when missing), or null when it was already at the cap and nothing changed. The Pawlegends first-win
     * catnip claim (POC.md §11.5): of two saves racing for the same first win, exactly one gets a non-null answer.
     */
    async claimBelowCap(id: string, path: string, cap: number): Promise<number | null> {
        const before = (await this.collectionModel
            .findOneAndUpdate(
                { _id: id, $or: [{ [path]: { $lt: cap } }, { [path]: { $exists: false } }, { [path]: null }] },
                { $set: { [path]: cap } },
                { new: false, projection: { [path]: 1 } }
            )
            .lean()) as any;
        if (!before) return null;
        const value = path.split('.').reduce((node, key) => node?.[key], before);
        return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    async weeklyCount(): Promise<Array<{ [key: string]: number }>> {
        const startDate = new Date('2025-04-14');
        const currentDate = new Date();

        // Use MongoDB aggregation to get weekly counts in a single query
        const results = await this.collectionModel.aggregate([
            {
                // Guests are not users for traction (decision #13).
                $match: {
                    createdAt: { $gte: startDate, $lte: currentDate },
                    ...notGuestFilter(),
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
