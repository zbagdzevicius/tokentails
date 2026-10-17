import { normalizeIsoAlpha2 } from 'src/impact/iso-countries';

/*
 * Moon Rave flags (Oct 17): each order carries the buyer's country as an ISO 3166-1 alpha-2 code, so the
 * crowd cats can hold its flag and GET /rave/countries can rank countries by cats.
 *
 * 1. The visitor's country from the IP: Cloudflare's `cf-ipcountry` header (set on every proxied request
 *    when IP geolocation is on). `XX` (unknown) and `T1` (Tor) are not assigned codes, so they read as
 *    "not detected". The address itself is never stored; only the two-letter code is.
 * 2. Not detected: the buyer may pick a country in the Add-a-cat sheet (`country` in the checkout body).
 *    A detected country wins over a picked one.
 * 3. `country: "none"` is the buyer's "no flag" choice. It always wins: the order stores no country, so
 *    nothing about the buyer's location is published next to their names or X handle.
 *
 * Besides the assigned ISO codes, Kosovo's `XK` (user-assigned, but what Cloudflare sends) is accepted.
 *
 * Like `cf-connecting-ip` (shared/client-ip.ts), the header can be forged by a caller who reaches the
 * origin directly (accepted, docs/BACKEND.md); the worst case is a wrong flag on the caller's own cats.
 */

export type RaveCountrySource = 'ip' | 'picked';

/** The "no flag" choice in the checkout body. */
export const RAVE_NO_FLAG = 'none';

/** An ISO alpha-2 code (any case, trimmed) or Kosovo's XK, uppercased; else null. */
export function normalizeRaveCountry(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().toUpperCase() === 'XK') return 'XK';
    return normalizeIsoAlpha2(value);
}

/** The country Cloudflare detected for `req`, or null. */
export function raveCountryFromRequest(req: any): string | null {
    const raw = req?.headers?.['cf-ipcountry'];
    return normalizeRaveCountry(Array.isArray(raw) ? raw[0] : raw);
}

/**
 * The order's country: none when the buyer chose "no flag", else the detected one, else the picked one.
 * `picked` must be an ISO alpha-2 code (any case), `"none"`, empty, null or absent; anything else is
 * `'invalid'`.
 */
export function resolveRaveCountry(
    detected: string | null | undefined,
    picked: unknown
): { country: string; source: RaveCountrySource } | null | 'invalid' {
    let pickedCode: string | null = null;
    if (picked !== undefined && picked !== null && picked !== '') {
        if (typeof picked === 'string' && picked.trim().toLowerCase() === RAVE_NO_FLAG) return null;
        pickedCode = normalizeRaveCountry(picked);
        if (!pickedCode) return 'invalid';
    }
    const ip = normalizeRaveCountry(detected);
    if (ip) return { country: ip, source: 'ip' };
    if (pickedCode) return { country: pickedCode, source: 'picked' };
    return null;
}
