/**
 * Push notifications, the game side (docs/plans/moba/SHARE-PUSH.md §2): web push through pawlegends.app's service
 * worker (`/push-sw.js`, pawlegends-web/public). The game asks once a player has won a match, never on the first
 * launch, with its own card first (the browser's prompt only after "Turn on"); Settings turns each category off. The
 * subscription goes to the backend through the host's API ops (`push.key`, `push.subscribe`, `push.prefs`,
 * `push.off`), so the game never sees a token. Not in the app shells (their WebViews have no web push; native push is
 * a follow-up), not in a browser without PushManager (iOS Safari outside a Home Screen web app).
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { inAppShell } from '../app/platform';

export const PUSH_CATS = ['invite', 'club', 'ranked', 'event', 'nap'] as const;
export type PushCat = (typeof PUSH_CATS)[number];
export const PUSH_CAT_NAME: Readonly<Record<PushCat, string>> = Object.freeze({
  invite: 'Friend invites',
  club: 'Club chest ready',
  ranked: 'Ranked opening',
  event: 'New events',
  nap: 'Winter Nap gifts',
});

const KEY = 'tt.pawlegends.push.v1';
/** "Not now" waits this long before the card may come back; after two "Not now"s it never does (Settings still can). */
export const ASK_AGAIN_MS = 7 * 86_400_000;
export const MAX_ASKS = 2;

export interface PushPrefs {
  v: 1;
  /** The player turned notifications on (this device). */
  on: boolean;
  cats: PushCat[];
  /** Times the card was shown, and when last. */
  asks: number;
  lastAsk: number;
  /** The endpoint the backend has, to send prefs and to notice a rotated subscription. */
  endpoint: string | null;
}

export const defaultPrefs = (): PushPrefs => ({ v: 1, on: false, cats: [...PUSH_CATS], asks: 0, lastAsk: 0, endpoint: null });

export function parsePrefs(raw: unknown): PushPrefs {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    v: 1,
    on: o.on === true,
    cats: Array.isArray(o.cats) ? PUSH_CATS.filter((c) => (o.cats as unknown[]).includes(c)) : d.cats,
    asks: n(o.asks),
    lastAsk: n(o.lastAsk),
    endpoint: typeof o.endpoint === 'string' && o.endpoint.length <= 1000 ? o.endpoint : null,
  };
}

export function loadPushPrefs(): PushPrefs {
  try {
    return parsePrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return defaultPrefs();
  }
}

export function savePushPrefs(p: PushPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or off */
  }
}

type Perm = 'default' | 'granted' | 'denied' | 'unsupported';

/** This browser can take web push here (never in the app shells). */
export function pushSupported(w: unknown = typeof window !== 'undefined' ? window : undefined): boolean {
  try {
    const win = w as (Window & { PushManager?: unknown; Notification?: unknown }) | undefined;
    if (!win || inAppShell(undefined, win)) return false;
    return !!win.isSecureContext && 'serviceWorker' in win.navigator && !!win.PushManager && !!win.Notification;
  } catch {
    return false;
  }
}

export function permission(): Perm {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as Perm);
  } catch {
    return 'unsupported';
  }
}

/**
 * Show the card after this match? A win, not the first launch, notifications not on, the browser not already decided,
 * fewer than two asks and a week since the last. Pure.
 */
export function shouldAsk(o: { won: boolean; session: number; supported: boolean; perm: Perm; prefs: PushPrefs; now: number }): boolean {
  if (!o.won || o.session < 2 || !o.supported || o.perm !== 'default') return false;
  if (o.prefs.on || o.prefs.asks >= MAX_ASKS) return false;
  return o.now - o.prefs.lastAsk >= ASK_AGAIN_MS;
}

/** base64url → bytes (the VAPID public key for `applicationServerKey`). */
export function keyBytes(b64u: string): Uint8Array {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type Api = (op: ApiOp, args?: ApiArgs) => Promise<ApiResult>;

/** The server's public key, or null (push not set up there, or no host to ask). Cached for the page. */
let keyCache: Promise<string | null> | null = null;
export function serverKey(api: Api): Promise<string | null> {
  keyCache ??= api('push.key')
    .then((r) => {
      const k = r.ok ? (r.body as { key?: unknown } | undefined)?.key : null;
      return typeof k === 'string' && /^[A-Za-z0-9_-]{80,100}$/.test(k) ? k : null;
    })
    .catch(() => null)
    .then((k) => {
      if (!k) keyCache = null;
      return k;
    });
  return keyCache;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

const tz = (): number => new Date().getTimezoneOffset();

async function sendSub(api: Api, sub: PushSubscription, cats: readonly PushCat[]): Promise<boolean> {
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return false;
  const r = await api('push.subscribe', { endpoint: j.endpoint, pushKey: j.keys.p256dh, pushAuth: j.keys.auth, cats: cats.join(','), tz: tz() });
  return r.ok;
}

export type EnableResult = 'on' | 'denied' | 'unavailable' | 'failed';

/**
 * Turn notifications on. Call it straight from the tap (the permission prompt needs the gesture), with the key already
 * fetched (`serverKey`).
 */
export async function enablePush(api: Api, key: string): Promise<EnableResult> {
  if (!pushSupported()) return 'unavailable';
  let perm: NotificationPermission;
  try {
    perm = await Notification.requestPermission();
  } catch {
    return 'failed';
  }
  if (perm !== 'granted') return 'denied';
  try {
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
    const p = loadPushPrefs();
    if (!(await sendSub(api, sub, p.cats))) return 'failed';
    savePushPrefs({ ...p, on: true, endpoint: sub.endpoint });
    return 'on';
  } catch {
    return 'failed';
  }
}

/** Turn notifications off on this device. */
export async function disablePush(api: Api): Promise<void> {
  const p = loadPushPrefs();
  savePushPrefs({ ...p, on: false, endpoint: null });
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint ?? p.endpoint;
    if (endpoint) await api('push.off', { endpoint });
    await sub?.unsubscribe();
  } catch {
    /* the server forgets it on the next 410 */
  }
}

/** Save the categories (the server too when on). */
export async function setPushCats(api: Api, cats: readonly PushCat[]): Promise<void> {
  const p = loadPushPrefs();
  savePushPrefs({ ...p, cats: [...cats] });
  if (p.on && p.endpoint) await api('push.prefs', { endpoint: p.endpoint, cats: cats.join(','), tz: tz() }).catch(() => undefined);
}

/**
 * Once a launch, when on: send the current subscription again (the browser may have rotated it, another account may be
 * signed in, the time zone may have changed). Turned off when the browser permission was taken back.
 */
export async function resyncPush(api: Api): Promise<void> {
  const p = loadPushPrefs();
  if (!p.on || !pushSupported()) return;
  if (permission() !== 'granted') {
    savePushPrefs({ ...p, on: false });
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) {
      savePushPrefs({ ...p, on: false, endpoint: null });
      return;
    }
    if (await sendSub(api, sub, p.cats)) savePushPrefs({ ...loadPushPrefs(), endpoint: sub.endpoint });
  } catch {
    /* next launch */
  }
}
