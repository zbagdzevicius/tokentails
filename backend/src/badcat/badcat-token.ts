import { createHmac, timingSafeEqual } from 'crypto';
import { Entitlements } from './badcat.contracts';

/*
 * Entitlement tokens: `<base64url(JSON payload)>.<base64url(HMAC-SHA256(payload part, BADCAT_ENTITLEMENT_SECRET))>`.
 * The payload is the `Entitlements` object plus server claims (`ev`: the email was verified by a restore
 * link; `sids`: the purchases a scoped token may speak for). The client caches the token and never verifies
 * it; the server verifies it on refresh, portal, club cat and face upload.
 */

export interface TokenClaims {
    /** 1 when a restore magic link verified the email. */
    ev?: 1;
    /** Checkout Session ids and `gift:<code>` the token speaks for (scoped tokens). */
    sids?: string[];
}

export type TokenPayload = Entitlements & TokenClaims;

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest();

export function signEntitlements(entitlements: Entitlements, secret: string, claims: TokenClaims = {}): string {
    const payload = b64url(JSON.stringify({ ...entitlements, ...claims }));
    return `${payload}.${b64url(mac(payload, secret))}`;
}

export interface VerifyOptions {
    now?: number;
    /** Accept a token this long after its `expiresAt` (refresh and portal use the identity, not the perks). */
    graceMs?: number;
}

/** The payload of a well-signed, unexpired (or within `graceMs`) token; null otherwise. */
export function verifyEntitlementToken(
    token: unknown,
    secret: string,
    options: VerifyOptions = {}
): TokenPayload | null {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, signature] = parts;
    const expected = mac(payload, secret);
    let given: Buffer;
    try {
        given = Buffer.from(signature, 'base64url');
    } catch {
        return null;
    }
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    let decoded: TokenPayload;
    try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!decoded || typeof decoded !== 'object' || typeof decoded.expiresAt !== 'number') return null;
    const now = options.now ?? Date.now();
    if (decoded.expiresAt + (options.graceMs ?? 0) <= now) return null;
    return decoded;
}
