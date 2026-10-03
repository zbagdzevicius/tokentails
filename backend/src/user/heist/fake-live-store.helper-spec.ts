import { Types } from 'mongoose';

/*
 * In-memory stand-ins for the user and game repositories `/live` uses, with MongoDB's semantics
 * where they matter for the save path:
 * - a dotted `$max`/`$set` into a missing field creates a SUB-DOCUMENT (`{ "3": x }`), and into an
 *   array pads it with null, exactly as MongoDB does, so a missing array guard shows up as a bug;
 * - `$bit` on a null or non-integer slot throws, as MongoDB does;
 * - the update pipeline of `arrayGuardPipeline` is interpreted for its two expression shapes;
 * - `games.create` enforces the global unique `replayDigest` with an E11000 error.
 * The real behaviour is checked against MongoDB in heist-mongo.spec.ts (opt-in).
 */

type Doc = Record<string, any>;

const clone = <T>(value: T): T =>
    value === undefined || value instanceof Date ? value : JSON.parse(JSON.stringify(value));

function project(doc: Doc, projection?: string): Doc {
    if (!projection) {
        return { ...clone(doc), _id: doc._id };
    }
    const out: Doc = { _id: doc._id };
    for (const field of projection.split(/\s+/).filter(Boolean)) {
        if (field in doc) {
            out[field] = field === 'cat' ? doc[field] : clone(doc[field]);
        }
    }
    return out;
}

function writePath(doc: Doc, path: string, apply: (current: unknown) => unknown) {
    const [field, key] = path.split('.');
    if (key === undefined) {
        doc[field] = apply(doc[field]);
        return;
    }
    if (doc[field] === undefined || doc[field] === null) {
        doc[field] = {};
    }
    const container = doc[field];
    if (Array.isArray(container)) {
        const index = Number(key);
        while (container.length < index) {
            container.push(null);
        }
        container[index] = apply(container[index]);
    } else {
        container[key] = apply(container[key]);
    }
}

function evalGuardExpression(doc: Doc, field: string, expression: any) {
    const value = doc[field];
    if (expression.$ifNull) {
        return value === undefined || value === null ? [] : value;
    }
    if (expression.$switch) {
        const length = expression.$switch.default.length;
        if (Array.isArray(value)) {
            return Array.from({ length: Math.max(length, value.length) }, (_v, index) =>
                typeof value[index] === 'number' ? Math.trunc(value[index]) : 0
            );
        }
        if (value && typeof value === 'object') {
            return value;
        }
        return Array.from({ length }, () => 0);
    }
    throw new Error(`fake store: unsupported pipeline expression for ${field}`);
}

export function applyUpdate(doc: Doc, update: any) {
    if (Array.isArray(update)) {
        for (const stage of update) {
            const computed = Object.entries(stage.$set).map(([field, expression]) => [
                field,
                evalGuardExpression(doc, field, expression),
            ]);
            computed.forEach(([field, value]) => (doc[field as string] = value));
        }
        return;
    }
    for (const [operator, fields] of Object.entries<any>(update)) {
        for (const [path, operand] of Object.entries<any>(fields)) {
            if (operator === '$set') {
                writePath(doc, path, () => (operand instanceof Date ? operand : clone(operand)));
            } else if (operator === '$unset') {
                const [field, key] = path.split('.');
                if (key === undefined) delete doc[field];
                else if (doc[field]) doc[field][key] = null;
            } else if (operator === '$max') {
                writePath(doc, path, current =>
                    current === undefined || current === null || (operand as any) > (current as any) ? operand : current
                );
            } else if (operator === '$min') {
                // MongoDB order: a missing field takes the operand; null sorts below numbers and stays.
                writePath(doc, path, current =>
                    current === undefined || (current !== null && (operand as any) < (current as any))
                        ? operand
                        : current
                );
            } else if (operator === '$bit') {
                writePath(doc, path, current => {
                    const isAnd = operand.and !== undefined;
                    if (current === undefined) return isAnd ? 0 : operand.or;
                    if (!Number.isInteger(current)) {
                        throw Object.assign(new Error(`Cannot apply $bit to a value of non-integral type`), {
                            code: 2,
                        });
                    }
                    return isAnd ? (current as number) & operand.and : (current as number) | operand.or;
                });
            } else {
                throw new Error(`fake store: unsupported operator ${operator}`);
            }
        }
    }
}

export class FakeUsers {
    readonly docs = new Map<string, Doc>();
    readonly updates: { id: string; update: any }[] = [];

    add(doc: Doc = {}): string {
        const id = new Types.ObjectId().toString();
        this.docs.set(id, { cat: new Types.ObjectId(), ...clone(doc), _id: new Types.ObjectId(id) });
        return id;
    }

    get(id: string): Doc {
        return this.docs.get(id)!;
    }

    findOne = jest.fn(async ({ searchObject, projection }: { searchObject: Doc; projection?: string }) => {
        const doc = this.docs.get(String(searchObject._id));
        return doc ? project(doc, projection) : null;
    });

    update = jest.fn(async (id: string, update: any) => {
        this.updates.push({ id: String(id), update: JSON.parse(JSON.stringify(update)) });
        const doc = this.docs.get(String(id));
        if (doc) {
            applyUpdate(doc, update);
        }
        return doc ? project(doc) : null;
    });
}

export class FakeGames {
    readonly rows: Doc[] = [];

    findOne = jest.fn(
        async ({ searchObject }: { searchObject: Doc }) =>
            this.rows.find(row => Object.entries(searchObject).every(([key, value]) => row[key] === value)) || null
    );

    create = jest.fn(async (row: Doc) => {
        if (row.replayDigest && this.rows.some(existing => existing.replayDigest === row.replayDigest)) {
            throw Object.assign(new Error('E11000 duplicate key error collection: games index: replayDigest_unique'), {
                code: 11000,
            });
        }
        const stored = { ...row, _id: new Types.ObjectId() };
        this.rows.push(stored);
        return stored;
    });

    delete = jest.fn(async (id: string) => {
        const index = this.rows.findIndex(row => String(row._id) === String(id));
        return index >= 0 ? this.rows.splice(index, 1)[0] : null;
    });

    updateMany = jest.fn();
    updateOne = jest.fn();
    insertMany = jest.fn();
}
