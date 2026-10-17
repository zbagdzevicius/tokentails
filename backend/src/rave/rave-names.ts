import { createHash } from 'crypto';
import { isBlockedCatName, normalizeCatName } from 'src/shared-contracts/name';
import { RaveNameFieldError } from './rave.errors';

/*
 * Cat names and the buyer's X handle (cat-rave/CHECKOUT-SPEC.md section 7). The server is authoritative;
 * the page mirrors these rules in cat-rave/src/checkout/names.ts and xhandle.ts for inline messages only.
 * Names and handles are rendered as text only (textContent or canvas text), never as HTML.
 */

/** Named fields per order; above this, one "name for the rest" field becomes "Name 11", "Name 12", ... */
export const RAVE_NAMED_SLOTS = 10;
/** More than this many identical buyer-typed names in one order is spam. */
export const RAVE_MAX_REPEAT = 3;

/** Cute defaults for empty fields. Each passes normalizeCatName (rave-names.spec.ts). */
export const RAVE_DEFAULT_NAMES: readonly string[] = Object.freeze([
    'Mochi',
    'Biscuit',
    'Pixel',
    'Noodle',
    'Bean',
    'Sprout',
    'Tofu',
    'Waffles',
    'Pumpkin',
    'Pepper',
    'Clover',
    'Nugget',
    'Pickle',
    'Sushi',
    'Toast',
    'Peanut',
    'Muffin',
    'Kiwi',
    'Dumpling',
    'Boba',
    'Ziggy',
    'Disco',
    'Glowstick',
    'Bassline',
    'Beatpaw',
    'Moonbeam',
    'Wobble',
    'Sparkle',
    'Velvet',
    'Neon',
    'Comet',
    'Jellybean',
    'Marble',
    'Tinsel',
    'Paprika',
    'Mango',
    'Fudge',
    'Pebble',
    'Hopscotch',
    'Zephyr',
]);

/**
 * `count` default names for an order, picked from sha256(orderId:index) so a retry of the same order
 * gets the same names, and no two slots share one while the list lasts.
 */
export function raveDefaultNames(orderId: string, count: number): string[] {
    const out: string[] = [];
    const used = new Set<number>();
    const n = RAVE_DEFAULT_NAMES.length;
    for (let i = 0; i < count; i += 1) {
        const start = createHash('sha256').update(`${orderId}:${i}`).digest().readUInt32BE(0) % n;
        let pick = start;
        if (used.size < n) {
            while (used.has(pick)) pick = (pick + 1) % n;
        }
        used.add(pick);
        out.push(RAVE_DEFAULT_NAMES[pick]);
    }
    return out;
}

export interface RaveNamesInput {
    cats: number;
    names?: unknown;
    restName?: unknown;
}

export interface RaveNames {
    /** One per named slot (min(cats, 10)), defaults filled in. */
    names: string[];
    /** Only when cats > 10. */
    restName?: string;
    /** The defaults of every named slot, then the rest slot: shown instead when a moderator hides the order. */
    defaultNames: string[];
}

export type RaveNamesResult = { ok: true; value: RaveNames } | { ok: false; fields: RaveNameFieldError[] };

const isEmpty = (value: unknown) =>
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** Normalises the buyer's names, or lists every field that is refused. `names` must already be an array or absent. */
export function resolveRaveNames(input: RaveNamesInput, orderId: string): RaveNamesResult {
    const slots = Math.min(input.cats, RAVE_NAMED_SLOTS);
    const hasRest = input.cats > RAVE_NAMED_SLOTS;
    const raw: unknown[] = Array.isArray(input.names) ? input.names : [];
    const defaults = raveDefaultNames(orderId, slots + (hasRest ? 1 : 0));
    const fields: RaveNameFieldError[] = [];
    const typed: { index: number | 'rest'; name: string }[] = [];

    const one = (value: unknown, index: number | 'rest', fallback: string): string => {
        if (isEmpty(value)) return fallback;
        const result = normalizeCatName(value);
        if (!result.ok) {
            fields.push({ index, code: result.code });
            return fallback;
        }
        typed.push({ index, name: result.name });
        return result.name;
    };

    const names: string[] = [];
    for (let i = 0; i < slots; i += 1) {
        names.push(one(raw[i], i, defaults[i]));
    }
    const restName = hasRest ? one(input.restName, 'rest', defaults[slots]) : undefined;

    const counts = new Map<string, number>();
    for (const entry of typed) {
        const key = entry.name.toLowerCase();
        const seen = (counts.get(key) || 0) + 1;
        counts.set(key, seen);
        if (seen > RAVE_MAX_REPEAT) {
            fields.push({ index: entry.index, code: 'NAME_REPEAT' });
        }
    }

    if (fields.length) {
        return { ok: false, fields };
    }
    return { ok: true, value: { names, ...(restName !== undefined ? { restName } : {}), defaultNames: defaults } };
}

/** The name of cat `i` (0-based) of an order: `names[i]`, else `${restName} ${i + 1}`. The client uses the same rule. */
export function raveCatName(order: { names: string[]; restName?: string | null }, i: number): string {
    if (i < order.names.length) return order.names[i];
    return `${order.restName || order.names[order.names.length - 1] || 'Cat'} ${i + 1}`;
}

// ---------------------------------------------------------------------------------------- X handle

export const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const X_RAW_LIMIT = 100;
/** Zero-width, bidi and other invisible characters. */
const INVISIBLE_RE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;
const X_PROFILE_URL_RE = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#\s]+)\/?(?:[?#].*)?$/i;

/** X's own pages, never a profile. */
export const X_RESERVED_PATHS: readonly string[] = Object.freeze([
    'home',
    'i',
    'intent',
    'share',
    'search',
    'explore',
    'settings',
    'messages',
    'notifications',
    'compose',
    'login',
    'logout',
    'signup',
    'tos',
    'privacy',
    'hashtag',
    'account',
    'about',
    'download',
    'jobs',
]);

export type XHandleErrorCode = 'X_HANDLE_INVALID' | 'X_HANDLE_BLOCKED';
export type XHandleResult = { ok: true; handle: string | null } | { ok: false; code: XHandleErrorCode };

/**
 * `@handle`, `handle` or an x.com / twitter.com profile link → the bare handle (`^[A-Za-z0-9_]{1,15}$`),
 * `null` for an empty field, or an error. Any other host, a deeper path (a post), X's own pages and
 * handles the cat-name word lists block are refused. Only the handle is ever stored; the page builds
 * `https://x.com/<handle>` itself.
 */
export function normalizeXHandle(input: unknown): XHandleResult {
    if (input === undefined || input === null) return { ok: true, handle: null };
    if (typeof input !== 'string') return { ok: false, code: 'X_HANDLE_INVALID' };
    if (input.length > X_RAW_LIMIT) return { ok: false, code: 'X_HANDLE_INVALID' };
    const value = input.normalize('NFKC').replace(INVISIBLE_RE, '').trim();
    if (!value) return { ok: true, handle: null };

    let candidate: string;
    const url = X_PROFILE_URL_RE.exec(value);
    if (url) {
        candidate = url[1];
    } else {
        candidate = value.startsWith('@') ? value.slice(1) : value;
    }
    if (!X_HANDLE_RE.test(candidate)) return { ok: false, code: 'X_HANDLE_INVALID' };
    if (X_RESERVED_PATHS.includes(candidate.toLowerCase())) return { ok: false, code: 'X_HANDLE_INVALID' };
    if (isBlockedCatName(candidate) || isBlockedCatName(candidate.replace(/_/g, ' '))) {
        return { ok: false, code: 'X_HANDLE_BLOCKED' };
    }
    return { ok: true, handle: candidate };
}
