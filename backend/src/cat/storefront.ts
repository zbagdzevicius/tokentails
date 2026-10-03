/*
 * GET /cat/sale response (G13 backend hotfix).
 *
 * Today's shape is `{ tokentails: ICat[], [shelterSlug]: ICat[] }`, where a shelter key exists only
 * while that shelter has unowned blessed cats. Shipped clients read `token-tails`, `token-tails-2`
 * and `rozine-pedute` and call array methods on them (`Shelter.tsx:103-106`), so a missing key
 * crashes the Shelter screen once every Pink Paw cat is adopted.
 *
 * The hotfix keeps every key the old response had (a key superset), guarantees every required key
 * is an array, and adds `_meta`. Keys, version and meta types come from `shared/storefront.ts` (F2)
 * through its generated copy in `src/shared-contracts/`.
 */

import {
    STOREFRONT_META_VERSION,
    STOREFRONT_REQUIRED_KEYS,
    StorefrontMeta,
    StorefrontShelterMeta,
} from 'src/shared-contracts/storefront';

// The required keys and `_meta` version come from the shared contract (F2), never a local copy.
export { STOREFRONT_META_VERSION, STOREFRONT_REQUIRED_KEYS };

/**
 * Blessed cats for sale per shelter, newest first. The marketplace and CatsInNeed list every cat of a
 * shelter, and the old global limit of 200 dropped whole shelters once one shelter had 200 cats, so
 * the cap is per shelter. 200 is the old global limit, so no shelter gets fewer cats than before.
 */
export const STOREFRONT_PER_SHELTER_LIMIT = 200;

/** Global safety bound on blessed cats in one response, above the sum any shelter mix needs today. */
export const STOREFRONT_LIMIT = 1000;

/** Blueprint cats sampled per response, as before. */
export const STOREFRONT_BLUEPRINT_SAMPLE = 10;

export const STOREFRONT_CACHE_TTL_MS = 45000;

/** Group key for a blessed cat whose shelter is missing, as before. */
export const STOREFRONT_UNKNOWN_KEY = 'unknown';

/**
 * Whitelist of cat fields in the response: what the marketplace, TailsCard and the Shelter NPCs
 * read. Never `owner`, `code`, `staked` or anything added later by default.
 */
export const STOREFRONT_CAT_FIELDS = [
    '_id',
    'name',
    'type',
    'tier',
    'spriteImg',
    'catImg',
    'resqueStory',
    'status',
    'blessing',
    'shelter',
    'isBlueprint',
    'packType',
    'packed',
    'tokenId',
    'token',
    'createdAt',
    'updatedAt',
] as const;

/** Blessing fields for a sale cat. Never `creator` (a user id). */
export const STOREFRONT_BLESSING_SELECT = 'name description status image catAvatar instagram tokenId token';

/** Shelter fields for a sale cat, as before plus nothing private (no wallets, users or code). */
export const STOREFRONT_SHELTER_SELECT = 'country name image slug';

export const storefrontProjection = (): Record<string, 1> =>
    STOREFRONT_CAT_FIELDS.reduce((acc, field) => ({ ...acc, [field]: 1 }), {} as Record<string, 1>);

/**
 * `StorefrontShelterMeta` without `role` until task 2b adds it (F7.7). The shared parser drops entries
 * without a valid `role`, so new clients see `meta.shelters: []` until then; old clients ignore `_meta`.
 */
export type IStorefrontShelterMeta = Omit<StorefrontShelterMeta, 'role'> & Partial<Pick<StorefrontShelterMeta, 'role'>>;

export type IStorefrontMeta = Omit<StorefrontMeta, 'shelters'> & { shelters: IStorefrontShelterMeta[] };

export type IStorefront<TCat = unknown> = Record<string, TCat[]> & { _meta?: IStorefrontMeta };

interface IShelterLike {
    slug?: string;
    name?: string;
}

/**
 * Keys a shelter slug may never take: the blueprints, the meta block, and the keys the shared parser
 * reserves (`__proto__` would set the response's prototype instead of adding a key).
 */
export const STOREFRONT_RESERVED_KEYS: readonly string[] = [
    'tokentails',
    '_meta',
    '__proto__',
    'constructor',
    'prototype',
];

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

/**
 * Builds the response from blueprints and unowned blessed cats. Pure, so the key-superset and
 * array guarantees are unit tested without MongoDB.
 *
 * `_meta.shelters` has one entry per shelter key in the response (contract), named from the shelter
 * list or the populated cat shelter, never an entry for `tokentails` or `unknown`.
 */
export function buildStorefront<TCat>(
    blueprints: TCat[] | null | undefined,
    blessedForSale: TCat[] | null | undefined,
    shelters: IShelterLike[] | null | undefined,
    now = new Date()
): Record<string, TCat[] | IStorefrontMeta> {
    const response: Record<string, TCat[] | IStorefrontMeta> = {};
    for (const key of STOREFRONT_REQUIRED_KEYS) {
        response[key] = [];
    }
    response.tokentails = Array.isArray(blueprints) ? blueprints : [];

    const names = new Map<string, string>();
    for (const shelter of Array.isArray(shelters) ? shelters : []) {
        if (typeof shelter?.slug === 'string' && shelter.slug && typeof shelter.name === 'string') {
            names.set(shelter.slug, names.get(shelter.slug) || shelter.name);
        }
    }

    for (const cat of Array.isArray(blessedForSale) ? blessedForSale : []) {
        const shelter = (cat as { shelter?: IShelterLike } | null)?.shelter;
        const slug = (typeof shelter?.slug === 'string' && shelter.slug) || STOREFRONT_UNKNOWN_KEY;
        if (STOREFRONT_RESERVED_KEYS.includes(slug)) {
            // Never let a shelter slug overwrite the blueprints, the meta block or the prototype.
            continue;
        }
        if (typeof shelter?.name === 'string' && !names.has(slug)) {
            names.set(slug, shelter.name);
        }
        const bucket = hasOwn(response, slug) ? response[slug] : undefined;
        if (Array.isArray(bucket)) {
            bucket.push(cat);
        } else {
            response[slug] = [cat];
        }
    }

    const shelterMeta: IStorefrontShelterMeta[] = [];
    for (const slug of Object.keys(response)) {
        if (slug === 'tokentails' || slug === STOREFRONT_UNKNOWN_KEY) {
            continue;
        }
        const name = names.get(slug);
        const isRequired = (STOREFRONT_REQUIRED_KEYS as readonly string[]).includes(slug);
        // A required key with no shelter document behind it is only a crash guard, not a shelter.
        if (name === undefined && isRequired) {
            continue;
        }
        shelterMeta.push({ slug, name: name ?? slug });
    }

    response._meta = { _v: STOREFRONT_META_VERSION, generatedAt: now.toISOString(), shelters: shelterMeta };
    return response;
}
