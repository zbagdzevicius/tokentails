/**
 * The browser half of the Phase 2 daily reminder: a PushSubscription on the game's service worker (public/sw.js
 * shows the notification). Needs a registered service worker, the Push API and the player's permission; iOS only
 * offers it to a home-screen web app. Every call is a no-op answer when something is missing.
 */

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushClient {
  supported(): boolean;
  state(): Promise<'on' | 'off' | 'unsupported' | 'denied'>;
  /** Asks for permission and subscribes with the server's VAPID key; null when refused or unavailable. */
  subscribe(vapidPublicKey: string): Promise<PushSubscriptionJson | null>;
  /** Unsubscribes; resolves with the old endpoint (for the server) or null. */
  unsubscribe(): Promise<string | null>;
}

/** Base64url (the VAPID public key) to bytes for `applicationServerKey`. */
export function urlBase64ToBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface Nav {
  serviceWorker?: { ready: Promise<{ pushManager?: PushManager }>; getRegistration?(): Promise<unknown> };
}

export function createPushClient(g: { navigator?: Nav; Notification?: { permission: string; requestPermission(): Promise<string> } } = globalThis as never): PushClient {
  const supported = (): boolean => {
    try {
      return !!g.navigator?.serviceWorker && typeof g.Notification !== 'undefined' && typeof (globalThis as { PushManager?: unknown }).PushManager !== 'undefined';
    } catch {
      return false;
    }
  };
  const manager = async (): Promise<PushManager | null> => {
    if (!supported()) return null;
    try {
      const reg = await Promise.race([g.navigator!.serviceWorker!.ready, new Promise<null>((res) => setTimeout(() => res(null), 4000))]);
      return reg?.pushManager ?? null;
    } catch {
      return null;
    }
  };
  return {
    supported,
    async state() {
      if (!supported()) return 'unsupported';
      if (g.Notification!.permission === 'denied') return 'denied';
      const pm = await manager();
      if (!pm) return 'unsupported';
      try {
        return (await pm.getSubscription()) ? 'on' : 'off';
      } catch {
        return 'off';
      }
    },
    async subscribe(key) {
      const pm = await manager();
      if (!pm) return null;
      try {
        const perm = g.Notification!.permission === 'granted' ? 'granted' : await g.Notification!.requestPermission();
        if (perm !== 'granted') return null;
        const sub = (await pm.getSubscription()) ?? (await pm.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) as BufferSource }));
        const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
        return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
      } catch {
        return null;
      }
    },
    async unsubscribe() {
      const pm = await manager();
      if (!pm) return null;
      try {
        const sub = await pm.getSubscription();
        if (!sub) return null;
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        return endpoint;
      } catch {
        return null;
      }
    },
  };
}
