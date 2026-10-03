import { Types } from 'mongoose';
import { CAT_UNIQUE_INDEXES, matches, MemoryModel } from 'src/user/guest/memory-model.helper-spec';

/* eslint-disable @typescript-eslint/no-var-requires */
const auditGrants = require('../../scripts/audit-orders-grants.js');
const backfillSpent = require('../../scripts/backfill-spent-usd.js');
const backfillStarters = require('../../scripts/backfill-starter-cats.js');
/* eslint-enable @typescript-eslint/no-var-requires */

/*
 * The 3c scripts (plan G3 "Legacy" and audit, G4 "Spend"): dry run by default, counts only, and the
 * read-only audit never calls a write method.
 */

/** A native-driver-like collection over a MemoryModel. `writable: false` throws on any write. */
function native(model: MemoryModel, writable = true) {
    const find = (filter: Record<string, unknown> = {}) => {
        const run = async () => model.docs.filter(doc => matches(doc, filter)).map(doc => ({ ...doc }));
        const cursor: any = {
            toArray: run,
            sort: () => cursor,
            batchSize: () => cursor,
            async *[Symbol.asyncIterator]() {
                for (const doc of await run()) yield doc;
            },
        };
        return cursor;
    };
    const reads = { find, countDocuments: (filter: Record<string, unknown>) => model.countDocuments(filter) };
    if (!writable) {
        return new Proxy(reads as Record<string, any>, {
            get(target, prop: string) {
                if (!(prop in target)) throw new Error(`read-only script called ${prop}`);
                return target[prop];
            },
        });
    }
    return { ...reads, updateOne: (filter: any, update: any) => model.updateOne(filter, update) };
}

const dbOf = (collections: Record<string, MemoryModel>, writable = true) => ({
    collection: (name: string) => {
        if (!collections[name]) throw new Error(`unexpected collection ${name}`);
        return native(collections[name], writable);
    },
});

const silent = () => undefined;

describe('scripts/backfill-starter-cats.js', () => {
    const legacy = (owner: Types.ObjectId, fields: Record<string, unknown> = {}) => ({
        _id: new Types.ObjectId(),
        owner,
        ...backfillStarters.LEGACY_CLEOCATRA,
        resqueStory: 'legacy',
        ...fields,
    });

    function world() {
        const plain = new Types.ObjectId();
        const minted = new Types.ObjectId();
        const deleted = new Types.ObjectId();
        const hasStarter = new Types.ObjectId();
        const twoCats = new Types.ObjectId();
        const activeSecond = legacy(twoCats, { createdAt: new Date('2025-02-01') });
        const cats = new MemoryModel(
            [
                legacy(plain),
                legacy(minted, { token: { stellar: 'C1' } }),
                legacy(deleted),
                legacy(hasStarter),
                { _id: new Types.ObjectId(), owner: hasStarter, isStarter: true, name: 'Scout' },
                legacy(twoCats, { createdAt: new Date('2025-01-01') }),
                activeSecond,
                // Not exact matches: renamed, a pack copy with a blessing, an unowned catalogue row.
                legacy(new Types.ObjectId(), { name: 'Cleo' }),
                legacy(new Types.ObjectId(), { blessing: new Types.ObjectId() }),
                { ...legacy(new Types.ObjectId()), owner: undefined },
            ],
            CAT_UNIQUE_INDEXES
        );
        const users = new MemoryModel([
            { _id: plain },
            { _id: minted },
            { _id: deleted, deletedAt: new Date() },
            { _id: hasStarter },
            { _id: twoCats, cat: activeSecond._id },
        ]);
        return { cats, users, ids: { plain, minted, deleted, hasStarter, twoCats, activeSecond } };
    }

    it('dry run counts and writes nothing', async () => {
        const { cats, users } = world();
        const before = JSON.stringify(cats.docs);

        const report = await backfillStarters.backfill(dbOf({ cats, users }), {}, new Date(), silent);

        expect(report).toMatchObject({
            matches: 6,
            owners: 5,
            ownersWithStarter: 1,
            // The fixture's Scout starter has no starterLockedAt: created by sign-in or a merge.
            ownersWithUnlockedStarter: 1,
            extraMatches: 1,
            toMark: 4,
            renameOffers: 2,
            minted: 1,
            marked: 0,
        });
        expect(JSON.stringify(cats.docs)).toBe(before);
    });

    it('--apply marks one locked PINKIE starter per owner, the active cat first, offers renames once', async () => {
        const { cats, users, ids } = world();
        const now = new Date('2026-10-01T00:00:00Z');

        const report = await backfillStarters.backfill(dbOf({ cats, users }), { apply: true }, now, silent);

        expect(report.marked).toBe(4);
        const starters = cats.docs.filter(doc => doc.isStarter && doc.name === 'Cleocatra');
        expect(starters).toHaveLength(4);
        starters.forEach(doc => expect(doc).toMatchObject({ starterBreed: 'PINKIE', origin: 'starter' }));
        expect(starters.every(doc => doc.starterLockedAt)).toBe(true);
        const ofOwner = (owner: Types.ObjectId) => starters.find(doc => String(doc.owner) === String(owner));
        expect(String(ofOwner(ids.twoCats)!._id)).toBe(String(ids.activeSecond._id));
        expect(ofOwner(ids.plain)).toMatchObject({ renameOffer: true });
        expect(ofOwner(ids.minted)).not.toHaveProperty('renameOffer');
        expect(ofOwner(ids.deleted)).not.toHaveProperty('renameOffer');
        expect(ofOwner(ids.hasStarter)).toBeUndefined();

        const again = await backfillStarters.backfill(dbOf({ cats, users }), { apply: true }, now, silent);
        expect(again).toMatchObject({ toMark: 0, marked: 0 });
    });
});

describe('scripts/audit-orders-grants.js', () => {
    it('only reads, and counts grants before and after the cutoff', async () => {
        const buyer = new Types.ObjectId();
        const owned = new Types.ObjectId();
        const someoneElses = new Types.ObjectId();
        const source = new Types.ObjectId();
        const cats = new MemoryModel([
            { _id: owned, owner: buyer },
            { _id: someoneElses, owner: new Types.ObjectId() },
            // Two copies of one catalogue cat for one owner: one duplicate. Another owner's is fine.
            { _id: new Types.ObjectId(), owner: buyer, sourceCat: source },
            { _id: new Types.ObjectId(), owner: buyer, sourceCat: source },
            { _id: new Types.ObjectId(), owner: new Types.ObjectId(), sourceCat: source },
        ]);
        const before = new Date('2026-09-01');
        const after = new Date('2026-10-10');
        const orders = new MemoryModel([
            { entityType: 'PACK', status: 'COMPLETE', user: buyer, createdAt: before },
            { entityType: 'PACK', status: 'COMPLETE', user: buyer, cat: new Types.ObjectId(), createdAt: before },
            { entityType: 'LOOT_BOX', status: 'COMPLETE', user: buyer, cat: someoneElses, createdAt: before },
            { entityType: 'PACK', status: 'COMPLETE', user: buyer, cat: owned, createdAt: after },
            {
                entityType: 'PACK',
                status: 'FAILED_GRANT',
                failureReason: 'EMPTY_POOL: Pack pool empty for this buyer',
                refund: { state: 'due' },
                user: buyer,
                createdAt: after,
            },
            { entityType: 'IMAGE', status: 'PENDING', user: buyer, createdAt: after },
            { entityType: 'TICKET', status: 'COMPLETE', createdAt: after },
        ]);

        const report = await auditGrants.audit(
            dbOf({ orders, cats }, false),
            { cutoff: new Date('2026-10-01') },
            new Date('2026-10-11')
        );

        expect(report.buckets.before.pack).toMatchObject({
            total: 3,
            completeWithoutCat: 1,
            completeCatMissing: 1,
            completeCatNotOwned: 1,
        });
        expect(report.buckets.after.pack).toMatchObject({
            total: 2,
            byStatus: { COMPLETE: 1, FAILED_GRANT: 1 },
            failedGrantByReason: { EMPTY_POOL: 1 },
            refunds: { due: 1 },
            completeCatMissing: 0,
            completeCatNotOwned: 0,
        });
        expect(report.buckets.after.portrait).toMatchObject({ total: 1, stalePending: 1 });
        expect(report.duplicateCopies).toBe(1);
        const printed: string[] = [];
        auditGrants.print(report, (line: string) => printed.push(line));
        expect(printed.join('\n')).not.toContain(String(buyer));
    });

    it('rejects a bad cutoff', () => {
        expect(() => auditGrants.parseArgs(['--cutoff', 'soon'])).toThrow();
        expect(auditGrants.parseArgs([])).toEqual({ json: false });
    });
});

describe('scripts/backfill-spent-usd.js', () => {
    const cutoff = new Date('2026-10-05T00:00:00Z');
    const at = (created: string, updated = created) => ({ createdAt: new Date(created), updatedAt: new Date(updated) });

    function world() {
        const a = new Types.ObjectId();
        const b = new Types.ObjectId();
        const users = new MemoryModel([
            { _id: a, spent: 40, spentUsd: 3 }, // spent inflated by +1 grants; 3 USD bought after the deploy
            { _id: b, spent: 2 },
        ]);
        const orders = new MemoryModel([
            {
                user: a,
                status: 'COMPLETE',
                priceUsd: 10,
                price: 50,
                currencyType: 'XLM',
                ...at('2026-01-01'),
            },
            { user: a, status: 'COMPLETE', price: 5, currencyType: 'USDC', ...at('2026-02-01') },
            { user: a, status: 'COMPLETE', price: 99, currencyType: 'XLM', ...at('2026-03-01') },
            { user: a, status: 'FAILED', priceUsd: 70, ...at('2026-03-01') },
            { user: a, status: 'COMPLETE', priceUsd: 3, ...at('2026-10-06') },
            { user: b, status: 'COMPLETE', priceUsd: 1, ...at('2026-04-01') },
            // Created before the cutoff, confirmed after it: the live verified write counted it.
            { user: b, status: 'COMPLETE', priceUsd: 4, ...at('2026-10-04', '2026-10-06') },
        ]);
        return { users, orders, a, b };
    }

    it('requires a cutoff', () => {
        expect(() => backfillSpent.parseArgs([])).toThrow('--cutoff');
        expect(backfillSpent.orderUsd({ priceUsd: 2 })).toBe(2);
        expect(backfillSpent.orderUsd({ price: 4, currencyType: 'usdt' })).toBe(4);
        expect(backfillSpent.orderUsd({ price: 4, currencyType: 'XLM' })).toBeNull();
    });

    it('dry run estimates from verified legacy orders only and writes nothing', async () => {
        const { users, orders } = world();
        const before = JSON.stringify(users.docs);

        const report = await backfillSpent.backfill(dbOf({ users, orders }), { cutoff }, new Date(), silent);

        expect(report).toMatchObject({
            orders: 4,
            priced: 3,
            unpriced: 1,
            updatedAfterCutoff: 1,
            users: 2,
            totalUsd: 16,
            applied: 0,
        });
        expect(JSON.stringify(users.docs)).toBe(before);
    });

    it('--apply writes the estimate once to spentUsdLegacy and never touches verified spentUsd', async () => {
        const { users, orders, a, b } = world();
        const run = () => backfillSpent.backfill(dbOf({ users, orders }), { cutoff, apply: true }, new Date(), silent);

        await expect(run()).resolves.toMatchObject({ applied: 2 });
        await expect(run()).resolves.toMatchObject({ applied: 0, alreadyApplied: 2 });

        const doc = (id: Types.ObjectId) => users.docs.find(user => String(user._id) === String(id))!;
        expect(doc(a)).toMatchObject({ spentUsd: 3, spentUsdLegacy: 15, spent: 40 });
        expect(doc(b)).toMatchObject({ spentUsdLegacy: 1 });
        expect(doc(b)).not.toHaveProperty('spentUsd');
        expect(doc(a)).not.toHaveProperty('spentUsdSource');
    });
});
