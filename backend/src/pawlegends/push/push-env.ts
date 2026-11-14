import { Env } from '../pawlegends-env';
import { normalPrivateKey, VapidKeys, vapidKeysValid } from './web-push';

/*
 * Web push keys (docs/plans/moba/SHARE-PUSH.md §2, names in docs/BACKEND.md). No on/off switch: with both keys set
 * the opt-in shows and pushes go out; without them (or with a pair that does not match) nothing is sent.
 * - `PAWLEGENDS_VAPID_PUBLIC_KEY`: the uncompressed P-256 public key, base64url (87 characters).
 * - `PAWLEGENDS_VAPID_PRIVATE_KEY`: its private scalar, base64url (43 characters; a 42-character one, a key
 *   with a leading zero byte, is padded). A secret: never in the repo.
 * - `PAWLEGENDS_VAPID_SUBJECT`: optional contact for the push services, default `https://pawlegends.app`.
 */

let cache: { pub: string; priv: string; subject: string; keys: VapidKeys | null } | null = null;

export function pushVapid(env: Env = process.env): VapidKeys | null {
    const pub = (env.PAWLEGENDS_VAPID_PUBLIC_KEY || '').trim();
    const priv = (env.PAWLEGENDS_VAPID_PRIVATE_KEY || '').trim();
    const subject = (env.PAWLEGENDS_VAPID_SUBJECT || '').trim() || 'https://pawlegends.app';
    if (cache && cache.pub === pub && cache.priv === priv && cache.subject === subject) return cache.keys;
    const ok = !!pub && !!priv && /^(mailto:|https:\/\/)/.test(subject) && vapidKeysValid(pub, priv);
    cache = { pub, priv, subject, keys: ok ? { publicKey: pub, privateKey: normalPrivateKey(priv)!, subject } : null };
    return cache.keys;
}
