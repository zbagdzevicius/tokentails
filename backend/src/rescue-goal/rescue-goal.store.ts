import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ShelterDonation } from 'src/shelter/onchain/shelter-onchain.schema';
import { Shelter } from 'src/shelter/shelter.schema';
import { ILeaseCollection, JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { User } from 'src/user/user.schema';
import {
    RescueGoal,
    RescueGoalHelper,
    RescueGoalPledge,
    RescueGoalPledgeDay,
    RescueGoalReceipt,
} from './rescue-goal.schema';

/*
 * The native collections Rescue Goals write through. The saga needs conditional upserts and
 * pipeline updates whose results it reads exactly (matched / modified / upserted), so it talks to
 * the driver directly instead of through Mongoose casting. The specs swap in an in-memory
 * implementation of the same subset (`rescue-goal.fakes-spec.ts`), and the opt-in Mongo spec runs
 * the same code on a real server.
 */

export type Doc = Record<string, any>;

export interface IWriteResult {
    matchedCount?: number;
    modifiedCount?: number;
    upsertedCount?: number;
}

export interface IFindOptions {
    sort?: Record<string, 1 | -1>;
    limit?: number;
    projection?: Record<string, 0 | 1>;
    session?: unknown;
}

export interface ICollectionLike {
    findOne(filter: Doc, options?: IFindOptions): Promise<Doc | null>;
    find(filter: Doc, options?: IFindOptions): { toArray(): Promise<Doc[]> };
    insertOne(doc: Doc, options?: { session?: unknown }): Promise<unknown>;
    updateOne(
        filter: Doc,
        update: Doc | Doc[],
        options?: { upsert?: boolean; session?: unknown }
    ): Promise<IWriteResult>;
    countDocuments(filter: Doc, options?: { limit?: number; session?: unknown }): Promise<number>;
}

export interface ISessionLike {
    withTransaction(run: () => Promise<unknown>): Promise<unknown>;
    endSession(): Promise<void> | void;
}

export interface IRescueGoalCollections {
    goals: ICollectionLike;
    pledges: ICollectionLike;
    days: ICollectionLike;
    helpers: ICollectionLike;
    receipts: ICollectionLike;
    users: ICollectionLike;
    shelters: ICollectionLike;
    donations: ICollectionLike;
    jobRuns: ILeaseCollection;
    startSession?: () => Promise<ISessionLike>;
}

@Injectable()
export class RescueGoalStore implements IRescueGoalCollections {
    goals: ICollectionLike;
    pledges: ICollectionLike;
    days: ICollectionLike;
    helpers: ICollectionLike;
    receipts: ICollectionLike;
    users: ICollectionLike;
    shelters: ICollectionLike;
    donations: ICollectionLike;
    jobRuns: ILeaseCollection;
    startSession?: () => Promise<ISessionLike>;

    constructor(
        @InjectModel(RescueGoal.name) goalModel: Model<any>,
        @InjectModel(RescueGoalPledge.name) pledgeModel: Model<any>,
        @InjectModel(RescueGoalPledgeDay.name) dayModel: Model<any>,
        @InjectModel(RescueGoalHelper.name) helperModel: Model<any>,
        @InjectModel(RescueGoalReceipt.name) receiptModel: Model<any>,
        @InjectModel(User.name) userModel: Model<any>,
        @InjectModel(Shelter.name) shelterModel: Model<any>,
        @InjectModel(ShelterDonation.name) donationModel: Model<any>
    ) {
        const native = (model: Model<any>) => model?.collection as unknown as ICollectionLike;
        this.goals = native(goalModel);
        this.pledges = native(pledgeModel);
        this.days = native(dayModel);
        this.helpers = native(helperModel);
        this.receipts = native(receiptModel);
        this.users = native(userModel);
        this.shelters = native(shelterModel);
        this.donations = native(donationModel);
        this.jobRuns = goalModel?.db?.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection;
        const connection = goalModel?.db;
        if (connection) {
            this.startSession = async () => (await connection.startSession()) as unknown as ISessionLike;
        }
    }

    /** A store over given collections (specs, scripts). */
    static of(collections: IRescueGoalCollections): RescueGoalStore {
        return Object.assign(Object.create(RescueGoalStore.prototype), collections) as RescueGoalStore;
    }
}

/** `new ObjectId(value)` when `value` is a valid id, else null. */
export function objectIdOrNull(value: unknown): Types.ObjectId | null {
    if (value instanceof Types.ObjectId) {
        return value;
    }
    const text = String(value ?? '');
    return /^[a-f0-9]{24}$/i.test(text) ? new Types.ObjectId(text) : null;
}

/** True when `list` holds `id` (ObjectIds compared by value). */
export const includesId = (list: unknown, id: unknown) =>
    Array.isArray(list) && list.some(item => String(item) === String(id));
