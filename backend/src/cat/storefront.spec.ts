import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { CatController } from './cat.controller';
import { CatService } from './cat.service';
import {
    buildStorefront,
    STOREFRONT_BLESSING_SELECT,
    STOREFRONT_CACHE_TTL_MS,
    STOREFRONT_CAT_FIELDS,
    STOREFRONT_LIMIT,
    STOREFRONT_META_VERSION,
    STOREFRONT_PER_SHELTER_LIMIT,
    STOREFRONT_REQUIRED_KEYS,
    STOREFRONT_SHELTER_SELECT,
} from './storefront';
import * as contract from 'src/shared-contracts/storefront';

// CatService imports the AI generators at load time; the storefront never calls them.
jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generateAvatarFromImage: jest.fn() }));
jest.mock('node-fetch', () => jest.fn());
jest.mock('src/user/user.service', () => ({ UserService: class {}, generateRandomNumber: () => 1 }));

/*
 * G13 backend hotfix for GET /cat/sale. Shipped clients read `token-tails`, `token-tails-2` and
 * `rozine-pedute` and sort them (Shelter.tsx:103-106 through utils.ts:13-15), so a missing key
 * crashed the Shelter screen when every Pink Paw cat was adopted.
 */

const shelter = (slug: string, name = slug) => ({ _id: new Types.ObjectId(), slug, name, image: { url: 'u' } });
const blessedCat = (shelterDoc: ReturnType<typeof shelter> | undefined, extra: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    name: 'Cat',
    type: 'FIRE',
    tier: 'COMMON',
    blessing: { _id: new Types.ObjectId(), name: 'b', image: { url: 'i' } },
    shelter: shelterDoc,
    ...extra,
});
const blueprint = (): Record<string, unknown> => ({ _id: new Types.ObjectId(), name: 'Blueprint', isBlueprint: true });

/** Today's algorithm (cat.controller.ts:91-127 before the hotfix), kept to compare shapes. */
function legacyShape(tokentails: any[], blessed: any[]) {
    const byShelter = blessed.reduce((acc: Record<string, any[]>, cat) => {
        const key = cat.shelter?.slug || 'unknown';
        (acc[key] = acc[key] || []).push(cat);
        return acc;
    }, {});
    return { tokentails, ...byShelter };
}

/** What an unchanged shipped client does with the response (Shelter.tsx, MarketplaceItems.tsx). */
function shippedClientReads(response: Record<string, any>) {
    const sample = (items: any[], count: number) => items.sort(() => 0.5 - Math.random()).slice(0, count);
    response['token-tails']?.forEach(() => undefined);
    response['token-tails-2']?.forEach(() => undefined);
    sample(response['rozine-pedute'], 10).forEach(() => undefined);
    return response['rozine-pedute'].length;
}

describe('buildStorefront (G13 hotfix)', () => {
    it('every required key is an array when every Pink Paw cat is adopted', () => {
        const response = buildStorefront([blueprint()], [], [shelter('rozine-pedute')]);

        STOREFRONT_REQUIRED_KEYS.forEach(key => expect(Array.isArray(response[key])).toBe(true));
        expect(response['rozine-pedute']).toEqual([]);
        expect(() => shippedClientReads(response)).not.toThrow();
    });

    it('every required key is an array even when every query came back empty or broken', () => {
        for (const response of [buildStorefront([], [], []), buildStorefront(null, undefined, null)]) {
            STOREFRONT_REQUIRED_KEYS.forEach(key => expect(response[key]).toEqual([]));
            expect(() => shippedClientReads(response)).not.toThrow();
        }
    });

    it('keeps every key and value of the old response (key superset)', () => {
        const pinkPaw = shelter('rozine-pedute');
        const other = shelter('some-other-shelter');
        const tokentails = [blueprint(), blueprint()];
        const blessed = [blessedCat(pinkPaw), blessedCat(other), blessedCat(pinkPaw), blessedCat(undefined)];

        const legacy = legacyShape(tokentails, blessed);
        const response = buildStorefront(tokentails, blessed, [pinkPaw, other]);

        Object.keys(legacy).forEach(key => expect(response[key]).toEqual((legacy as any)[key]));
        expect(Object.keys(response)).toEqual(expect.arrayContaining(Object.keys(legacy)));
        expect(response.unknown).toHaveLength(1);
        // Only the required keys and `_meta` are added.
        const added = Object.keys(response).filter(key => !(key in legacy));
        added.forEach(key => expect([...STOREFRONT_REQUIRED_KEYS, '_meta']).toContain(key));
    });

    it('adds an additive _meta block with the shelters (role arrives with task 2b)', () => {
        const now = new Date('2026-09-30T10:00:00Z');
        const response = buildStorefront(
            [],
            [],
            [shelter('rozine-pedute', 'Rožinė pėdutė'), shelter('rozine-pedute')],
            now
        );

        expect(response._meta).toEqual({
            _v: STOREFRONT_META_VERSION,
            generatedAt: now.toISOString(),
            shelters: [{ slug: 'rozine-pedute', name: 'Rožinė pėdutė' }],
        });
        expect((response._meta as any).shelters[0]).not.toHaveProperty('role');
    });

    it('a shelter slug can never overwrite the blueprints or _meta', () => {
        const tokentails = [blueprint()];
        const response = buildStorefront(
            tokentails,
            [blessedCat(shelter('tokentails')), blessedCat(shelter('_meta'))],
            []
        );

        expect(response.tokentails).toBe(tokentails);
        expect(Array.isArray(response._meta)).toBe(false);
    });
    it('takes the required keys and meta version from the shared contract, not a local copy', () => {
        expect(STOREFRONT_REQUIRED_KEYS).toBe(contract.STOREFRONT_REQUIRED_KEYS);
        expect(STOREFRONT_META_VERSION).toBe(contract.STOREFRONT_META_VERSION);
    });

    it('lists one _meta entry per shelter key in the response', () => {
        const pinkPaw = shelter('rozine-pedute', 'Pink Paw');
        const tokenTails2 = shelter('token-tails-2', 'Token Tails 2');
        const home = shelter('home', 'Home');
        const response = buildStorefront(
            [blueprint()],
            [blessedCat(home), blessedCat(undefined)],
            // `token-tails` has no shelter document here; `rozine-pedute` has one but no cats.
            [pinkPaw, tokenTails2]
        );

        expect((response._meta as any).shelters).toEqual([
            { slug: 'token-tails-2', name: 'Token Tails 2' },
            { slug: 'rozine-pedute', name: 'Pink Paw' },
            { slug: 'home', name: 'Home' },
        ]);
        // Every meta entry is a key of the response; `tokentails` and `unknown` are not shelters.
        (response._meta as any).shelters.forEach((entry: any) =>
            expect(Array.isArray(response[entry.slug])).toBe(true)
        );
        expect(response.unknown).toHaveLength(1);
    });

    it('also skips the keys the shared parser reserves (__proto__, constructor, prototype)', () => {
        const response = buildStorefront(
            [],
            ['__proto__', 'constructor', 'prototype', 'rozine-pedute'].map(slug => blessedCat(shelter(slug))),
            []
        );

        expect(Object.getPrototypeOf(response)).toBe(Object.prototype);
        ['constructor', 'prototype'].forEach(key =>
            expect(Object.prototype.hasOwnProperty.call(response, key)).toBe(false)
        );
        expect(Object.keys(response)).not.toContain('__proto__');
        expect(response['rozine-pedute']).toHaveLength(1);
        expect(Object.keys(JSON.parse(JSON.stringify(response)))).not.toContain('constructor');
        expect(
            contract.parseStorefrontDetailed(JSON.parse(JSON.stringify(response))).cats['rozine-pedute']
        ).toHaveLength(1);
    });
});

/**
 * A stand-in for the Mongoose queries CatService.storefront sends. It runs the per-shelter pipeline
 * over the given cats in memory ($match is implied: `blessed` are the unowned blessed cats), so the
 * cap behaviour is tested, not just the calls.
 */
function createModels(data: { blueprints?: any[]; blessed?: any[]; shelters?: any[] } = {}) {
    const calls: Record<string, any[]> = {
        aggregate: [],
        find: [],
        populate: [],
        limit: [],
        sort: [],
        shelterFind: [],
    };
    let builds = 0;
    const byIdDesc = (a: any, b: any) => String(b._id).localeCompare(String(a._id));
    const runPipeline = (pipeline: any[]) => {
        const slice = pipeline.find(stage => stage.$project?.ids)?.$project.ids.$slice[1] ?? Infinity;
        const groups = new Map<string, any[]>();
        [...(data.blessed || [])].sort(byIdDesc).forEach(cat => {
            const key = String(cat.shelter?._id ?? null);
            groups.set(key, [...(groups.get(key) || []), cat._id]);
        });
        return [...groups.entries()].map(([key, ids]) => ({ _id: key, ids: ids.slice(0, slice) }));
    };
    const catModel = {
        aggregate: jest.fn((pipeline: any[]) => {
            calls.aggregate.push(pipeline);
            const isBlueprints = !!pipeline[0]?.$match?.isBlueprint;
            if (isBlueprints) {
                builds++;
            }
            const rows = () => (isBlueprints ? data.blueprints || [] : runPipeline(pipeline));
            const chain: any = { allowDiskUse: () => chain, exec: async () => rows() };
            return chain;
        }),
        find: jest.fn((filter: any, projection: unknown) => {
            calls.find.push([filter, projection]);
            let limit = Infinity;
            const chain: any = {
                sort: (arg: unknown) => (calls.sort.push(arg), chain),
                limit: (arg: number) => (calls.limit.push(arg), (limit = arg), chain),
                populate: (arg: unknown) => (calls.populate.push(arg), chain),
                lean: () => chain,
                exec: async () => {
                    const wanted = new Set((filter?._id?.$in || []).map(String));
                    return (data.blessed || [])
                        .filter(cat => wanted.has(String(cat._id)))
                        .sort(byIdDesc)
                        .slice(0, limit);
                },
            };
            return chain;
        }),
    };
    const shelterModel = {
        find: jest.fn((filter: any, projection: unknown) => {
            calls.shelterFind.push([filter, projection]);
            const chain: any = {
                limit: () => chain,
                lean: () => chain,
                exec: async () =>
                    (data.shelters || []).filter(item => !filter?.slug?.$in || filter.slug.$in.includes(item.slug)),
            };
            return chain;
        }),
    };
    return { catModel, shelterModel, calls, builds: () => builds };
}

function createService(data?: Parameters<typeof createModels>[0]) {
    const models = createModels(data);
    const userRepository = { update: jest.fn(async () => ({})) };
    const catRepository = {
        model: models.catModel,
        update: jest.fn(async () => ({})),
        findOne: jest.fn(async () => ({ _id: new Types.ObjectId() })),
    };
    const service = new CatService(
        catRepository as any,
        userRepository as any,
        {} as any,
        {} as any,
        { model: models.shelterModel } as any
    );
    return { service, ...models };
}

describe('CatService.storefront (GET /cat/sale)', () => {
    it('whitelists cat, blessing and shelter fields and never selects owner or private data', async () => {
        const { service, calls } = createService({ blessed: [blessedCat(shelter('rozine-pedute'))] });
        await service.storefront();

        const [[filter, projection]] = calls.find;
        expect(filter).toEqual({
            blessing: { $exists: true },
            owner: { $exists: false },
            _id: { $in: expect.any(Array) },
        });
        expect(Object.keys(projection).sort()).toEqual([...STOREFRONT_CAT_FIELDS].sort());
        ['owner', 'code', 'staked'].forEach(field => expect(projection).not.toHaveProperty(field));
        expect(Object.values(projection).every(value => value === 1)).toBe(true);

        const [populate] = calls.populate;
        const blessing = populate.find((p: any) => p.path === 'blessing');
        const shelterPopulate = populate.find((p: any) => p.path === 'shelter');
        expect(blessing.select).toBe(STOREFRONT_BLESSING_SELECT);
        expect(blessing.select).not.toMatch(/creator|wallets/);
        expect(shelterPopulate.select).toBe(STOREFRONT_SHELTER_SELECT);
        expect(shelterPopulate.select).not.toMatch(/wallets|users|code|blessing/);

        const [shelterFilter, shelterProjection] = calls.shelterFind[0];
        expect(shelterFilter).toEqual({ slug: { $in: [...STOREFRONT_REQUIRED_KEYS] } });
        expect(shelterProjection).toEqual({ slug: 1, name: 1 });

        const blueprintPipeline = calls.aggregate.find((p: any[]) => p[0].$match.isBlueprint);
        expect(blueprintPipeline).toEqual([
            { $match: { isBlueprint: true } },
            { $sample: { size: 10 } },
            { $project: projection },
        ]);
    });

    it(`caps blessed cats per shelter (${STOREFRONT_PER_SHELTER_LIMIT}) and overall (${STOREFRONT_LIMIT})`, async () => {
        const { service, calls } = createService({ blessed: [blessedCat(shelter('rozine-pedute'))] });
        await service.storefront();

        const grouping = calls.aggregate.find((p: any[]) => !p[0].$match.isBlueprint);
        expect(grouping).toEqual([
            { $match: { blessing: { $exists: true }, owner: { $exists: false } } },
            { $sort: { _id: -1 } },
            { $group: { _id: '$shelter', ids: { $push: '$_id' } } },
            { $project: { ids: { $slice: ['$ids', STOREFRONT_PER_SHELTER_LIMIT] } } },
        ]);
        expect(calls.sort).toEqual([{ _id: -1 }]);
        expect(calls.limit).toEqual([STOREFRONT_LIMIT]);
        expect(STOREFRONT_LIMIT).toBeGreaterThan(STOREFRONT_PER_SHELTER_LIMIT);
    });

    it('one large shelter never pushes the others out (more than 200 cats over 4+ shelters)', async () => {
        // The dev data that broke the old global limit: one shelter with most of the newest cats.
        const shelters = [
            'token-tails',
            'token-tails-2',
            'rozine-pedute',
            'home',
            'mil-bigotes',
            'puppy-kitty-nyc',
        ].map(slug => shelter(slug));
        const [tokenTails, tokenTails2, pinkPaw, home, milBigotes, puppyKitty] = shelters;
        const blessed = [
            ...Array.from({ length: 5 }, () => blessedCat(tokenTails2)),
            ...Array.from({ length: 3 }, () => blessedCat(milBigotes)),
            ...Array.from({ length: 2 }, () => blessedCat(puppyKitty)),
            ...Array.from({ length: 10 }, () => blessedCat(tokenTails)),
            ...Array.from({ length: 2 }, () => blessedCat(home)),
            // Created last, so newest by _id.
            ...Array.from({ length: 250 }, () => blessedCat(pinkPaw)),
        ];
        expect(blessed.length).toBeGreaterThan(200);
        const { service } = createService({ blessed, shelters });
        const response = await service.storefront();

        const expected: Record<string, number> = {
            'token-tails': 10,
            'token-tails-2': 5,
            'rozine-pedute': STOREFRONT_PER_SHELTER_LIMIT,
            home: 2,
            'mil-bigotes': 3,
            'puppy-kitty-nyc': 2,
        };
        Object.entries(expected).forEach(([slug, count]) =>
            expect([slug, (response[slug] as any[]).length]).toEqual([slug, count])
        );
        // Newest first within a shelter.
        const pinkPawIds = (response['rozine-pedute'] as any[]).map(cat => String(cat._id));
        expect(pinkPawIds).toEqual([...pinkPawIds].sort().reverse());
        // `_meta.shelters` names exactly the shelter keys in the response.
        const metaSlugs = (response._meta as any).shelters.map((entry: any) => entry.slug).sort();
        expect(metaSlugs).toEqual(Object.keys(expected).sort());
    });

    it('returns the required keys as arrays when every Pink Paw cat is adopted', async () => {
        const { service } = createService({
            blueprints: [blueprint()],
            blessed: [],
            shelters: [shelter('rozine-pedute')],
        });
        const response = await service.storefront();

        STOREFRONT_REQUIRED_KEYS.forEach(key => expect(Array.isArray(response[key])).toBe(true));
        expect(() => shippedClientReads(response)).not.toThrow();
    });

    it('shares one in-flight build between concurrent requests and caches it for 45 s', async () => {
        const { service, builds } = createService({ blessed: [blessedCat(shelter('rozine-pedute'))] });
        let clock = 1000;
        const now = () => clock;

        const [a, b] = await Promise.all([service.storefront(now), service.storefront(now)]);
        expect(a).toBe(b);
        expect(builds()).toBe(1);

        clock += STOREFRONT_CACHE_TTL_MS - 1;
        await service.storefront(now);
        expect(builds()).toBe(1);

        clock += 2;
        await service.storefront(now);
        expect(builds()).toBe(2);
    });

    it('is invalidated by an adoption', async () => {
        const { service, builds } = createService();
        await service.storefront();
        await service.addCatToTheOwner({ _id: new Types.ObjectId() } as any, { _id: new Types.ObjectId() } as any);
        await service.storefront();

        expect(builds()).toBe(2);
    });

    it('does not cache a build that started before an adoption', async () => {
        const { service, builds } = createService();
        const inFlight = service.storefront();
        service.invalidateStorefront();
        await inFlight;
        await service.storefront();

        expect(builds()).toBe(2);
    });

    it('never serves a failed build from the cache', async () => {
        const { service, catModel } = createService();
        catModel.aggregate.mockImplementationOnce(() => ({
            exec: async () => {
                throw new Error('mongo down');
            },
        }));

        await expect(service.storefront()).rejects.toThrow('mongo down');
        await expect(service.storefront()).resolves.toBeDefined();
        // Two builds (blueprints plus the per-shelter grouping each).
        expect(catModel.aggregate).toHaveBeenCalledTimes(4);
    });
});

describe('GET /cat/sale route', () => {
    it('stays public and delegates to CatService.storefront', async () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, CatController.prototype.cats)).toBeUndefined();
        const storefront = jest.fn(async () => ({ tokentails: [] }));
        const controller = new CatController({} as any, {} as any, { storefront } as any, {} as any);

        await expect(controller.cats()).resolves.toEqual({ tokentails: [] });
        expect(storefront).toHaveBeenCalledTimes(1);
    });
});
