import { BlessingStatus } from './blessing.schema';

/*
 * GET /blessing/featured (plan G3 step 6, "Real cats are waiting too"): pure helpers, so the
 * response shape and the excerpt rules are unit tested without a database.
 */

export const FEATURED_DEFAULT_LIMIT = 3;
export const FEATURED_MAX_LIMIT = 12;
export const FEATURED_CACHE_TTL_MS = 10 * 60 * 1000;
export const FEATURED_EXCERPT_LENGTH = 140;
/** Only cats still on their way home are featured. */
export const FEATURED_STATUSES = [BlessingStatus.WAITING, BlessingStatus.RECOVERING];

export interface IFeaturedCat {
    _id: string;
    name: string;
    status: BlessingStatus;
    excerpt: string;
    image?: string;
    catAvatar?: string;
    catImg?: string;
    shelter?: { _id: string; name?: string; slug?: string };
}

/** `?limit=` as a whole number in [1, FEATURED_MAX_LIMIT]; anything else is the default. */
export function parseFeaturedLimit(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
        return FEATURED_DEFAULT_LIMIT;
    }
    return Math.min(parsed, FEATURED_MAX_LIMIT);
}

const ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    '#39': "'",
    hellip: '...',
    ndash: '-',
    mdash: '-',
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
};

/**
 * A numeric entity's character, or a space for a control character, a lone surrogate or a value
 * past U+10FFFF (`String.fromCodePoint` throws a RangeError there, which would fail the whole
 * featured response).
 */
function decodeCodePoint(code: number): string {
    const valid = Number.isFinite(code) && code > 31 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : ' ';
}

/**
 * Plain-text excerpt of a blessing description (rich text from the CMS): tags, scripts and styles
 * removed, entities decoded, whitespace collapsed, cut at a word boundary with an ellipsis.
 */
export function htmlExcerpt(html: unknown, length = FEATURED_EXCERPT_LENGTH): string {
    if (typeof html !== 'string' || !html) {
        return '';
    }
    const text = html
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
            const key = entity.toLowerCase();
            if (ENTITIES[key] !== undefined) {
                return ENTITIES[key];
            }
            if (key.startsWith('#x')) {
                return decodeCodePoint(parseInt(key.slice(2), 16));
            }
            if (key.startsWith('#')) {
                return decodeCodePoint(parseInt(key.slice(1), 10));
            }
            return match;
        })
        // Decoded `<` or `>` must never reach the client as markup.
        .replace(/[<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= length) {
        return text;
    }
    const cut = text.slice(0, length - 1);
    const lastSpace = cut.lastIndexOf(' ');
    const trimmed = (lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?'"-]+$/, '');
    return `${trimmed}…`;
}

const idOf = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'object' && (value as { _id?: unknown })._id) {
        return String((value as { _id: unknown })._id);
    }
    return String(value);
};
const urlOf = (value: unknown): string | undefined =>
    value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
        ? (value as { url: string }).url
        : undefined;

/** The whitelisted public shape of one featured cat. Never includes creator, cat owner or tokens. */
export function toFeaturedCat(row: Record<string, any>): IFeaturedCat {
    const shelter = row.shelter && typeof row.shelter === 'object' ? row.shelter : undefined;
    const cat = row.cat && typeof row.cat === 'object' ? row.cat : undefined;
    const featured: IFeaturedCat = {
        _id: String(row._id),
        name: String(row.name || ''),
        status: row.status,
        excerpt: htmlExcerpt(row.description),
    };
    const image = urlOf(row.image);
    const catAvatar = urlOf(row.catAvatar);
    if (image) featured.image = image;
    if (catAvatar) featured.catAvatar = catAvatar;
    if (typeof cat?.catImg === 'string') featured.catImg = cat.catImg;
    if (shelter) {
        featured.shelter = { _id: idOf(shelter)! };
        if (typeof shelter.name === 'string') featured.shelter.name = shelter.name;
        if (typeof shelter.slug === 'string') featured.shelter.slug = shelter.slug;
    }
    return featured;
}
