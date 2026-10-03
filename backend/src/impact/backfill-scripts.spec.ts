import { ObjectId } from 'mongodb';
import { HOUSE_SHELTER_SLUGS } from './impact-public';
import { ISO_ALPHA2_CODES } from './iso-countries';

/* eslint-disable @typescript-eslint/no-var-requires */
const blessingKind = require('../../scripts/backfill-blessing-kind.js');
const shelterFields = require('../../scripts/backfill-shelter-fields.js');
/* eslint-enable @typescript-eslint/no-var-requires */

const PORTRAIT = new ObjectId(blessingKind.PORTRAIT_SHELTER_ID);
const quiet = () => undefined;

/** Enough of a native collection for the scripts: filters with $exists, $ne and plain equality. */
function fakeCollection(rows: Record<string, any>[]) {
    const matches = (row: Record<string, any>, filter: Record<string, any>) =>
        Object.entries(filter).every(([key, cond]) => {
            const value = row[key];
            const same = (a: unknown, b: unknown) => String(a) === String(b);
            if (cond && typeof cond === 'object' && !(cond instanceof ObjectId)) {
                if ('$exists' in cond) return cond.$exists ? value !== undefined : value === undefined;
                if ('$ne' in cond) return !same(value, cond.$ne);
            }
            return same(value, cond);
        });
    const calls: string[] = [];
    return {
        rows,
        calls,
        countDocuments: async (filter: Record<string, any>) => {
            calls.push('countDocuments');
            return rows.filter(row => matches(row, filter)).length;
        },
        find: (filter: Record<string, any>, options: { projection?: Record<string, 1> } = {}) => {
            calls.push('find');
            return {
                toArray: async () =>
                    rows
                        .filter(row => matches(row, filter))
                        .map(row =>
                            options.projection
                                ? Object.fromEntries(
                                      Object.entries(row).filter(([k]) => k === '_id' || options.projection![k])
                                  )
                                : row
                        ),
            };
        },
        updateMany: async (filter: Record<string, any>, update: { $set: Record<string, unknown> }) => {
            calls.push('updateMany');
            const hit = rows.filter(row => matches(row, filter));
            hit.forEach(row => Object.assign(row, update.$set));
            return { modifiedCount: hit.length };
        },
        updateOne: async (filter: Record<string, any>, update: { $set: Record<string, unknown> }) => {
            calls.push('updateOne');
            const hit = rows.find(row => matches(row, filter));
            if (hit) Object.assign(hit, update.$set);
            return { modifiedCount: hit ? 1 : 0 };
        },
    };
}

describe('scripts/backfill-blessing-kind.js (F7.8)', () => {
    const rows = () => [
        { _id: new ObjectId(), shelter: PORTRAIT },
        { _id: new ObjectId(), shelter: PORTRAIT },
        { _id: new ObjectId(), shelter: new ObjectId() },
        { _id: new ObjectId(), shelter: new ObjectId(), kind: 'portrait' },
    ];

    it('is a dry run by default: counts, writes nothing', async () => {
        const collection = fakeCollection(rows());
        const report = await blessingKind.backfill(collection, blessingKind.parseArgs([]), new Date(), quiet);
        expect(report.planned).toEqual({ portrait: 2, rescue: 1 });
        expect(report.alreadySet).toBe(1);
        expect(collection.calls).not.toContain('updateMany');
        expect(collection.rows.filter(r => r.kind)).toHaveLength(1);
    });

    it('with --apply sets portrait for the portrait shelter, rescue otherwise, and never touches a set kind', async () => {
        const collection = fakeCollection(rows());
        await blessingKind.backfill(collection, blessingKind.parseArgs(['--apply']), new Date(), quiet);
        expect(collection.rows.map(r => r.kind)).toEqual(['portrait', 'portrait', 'rescue', 'portrait']);
        expect(collection.rows[3].kindBackfilledAt).toBeUndefined();

        const again = await blessingKind.backfill(collection, blessingKind.parseArgs(['--apply']), new Date(), quiet);
        expect(again.modified).toEqual({ portrait: 0, rescue: 0 });
    });

    it('reports how many planned rescue rows sit in house zones, and finds the zones by role or slug', async () => {
        const house = new ObjectId();
        const event = new ObjectId();
        const shelters = fakeCollection([
            { _id: house, slug: 'renamed', role: 'house' },
            { _id: event, slug: 'token-tails-2' },
            { _id: PORTRAIT, slug: 'home' },
            { _id: new ObjectId(), slug: 'rozine-pedute', role: 'partner' },
            { _id: new ObjectId(), slug: 'token-tails', role: 'partner' },
        ]);
        const houseShelters = await blessingKind.houseShelterIds(shelters);
        expect(houseShelters.map(String).sort()).toEqual([house, event, PORTRAIT].map(String).sort());

        const collection = fakeCollection([
            ...rows(),
            { _id: new ObjectId(), shelter: house },
            { _id: new ObjectId(), shelter: event },
            { _id: new ObjectId(), shelter: event, kind: 'rescue' },
        ]);
        const report = await blessingKind.backfill(
            collection,
            { ...blessingKind.parseArgs([]), houseShelters },
            new Date(),
            quiet
        );
        // The portrait shelter is counted as portraits, never as a house-zone rescue.
        expect(report.houseZoneRescue).toBe(2);
        expect(report.planned).toEqual({ portrait: 2, rescue: 3 });
    });

    it('rejects a bad portrait shelter id and unknown options', () => {
        expect(() => blessingKind.parseArgs(['--portrait-shelter', 'nope'])).toThrow();
        expect(() => blessingKind.parseArgs(['--force'])).toThrow('Unknown option');
    });
});

describe('scripts/backfill-shelter-fields.js (F7.7)', () => {
    const shelters = () => [
        { _id: new ObjectId(), slug: 'rozine-pedute', country: 'Lithuania', wallets: { secret: 'x' } },
        { _id: new ObjectId(), slug: 'mil-bigotes', country: '' },
        { _id: new ObjectId(), slug: 'token-tails', country: 'Estonia' },
        { _id: new ObjectId(), slug: 'somewhere', country: 'Atlantis' },
        {
            _id: new ObjectId(),
            slug: 'set-already',
            countryCode: 'DE',
            role: 'partner',
            handoverStatus: 'handed-over',
            partnerStatus: 'past',
        },
    ];

    it('keeps the ISO list identical to src/impact/iso-countries.ts', () => {
        expect([...shelterFields.ISO_ALPHA2].sort()).toEqual([...ISO_ALPHA2_CODES].sort());
    });

    it('maps free-text countries only when unambiguous', () => {
        expect(shelterFields.countryCodeOf('Lithuania')).toBe('LT');
        expect(shelterFields.countryCodeOf(' lt ')).toBe('LT');
        expect(shelterFields.countryCodeOf('USA')).toBe('US');
        expect(shelterFields.countryCodeOf('XX')).toBeNull();
        expect(shelterFields.countryCodeOf('Atlantis')).toBeNull();
        expect(shelterFields.countryCodeOf(undefined)).toBeNull();
    });

    it('dry run plans per slug, never guesses partnerStatus and never reads private fields', async () => {
        const collection = fakeCollection(shelters());
        const lines: string[] = [];
        const { plans, modified } = await shelterFields.backfill(
            collection,
            shelterFields.parseArgs([]),
            new Date(),
            (line: string) => lines.push(line)
        );
        expect(modified).toBe(0);
        expect(collection.calls).not.toContain('updateOne');
        const bySlug = Object.fromEntries(plans.map((p: any) => [p.slug, p]));
        expect(bySlug['rozine-pedute'].set).toEqual({
            countryCode: 'LT',
            role: 'partner',
            handoverStatus: 'held-by-token-tails',
        });
        expect(bySlug['mil-bigotes'].set.countryCode).toBe('ES');
        expect(bySlug['token-tails'].set).toMatchObject({ countryCode: 'EE', role: 'house' });
        expect(bySlug['somewhere'].notes).toContain('needs a country code');
        expect(bySlug['set-already'].set).toEqual({});
        expect(plans.every((p: any) => !('partnerStatus' in p.set))).toBe(true);
        expect(lines.join('\n')).not.toMatch(/secret|wallets/);
    });

    it('--apply writes only absent fields, and --active sets the partner status', async () => {
        const collection = fakeCollection(shelters());
        const args = shelterFields.parseArgs(['--active', 'rozine-pedute', '--past', 'mil-bigotes', '--apply']);
        await shelterFields.backfill(collection, args, new Date(), quiet);
        const bySlug = Object.fromEntries(collection.rows.map(r => [r.slug, r]));
        expect(bySlug['rozine-pedute']).toMatchObject({ countryCode: 'LT', partnerStatus: 'active', role: 'partner' });
        expect(bySlug['mil-bigotes'].partnerStatus).toBe('past');
        expect(bySlug['set-already']).toMatchObject({
            countryCode: 'DE',
            handoverStatus: 'handed-over',
            partnerStatus: 'past',
        });
        expect(bySlug['set-already'].fieldsBackfilledAt).toBeUndefined();
    });

    it('classifies house zones with the same slug list as the impact snapshot', () => {
        expect([...shelterFields.DEFAULT_HOUSE_SLUGS]).toEqual([...HOUSE_SHELTER_SLUGS]);
    });

    it('refuses an unknown slug and a slug with two statuses', async () => {
        const collection = fakeCollection(shelters());
        await expect(
            shelterFields.backfill(collection, shelterFields.parseArgs(['--active', 'nope']), new Date(), quiet)
        ).rejects.toThrow('No shelter with slug nope');
        expect(() => shelterFields.parseArgs(['--active', 'a', '--past', 'a'])).toThrow('two partner statuses');
    });
});
