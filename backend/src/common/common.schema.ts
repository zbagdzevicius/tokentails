import { Types } from 'mongoose';

export class CommonSchema {
    _id?: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface CrudOptions {
    skip?: number;
    limit?: number;
    sort?: any;
    projection?: any;
    filter?: any;
}

export interface QueryHelper {
    $inc?: any;
    $push?: any;
    $pull?: any;
}
