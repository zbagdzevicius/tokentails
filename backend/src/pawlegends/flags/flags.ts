/*
 * Country flags (docs/plans/moba/FLAGS.md): a player's flag is the ISO 3166-1 alpha-2 country Cloudflare derives from
 * the request IP (`cf-ipcountry`). Only the two-letter code is ever kept; the IP is never stored or logged for this.
 * Cloudflare's own non-country codes (XX unknown, T1 Tor, and the legacy A1/A2/O1/EU/AP) give no flag. Pure, relative
 * imports only (the relay role loads it without the `src/` alias).
 */

/** Codes Cloudflare sends that are not a country. */
const NOT_A_COUNTRY = new Set(['XX', 'T1', 'A1', 'A2', 'O1', 'EU', 'AP', 'ZZ']);

/** The ISO country of a `cf-ipcountry` header value, or null (absent, malformed, unknown, Tor). Pure. */
export function countryOf(raw: unknown): string | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string') return null;
    const cc = v.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc) || NOT_A_COUNTRY.has(cc)) return null;
    return cc;
}

/** A stored flag row as the readers see it. */
export interface FlagRow {
    cc?: string | null;
    off?: boolean;
}

/** The flag others may see for a row (null: hidden by its owner, or no country known). Pure. */
export function shownFlag(row: FlagRow | null | undefined, fallback: string | null = null): string | null {
    if (row?.off) return null;
    return countryOf(row?.cc) ?? countryOf(fallback);
}

export const FLAGS_COLLECTION = 'pawlegendsflags';
