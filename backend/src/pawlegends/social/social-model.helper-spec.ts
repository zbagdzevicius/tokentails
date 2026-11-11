/*
 * MemoryModel (user/guest/memory-model.helper-spec.ts) with the query chain the social code uses: `sort` actually
 * sorts, `select` projects, `skip`/`limit` apply after the sort, and `findById` reads by `_id`. Not a spec.
 */
import { MemoryModel, matches } from 'src/user/guest/memory-model.helper-spec';

type Doc = Record<string, any>;

const get = (doc: Doc, path: string) =>
    path.split('.').reduce<any>((v, k) => (v === null || v === undefined ? undefined : v[k]), doc);

const cmp = (a: unknown, b: unknown) => {
    const x = a instanceof Date ? a.getTime() : (a as any);
    const y = b instanceof Date ? b.getTime() : (b as any);
    if (x === y) return 0;
    if (x === undefined || x === null) return -1;
    if (y === undefined || y === null) return 1;
    return x < y ? -1 : 1;
};

function chain(load: () => Promise<Doc[]>, single = false) {
    let sortSpec: Record<string, number> | null = null;
    let skipN = 0;
    let limitN = Infinity;
    let fields: Record<string, number> | null = null;
    const run = async () => {
        let docs = await load();
        if (sortSpec) {
            const spec = Object.entries(sortSpec);
            docs = [...docs].sort((a, b) => {
                for (const [k, dir] of spec) {
                    const c = cmp(get(a, k), get(b, k));
                    if (c) return c * dir;
                }
                return 0;
            });
        }
        docs = docs.slice(skipN, skipN + limitN);
        if (fields && Object.values(fields).some(v => v)) {
            const keep = Object.keys(fields).filter(k => fields![k]);
            docs = docs.map(d => Object.fromEntries([['_id', d._id], ...keep.map(k => [k, d[k]])]));
        }
        return single ? docs[0] ?? null : docs;
    };
    const c: any = {
        lean: () => c,
        exec: () => run(),
        sort: (s: Record<string, number>) => ((sortSpec = s), c),
        skip: (n: number) => ((skipN = n), c),
        limit: (n: number) => ((limitN = n), c),
        select: (f: Record<string, number>) => ((fields = f), c),
        maxTimeMS: () => c,
        then: (res: any, rej: any) => run().then(res, rej),
    };
    return c;
}

/** Every value at a dotted path, through arrays (MongoDB's array traversal). */
function valuesAt(doc: any, keys: string[]): unknown[] {
    if (!keys.length) return [doc];
    if (doc === null || doc === undefined) return [undefined];
    if (Array.isArray(doc) && !/^\d+$/.test(keys[0])) return doc.flatMap(item => valuesAt(item, keys));
    return valuesAt(doc[keys[0]], keys.slice(1));
}

/** `matches` with array traversal on dotted paths (`'members.accountId': id`). */
export function deepMatches(doc: Doc, filter: Doc = {}): boolean {
    return Object.entries(filter).every(([key, cond]) => {
        if (key === '$or') return (cond as Doc[]).some(part => deepMatches(doc, part));
        if (key === '$and') return (cond as Doc[]).every(part => deepMatches(doc, part));
        if (!key.includes('.')) return matches(doc, { [key]: cond });
        const vals = valuesAt(doc, key.split('.'));
        return vals.some(v => matches({ v }, { v: cond }));
    });
}

export class SocialMemoryModel extends MemoryModel {
    find(filter: Doc = {}) {
        this.calls.push('find');
        return chain(async () =>
            this.docs.filter(d => deepMatches(d, filter)).map(d => JSON.parse(JSON.stringify(d), revive))
        );
    }

    findOne(filter: Doc = {}) {
        this.calls.push('findOne');
        return chain(
            async () => this.docs.filter(d => deepMatches(d, filter)).map(d => JSON.parse(JSON.stringify(d), revive)),
            true
        );
    }

    findById(id: unknown) {
        return this.findOne({ _id: id });
    }

    async countDocuments(filter: Doc = {}) {
        return this.docs.filter(d => deepMatches(d, filter)).length;
    }

    async bulkWrite(ops: Array<{ updateOne: { filter: Doc; update: Doc; upsert?: boolean } }>) {
        for (const op of ops)
            await this.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert });
        return { ok: 1 };
    }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const revive = (_k: string, v: unknown) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v);

/** A fixed clock the specs move. */
export class TestClock {
    constructor(public ms = Date.UTC(2026, 10, 12, 12, 0, 0)) {}
    now = () => new Date(this.ms);
    advance(ms: number) {
        this.ms += ms;
    }
}
