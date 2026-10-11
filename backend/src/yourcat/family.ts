import { CatOriginType } from 'src/cat/cat.schema';
import { YourcatFamilyOption } from './yourcat.contracts';

/*
 * The cat families a `/yourcat` cat can take (docs/plans/yourcat-v2.md section 4.2). The look is always
 * the family's `base` sheet with the `GROOMING` emote: both were verified on the CDN for all 21 families
 * on 2026-10-11. `PEACHES` has no art on the CDN (403), so it is never used.
 */

export const SPRITE_CDN = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com';

export const PLAYABLE_FAMILIES: readonly string[] = Object.values(CatOriginType).filter(
    family => family !== CatOriginType.PEACHES
);

export const FAMILY_LABELS: Readonly<Record<string, string>> = {
    BLACK: 'Black',
    GREY: 'Grey',
    PINKIE: 'Pinkie',
    SIAMESE: 'Siamese',
    YELLOW: 'Ginger',
    WHITE: 'White',
    MAINE: 'Maine',
    OREO: 'Oreo',
    MIST: 'Mist',
    FOLD: 'Fold',
    OBSIDIAN: 'Obsidian',
    SAVANHAN: 'Savannah',
    BALINESE: 'Balinese',
    OBI: 'Obi',
    OLIVE: 'Olive',
    PICKLES: 'Pickles',
    RASCAL: 'Rascal',
    SABLE: 'Sable',
    FICUS: 'Ficus',
    MERLOT: 'Merlot',
    TROUFAS: 'Troufas',
};

const ALL_FAMILIES = new Set<string>(Object.values(CatOriginType));

/**
 * The family key in a classifier answer: upper-cased, A-Z only per word, the first word that is a
 * `CatOriginType` key wins ('Black.' -> BLACK, 'yellow cat' -> YELLOW). PEACHES (white with ginger
 * patches) maps to RASCAL (ginger with white patches), the nearest family with art. NONE or anything
 * else -> null.
 */
export function normaliseFamily(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const words = raw
        .toUpperCase()
        .split(/\s+/)
        .map(word => word.replace(/[^A-Z]/g, ''))
        .filter(Boolean);
    for (const word of words) {
        if (ALL_FAMILIES.has(word)) {
            return word === CatOriginType.PEACHES ? CatOriginType.RASCAL : word;
        }
    }
    return null;
}

export const isPlayableFamily = (family: unknown): family is string =>
    typeof family === 'string' && PLAYABLE_FAMILIES.includes(family);

export function familySprites(family: string): { spriteImg: string; catImg: string } {
    return {
        spriteImg: `${SPRITE_CDN}/assets/${family}/base.png`,
        catImg: `${SPRITE_CDN}/assets/${family}/base/GROOMING.gif`,
    };
}

export const familyLabel = (family: string) => FAMILY_LABELS[family] || family;

/** The manual picker's options, for GET /yourcat/status. */
export function familyOptions(): YourcatFamilyOption[] {
    return PLAYABLE_FAMILIES.map(family => ({
        family,
        label: familyLabel(family),
        spriteImg: familySprites(family).spriteImg,
    }));
}
