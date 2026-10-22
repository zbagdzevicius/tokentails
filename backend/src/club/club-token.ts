import { createHmac, timingSafeEqual } from 'crypto';

/*
 * Tails Club tokens: `<base64url(JSON payload)>.<base64url(HMAC-SHA256('club:' + payload part, secret))>`
 * (the badcat-token.ts shape). Two kinds, never interchangeable:
 * - `manage`: `{t:'manage', sub, exp}`, 30 days, handed only to the paying client (it holds the clientKey) by
 *   GET /club/subscriptions/:id once the membership is active; POST /club/portal opens the portal with it.
 * - `open`: `{t:'open', cus, exp}`, 15 minutes, only inside the emailed GET /club/portal/open link.
 */

export const CLUB_MANAGE_TTL_MS = 30 * 24 * 3600 * 1000;
export const CLUB_OPEN_TTL_MS = 15 * 60 * 1000;

export type ClubTokenKind = 'manage' | 'open';

export interface ClubTokenPayload {
    t: ClubTokenKind;
    /** Subscription id (`manage`). */
    sub?: string;
    /** Customer id (`open`). */
    cus?: string;
    /** Expiry, ms since the epoch. */
    exp: number;
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(`club:${payload}`).digest();

export function signClubToken(payload: ClubTokenPayload, secret: string): string {
    const part = b64url(JSON.stringify(payload));
    return `${part}.${b64url(mac(part, secret))}`;
}

/** The payload of a well-signed, unexpired token of `kind`; null otherwise. */
export function verifyClubToken(
    token: unknown,
    secret: string,
    kind: ClubTokenKind,
    now: number = Date.now()
): ClubTokenPayload | null {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [part, signature] = parts;
    const expected = mac(part, secret);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    let decoded: ClubTokenPayload;
    try {
        decoded = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!decoded || typeof decoded !== 'object' || decoded.t !== kind || typeof decoded.exp !== 'number') return null;
    if (decoded.exp <= now) return null;
    if (kind === 'manage' && (typeof decoded.sub !== 'string' || !decoded.sub.startsWith('sub_'))) return null;
    if (kind === 'open' && (typeof decoded.cus !== 'string' || !decoded.cus.startsWith('cus_'))) return null;
    return decoded;
}
