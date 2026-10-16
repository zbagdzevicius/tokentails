/*
 * A small in-memory stand-in for the Mongoose models the AI budget uses (bet #3 specs). It models what
 * the budget relies on: `$not: {$gt}` / `$not: {$gte}` (which also match a missing field), `$gt`,
 * `$exists`, upserts that insert the filter's equality fields, and E11000 on the unique key when an
 * upsert misses a document that exists. `failNextWith11000` simulates two first-of-day upserts racing.
 */

type Doc = Record<string, any>;

const get = (doc: Doc, path: string) =>
    path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), doc);

function set(doc: Doc, path: string, value: unknown) {
    const keys = path.split('.');
    let target = doc;
    for (const key of keys.slice(0, -1)) {
        target[key] = target[key] ?? {};
        target = target[key];
    }
    target[keys[keys.length - 1]] = value;
}

function matchesCondition(value: any, condition: any): boolean {
    if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
        const keys = Object.keys(condition);
        if (keys.length && keys.every(key => key.startsWith('$'))) {
            return keys.every(operator => {
                const operand = condition[operator];
                switch (operator) {
                    case '$not':
                        return !matchesCondition(value, operand);
                    case '$gt':
                        return value !== undefined && value !== null && value > operand;
                    case '$gte':
                        return value !== undefined && value !== null && value >= operand;
                    case '$lte':
                        return value !== undefined && value !== null && value <= operand;
                    case '$exists':
                        return operand ? value !== undefined : value === undefined;
                    case '$ne':
                        return value !== operand;
                    case '$in':
                        return operand.some((item: any) => String(item) === String(value));
                    default:
                        throw new Error(`fake collection: unsupported operator ${operator}`);
                }
            });
        }
    }
    if (condition === null) {
        return value === null || value === undefined;
    }
    return String(value) === String(condition);
}

const matches = (doc: Doc, filter: Doc) =>
    Object.entries(filter).every(([path, condition]) => matchesCondition(get(doc, path), condition));

function applyUpdate(doc: Doc, update: Doc, inserting: boolean) {
    for (const [path, value] of Object.entries(update.$set || {})) {
        set(doc, path, value);
    }
    for (const [path, value] of Object.entries(update.$inc || {})) {
        set(doc, path, (get(doc, path) || 0) + (value as number));
    }
    if (inserting) {
        for (const [path, value] of Object.entries(update.$setOnInsert || {})) {
            set(doc, path, value);
        }
    }
}

const query = <T>(value: T) => {
    const promise = Promise.resolve(value);
    return Object.assign(promise, {
        lean: () => promise,
        sort: () => query(value),
        limit: () => query(value),
    });
};

export class FakeCollection {
    docs: Doc[] = [];
    calls = 0;
    private pendingDuplicateErrors = 0;

    constructor(private readonly uniqueKey: string) {}

    failNextWith11000(times = 1) {
        this.pendingDuplicateErrors = times;
    }

    private duplicate() {
        return Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    }

    private upsertOrUpdate(filter: Doc, update: Doc, options: Doc = {}): { doc: Doc | null; matched: boolean } {
        this.calls += 1;
        if (this.pendingDuplicateErrors > 0) {
            this.pendingDuplicateErrors -= 1;
            throw this.duplicate();
        }
        const found = this.docs.find(doc => matches(doc, filter));
        if (found) {
            applyUpdate(found, update, false);
            return { doc: found, matched: true };
        }
        if (!options.upsert) {
            return { doc: null, matched: false };
        }
        const fresh: Doc = {};
        for (const [path, condition] of Object.entries(filter)) {
            const isOperator =
                condition && typeof condition === 'object' && Object.keys(condition).some(key => key.startsWith('$'));
            if (!isOperator) {
                set(fresh, path, condition);
            }
        }
        if (this.docs.some(doc => String(doc[this.uniqueKey]) === String(fresh[this.uniqueKey]))) {
            throw this.duplicate();
        }
        applyUpdate(fresh, update, true);
        this.docs.push(fresh);
        return { doc: fresh, matched: false };
    }

    findOneAndUpdate(filter: Doc, update: Doc, options: Doc = {}) {
        try {
            const { doc } = this.upsertOrUpdate(filter, update, options);
            return query(doc ? { ...doc } : null);
        } catch (error) {
            const rejected = Promise.reject(error);
            return Object.assign(rejected, { lean: () => rejected });
        }
    }

    async updateOne(filter: Doc, update: Doc, options: Doc = {}) {
        const { doc, matched } = this.upsertOrUpdate(filter, update, options);
        return { matchedCount: matched ? 1 : 0, modifiedCount: doc ? 1 : 0, upsertedCount: doc && !matched ? 1 : 0 };
    }

    findOne(filter: Doc) {
        const found = this.docs.find(doc => matches(doc, filter));
        return query(found ? JSON.parse(JSON.stringify(found)) : null);
    }

    find(filter: Doc) {
        return query(this.docs.filter(doc => matches(doc, filter)).map(doc => ({ ...doc })));
    }

    byKey(key: string) {
        return this.docs.find(doc => String(doc[this.uniqueKey]) === key);
    }
}
