import { levelOf } from './mode-unlocks';

/*
 * The account level's ONE source (docs/plans/moba/LEADERBOARDS.md "Account level", founder Nov 20: "my level is 8 ...
 * but it shows LV 4"). Every reader uses `accountMatchesOf`: the Global and Country boards (their `pawlegendslevels`
 * rows), another player's profile card, the caller's own progress view (the game's Home chip and Profile), the Ranked
 * gate and the matchmaker's newbie lock. The game shows this number for a signed-in player; only a guest (or a game
 * still waiting for its first answer) shows its own device count.
 *
 * accountMatches = saved matches (`User.pawlegendsMatches`, raised only by a verified `/live` save) + the legacy
 * credit (`User.pawlegendsLegacyMatches`). Before Nov 20 the game counted its level on the device (forfeits, draws,
 * unscored party rooms and rejected replays counted there and never on the server) and synced that count to the
 * account; the credit is that gap, frozen ONCE per account by the leaderboard repair (`legacy:v1`): the synced device
 * count minus the saved count, 0 or more, at most LEGACY_MATCHES_CAP. Nobody loses a level or a mode they had; after the
 * freeze only saved matches add levels, so the progress sync can no longer raise a board.
 */

export const LEGACY_MATCHES_FIELD = 'pawlegendsLegacyMatches';
/** The frozen credit never exceeds this (a client could write its synced count up to 1,000,000). */
export const LEGACY_MATCHES_CAP = 200;
/** What a users read selects to compute the account level. */
export const ACCOUNT_LEVEL_PROJECTION: Readonly<Record<string, 1>> = Object.freeze({
    pawlegendsMatches: 1,
    pawlegendsLegacyMatches: 1,
});

/** An account's replay-verified saved matches (`User.pawlegendsMatches`): how many, and the top difficulty played. */
export interface MmPlayed {
    matches: number;
    top: string | null;
}

/** The top difficulty with a saved match and the total, from `pawlegendsMatches` (junk keys and values ignored). */
export function playedOf(counts: Record<string, unknown> | null | undefined): MmPlayed {
    const order = ['rookie', 'easy', 'normal', 'hard'];
    let matches = 0;
    let top: string | null = null;
    for (const d of order) {
        const n = counts?.[d];
        if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
        matches += Math.floor(n);
        top = d;
    }
    return { matches, top };
}

/** The stored legacy credit, clamped (junk reads as 0). Pure. */
export function legacyOf(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(LEGACY_MATCHES_CAP, Math.floor(v)) : 0;
}

/** The credit to freeze: the synced device count above the saved count, 0..LEGACY_MATCHES_CAP. Pure. */
export function legacyCredit(deviceMatches: unknown, savedMatches: number): number {
    const d = typeof deviceMatches === 'number' && Number.isFinite(deviceMatches) ? Math.floor(deviceMatches) : 0;
    return Math.max(0, Math.min(LEGACY_MATCHES_CAP, d - Math.max(0, Math.floor(savedMatches) || 0)));
}

/** The matches the account level counts. Pure. */
export function accountMatchesOf(
    user: { pawlegendsMatches?: Record<string, unknown> | null; pawlegendsLegacyMatches?: unknown } | null | undefined
): number {
    return playedOf(user?.pawlegendsMatches).matches + legacyOf(user?.pawlegendsLegacyMatches);
}

/** The account level. Pure. */
export function accountLevelOf(user: Parameters<typeof accountMatchesOf>[0]): number {
    return levelOf(accountMatchesOf(user));
}
