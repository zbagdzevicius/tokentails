// In-memory stand-in for the slice of a Mongoose model the impact and donation code uses. The name
// ends in `-spec.ts`, so tsconfig.build.json leaves it out of dist and jest does not run it.
// Not imported by application code.
import { Types } from 'mongoose';

export const duplicateKey = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

type Doc = Record<string, any>;

const isPlainObject = (value: unknown): value is Record<string, any> =>
    !!value &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !(value instanceof Types.ObjectId) &&
    !Array.isArray(value);

const norm = (value: any) =>
    value instanceof Types.ObjectId ? `oid:${value.toString()}` : value instanceof Date ? value.getTime() : value;

function valuesAt(doc: Doc, path: string): any[] {
    const parts = path.split('.');
    let current: any[] = [doc];
    for (const part of parts) {
        const next: any[] = [];
        for (const value of current) {
            if (Array.isArray(value)) {
                value.forEach(item => item && typeof item === 'object' && next.push(item[part]));
            } else if (value && typeof value === 'object') {
                next.push(value[part]);
            }
        }
        current = next;
    }
    return current.flatMap(value => (Array.isArray(value) ? [value, ...value] : [value]));
}

function compare(a: any, b: any): number {
    // Missing and null sort first, as in MongoDB.
    const aMissing = a === undefined || a === null;
    const bMissing = b === undefined || b === null;
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? -1 : 1;
    const x = norm(a);
    const y = norm(b);
    return x < y ? -1 : x > y ? 1 : 0;
}

function test(value: any, condition: any): boolean {
    if (isPlainObject(condition) && Object.keys(condition).some(key => key.startsWith('$'))) {
        return Object.entries(condition).every(([op, arg]) => {
            switch (op) {
                case '$in':
                    return (arg as any[]).some(item => norm(item) === norm(value));
                case '$nin':
                    return !(arg as any[]).some(item => norm(item) === norm(value));
                case '$ne':
                    return norm(value) !== norm(arg);
                case '$exists':
                    return (value !== undefined) === !!arg;
                case '$lt':
                    return value !== undefined && value !== null && compare(value, arg) < 0;
                case '$lte':
                    return value !== undefined && value !== null && compare(value, arg) <= 0;
                case '$gt':
                    return value !== undefined && value !== null && compare(value, arg) > 0;
                case '$gte':
                    return value !== undefined && value !== null && compare(value, arg) >= 0;
                case '$not':
                    return !test(value, arg);
                default:
                    throw new Error(`fake model: unsupported operator ${op}`);
            }
        });
    }
    return norm(value) === norm(condition);
}

export function matches(doc: Doc, filter: Doc = {}): boolean {
    return Object.entries(filter).every(([key, condition]) => {
        if (key === '$or') return (condition as Doc[]).some(sub => matches(doc, sub));
        if (key === '$and') return (condition as Doc[]).every(sub => matches(doc, sub));
        if (key === '$nor') return !(condition as Doc[]).some(sub => matches(doc, sub));
        const values = valuesAt(doc, key);
        const negative = isPlainObject(condition) && ('$ne' in condition || '$nin' in condition || '$not' in condition);
        if (negative) {
            return values.every(value => test(value, condition));
        }
        return values.some(value => test(value, condition));
    });
}

function setPath(doc: Doc, path: string, value: unknown) {
    const parts = path.split('.');
    let target = doc;
    for (const part of parts.slice(0, -1)) {
        if (!isPlainObject(target[part])) target[part] = {};
        target = target[part];
    }
    target[parts[parts.length - 1]] = value;
}

function unsetPath(doc: Doc, path: string) {
    const parts = path.split('.');
    let target = doc;
    for (const part of parts.slice(0, -1)) {
        if (!isPlainObject(target[part])) return;
        target = target[part];
    }
    delete target[parts[parts.length - 1]];
}

function applyUpdate(doc: Doc, update: Doc, inserting: boolean) {
    const ops = Object.keys(update).some(key => key.startsWith('$')) ? update : { $set: update };
    for (const [op, fields] of Object.entries(ops)) {
        for (const [key, value] of Object.entries(fields as Doc)) {
            if (op === '$set' || (op === '$setOnInsert' && inserting)) setPath(doc, key, value);
            else if (op === '$unset') unsetPath(doc, key);
            else if (op === '$inc') doc[key] = (doc[key] || 0) + (value as number);
            else if (op === '$push') {
                doc[key] = [...(doc[key] || []), ...(isPlainObject(value) && '$each' in value ? value.$each : [value])];
            } else if (op === '$addToSet') {
                const items = isPlainObject(value) && '$each' in value ? value.$each : [value];
                const current = [...(doc[key] || [])];
                items.forEach((item: any) => !current.some(c => norm(c) === norm(item)) && current.push(item));
                doc[key] = current;
            } else if (op === '$pull') {
                const condition = value;
                doc[key] = (doc[key] || []).filter((item: any) => !test(item, condition));
            } else if (op !== '$setOnInsert') throw new Error(`fake model: unsupported update ${op}`);
        }
    }
}

function project(doc: Doc, projection?: Doc | string | null): Doc {
    const copy = { ...doc };
    if (!projection || typeof projection === 'string') return copy;
    const keys = Object.keys(projection).filter(key => projection[key]);
    if (!keys.length) return copy;
    const out: Doc = { _id: doc._id };
    keys.forEach(key => key in doc && (out[key] = doc[key]));
    return out;
}

function sortRows(rows: Doc[], spec?: Doc) {
    if (!spec) return rows;
    const entries = Object.entries(spec);
    return [...rows].sort((a, b) => {
        for (const [key, dir] of entries) {
            const c = compare(a[key], b[key]);
            if (c) return c * (dir as number);
        }
        return 0;
    });
}

/** A chainable, awaitable query like Mongoose's (`.sort().limit().lean().exec()`). */
function query<T>(run: (opts: { sort?: Doc; limit?: number }) => T) {
    const opts: { sort?: Doc; limit?: number } = {};
    const q: any = {
        sort: (spec: Doc) => ((opts.sort = spec), q),
        limit: (n: number) => ((opts.limit = n), q),
        lean: () => q,
        exec: async () => run(opts),
        then: (resolve: any, reject: any) =>
            Promise.resolve()
                .then(() => run(opts))
                .then(resolve, reject),
        catch: (reject: any) =>
            Promise.resolve()
                .then(() => run(opts))
                .catch(reject),
    };
    return q;
}

export interface MemoryModelOptions {
    /** Compound unique indexes, as lists of field names. `_id` is always unique. */
    unique?: string[][];
    now?: () => Date;
    /** `db.collection(name)` result, for crons that take their lease from the model's connection. */
    collections?: Record<string, unknown>;
}

export function memoryModel(options: MemoryModelOptions = {}) {
    const rows: Doc[] = [];
    const now = options.now || (() => new Date());
    const unique = [['_id'], ...(options.unique || [])];

    const violates = (candidate: Doc, self?: Doc) =>
        unique.some(fields =>
            rows.some(
                row =>
                    row !== self &&
                    fields.every(field => candidate[field] !== undefined && norm(row[field]) === norm(candidate[field]))
            )
        );

    const insert = (doc: Doc) => {
        const row = { _id: new Types.ObjectId(), createdAt: now(), updatedAt: now(), ...doc };
        if (violates(row)) throw duplicateKey();
        rows.push(row);
        return row;
    };

    const upsertBase = (filter: Doc) =>
        Object.fromEntries(
            Object.entries(filter).filter(([key, value]) => !key.startsWith('$') && !isPlainObject(value))
        );

    const writeOne = (filter: Doc, update: Doc, opts: Doc = {}) => {
        const row = rows.find(r => matches(r, filter));
        if (row) {
            const before = { ...row };
            const next = { ...row };
            applyUpdate(next, update, false);
            next.updatedAt = now();
            if (violates(next, row)) throw duplicateKey();
            Object.keys(row).forEach(key => delete row[key]);
            Object.assign(row, next);
            return { before, after: row, upserted: false };
        }
        if (!opts.upsert) return { before: null, after: null, upserted: false };
        const doc = upsertBase(filter);
        applyUpdate(doc, update, true);
        return { before: null, after: insert(doc), upserted: true };
    };

    const model = {
        rows,
        db: { collection: (name: string) => options.collections?.[name] },
        create: jest.fn(async (doc: Doc) => insert({ ...doc })),
        findOne: jest.fn((filter: Doc = {}, projection?: Doc) =>
            query(({ sort }) => {
                const row = sortRows(
                    rows.filter(r => matches(r, filter)),
                    sort
                )[0];
                return row ? project(row, projection) : null;
            })
        ),
        find: jest.fn((filter: Doc = {}, projection?: Doc) =>
            query(({ sort, limit }) =>
                sortRows(
                    rows.filter(r => matches(r, filter)),
                    sort
                )
                    .slice(0, limit ?? Infinity)
                    .map(row => project(row, projection))
            )
        ),
        findOneAndUpdate: jest.fn((filter: Doc, update: Doc, opts: Doc = {}) =>
            query(() => {
                const { before, after } = writeOne(filter, update, opts);
                const result = opts.new ? after : before;
                return result ? { ...result } : null;
            })
        ),
        updateOne: jest.fn(async (filter: Doc, update: Doc, opts: Doc = {}) => {
            const { after, upserted } = writeOne(filter, update, opts);
            return {
                matchedCount: after && !upserted ? 1 : 0,
                modifiedCount: after && !upserted ? 1 : 0,
                upsertedCount: upserted ? 1 : 0,
            };
        }),
        updateMany: jest.fn(async (filter: Doc, update: Doc) => {
            const hits = rows.filter(r => matches(r, filter));
            hits.forEach(row => {
                applyUpdate(row, update, false);
                row.updatedAt = now();
            });
            return { matchedCount: hits.length, modifiedCount: hits.length };
        }),
        deleteOne: jest.fn(async (filter: Doc) => {
            const index = rows.findIndex(r => matches(r, filter));
            if (index >= 0) rows.splice(index, 1);
            return { deletedCount: index >= 0 ? 1 : 0 };
        }),
        deleteMany: jest.fn(async (filter: Doc) => {
            const keep = rows.filter(r => !matches(r, filter));
            const deletedCount = rows.length - keep.length;
            rows.splice(0, rows.length, ...keep);
            return { deletedCount };
        }),
        countDocuments: jest.fn((filter: Doc = {}) =>
            query(({ limit }) => Math.min(rows.filter(r => matches(r, filter)).length, limit ?? Infinity))
        ),
        distinct: jest.fn(async (field: string, filter: Doc = {}) => [
            ...new Set(rows.filter(r => matches(r, filter)).map(r => r[field])),
        ]),
        aggregate: jest.fn((pipeline: Doc[]) => ({
            exec: async () => aggregate(rows, pipeline),
        })),
    };
    return model;
}

/** `YYYY-MM` style formats of `$dateToString` (UTC). */
function dateToString(spec: Doc, row: Doc): string | null {
    const value = row[String(spec.date).slice(1)];
    if (!value) return null;
    const iso = new Date(value).toISOString();
    return String(spec.format)
        .replace('%Y', iso.slice(0, 4))
        .replace('%m', iso.slice(5, 7))
        .replace('%d', iso.slice(8, 10));
}

function groupId(idSpec: any, row: Doc): any {
    if (idSpec === null) return null;
    if (typeof idSpec === 'string') return row[idSpec.slice(1)];
    if (isPlainObject(idSpec) && idSpec.$dateToString) return dateToString(idSpec.$dateToString, row);
    return Object.fromEntries(Object.entries(idSpec as Doc).map(([key, path]) => [key, row[String(path).slice(1)]]));
}

/**
 * `$match` then `$group` with `$sum: 1`, `$sum: '$field'`, `$sum: {$toDecimal: '$field'}` or
 * `$push: '$field'`, grouped by null, a field, a `$dateToString` or an object of fields: the pipelines
 * this code runs.
 */
function aggregate(rows: Doc[], pipeline: Doc[]): Doc[] {
    let current = rows;
    for (const stage of pipeline) {
        if (stage.$match) {
            current = current.filter(r => matches(r, stage.$match));
        } else if (stage.$group) {
            const { _id: idSpec, ...accumulators } = stage.$group;
            const groups = new Map<string, Doc>();
            for (const row of current) {
                const id = groupId(idSpec, row);
                const key = JSON.stringify(norm(id) ?? id);
                const group = groups.get(key) || { _id: id };
                for (const [name, acc] of Object.entries(accumulators)) {
                    const sum = (acc as Doc).$sum;
                    const push = (acc as Doc).$push;
                    if (push !== undefined) group[name] = [...(group[name] || []), row[String(push).slice(1)]];
                    else if (sum === 1) group[name] = (group[name] || 0) + 1;
                    else if (typeof sum === 'string')
                        group[name] = (group[name] || 0) + (Number(row[sum.slice(1)]) || 0);
                    else if (sum?.$toDecimal) {
                        const value = BigInt(String(row[String(sum.$toDecimal).slice(1)] || '0'));
                        group[name] = (BigInt(group[name] || 0) + value).toString();
                    } else throw new Error('fake aggregate: unsupported accumulator');
                }
                groups.set(key, group);
            }
            current = [...groups.values()];
        } else {
            throw new Error(`fake aggregate: unsupported stage ${Object.keys(stage)[0]}`);
        }
    }
    return current;
}
