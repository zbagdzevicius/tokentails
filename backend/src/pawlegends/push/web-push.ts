import { createECDH } from 'crypto';
import { encryptPayload, fromB64url, isPushEndpoint, vapidJwt } from 'src/badcat/badcat-webpush';

/*
 * Web Push for Paw Legends (docs/plans/moba/SHARE-PUSH.md §2). The RFC 8291 encryption, the RFC 8292 VAPID JWT and the
 * push-service host list are the backend's dependency-free ones (src/badcat/badcat-webpush.ts, pure node:crypto);
 * this adds the Paw Legends key checks and one send with a per-category TTL, urgency and topic.
 */

export { encryptPayload, isPushEndpoint };

export const b64u = (b: Buffer | Uint8Array): string => Buffer.from(b).toString('base64url');
export const unb64u = (s: string): Buffer => fromB64url(String(s));

export interface VapidKeys {
    /** Uncompressed P-256 public point (65 bytes), base64url: what the browser's `applicationServerKey` takes. */
    publicKey: string;
    /** The private scalar d (32 bytes), base64url. */
    privateKey: string;
    /** `mailto:` or `https:` contact the push services may use. */
    subject: string;
}

export interface PushSubscriptionKeys {
    endpoint: string;
    p256dh: string;
    auth: string;
}

/** A fresh VAPID key pair (SHARE-PUSH.md: the one-liner that makes the production pair). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/** The keys are a P-256 pair (public point 65 bytes from 0x04, private 32 bytes, the private matches). */
export function vapidKeysValid(publicKey: string, privateKey: string): boolean {
    try {
        const pub = unb64u(publicKey);
        const d = unb64u(privateKey);
        if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) return false;
        const ecdh = createECDH('prime256v1');
        ecdh.setPrivateKey(d);
        return ecdh.getPublicKey().equals(pub);
    } catch {
        return false;
    }
}

/** The `Authorization: vapid t=…, k=…` header for an endpoint (the JWT's audience is the endpoint's origin). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSec = Math.floor(Date.now() / 1000)): string {
    return `vapid t=${vapidJwt(endpoint, keys, nowSec)}, k=${keys.publicKey}`;
}

export type PushFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: Buffer }
) => Promise<{ status: number }>;

export type PushOutcome = 'sent' | 'gone' | 'failed';

/** One push: `gone` (404/410: the subscription is dead, delete it), `sent`, or `failed` (try another time). */
export async function sendWebPush(
    sub: PushSubscriptionKeys,
    payload: Record<string, unknown>,
    keys: VapidKeys,
    o: { ttlSec: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string; fetch: PushFetch }
): Promise<PushOutcome> {
    if (!isPushEndpoint(sub.endpoint)) return 'gone';
    let body: Buffer;
    let auth: string;
    try {
        body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub.p256dh, sub.auth);
        auth = vapidAuthorization(sub.endpoint, keys);
    } catch {
        return 'gone';
    }
    const headers: Record<string, string> = {
        Authorization: auth,
        TTL: String(Math.max(0, Math.floor(o.ttlSec))),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Urgency: o.urgency ?? 'normal',
    };
    // a Topic replaces an undelivered push of the same topic (the device sees the latest only)
    if (o.topic && /^[A-Za-z0-9_-]{1,32}$/.test(o.topic)) headers.Topic = o.topic;
    try {
        const r = await o.fetch(sub.endpoint, { method: 'POST', headers, body });
        if (r.status === 404 || r.status === 410) return 'gone';
        return r.status >= 200 && r.status < 300 ? 'sent' : 'failed';
    } catch {
        return 'failed';
    }
}
