import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { BlessingController } from './blessing.controller';
import { BlessingStatus, PORTRAIT_SHELTER_ID } from './blessing.schema';
import {
    FEATURED_CACHE_TTL_MS,
    FEATURED_DEFAULT_LIMIT,
    FEATURED_MAX_LIMIT,
    htmlExcerpt,
    parseFeaturedLimit,
    toFeaturedCat,
} from './featured';
import { PACK_SHELTER_IDS } from './featured-shelters';
import { FeaturedBlessingService } from './featured.service';

jest.mock('src/shared/utils/ai.utils', () => ({ generateCat: jest.fn() }));
jest.mock('src/shared/utils/ai-avatar', () => ({ generateAvatarFromImage: jest.fn() }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));

/*
 * GET /blessing/featured (plan G3 step 6): public, 10 minute cache, Pink Paw and the catfluencers,
 * WAITING or RECOVERING, rescue blessings only (never a portrait), plain-text 140-character excerpt.
 */

describe('featured helpers', () => {
    it('parses the limit: default 3, at most 12', () => {
        expect(parseFeaturedLimit(undefined)).toBe(FEATURED_DEFAULT_LIMIT);
        expect(parseFeaturedLimit('5')).toBe(5);
        expect(parseFeaturedLimit('0')).toBe(FEATURED_DEFAULT_LIMIT);
        expect(parseFeaturedLimit('-4')).toBe(FEATURED_DEFAULT_LIMIT);
        expect(parseFeaturedLimit('2.5')).toBe(FEATURED_DEFAULT_LIMIT);
        expect(parseFeaturedLimit('abc')).toBe(FEATURED_DEFAULT_LIMIT);
        expect(parseFeaturedLimit('999')).toBe(FEATURED_MAX_LIMIT);
    });

    it('strips HTML, scripts and entities into a 140-character excerpt cut at a word', () => {
        const html =
            '<p>Mila was found <strong>under a car</strong> in Vilnius&nbsp;&amp; brought to Pink&#39;s.</p>' +
            '<script>alert(1)</script><p>' +
            'She loves sunny windows and soft blankets, and she is waiting for a family who will love her forever and ever.</p>';
        const excerpt = htmlExcerpt(html);

        expect(excerpt.length).toBeLessThanOrEqual(140);
        expect(excerpt).toMatch(/^Mila was found under a car in Vilnius & brought to Pink's\. She loves/);
        expect(excerpt).not.toMatch(/[<>]|alert|&amp;|&nbsp;/);
        expect(excerpt.endsWith('…')).toBe(true);
        expect(htmlExcerpt('&lt;img src=x onerror=alert(1)&gt; Hi')).not.toMatch(/[<>]/);
        expect(htmlExcerpt('<p>Short</p>')).toBe('Short');
        expect(htmlExcerpt(undefined)).toBe('');
    });

    it('never throws on an out-of-range or surrogate entity', () => {
        expect(() => htmlExcerpt('Mila &#99999999; &#x110000; naps')).not.toThrow();
        expect(htmlExcerpt('Mila &#99999999; &#x110000; naps')).toBe('Mila naps');
        expect(htmlExcerpt('A&#xD800;B &#55296;C')).toBe('A B C');
        expect(htmlExcerpt('Cat &#x1F431; and &#233;')).toBe('Cat \u{1F431} and \u00E9');
    });

    it('whitelists the public fields', () => {
        const row = {
            _id: new Types.ObjectId(),
            name: 'Mila',
            status: BlessingStatus.WAITING,
            description: '<b>Hi</b>',
            image: { _id: new Types.ObjectId(), url: 'https://img/mila.webp' },
            catAvatar: { url: 'https://img/avatar.webp' },
            shelter: {
                _id: new Types.ObjectId(PACK_SHELTER_IDS.pinkPaw),
                name: 'Pink Paw',
                slug: 'rozine-pedute',
                wallets: { x: 1 },
            },
            cat: { _id: new Types.ObjectId(), catImg: 'https://img/cat.gif', owner: new Types.ObjectId() },
            creator: new Types.ObjectId(),
            token: { stellar: 'x' },
        };
        const featured = toFeaturedCat(row);

        expect(featured).toEqual({
            _id: String(row._id),
            name: 'Mila',
            status: BlessingStatus.WAITING,
            excerpt: 'Hi',
            image: 'https://img/mila.webp',
            catAvatar: 'https://img/avatar.webp',
            catImg: 'https://img/cat.gif',
            shelter: { _id: PACK_SHELTER_IDS.pinkPaw, name: 'Pink Paw', slug: 'rozine-pedute' },
        });
    });
});

describe('FeaturedBlessingService', () => {
    const row = (name: string, status = 'WAITING') => ({ _id: new Types.ObjectId(), name, status, description: 'x' });

    /** A fake model: `find` without `_id` answers the pool, with `_id: {$in}` the chosen rows. */
    function setup(initial: any[] = [row('Mila')]) {
        let pool = initial;
        const find = jest.fn((filter: any) => ({
            lean: () => ({
                exec: async () => {
                    if (filter?._id?.$in) {
                        const wanted = new Set(filter._id.$in.map(String));
                        return pool.filter(r => wanted.has(String(r._id)));
                    }
                    return pool.map(r => ({ _id: r._id, name: r.name }));
                },
            }),
        }));
        const populate = jest.fn(async (docs: any[]) => docs);
        const service = new FeaturedBlessingService({ model: { find, populate } } as any);
        let now = FEATURED_CACHE_TTL_MS * 1000 + 1000;
        service.now = () => now;
        const poolCalls = () => find.mock.calls.filter(([filter]) => !(filter as any)?._id).length;
        return {
            service,
            find,
            poolCalls,
            setPool: (rows: any[]) => (pool = rows),
            advance: (ms: number) => (now += ms),
            setNow: (ms: number) => (now = ms),
        };
    }

    it('queries rescue blessings of the two partners that are WAITING or RECOVERING, never portraits', async () => {
        const { service, find } = setup();
        await service.featured(3);

        const match = find.mock.calls[0][0] as any;
        expect(match.status).toEqual({ $in: [BlessingStatus.WAITING, BlessingStatus.RECOVERING] });
        expect(match.shelter.$in.map(String).sort()).toEqual(
            [PACK_SHELTER_IDS.catfluencers, PACK_SHELTER_IDS.pinkPaw].sort()
        );
        // The rescue filter: `kind: 'rescue'`, or an un-backfilled row outside the portrait shelter.
        expect(match.$or).toEqual([
            { kind: 'rescue' },
            { kind: { $exists: false }, shelter: { $ne: new Types.ObjectId(PORTRAIT_SHELTER_ID) } },
        ]);
        // The detail query keeps the pool filter, so a row that left the pool in between is dropped.
        expect((find.mock.calls[1][0] as any).$or).toEqual(match.$or);
    });

    it('is deterministic: every instance and every limit shows the same cats in a bucket', async () => {
        const pool = Array.from({ length: 20 }, (_, i) => row(`Cat${i}`));
        const a = setup(pool);
        const b = setup(pool);
        const three = (await a.service.featured(3)).map(cat => cat.name);
        const twelve = (await b.service.featured(12)).map(cat => cat.name);
        expect(three).toHaveLength(3);
        expect(twelve).toHaveLength(FEATURED_MAX_LIMIT);
        expect(twelve.slice(0, 3)).toEqual(three);
        expect((await b.service.featured(3)).map(cat => cat.name)).toEqual(three);
    });

    it('caches one ranking per 10-minute bucket and shares the in-flight query', async () => {
        const { service, poolCalls, advance } = setup();
        await Promise.all([service.featured(3), service.featured(3)]);
        await service.featured(5);
        expect(poolCalls()).toBe(1);
        advance(FEATURED_CACHE_TTL_MS);
        await service.featured(3);
        expect(poolCalls()).toBe(2);
    });

    it('never caches a failed query', async () => {
        const { service, find } = setup();
        find.mockImplementationOnce(() => ({ lean: () => ({ exec: async () => Promise.reject(new Error('down')) }) }));
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        await expect(service.featured(3)).rejects.toThrow('down');
        await expect(service.featured(3)).resolves.toHaveLength(1);
    });

    it('never features a cat whose name fails the blocked-word check', async () => {
        const { service } = setup([row('VIagra'), row('Mila')]);
        expect((await service.featured(12)).map(cat => cat.name)).toEqual(['Mila']);
        await expect(service.reservedNames()).resolves.toEqual(['Mila']);
    });

    it('reserves only the default set of the current and previous bucket, never longer lists', async () => {
        const pool = Array.from({ length: 20 }, (_, i) => row(`Cat${i}`));
        const { service, setNow } = setup(pool);
        const bucket = 5000;
        setNow(bucket * FEATURED_CACHE_TTL_MS + 1);
        const reserved = await service.reservedNames();
        const current = (await service.featured(FEATURED_DEFAULT_LIMIT)).map(cat => cat.name);
        current.forEach(name => expect(reserved).toContain(name));
        expect(reserved.length).toBeLessThanOrEqual(2 * FEATURED_DEFAULT_LIMIT);

        // A ?limit=12 call changes nothing.
        await service.featured(FEATURED_MAX_LIMIT);
        await expect(service.reservedNames()).resolves.toEqual(reserved);

        // Next buckets: the set shown a minute ago is still reserved, alongside the new one.
        setNow((bucket + 1) * FEATURED_CACHE_TTL_MS + 1);
        const next = await service.reservedNames();
        current.forEach(name => expect(next).toContain(name));
        setNow((bucket + 2) * FEATURED_CACHE_TTL_MS + 1);
        const later = await service.reservedNames();
        const nextOnly = (await service.featured(FEATURED_DEFAULT_LIMIT)).map(cat => cat.name);
        nextOnly.forEach(name => expect(later).toContain(name));
        expect(later).toHaveLength(new Set(later).size);
    });

    it('trims and dedupes reserved names', async () => {
        const { service } = setup([row('Mila'), row(' Mila '), row('Pupa', 'RECOVERING')]);
        await expect(service.reservedNames().then(names => names.sort())).resolves.toEqual(['Mila', 'Pupa']);
    });

    it('answers an empty list when the featured query fails', async () => {
        const { service, find } = setup();
        find.mockImplementation(() => ({ lean: () => ({ exec: async () => Promise.reject(new Error('down')) }) }));
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        await expect(service.reservedNames()).resolves.toEqual([]);
    });

    it('serves the reserved names publicly at GET /blessing/featured/names, before GET :id', async () => {
        const names = Object.getOwnPropertyNames(BlessingController.prototype);
        expect(names.indexOf('featuredNames')).toBeLessThan(names.indexOf('findOne'));
        expect(Reflect.getMetadata('__guards__', BlessingController.prototype.featuredNames)).toBeUndefined();
        expect(Reflect.getMetadata('path', BlessingController.prototype.featuredNames)).toBe('featured/names');
        const reservedNames = jest.fn(async () => ['Mila']);
        const controller = new BlessingController(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {
                reservedNames,
            } as any
        );
        await expect(controller.featuredNames()).resolves.toEqual({ names: ['Mila'] });
    });

    it('is a public route declared before GET :id', () => {
        const names = Object.getOwnPropertyNames(BlessingController.prototype);
        expect(names.indexOf('featured')).toBeLessThan(names.indexOf('findOne'));
        expect(Reflect.getMetadata('__guards__', BlessingController.prototype.featured)).toBeUndefined();
    });
});
