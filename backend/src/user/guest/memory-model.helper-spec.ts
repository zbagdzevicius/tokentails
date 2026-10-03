/*
 * In-memory stand-in for the subset of the Mongoose model API the identity code uses (plan F5 specs).
 *
 * Every operation yields once before it runs and then applies its filter and update in one
 * synchronous step, the way MongoDB applies a single-document write. So `Promise.all` of several
 * calls interleaves between operations, never inside one: exactly the races the identity code must
 * survive. Unique (partial) indexes throw `{ code: 11000 }` like the server.
 *
 * Not a spec (no `.spec.ts`), and excluded from the build by the `*spec.ts` pattern.
 */
import { Types } from 'mongoose';

type Doc = Record<string, any>;

export interface IUniqueIndex {
    fields: string[];
    partial?: Doc;
    /** Like a non-sparse MongoDB index: a missing field is indexed as null instead of skipped. */
    missingAsNull?: boolean;
}

const isObjectId = (value: unknown) => value instanceof Types.ObjectId;
const isPlainObject = (value: unknown): value is Doc =>
    !!value && typeof value === 'object' && !Array.isArray(value) && !isObjectId(value) && !(value instanceof Date);

const clone = <T>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map(clone) as unknown as T;
    }
    if (isObjectId(value) || value instanceof Date || !value || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(Object.entries(value as Doc).map(([key, inner]) => [key, clone(inner)])) as T;
};

const scalar = (value: unknown) => {
    if (isObjectId(value)) return value!.toString();
    if (value instanceof Date) return value.getTime();
    return value;
};

const equal = (a: unknown, b: unknown): boolean => {
    if (a === null || a === undefined) return b === null || b === undefined;
    return scalar(a) === scalar(b);
};

function getPath(doc: Doc, path: string): unknown {
    return path
        .split('.')
        .reduce<any>((value, key) => (value === null || value === undefined ? undefined : value[key]), doc);
}

function setPath(doc: Doc, path: string, value: unknown) {
    const keys = path.split('.');
    let target: any = doc;
    // Like MongoDB: a missing parent becomes an embedded document even for a numeric key
    // (`$set: {'a.3': 1}` on a doc without `a` stores `{a: {'3': 1}}`); an existing array is padded.
    // A null parent is refused, as MongoDB does (`$max: {'a.3': 5}` on `{a: null}` fails with
    // "Cannot create field '3' in element {a: null}").
    keys.slice(0, -1).forEach((key, i) => {
        if (target[key] === null) {
            throw new Error(`memory model: Cannot create field '${keys[i + 1]}' in element {${key}: null}`);
        }
        if (target[key] === undefined) {
            target[key] = {};
        }
        target = target[key];
    });
    const last = keys[keys.length - 1];
    if (Array.isArray(target) && /^\d+$/.test(last)) {
        const index = Number(last);
        while (target.length < index) target.push(null);
    }
    target[last] = value;
}

function unsetPath(doc: Doc, path: string) {
    const keys = path.split('.');
    const parent: any = keys.length > 1 ? getPath(doc, keys.slice(0, -1).join('.')) : doc;
    if (parent && typeof parent === 'object') {
        if (Array.isArray(parent)) parent[Number(keys[keys.length - 1])] = null;
        else delete parent[keys[keys.length - 1]];
    }
}

const compare = (a: unknown, b: unknown) => {
    const x = scalar(a) as any;
    const y = scalar(b) as any;
    return x < y ? -1 : x > y ? 1 : 0;
};

function matchCondition(value: unknown, condition: unknown): boolean {
    if (isPlainObject(condition) && Object.keys(condition).some(key => key.startsWith('$'))) {
        return Object.entries(condition).every(([operator, operand]) => {
            const values = Array.isArray(value) ? value : [value];
            switch (operator) {
                case '$exists':
                    return operand ? value !== undefined : value === undefined;
                case '$ne':
                    return !matchCondition(value, operand);
                case '$in':
                    return (operand as unknown[]).some(option => matchCondition(value, option));
                case '$nin':
                    return !(operand as unknown[]).some(option => matchCondition(value, option));
                case '$lt':
                    return values.some(v => v !== undefined && v !== null && compare(v, operand) < 0);
                case '$lte':
                    return values.some(v => v !== undefined && v !== null && compare(v, operand) <= 0);
                case '$gt':
                    return values.some(v => v !== undefined && v !== null && compare(v, operand) > 0);
                case '$gte':
                    return values.some(v => v !== undefined && v !== null && compare(v, operand) >= 0);
                case '$not':
                    return !matchCondition(value, operand);
                case '$regex': {
                    const flags = String((condition as Doc).$options || '');
                    return values.some(v => typeof v === 'string' && new RegExp(String(operand), flags).test(v));
                }
                case '$options':
                    return true;
                default:
                    throw new Error(`memory model: unsupported operator ${operator}`);
            }
        });
    }
    if (Array.isArray(value) && !Array.isArray(condition)) {
        return value.some(item => equal(item, condition));
    }
    if (Array.isArray(condition)) {
        return (
            Array.isArray(value) && value.length === condition.length && value.every((v, i) => equal(v, condition[i]))
        );
    }
    return equal(value, condition);
}

export function matches(doc: Doc, filter: Doc = {}): boolean {
    return Object.entries(filter).every(([key, condition]) => {
        if (key === '$or') return (condition as Doc[]).some(part => matches(doc, part));
        if (key === '$and') return (condition as Doc[]).every(part => matches(doc, part));
        return matchCondition(getPath(doc, key), condition);
    });
}

/**
 * Update pipelines: only `[{$set: {field: <literal> | {$ifNull: ['$field', <literal>]}}}]`, the
 * shape `arrayGuardPipeline` (utils/live-game.ts) produces for `$max` fields.
 */
function applyPipeline(doc: Doc, stages: Doc[]) {
    for (const stage of stages) {
        for (const [operator, fields] of Object.entries(stage)) {
            if (operator !== '$set') throw new Error(`memory model: unsupported pipeline stage ${operator}`);
            for (const [path, expression] of Object.entries(fields as Doc)) {
                if (isPlainObject(expression) && Array.isArray(expression.$ifNull)) {
                    const [source, fallback] = expression.$ifNull as [string, unknown];
                    const current = getPath(doc, String(source).replace(/^\$/, ''));
                    setPath(doc, path, clone(current === null || current === undefined ? fallback : current));
                } else if (isPlainObject(expression) && Object.keys(expression).some(key => key.startsWith('$'))) {
                    throw new Error(`memory model: unsupported pipeline expression at ${path}`);
                } else {
                    setPath(doc, path, clone(expression));
                }
            }
        }
    }
}

function applyUpdate(doc: Doc, update: Doc, inserting: boolean) {
    if (Array.isArray(update)) {
        applyPipeline(doc, update);
        return;
    }
    for (const [operator, fields] of Object.entries(update)) {
        for (const [path, operand] of Object.entries(fields as Doc)) {
            const current = getPath(doc, path);
            switch (operator) {
                case '$set':
                    setPath(doc, path, clone(operand));
                    break;
                case '$setOnInsert':
                    if (inserting) setPath(doc, path, clone(operand));
                    break;
                case '$inc':
                    setPath(doc, path, (Number(current) || 0) + Number(operand));
                    break;
                case '$unset':
                    unsetPath(doc, path);
                    break;
                case '$max':
                    if (current === undefined || current === null || compare(operand, current) > 0)
                        setPath(doc, path, operand);
                    break;
                case '$min':
                    if (current === undefined || current === null || compare(operand, current) < 0)
                        setPath(doc, path, operand);
                    break;
                case '$bit': {
                    // MongoDB refuses $bit on a non-integer; the callers guard the array first.
                    if (current !== undefined && current !== null && !Number.isInteger(current)) {
                        throw new Error(`memory model: $bit on a non-integer at ${path}`);
                    }
                    let value = Number(current) || 0;
                    const ops = operand as Doc;
                    if (ops.and !== undefined) value &= Number(ops.and);
                    if (ops.or !== undefined) value |= Number(ops.or);
                    if (ops.xor !== undefined) value ^= Number(ops.xor);
                    setPath(doc, path, value);
                    break;
                }
                case '$addToSet': {
                    const list = Array.isArray(current) ? current : [];
                    if (!list.some(item => equal(item, operand))) list.push(operand);
                    setPath(doc, path, list);
                    break;
                }
                case '$pull': {
                    if (Array.isArray(current)) {
                        setPath(
                            doc,
                            path,
                            current.filter(item => !matchCondition(item, operand))
                        );
                    }
                    break;
                }
                case '$push': {
                    const list = Array.isArray(current) ? current : [];
                    if (isPlainObject(operand) && '$each' in operand) {
                        const position = (operand.$position as number) ?? list.length;
                        list.splice(position, 0, ...(operand.$each as unknown[]));
                    } else {
                        list.push(operand);
                    }
                    setPath(doc, path, list);
                    break;
                }
                default:
                    throw new Error(`memory model: unsupported update ${operator}`);
            }
        }
    }
}

/** Equality fields of a filter, copied into an upserted document (as MongoDB does). */
function equalitySeed(filter: Doc): Doc {
    const seed: Doc = {};
    for (const [key, condition] of Object.entries(filter)) {
        if (key.startsWith('$')) continue;
        if (isPlainObject(condition) && Object.keys(condition).some(k => k.startsWith('$'))) continue;
        setPath(seed, key, clone(condition));
    }
    return seed;
}

const query = <T>(run: () => Promise<T>) => {
    const chain: any = {
        lean: () => chain,
        exec: () => run(),
        limit: (count: number) => query(async () => ((await run()) as any).slice(0, count)),
        sort: () => chain,
        maxTimeMS: () => chain,
        then: (resolve: any, reject: any) => run().then(resolve, reject),
    };
    return chain;
};

export class MemoryModel {
    docs: Doc[] = [];
    readonly calls: string[] = [];
    readonly extraCollections = new Map<string, MemoryModel>();

    constructor(
        docs: Doc[] = [],
        private readonly uniques: IUniqueIndex[] = [],
        public now: () => Date = () => new Date()
    ) {
        this.docs = docs.map(doc => ({ createdAt: this.now(), updatedAt: this.now(), ...clone(doc) }));
    }

    private tick = () => Promise.resolve();

    private checkUnique(candidate: Doc, self?: Doc) {
        for (const index of this.uniques) {
            if (index.partial && !matches(candidate, index.partial)) continue;
            const read = (doc: Doc, field: string) => {
                const value = getPath(doc, field);
                return index.missingAsNull && value === undefined ? null : value;
            };
            if (index.fields.some(field => read(candidate, field) === undefined)) continue;
            const clash = this.docs.some(
                other =>
                    other !== self &&
                    (!index.partial || matches(other, index.partial)) &&
                    index.fields.every(field => {
                        const mine = read(candidate, field);
                        const theirs = read(other, field);
                        const mineList = Array.isArray(mine) ? mine : [mine];
                        const theirList = Array.isArray(theirs) ? theirs : [theirs];
                        return mineList.some(m => theirList.some(t => equal(m, t)));
                    })
            );
            if (clash) {
                throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
            }
        }
    }

    private insert(doc: Doc): Doc {
        const stored = { _id: new Types.ObjectId(), createdAt: this.now(), updatedAt: this.now(), ...clone(doc) };
        this.checkUnique(stored);
        this.docs.push(stored);
        return stored;
    }

    private write(doc: Doc, update: Doc) {
        const next = clone(doc);
        applyUpdate(next, update, false);
        next.updatedAt = this.now();
        this.checkUnique(next, doc);
        Object.keys(doc).forEach(key => delete doc[key]);
        Object.assign(doc, next);
    }

    findOne(filter: Doc = {}) {
        this.calls.push('findOne');
        return query(async () => {
            await this.tick();
            const found = this.docs.find(doc => matches(doc, filter));
            return found ? clone(found) : null;
        });
    }

    find(filter: Doc = {}) {
        this.calls.push('find');
        return query(async () => {
            await this.tick();
            return this.docs.filter(doc => matches(doc, filter)).map(clone);
        });
    }

    findOneAndUpdate(filter: Doc, update: Doc, options: { upsert?: boolean; new?: boolean } = {}) {
        this.calls.push('findOneAndUpdate');
        return query(async () => {
            await this.tick();
            const found = this.docs.find(doc => matches(doc, filter));
            if (found) {
                const before = clone(found);
                this.write(found, update);
                return options.new ? clone(found) : before;
            }
            if (!options.upsert) return null;
            const seed = equalitySeed(filter);
            applyUpdate(seed, update, true);
            const inserted = this.insert(seed);
            return options.new ? clone(inserted) : null;
        });
    }

    async updateOne(filter: Doc, update: Doc, options: { upsert?: boolean } = {}) {
        this.calls.push('updateOne');
        await this.tick();
        const found = this.docs.find(doc => matches(doc, filter));
        if (found) {
            this.write(found, update);
            return { matchedCount: 1, modifiedCount: 1 };
        }
        if (options.upsert) {
            const seed = equalitySeed(filter);
            applyUpdate(seed, update, true);
            this.insert(seed);
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
    }

    async updateMany(filter: Doc, update: Doc) {
        this.calls.push('updateMany');
        await this.tick();
        const found = this.docs.filter(doc => matches(doc, filter));
        found.forEach(doc => this.write(doc, update));
        return { matchedCount: found.length, modifiedCount: found.length };
    }

    async deleteOne(filter: Doc) {
        this.calls.push('deleteOne');
        await this.tick();
        const index = this.docs.findIndex(doc => matches(doc, filter));
        if (index >= 0) this.docs.splice(index, 1);
        return { deletedCount: index >= 0 ? 1 : 0 };
    }

    async deleteMany(filter: Doc) {
        this.calls.push('deleteMany');
        await this.tick();
        const before = this.docs.length;
        this.docs = this.docs.filter(doc => !matches(doc, filter));
        return { deletedCount: before - this.docs.length };
    }

    async countDocuments(filter: Doc = {}) {
        await this.tick();
        return this.docs.filter(doc => matches(doc, filter)).length;
    }

    count(filter: Doc = {}) {
        return this.countDocuments(filter);
    }

    async exists(filter: Doc) {
        await this.tick();
        const found = this.docs.find(doc => matches(doc, filter));
        return found ? { _id: found._id } : null;
    }

    async create(doc: Doc) {
        this.calls.push('create');
        await this.tick();
        return clone(this.insert(doc));
    }

    async insertOne(doc: Doc) {
        await this.tick();
        this.insert(doc);
        return { acknowledged: true };
    }

    /** `model.collection`: the native driver, used by `UserService.findByEmail`. */
    get collection() {
        return {
            findOne: async (filter: Doc, options: { sort?: Doc } = {}) => {
                this.calls.push('collection.findOne');
                await this.tick();
                let found = this.docs.filter(doc => matches(doc, filter));
                const [sortKey, direction] = Object.entries(options.sort || {})[0] || [];
                if (sortKey) found = [...found].sort((a, b) => compare(a[sortKey], b[sortKey]) * Number(direction));
                return found[0] ? clone(found[0]) : null;
            },
        };
    }

    /** `model.db.collection(name)`: extra collections (audit, jobruns). */
    get db() {
        return {
            collection: (name: string) => {
                if (!this.extraCollections.has(name))
                    this.extraCollections.set(name, new MemoryModel([], [], this.now));
                return this.extraCollections.get(name)!;
            },
        };
    }
}

/** A repository over a MemoryModel with the BaseRepository methods the controllers call. */
export function memoryRepository(model: MemoryModel) {
    return {
        model,
        findOne: async ({ searchObject }: { searchObject: Doc }) => {
            // BaseRepository.findOne strips undefined and null values from the filter.
            const clean = Object.fromEntries(
                Object.entries(searchObject || {}).filter(([, value]) => value !== undefined && value !== null)
            );
            return model.findOne(clean).lean();
        },
        update: async (id: unknown, update: Doc) => {
            const hasOperator = Object.keys(update).some(key => key.startsWith('$'));
            await model.updateOne({ _id: id }, hasOperator ? update : { $set: update });
            return model.findOne({ _id: id });
        },
        create: (doc: Doc) => model.create(doc),
        count: (filter: Doc) => model.countDocuments(filter),
    };
}

// The same partial filters as migrations/tokentails/2026-10-01-identity-unique-indexes.js.
export const USER_UNIQUE_INDEXES: IUniqueIndex[] = [
    { fields: ['firebaseUids'], partial: { 'firebaseUids.0': { $exists: true } } },
];
export const CAT_UNIQUE_INDEXES: IUniqueIndex[] = [
    { fields: ['owner'], partial: { isStarter: true } },
    // cat.schema.ts `copy_per_owner_source`: a missing owner indexes as null.
    { fields: ['owner', 'sourceCat'], partial: { sourceCat: { $exists: true } }, missingAsNull: true },
];
