/*
 * Clubs and good-teammate kudos (research gaps.md P6; docs/plans/moba/CLUBS-KUDOS.md). Pure data and math, no imports:
 * the game's mirror `pawlegends/src/social/clubs/clubData.ts` is deep-compared with this file by
 * `pawlegends/tests/unit/clubs.test.ts`, so edit both in the same commit.
 *
 * - A club holds at most 30 members; one club per account; registered accounts only (no guest creates or joins).
 * - Club names are never free text: two words picked from these lists (the same rule for every age band), so a name
 *   needs no moderation queue. Duplicate names are fine: the join code tells clubs apart.
 * - The weekly club chest grows only inside the `/live` save (`applyClubChest`) from verified party and PvP wins of
 *   registered members, at most CLUB_LIMITS.winsPerMemberPerDay per member per UTC day. It pays the next item the
 *   account does not own from the current Legends Pass free row (earned items, never sold), else a little Yarn.
 * - Kudos: one thumbs-up per teammate per PvP match, never to a pre-made party mate. The monthly good-teammate chest
 *   pays the same way. Nothing here is random, so there are no odds to show.
 */

export const CLUB_LIMITS = Object.freeze({
    /** Members per club (the owner included). */
    members: 30,
    /** Verified wins one member adds to the weekly chest per UTC day (the rest still count for the player). */
    winsPerMemberPerDay: 6,
    /** A club line page and the newest lines kept in view. */
    chatPage: 30,
    /** How long an account waits after leaving a club before it can join or create another (club hopping). */
    rejoinMs: 60 * 60 * 1000,
});

/** The weekly chest tiers: total verified member wins in one ISO week (Monday 00:00 UTC). */
export const CLUB_CHEST_TIERS: readonly number[] = Object.freeze([8, 20, 40]);
/** Yarn paid for a reached tier when the account already owns every free-row item. */
export const CLUB_CHEST_YARN = 150;

/** The monthly good-teammate chest tiers: thumbs-ups received in one UTC calendar month. */
export const KUDOS_CHEST_TIERS: readonly number[] = Object.freeze([3, 8, 15]);
export const KUDOS_CHEST_YARN = 100;
/** Thumbs-ups one account may give per UTC day (every teammate of every match still fits). */
export const KUDOS_PER_DAY = 40;
/** A match's results stay open for kudos this long after the room ended. */
export const KUDOS_WINDOW_MS = 2 * 60 * 60 * 1000;

/** First word of a club name. */
export const CLUB_NAME_FIRST: readonly string[] = Object.freeze([
    'Sunny',
    'Brave',
    'Sleepy',
    'Zippy',
    'Mighty',
    'Nimble',
    'Plucky',
    'Swift',
    'Cozy',
    'Frosty',
    'Golden',
    'Lucky',
    'Midnight',
    'Thunder',
    'Velvet',
    'Wild',
    'Starry',
    'Rusty',
    'Silver',
    'Fuzzy',
    'Daring',
    'Jolly',
    'Misty',
    'Crimson',
]);

/** Second word of a club name. */
export const CLUB_NAME_SECOND: readonly string[] = Object.freeze([
    'Paws',
    'Whiskers',
    'Pouncers',
    'Rascals',
    'Tails',
    'Claws',
    'Purrs',
    'Biscuits',
    'Comets',
    'Lanterns',
    'Rockets',
    'Mittens',
    'Zoomies',
    'Puddings',
    'Sparks',
    'Howlers',
    'Bandits',
    'Legends',
    'Nappers',
    'Sprinters',
    'Bolts',
    'Rivals',
    'Barkers',
    'Prowlers',
]);

/** `"3.7"` → `[3, 7]`, or null (the API takes the two list positions, never text). */
export function parseClubName(input: unknown): [number, number] | null {
    if (typeof input !== 'string' || !/^\d{1,2}\.\d{1,2}$/.test(input)) return null;
    const [a, b] = input.split('.').map(Number);
    if (a >= CLUB_NAME_FIRST.length || b >= CLUB_NAME_SECOND.length) return null;
    return [a, b];
}

export const clubNameText = (a: number, b: number): string =>
    `${CLUB_NAME_FIRST[a] ?? CLUB_NAME_FIRST[0]} ${CLUB_NAME_SECOND[b] ?? CLUB_NAME_SECOND[0]}`;

/** Crockford base32 (the player code alphabet): no I, L, O, U. */
export const CLUB_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CLUB_CODE_LENGTH = 6;
export const CLUB_CODE_PREFIX = 'CL';

/** `7KQ2M9` → `CL-7KQ2M9`. */
export const formatClubCode = (code: string): string => `${CLUB_CODE_PREFIX}-${code}`;

/** Any typed form (`cl-7kq2m9`, spaces, look-alike letters) back to the 6 stored characters, or null. */
export function parseClubCode(input: unknown): string | null {
    if (typeof input !== 'string' || input.length > 20) return null;
    let s = input.toUpperCase().replace(/[\s-]/g, '');
    if (s.startsWith(CLUB_CODE_PREFIX) && s.length === CLUB_CODE_LENGTH + CLUB_CODE_PREFIX.length)
        s = s.slice(CLUB_CODE_PREFIX.length);
    s = s.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
    if (s.length !== CLUB_CODE_LENGTH) return null;
    for (const ch of s) if (!CLUB_CODE_ALPHABET.includes(ch)) return null;
    return s;
}

/** The tiers reached at `n` (indices into `tiers`). */
export const tiersReached = (tiers: readonly number[], n: number): number[] =>
    tiers.map((need, i) => (n >= need ? i : -1)).filter(i => i >= 0);

/** The first item of `pool` the account does not own yet, or null (then the chest pays Yarn). */
export function nextChestItem(pool: readonly string[], owned: Iterable<string>): string | null {
    const have = new Set(owned);
    return pool.find(item => !have.has(item)) ?? null;
}

/** `2026-11` (UTC calendar month). */
export const monthKey = (d: Date): string => d.toISOString().slice(0, 7);
