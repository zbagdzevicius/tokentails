import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'crypto';
import { VapidKeys } from './badcat-flags';

/*
 * Web Push without a dependency (Bad Cat Daily Phase 2 reminders): RFC 8291 message encryption (aes128gcm, RFC 8188)
 * and RFC 8292 VAPID with node:crypto only. Pure functions; the service does the HTTP.
 */

export const b64url = (buf: Buffer) =>
    buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Push services a subscription may point at (no request to any other host: SSRF guard). */
const PUSH_HOSTS = [
    /^fcm\.googleapis\.com$/,
    /^android\.googleapis\.com$/,
    /^updates\.push\.services\.mozilla\.com$/,
    /^push\.services\.mozilla\.com$/,
    /(^|\.)push\.apple\.com$/,
    /(^|\.)notify\.windows\.com$/,
];

export function isPushEndpoint(raw: unknown): raw is string {
    if (typeof raw !== 'string' || raw.length > 1000) return false;
    try {
        const u = new URL(raw);
        return (
            u.protocol === 'https:' &&
            !u.username &&
            !u.password &&
            !u.port &&
            PUSH_HOSTS.some(re => re.test(u.hostname))
        );
    } catch {
        return false;
    }
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

/** HKDF (RFC 5869) with one output block, enough for every length here (≤ 32 bytes). */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
    const prk = hmac(salt, ikm);
    return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

export interface EncryptedPush {
    body: Buffer;
    headers: Record<string, string>;
}

/**
 * Encrypts `payload` for one subscription (`p256dh` 65-byte uncompressed P-256 key, `auth` 16 bytes, both base64url).
 * `serverKeys` and `salt` are injectable for tests (RFC 8291 appendix A vector).
 */
export function encryptPayload(
    payload: Buffer,
    p256dh: string,
    auth: string,
    opts: { serverPrivate?: Buffer; salt?: Buffer } = {}
): Buffer {
    const uaPublic = fromB64url(p256dh);
    const authSecret = fromB64url(auth);
    if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh must be a 65-byte uncompressed P-256 key');
    if (authSecret.length < 16) throw new Error('auth must be 16 bytes');
    const ecdh = createECDH('prime256v1');
    if (opts.serverPrivate) ecdh.setPrivateKey(opts.serverPrivate);
    else ecdh.generateKeys();
    const asPublic = ecdh.getPublicKey();
    const shared = ecdh.computeSecret(uaPublic);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
    const ikm = hkdf(authSecret, shared, keyInfo, 32);
    const salt = opts.salt ?? randomBytes(16);
    const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
    const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
    const cipher = createCipheriv('aes-128-gcm', cek, nonce);
    const sealed = Buffer.concat([
        cipher.update(Buffer.concat([payload, Buffer.from([2])])),
        cipher.final(),
        cipher.getAuthTag(),
    ]);
    const rs = Buffer.alloc(4);
    rs.writeUInt32BE(4096, 0);
    return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, sealed]);
}

/** The VAPID JWT (ES256) for an endpoint's origin, valid 12 hours. */
export function vapidJwt(endpoint: string, keys: VapidKeys, nowSec: number): string {
    const pub = fromB64url(keys.publicKey);
    if (pub.length !== 65) throw new Error('BADCAT_VAPID_PUBLIC_KEY must be a 65-byte uncompressed P-256 key');
    const key = createPrivateKey({
        key: {
            kty: 'EC',
            crv: 'P-256',
            d: keys.privateKey,
            x: b64url(pub.subarray(1, 33)),
            y: b64url(pub.subarray(33, 65)),
        },
        format: 'jwk',
    });
    const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = b64url(
        Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: keys.subject }))
    );
    const data = `${header}.${claims}`;
    const signature = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
    return `${data}.${b64url(signature)}`;
}

/** Body and headers of one push request (TTL 12 h). */
export function buildPushRequest(
    sub: { endpoint: string; p256dh: string; auth: string },
    payload: object,
    keys: VapidKeys,
    nowSec: number
): EncryptedPush {
    const body = encryptPayload(Buffer.from(JSON.stringify(payload), 'utf8'), sub.p256dh, sub.auth);
    return {
        body,
        headers: {
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '43200',
            Urgency: 'normal',
            Authorization: `vapid t=${vapidJwt(sub.endpoint, keys, nowSec)}, k=${keys.publicKey}`,
        },
    };
}
