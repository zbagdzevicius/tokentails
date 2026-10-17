/*
 * Small pure helpers of the badcat module: day numbers, the name filter, input checks, the seeded RNG.
 */
import { BADCAT_DAY1 } from './badcat.contracts';

export const MS_DAY = 86_400_000;
const [D1Y, D1M, D1D] = BADCAT_DAY1.split('-').map(Number);
const DAY1_UTC = Date.UTC(D1Y, D1M - 1, D1D);

/** Day number of the UTC calendar date of `now` (players' local days differ by at most one). */
export function dayNoOf(now: Date): number {
    const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((utc - DAY1_UTC) / MS_DAY) + 1;
}

/**
 * The day numbers a booking (cameo, guest star, sponsor day, gift redeem) may name. Players book their
 * local day, which is the UTC day ±1, so the window starts at yesterday (UTC) and ends `aheadDays` after
 * tomorrow. The cameo bundle of any day in it picks up bookings made after it was stored.
 */
export function bookableDays(today: number, aheadDays: number): { min: number; max: number } {
    return { min: today - 1, max: today + 1 + aheadDays };
}

/** YYYY-MM-DD of a day number. */
export const dateOfDay = (dayNo: number) =>
    new Date(DAY1_UTC + (Math.trunc(dayNo) - 1) * MS_DAY).toISOString().slice(0, 10);

/** 0 = Monday … 6 = Sunday (day 1 is a Monday). */
export const weekdayOf = (dayNo: number) => (((Math.trunc(dayNo) - 1) % 7) + 7) % 7;
export const isFriday = (dayNo: number) => weekdayOf(dayNo) === 4;
/** The Monday of the week of `dayNo`. */
export const weekStartOf = (dayNo: number) => Math.trunc(dayNo) - weekdayOf(dayNo);

/** YYYY-MM-DD (UTC) of a date. */
export const utcDateKey = (now: Date) => now.toISOString().slice(0, 10);

export const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

/** A codec cat code: base64url. The codec's exact length check stays in the game (it may grow a version). */
export const CAT_CODE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const isCatCode = (value: unknown): value is string => typeof value === 'string' && CAT_CODE_PATTERN.test(value);

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}$/;
/** Lower-cased, trimmed email, or null when it does not look like one. */
export function normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
/**
 * A short block list (server-side backstop; the game's codec/text-filter.ts has the full multi-language
 * list and runs on encode and decode). Matched as substrings of the normalised, leet-mapped text.
 */
const BLOCKED = [
    'fuck',
    'shit',
    'cunt',
    'nigg',
    'fagg',
    'whore',
    'slut',
    'rape',
    'nazi',
    'hitler',
    'kurwa',
    'blyat',
    'suka',
    'pizd',
    'puta',
    'merde',
    'scheiss',
    'nahui',
    'bybis',
    'pyzd',
];

export const BLOCKED_NAME = 'A Cat';

// Built at runtime: unicode property escapes need ES2018 and the build targets ES2017.
const NOT_LETTER_DIGIT_SPACE = new RegExp('[^\\p{L}\\p{N} ]', 'gu');

/**
 * GDD 6.7 name filter: NFKC, strip URLs, @handles, emails and phone-like digit runs, keep letters, digits
 * and spaces, at most `max` characters; a blocked or empty name becomes "A Cat".
 */
export function filterName(value: unknown, max = 12): string {
    if (typeof value !== 'string') return BLOCKED_NAME;
    let text = value.normalize('NFKC');
    text = text
        .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
        .replace(/\S+@\S+\.\S+/g, ' ')
        .replace(/@\w+/g, ' ')
        .replace(/\+?\d[\d\s().-]{6,}\d/g, ' ')
        .replace(NOT_LETTER_DIGIT_SPACE, '')
        .replace(/\s+/g, ' ')
        .trim();
    text = Array.from(text).slice(0, max).join('').trim();
    if (!text) return BLOCKED_NAME;
    const folded = Array.from(text.toLowerCase())
        .map(char => LEET[char] ?? char)
        .join('')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zЀ-ӿ]/g, '');
    return BLOCKED.some(word => folded.includes(word)) ? BLOCKED_NAME : text;
}

/** A Stripe metadata value: a string without control characters, at most 500 characters (Stripe's limit). */
export function metaValue(value: unknown, max = 500): string | undefined {
    if (value === undefined || value === null) return undefined;
    const text = String(value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim();
    return text ? Array.from(text).slice(0, Math.min(max, 500)).join('') : undefined;
}

/** Drops undefined values (Stripe rejects them in metadata). */
export function compactMeta(meta: Record<string, string | undefined>): Record<string, string> {
    return Object.fromEntries(Object.entries(meta).filter(([, value]) => typeof value === 'string')) as Record<
        string,
        string
    >;
}

// ---------------------------------------------------------------------------------------------
// Deterministic RNG (cameo shuffles)
// ---------------------------------------------------------------------------------------------

/** FNV-1a over 32-bit integers or strings. */
export function hash32(...parts: (number | string)[]): number {
    let h = 0x811c9dc5;
    for (const part of parts) {
        const text = typeof part === 'number' ? String(part | 0) : part;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        h ^= 0x2c;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/** xorshift32 seeded from (day, shuffle). Integer only, deterministic across runtimes. */
export function xorshift32(seed: number): () => number {
    let x = seed >>> 0 || 0x9e3779b9;
    return () => {
        x ^= x << 13;
        x >>>= 0;
        x ^= x >>> 17;
        x ^= x << 5;
        x >>>= 0;
        return x;
    };
}

export const shuffleSeed = (dayNo: number, shuffle: number) => hash32('badcat-shuffle', dayNo, shuffle);

/**
 * Weighted sampling without replacement: `count` picks from `items` (already in a stable order), each
 * pick proportional to its integer weight.
 */
export function weightedSample<T>(
    items: readonly { item: T; weight: number }[],
    count: number,
    rng: () => number
): T[] {
    const pool = items.filter(entry => entry.weight > 0).map(entry => ({ ...entry }));
    const picked: T[] = [];
    while (picked.length < count && pool.length) {
        const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = rng() % total;
        let index = 0;
        while (roll >= pool[index].weight) {
            roll -= pool[index].weight;
            index++;
        }
        picked.push(pool[index].item);
        pool.splice(index, 1);
    }
    return picked;
}

/** `date` plus `months` calendar months (UTC), clamped to the month's last day. */
export function addMonths(date: Date, months: number): Date {
    const result = new Date(date.getTime());
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, last));
    return result;
}
