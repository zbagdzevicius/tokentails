import { createHmac, timingSafeEqual } from 'crypto';
import { PawlegendsSku } from './pawlegends.contracts';

/*
 * Pawlegends entitlement tokens (POC.md §8.2): `<base64url(JSON payload)>.<base64url(HMAC-SHA256(payload part,
 * PAWLEGENDS_ENTITLEMENT_SECRET))>`, the Bad Cat token format (`src/badcat/badcat-token.ts`) with its own key.
 * The game only reads `items`; the server verifies the token when it is refreshed or used for the upgrade and offers.
 */

export interface PawlegendsTokenPayload {
    items: string[];
    skus: PawlegendsSku[];
    expiresAt: number;
    /** Buyer email, set only once a restore link verified it (`ev: 1`). */
    email?: string;
    ev?: 1;
    /** Checkout Session ids the token speaks for. */
    sids?: string[];
    /** Device ids of those purchases. */
    dids?: string[];
}

/** A token lives 30 days; the host refreshes it on each visit. */
export const PAWLEGENDS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Longest token accepted (a few hundred purchases at most). */
const MAX_TOKEN_LENGTH = 8192;

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest();

export function signPawlegendsToken(payload: PawlegendsTokenPayload, secret: string): string {
    const body = b64url(JSON.stringify(payload));
    return `${body}.${b64url(mac(body, secret))}`;
}

/** The payload of a well-signed token unexpired at `now` (or within `graceMs`); null otherwise. Never throws. */
export function verifyPawlegendsToken(
    token: unknown,
    secret: string,
    now: number = Date.now(),
    graceMs = 0
): PawlegendsTokenPayload | null {
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = mac(parts[0], secret);
    const given = Buffer.from(parts[1], 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    let decoded: PawlegendsTokenPayload;
    try {
        decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!decoded || typeof decoded !== 'object' || typeof decoded.expiresAt !== 'number') return null;
    if (!Array.isArray(decoded.items) || !Array.isArray(decoded.skus)) return null;
    if (decoded.expiresAt + graceMs <= now) return null;
    return decoded;
}
