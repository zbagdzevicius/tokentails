import { randomInt } from 'crypto';

/*
 * Social contracts (docs/plans/moba/SOCIAL-RANKED.md §2, §3, §11.1). Duplicated in the game as
 * `pawlegends/src/social/code.ts`; `tests/unit/social-code.test.ts` there deep-compares the two copies.
 */

/** Crockford base32: no I, L, O, U (they read as 1, 1, 0 and V). */
export const PLAYER_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PLAYER_CODE_LENGTH = 8;
/** Shown as `PL-7KQ2-M9XR`; `parsePlayerCode` accepts that, lower case, spaces and the look-alike letters. */
export const PLAYER_CODE_PREFIX = 'PL';

export const FRIENDS_CAP = 100;
export const PENDING_OUT_CAP = 20;
export const REQUESTS_PER_DAY = 30;
export const BLOCKS_CAP = 200;
export const CODE_ROTATIONS_PER_DAY = 3;
export const RECENT_DAYS = 7;
export const RECENT_ROOMS = 20;
export const PENDING_TTL_DAYS = 30;
export const INVITE_TTL_MS = 3 * 60_000;

/** Presence windows (§4.2, §4.3). */
export const PRESENCE = Object.freeze({
    /** The row expires (TTL) this long after its last write. */
    ttlMs: 120_000,
    /** A relay state is trusted this long after its write. */
    relayFreshMs: 90_000,
    /** An API pulse counts as online this long. */
    apiFreshMs: 120_000,
    /** The pulse writes `api.at` at most this often per account. */
    apiWriteEveryMs: 60_000,
});

export const PRESENCE_STATES = ['offline', 'online', 'party', 'queue', 'match'] as const;
export type PresenceState = typeof PRESENCE_STATES[number];

export function generatePlayerCode(rand: (max: number) => number = randomInt): string {
    let out = '';
    for (let i = 0; i < PLAYER_CODE_LENGTH; i++) out += PLAYER_CODE_ALPHABET[rand(PLAYER_CODE_ALPHABET.length)];
    return out;
}

/** `7KQ2M9XR` → `PL-7KQ2-M9XR`. */
export const formatPlayerCode = (code: string): string =>
    `${PLAYER_CODE_PREFIX}-${code.slice(0, 4)}-${code.slice(4, PLAYER_CODE_LENGTH)}`;

/** Any typed form back to the 8 stored characters, or null. */
export function parsePlayerCode(input: unknown): string | null {
    if (typeof input !== 'string' || input.length > 24) return null;
    let s = input.toUpperCase().replace(/[\s-]/g, '');
    if (s.startsWith(PLAYER_CODE_PREFIX) && s.length === PLAYER_CODE_LENGTH + PLAYER_CODE_PREFIX.length)
        s = s.slice(PLAYER_CODE_PREFIX.length);
    s = s.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
    if (s.length !== PLAYER_CODE_LENGTH) return null;
    for (const ch of s) if (!PLAYER_CODE_ALPHABET.includes(ch)) return null;
    return s;
}

/** One row per pair, the smaller id first. */
export const pairId = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
