import { Types } from 'mongoose';
import { normalizeCatName } from '../../shared-contracts/name';
import type { PartyCard } from './party-relay';

/*
 * Party cards (MULTIPLAYER.md D8, §5.2): `party.card{catId}` wears one of the caller's own cats in the party. The relay
 * shows peers only the art, the element and the tier, and a name built from the card's catalog or breed name. The
 * cat's own name is a player's free text when it was named or renamed by a player (a starter, or any `nameChangedAt`),
 * so it only ever goes back to its owner as `ownName`, re-checked with `normalizeCatName` at every `party.card`.
 */

/** Cat art only from the Token Tails NFT bucket (the game's `ART_BUCKET_HOST` rule, embed/bridge.ts). */
export const PARTY_ART_HOST = 'tokentails-nfts.fra1.cdn.digitaloceanspaces.com';

/** The minimal cat fields the resolver reads (a lean CatRepository document). */
export interface PartyCatDoc {
    _id: unknown;
    owner?: unknown;
    name?: string;
    type?: string;
    tier?: string;
    catImg?: string;
    isStarter?: boolean;
    isGuestStarter?: boolean;
    starterBreed?: string;
    nameChangedAt?: unknown;
    sourceCat?: unknown;
}

export interface PartyCatReader {
    /** One cat by id (lean), or null. */
    byId(id: string): Promise<PartyCatDoc | null>;
}

const ELEMENTS = new Set(['ICE', 'ELECTRIC', 'FIRE', 'WIND', 'DARK', 'WATER', 'GRASS', 'SAND']);
const TIERS = new Set(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']);
const SAFE_NOUN = /^[A-Za-z][A-Za-z '-]{0,23}$/;

const titleCase = (s: string) =>
    s
        .toLowerCase()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' ');

export function artOf(url: unknown): string | null {
    if (typeof url !== 'string' || url.length > 300) return null;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && u.hostname === PARTY_ART_HOST && !u.username && !u.password ? u.href : null;
    } catch {
        return null;
    }
}

/** A catalogue name that is curated text (never a player's): the source cat's, a breed, or an unrenamed original. */
async function catalogOf(cat: PartyCatDoc, read: PartyCatReader): Promise<string | undefined> {
    if (cat.sourceCat) {
        const src = await read.byId(String(cat.sourceCat));
        const n = src && !src.isStarter && !src.isGuestStarter && !src.nameChangedAt ? src.name : undefined;
        return n && SAFE_NOUN.test(n) ? n : undefined;
    }
    if (cat.isStarter || cat.isGuestStarter) {
        const breed = cat.starterBreed ? titleCase(cat.starterBreed) : '';
        return SAFE_NOUN.test(breed) ? breed : undefined;
    }
    if (cat.nameChangedAt) return undefined;
    return cat.name && SAFE_NOUN.test(cat.name) ? cat.name : undefined;
}

/** The resolver the relay calls: only a cat `accountId` owns, with art from the bucket; null otherwise. */
export function partyCardResolver(read: PartyCatReader) {
    return async (accountId: string, catId: string): Promise<PartyCard | null> => {
        if (!Types.ObjectId.isValid(catId) || !/^[a-f0-9]{24}$/i.test(catId)) return null;
        const cat = await read.byId(catId);
        if (!cat || !cat.owner || String(cat.owner) !== accountId) return null;
        const image = artOf(cat.catImg);
        if (!image) return null;
        const element = String(cat.type ?? '').toUpperCase();
        const tier = String(cat.tier ?? '').toUpperCase();
        const own = normalizeCatName(cat.name ?? '');
        const card: PartyCard = {
            catId: String(cat._id),
            image,
            element: ELEMENTS.has(element) ? element.toLowerCase() : 'none',
            tier: TIERS.has(tier) ? tier.toLowerCase() : 'common',
        };
        const catalog = await catalogOf(cat, read);
        if (catalog) card.catalog = catalog;
        if (own.ok) card.ownName = own.name;
        return card;
    };
}
