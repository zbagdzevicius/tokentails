import { InsertManyResult, Model, PipelineStage, QueryOptions, Types } from 'mongoose';
import { QueryHelper } from 'src/common/common.schema';
import { getCleanObject } from './utils';
import { SearchModel, SortingModel } from './validators';

interface IPopulateBase {
    path: string;
    select?: string;
    populate?: IPopulateBase | IPopulateBase[];
}

interface IPopulate extends IPopulateBase {
    populate?: IPopulateBase | IPopulateBase[];
}

export interface IGenericSearchParams {
    searchObject?: any;
    secondarySearchObject?: any;
    projection?: string | object;
    populate?: IPopulate[];
    sort?: SortingModel;
    pipelineStages?: PipelineStage[];
    collation?: any;
    page?: number;
}

interface ISearchParams extends SearchModel, IGenericSearchParams {}

export interface IBaseRepository<T> {
    get(id: string | Types.ObjectId): Promise<T>;
    updateFieldToObjectId(field: string | Types.ObjectId): Promise<void>;
    find(params: IGenericSearchParams): Promise<T[]>;
    findOne(options: Partial<T> & any, projection: string): Promise<T>;
    create(object: T): Promise<T>;
    count(object: Partial<T> & QueryHelper): Promise<number>;
    update(id: string | Types.ObjectId, object: Partial<T> & QueryHelper): Promise<T>;
    updateAll(object: Partial<T> & QueryHelper): Promise<T>;
    delete(id: string): Promise<T>;
    insertMany(objects: T[]): Promise<InsertManyResult<T>>;
}

export class BaseRepository<T> implements IBaseRepository<T> {
    constructor(public model: Model<T>) {}

    async updateFieldToObjectId(field: string) {
        await this.model.updateMany(
            {},
            [
                {
                    $set: {
                        [field]: {
                            $toObjectId: `$${field}`,
                        },
                    },
                },
            ],
            {
                multi: true,
            }
        );
    }

    async get(id: string | Types.ObjectId): Promise<T> {
        return this.model.findById(id).lean();
    }

    async find({
        searchObject,
        secondarySearchObject,
        projection,
        page,
        perPage,
        populate,
        sort,
        pipelineStages,
        collation,
    }: ISearchParams): Promise<T[]> {
        const project = typeof projection === 'object' ? projection : projectionStringToObject(projection);
        const projectionExists = !!Object.keys(project)?.length;

        const match = searchObject?.['$search'] ? searchObject : { $match: searchObject || {} };
        const secondaryMatch = secondarySearchObject ? [{ $match: secondarySearchObject || {} }] : [];
        const sorting = sort?.sortBy === undefined ? [] : [{ $sort: { [sort!.sortBy!]: sort?.isAscending ? 1 : -1 } }];
        const skip =
            page !== undefined && perPage !== undefined ? [{ $skip: page * perPage }, { $limit: perPage }] : [];

        const aggregation = [
            match,
            ...secondaryMatch,
            ...sorting,
            ...(pipelineStages || []),
            ...skip,
            ...getStagesArray(
                [
                    {
                        $project: typeof projection === 'object' ? projection : projectionStringToObject(projection),
                    },
                ],
                projectionExists
            ),
        ];
        const results = await this.model.aggregate(aggregation, { collation, maxTimeMS: 600000 }).exec();

        if (!populate) {
            return results;
        }

        return this.model.populate(results, populate) as Promise<T[]>;
    }

    async getSlugs(populateCategory = false, projection = {}): Promise<{ slug: string; category?: string }[]> {
        return this.model
            .aggregate(
                [
                    ...getStagesArray(
                        [
                            {
                                $lookup: {
                                    from: 'categories',
                                    localField: 'category',
                                    foreignField: '_id',
                                    as: 'category',
                                },
                            },
                            {
                                $unwind: {
                                    path: '$category',
                                },
                            },
                            {
                                $lookup: {
                                    from: 'images',
                                    localField: 'featuredImage',
                                    foreignField: '_id',
                                    as: 'featuredImage',
                                },
                            },
                            {
                                $unwind: {
                                    path: '$featuredImage',
                                },
                            },
                            {
                                $project: {
                                    ...projection,
                                    _id: 0,
                                    slug: 1,
                                    category: '$category.slug',
                                    featuredImage: '$featuredImage.url',
                                    updatedAt: 1,
                                },
                            },
                        ],
                        populateCategory
                    ),
                    ...getStagesArray(
                        {
                            $project: {
                                _id: 0,
                                slug: 1,
                                updatedAt: 1,
                                ...projection,
                            },
                        },
                        !populateCategory
                    ),
                ],
                { maxTimeMS: 600000 }
            )
            .exec();
    }

    async findOne(object: IGenericSearchParams): Promise<T> {
        return this.model
            .findOne(getCleanObject(object.searchObject), object.projection, {
                populate: object.populate,
            })
            .lean();
    }

    async create(object: Partial<T>): Promise<T> {
        return this.model.create(object);
    }

    async update(id: string | Types.ObjectId, object: QueryOptions<Partial<T> & QueryHelper & any>): Promise<T> {
        return this.model.findByIdAndUpdate(id, object).lean();
    }

    async updateAll(object: QueryOptions<Partial<T> & QueryHelper & any>): Promise<T> {
        return this.model.updateMany({}, { $set: object }, { multi: true }).lean();
    }

    async count(object: QueryOptions<Partial<T> & QueryHelper & any>): Promise<number> {
        return this.model.countDocuments(object).lean();
    }

    async delete(id?: string | Types.ObjectId): Promise<T> {
        if (!id) {
            throw Error('ID is not supplied');
        }
        return this.model.findByIdAndDelete(id.toString()).lean();
    }

    async deleteMany(query: any): Promise<T> {
        if (!query) {
            throw Error('Delete query must be defined');
        }
        return this.model.deleteMany(query).lean();
    }

    async insertMany(objects: T[]): Promise<InsertManyResult<any>> {
        return this.model.insertMany(objects, { ordered: false, rawResult: true });
    }
}

type IProjection = Record<string, 0 | 1 | object>;

function projectionStringToObject(string = '', nestedPopulations?: IPopulate[]) {
    if (!string) {
        return {};
    }

    const object: IProjection = {};
    const keys = string.split(' ');
    for (const key of keys) {
        const isExcludedProperty = key.startsWith('-');
        const objectKey = isExcludedProperty ? key.slice(1) : key;
        object[objectKey] = isExcludedProperty ? 0 : 1;
    }

    if (nestedPopulations?.length) {
        for (const nestedPopulation of nestedPopulations) {
            object[nestedPopulation.path] = projectionStringToObject(nestedPopulation.select);
        }
    }

    return object;
}

function getStagesArray(stage: PipelineStage | PipelineStage[], include: boolean): PipelineStage[] {
    return include ? (Array.isArray(stage) ? stage : [stage]) : <any>[];
}
