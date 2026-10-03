import { Types } from 'mongoose';
import { Doc, ICollectionLike, IFindOptions, IRescueGoalCollections, IWriteResult } from './rescue-goal.store';

/*
 * In-memory stand-in for the native collections Rescue Goals use (not a spec: the file name keeps it
 * out of jest's `.spec.ts` pattern). It implements exactly the query, update and aggregation-expression
 * subset the service sends, with MongoDB semantics for each:
 *
 *   filters  equality (array contains), $ne (array does not contain), $gt/$gte/$lt/$lte, $in, $exists,
 *            $not, $or, $and, $expr; `field: null` matches a missing field
 *   updates  $set, $unset, $inc, $push, $pull, $addToSet, $setOnInsert, upsert; pipeline [{$set}]
 *   exprs    $add, $subtract, $max, $min, $cond, $ifNull, $concatArrays, $filter ($$this), $in,
 *            $eq/$ne/$gt/$gte/$lt/$lte, $and/$or/$not, field paths, literals
 *
 * Every call yields to the event loop once before it runs and then runs synchronously, so each call is
 * atomic on its documents (like a single-document write) while parallel callers interleave between
 * calls, the way concurrent requests do.
 */

export class DuplicateKeyError extends Error {
    code = 11000;
}

const yieldOnce = () => new Promise<void>(resolve => setImmediate(resolve));

const isPlainObject = (value: unknown): value is Doc =>
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Types.ObjectId) &&
    !Buffer.isBuffer(value);

export function clone<T>(value: T): T {
    if (value instanceof Types.ObjectId) return new Types.ObjectId(value.toHexString()) as unknown as T;
    if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
    if (Buffer.isBuffer(value)) return Buffer.from(value) as unknown as T;
    if (Array.isArray(value)) return value.map(clone) as unknown as T;
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
    }
    return value;
}

const keyOf = (value: unknown): unknown => {
    if (value instanceof Types.ObjectId) return `oid:${value.toHexString()}`;
    if (value instanceof Date) return `date:${value.getTime()}`;
    if (value === undefined) return null;
    if (Buffer.isBuffer(value)) return `buf:${value.toString('hex')}`;
    if (Array.isArray(value)) return `[${value.map(item => String(JSON.stringify(keyOf(item)))).join(',')}]`;
    if (isPlainObject(value)) {
        const entries = Object.keys(value)
            .filter(key => value[key] !== undefined)
            .sort()
            .map(key => `${JSON.stringify(key)}:${String(JSON.stringify(keyOf(value[key])))}`);
        return `{${entries.join(',')}}`;
    }
    return value;
};

const same = (a: unknown, b: unknown) => keyOf(a) === keyOf(b);

const comparable = (value: unknown) =>
    value instanceof Date ? value.getTime() : value instanceof Types.ObjectId ? value.toHexString() : value;

function compare(a: unknown, b: unknown): number {
    const x = comparable(a) as any;
    const y = comparable(b) as any;
    if (x === y) return 0;
    if (x === undefined || x === null) return -1;
    if (y === undefined || y === null) return 1;
    return x < y ? -1 : 1;
}

export function getPath(doc: Doc | undefined, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => (isPlainObject(value) ? value[key] : undefined), doc);
}

function setPath(doc: Doc, path: string, value: unknown) {
    const keys = path.split('.');
    let target = doc;
    for (const key of keys.slice(0, -1)) {
        if (!isPlainObject(target[key])) target[key] = {};
        target = target[key];
    }
    if (value === undefined) delete target[keys[keys.length - 1]];
    else target[keys[keys.length - 1]] = value;
}

const containsOrEquals = (value: unknown, wanted: unknown) =>
    Array.isArray(value) ? value.some(item => same(item, wanted)) || same(value, wanted) : same(value, wanted);

function matchCondition(value: unknown, condition: unknown): boolean {
    if (isPlainObject(condition) && Object.keys(condition).some(key => key.startsWith('$'))) {
        return Object.entries(condition).every(([op, arg]) => {
            switch (op) {
                case '$eq':
                    return containsOrEquals(value, arg);
                case '$ne':
                    return !(arg === null ? value === null || value === undefined : containsOrEquals(value, arg));
                case '$gt':
                    return value !== undefined && value !== null && compare(value, arg) > 0;
                case '$gte':
                    return value !== undefined && value !== null && compare(value, arg) >= 0;
                case '$lt':
                    return value !== undefined && value !== null && compare(value, arg) < 0;
                case '$lte':
                    return value !== undefined && value !== null && compare(value, arg) <= 0;
                case '$in':
                    return (arg as unknown[]).some(item => containsOrEquals(value, item));
                case '$nin':
                    return !(arg as unknown[]).some(item => containsOrEquals(value, item));
                case '$exists':
                    return (value !== undefined) === !!arg;
                case '$not':
                    return !matchCondition(value, arg);
                default:
                    throw new Error(`fake: unsupported query operator ${op}`);
            }
        });
    }
    if (condition === null) {
        return value === null || value === undefined;
    }
    return containsOrEquals(value, condition);
}

export function matches(doc: Doc, filter: Doc = {}): boolean {
    return Object.entries(filter).every(([key, condition]) => {
        if (key === '$or') return (condition as Doc[]).some(part => matches(doc, part));
        if (key === '$and') return (condition as Doc[]).every(part => matches(doc, part));
        if (key === '$expr') return truthy(evaluate(condition, doc));
        return matchCondition(getPath(doc, key), condition);
    });
}

const truthy = (value: unknown) => value !== false && value !== null && value !== undefined && value !== 0;

const sumOf = (values: unknown[]) =>
    values.some(v => v === null || v === undefined)
        ? null
        : values.reduce<any>(
              (acc, v) => (v instanceof Date ? new Date(v.getTime() + Number(acc)) : acc + Number(v)),
              0
          );

export function evaluate(expr: unknown, doc: Doc, vars: Doc = {}): unknown {
    if (typeof expr === 'string') {
        if (expr.startsWith('$$')) return getPath(vars, expr.slice(2));
        if (expr.startsWith('$')) return getPath(doc, expr.slice(1));
        return expr;
    }
    if (Array.isArray(expr)) return expr.map(item => evaluate(item, doc, vars));
    if (!isPlainObject(expr)) return expr;
    const keys = Object.keys(expr);
    if (keys.length === 1 && keys[0].startsWith('$')) {
        const op = keys[0];
        const arg = expr[op];
        const args = () => (Array.isArray(arg) ? arg : [arg]).map(item => evaluate(item, doc, vars));
        switch (op) {
            case '$literal':
                return arg;
            case '$add':
                return sumOf(args());
            case '$subtract': {
                const [a, b] = args() as any[];
                return a === null || a === undefined || b === null || b === undefined ? null : a - b;
            }
            case '$max':
                return (args().filter(v => v !== null && v !== undefined) as any[]).reduce(
                    (acc, v) => (acc === undefined || compare(v, acc) > 0 ? v : acc),
                    undefined
                );
            case '$min':
                return (args().filter(v => v !== null && v !== undefined) as any[]).reduce(
                    (acc, v) => (acc === undefined || compare(v, acc) < 0 ? v : acc),
                    undefined
                );
            case '$cond': {
                const [test, then, otherwise] = Array.isArray(arg) ? arg : [arg.if, arg.then, arg.else];
                return truthy(evaluate(test, doc, vars)) ? evaluate(then, doc, vars) : evaluate(otherwise, doc, vars);
            }
            case '$ifNull': {
                const values = args();
                const found = values.slice(0, -1).find(v => v !== null && v !== undefined);
                return found !== undefined ? found : values[values.length - 1];
            }
            case '$concatArrays': {
                const values = args();
                return values.some(v => v === null || v === undefined)
                    ? null
                    : ([] as unknown[]).concat(...(values as any[]));
            }
            case '$filter': {
                const input = evaluate(arg.input, doc, vars);
                if (!Array.isArray(input)) return null;
                const name = arg.as || 'this';
                return input.filter(item => truthy(evaluate(arg.cond, doc, { ...vars, [name]: item })));
            }
            case '$in': {
                const [value, list] = args();
                return Array.isArray(list) && list.some(item => same(item, value));
            }
            case '$eq':
            case '$ne':
            case '$gt':
            case '$gte':
            case '$lt':
            case '$lte': {
                const [a, b] = args();
                const c = compare(a, b);
                return { $eq: c === 0, $ne: c !== 0, $gt: c > 0, $gte: c >= 0, $lt: c < 0, $lte: c <= 0 }[op];
            }
            case '$and':
                return args().every(truthy);
            case '$or':
                return args().some(truthy);
            case '$not':
                return !truthy(args()[0]);
            default:
                throw new Error(`fake: unsupported expression ${op}`);
        }
    }
    return Object.fromEntries(Object.entries(expr).map(([k, v]) => [k, evaluate(v, doc, vars)]));
}

function applyUpdate(doc: Doc, update: Doc | Doc[], inserting: boolean) {
    if (Array.isArray(update)) {
        for (const stage of update) {
            const [op, fields] = Object.entries(stage)[0];
            if (op !== '$set' && op !== '$addFields') throw new Error(`fake: unsupported pipeline stage ${op}`);
            const input = clone(doc);
            for (const [path, expr] of Object.entries(fields as Doc)) {
                setPath(doc, path, clone(evaluate(expr, input)));
            }
        }
        return;
    }
    for (const [op, fields] of Object.entries(update)) {
        for (const [path, value] of Object.entries(fields as Doc)) {
            const current = getPath(doc, path);
            switch (op) {
                case '$set':
                    setPath(doc, path, clone(value));
                    break;
                case '$setOnInsert':
                    if (inserting) setPath(doc, path, clone(value));
                    break;
                case '$unset':
                    setPath(doc, path, undefined);
                    break;
                case '$inc':
                    setPath(doc, path, Number(current || 0) + Number(value));
                    break;
                case '$push':
                    setPath(doc, path, [...((current as unknown[]) || []), clone(value)]);
                    break;
                case '$addToSet':
                    setPath(
                        doc,
                        path,
                        containsOrEquals(current, value) && Array.isArray(current)
                            ? current
                            : [...((current as unknown[]) || []), clone(value)]
                    );
                    break;
                case '$pull':
                    if (Array.isArray(current)) {
                        setPath(
                            doc,
                            path,
                            current.filter(item => !same(item, value))
                        );
                    }
                    break;
                default:
                    throw new Error(`fake: unsupported update operator ${op}`);
            }
        }
    }
}

function project(doc: Doc, projection?: Record<string, 0 | 1>): Doc {
    if (!projection || !Object.keys(projection).length) return doc;
    const include = Object.values(projection).some(v => v === 1);
    if (include) {
        const out: Doc = { _id: doc._id };
        for (const [key, flag] of Object.entries(projection)) {
            if (flag === 1 && getPath(doc, key) !== undefined) setPath(out, key, getPath(doc, key));
            if (key === '_id' && flag === 0) delete out._id;
        }
        return out;
    }
    const out = clone(doc);
    for (const key of Object.keys(projection)) setPath(out, key, undefined);
    return out;
}

export interface FakeCollectionOptions {
    /** Compound unique indexes (lists of dotted paths), checked on insert and update. */
    unique?: string[][];
}

export class FakeCollection implements ICollectionLike {
    readonly docs: Doc[] = [];
    calls = 0;

    constructor(readonly name: string, private readonly options: FakeCollectionOptions = {}) {}

    /** Called before each operation with its name; a spec can throw here to fail a write. */
    beforeOp: ((op: string, filter: Doc, update?: unknown) => void) | null = null;

    private assertUnique(candidate: Doc, ignore?: Doc) {
        const others = this.docs.filter(doc => doc !== ignore);
        if (others.some(doc => same(doc._id, candidate._id))) throw new DuplicateKeyError(`${this.name} _id`);
        for (const keys of this.options.unique || []) {
            if (others.some(doc => keys.every(key => same(getPath(doc, key), getPath(candidate, key))))) {
                throw new DuplicateKeyError(`${this.name} ${keys.join(',')}`);
            }
        }
    }

    private select(filter: Doc, options: IFindOptions = {}) {
        let rows = this.docs.filter(doc => matches(doc, filter));
        if (options.sort) {
            const sort = Object.entries(options.sort);
            rows = [...rows].sort((a, b) => {
                for (const [key, dir] of sort) {
                    const c = compare(getPath(a, key), getPath(b, key));
                    if (c) return c * dir;
                }
                return 0;
            });
        }
        if (options.limit) rows = rows.slice(0, options.limit);
        return rows;
    }

    async findOne(filter: Doc, options: IFindOptions = {}) {
        await yieldOnce();
        this.calls++;
        this.beforeOp?.('findOne', filter);
        const [doc] = this.select(filter, { ...options, limit: 1 });
        return doc ? project(clone(doc), options.projection) : null;
    }

    find(filter: Doc, options: IFindOptions = {}) {
        return {
            toArray: async () => {
                await yieldOnce();
                this.calls++;
                this.beforeOp?.('find', filter);
                return this.select(filter, options).map(doc => project(clone(doc), options.projection));
            },
        };
    }

    async insertOne(doc: Doc) {
        await yieldOnce();
        this.calls++;
        this.beforeOp?.('insertOne', {}, doc);
        const row = clone(doc);
        if (row._id === undefined) row._id = new Types.ObjectId();
        this.assertUnique(row);
        this.docs.push(row);
        return { insertedId: row._id };
    }

    async updateOne(filter: Doc, update: Doc | Doc[], options: { upsert?: boolean } = {}): Promise<IWriteResult> {
        await yieldOnce();
        this.calls++;
        this.beforeOp?.('updateOne', filter, update);
        const doc = this.docs.find(row => matches(row, filter));
        if (doc) {
            const next = clone(doc);
            applyUpdate(next, update, false);
            this.assertUnique(next, doc);
            const modified = !same(next, doc);
            Object.keys(doc).forEach(key => delete doc[key]);
            Object.assign(doc, next);
            return { matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0 };
        }
        if (!options.upsert) {
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }
        const seed: Doc = {};
        for (const [key, condition] of Object.entries(filter)) {
            if (key.startsWith('$')) continue;
            if (isPlainObject(condition) && Object.keys(condition).some(k => k.startsWith('$'))) continue;
            setPath(seed, key, clone(condition));
        }
        applyUpdate(seed, update, true);
        if (seed._id === undefined) seed._id = new Types.ObjectId();
        this.assertUnique(seed);
        this.docs.push(seed);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }

    async countDocuments(filter: Doc, options: { limit?: number } = {}) {
        await yieldOnce();
        this.calls++;
        const count = this.docs.filter(doc => matches(doc, filter)).length;
        return options.limit ? Math.min(count, options.limit) : count;
    }

    async findOneAndUpdate(filter: Doc, update: Doc, options: { upsert?: boolean } = {}) {
        // Only the job lease uses this (acquireLease): its upsert-on-expired semantics.
        await yieldOnce();
        const doc = this.docs.find(row => matches(row, filter));
        if (doc) {
            applyUpdate(doc, update, false);
            return { value: clone(doc) };
        }
        if (options.upsert) {
            const seed: Doc = { _id: filter._id };
            applyUpdate(seed, update, true);
            this.assertUnique(seed);
            this.docs.push(seed);
            return { value: clone(seed) };
        }
        return { value: null };
    }

    get(id: unknown): Doc | undefined {
        return this.docs.find(doc => same(doc._id, id));
    }
}

export interface FakeRescueGoalDb extends IRescueGoalCollections {
    goals: FakeCollection;
    pledges: FakeCollection;
    days: FakeCollection;
    helpers: FakeCollection;
    receipts: FakeCollection;
    users: FakeCollection;
    shelters: FakeCollection;
    donations: FakeCollection;
    jobRuns: FakeCollection;
}

export function fakeRescueGoalDb(): FakeRescueGoalDb {
    return {
        goals: new FakeCollection('rescuegoals'),
        pledges: new FakeCollection('rescuegoalpledges', { unique: [['user', 'clientId']] }),
        days: new FakeCollection('rescuegoalpledgedays'),
        helpers: new FakeCollection('rescuegoalhelpers'),
        receipts: new FakeCollection('rescuegoalreceipts'),
        users: new FakeCollection('users'),
        shelters: new FakeCollection('shelters'),
        donations: new FakeCollection('shelterdonations'),
        jobRuns: new FakeCollection('jobruns'),
    };
}

/** Eligibility stand-in: every user has `games[userId]` saved games (default 3). */
export function fakeEligibility(games: Record<string, number> = {}, fallback = 3) {
    return {
        savedGames: jest.fn(async (userId: unknown, cap: number) => Math.min(cap, games[String(userId)] ?? fallback)),
    };
}
