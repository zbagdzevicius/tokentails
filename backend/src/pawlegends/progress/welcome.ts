/*
 * The 7-day Welcome Path (GAPS.md N11; MLBB login heroes, Brawl Stars' front-loaded Trophy Road): a gift on each of a
 * new player's first seven days of play. A "day of play" is a UTC day with at least one verified match, counted only
 * inside the `/live` save. Never resets for a missed day (GDD §6), never expires, never an offer: Treat XP and existing
 * free cosmetics only. A gift whose cosmetic is already owned pays its Treat XP instead.
 */

export interface WelcomeGift {
    day: number;
    /** An existing free cosmetic (client `meta/treats.ts` ids). */
    item?: string;
    /** Treat XP (always set: the fallback when the item is owned). */
    xp: number;
}

export const WELCOME_DAYS = 7;

export const WELCOME_PATH: readonly WelcomeGift[] = Object.freeze([
    { day: 1, xp: 100 },
    { day: 2, item: 'emote.wave', xp: 150 },
    { day: 3, xp: 200 },
    { day: 4, item: 'coat.clem.lilac', xp: 200 },
    { day: 5, xp: 250 },
    { day: 6, item: 'frame.champ.lambo', xp: 250 },
    { day: 7, item: 'coat.sage.fern', xp: 300 },
]);

/** The grant for day `n` (1..7) given what the account owns. Pure. */
export function welcomeGrant(n: number, owned: ReadonlySet<string>): { item?: string; xp?: number } | null {
    const g = WELCOME_PATH[n - 1];
    if (!g) return null;
    return g.item && !owned.has(g.item) ? { item: g.item } : { xp: g.xp };
}
