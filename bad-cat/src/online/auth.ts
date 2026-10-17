/**
 * Accounts (GDD 10 Phase 2): the game is a static build served top level at tokentails.com/badcat, and Token Tails
 * sign-in lives in the Next.js client. A hidden iframe of `<auth origin>/badcat-account?bridge=1&origin=<ours>`
 * (client/pages/badcat-account.tsx, client/lib/badcatBridge.ts) reports the Firebase session and hands out fresh ID
 * tokens on request, by `postMessage` to our exact origin only. Signing in is a full-page hop to
 * `/badcat-account?return=<this page>` and back (popups are blocked in the TikTok and Instagram webviews).
 *
 * Tokens stay in memory only (never in storage): an ID token lives an hour and the bridge mints a new one each time.
 */
import type { OnlineSession } from '../types';

export const AUTH_CHANNEL = 'tt-badcat-auth';
export const AUTH_VERSION = 1;
export const TOKEN_TIMEOUT_MS = 6000;
const HELLO_RETRY_MS = 500;
const HELLO_TRIES = 20;

export interface AuthBridge {
  session(): OnlineSession | null;
  onSession(fn: (s: OnlineSession | null) => void): () => void;
  token(): Promise<string | null>;
  signIn(returnUrl: string): void;
  signOut(): Promise<void>;
  dispose(): void;
}

/** The auth origin: VITE_BADCAT_AUTH_ORIGIN (https, or http://localhost in dev), else this page's origin on tokentails.com. */
export function authOriginFor(raw: string | null | undefined, here: { origin: string; hostname: string }, dev: boolean): string | null {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const u = new URL(raw.trim());
      if (u.username || u.password) return null;
      if (u.protocol === 'https:') return u.origin;
      if (dev && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.origin;
    } catch {
      return null;
    }
    return null;
  }
  return here.hostname === 'tokentails.com' || here.hostname.endsWith('.tokentails.com') ? here.origin : null;
}

interface WindowLike {
  location: { origin: string; href: string; assign(url: string): void };
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  removeEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  document: Document;
}

/** A session message from the bridge, checked. */
export function parseSession(data: unknown): OnlineSession | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.channel !== AUTH_CHANNEL || d.type !== 'session') return null;
  return { signedIn: d.signedIn === true, guest: d.guest === true, verified: d.verified === true };
}

export function createAuthBridge(authOrigin: string, win: WindowLike = window as unknown as WindowLike): AuthBridge {
  let current: OnlineSession | null = null;
  let frame: HTMLIFrameElement | null = null;
  let ready = false;
  let seq = 0;
  const waiting = new Map<number, (token: string | null) => void>();
  const listeners = new Set<(s: OnlineSession | null) => void>();
  let helloTimer: ReturnType<typeof setInterval> | null = null;

  const post = (msg: Record<string, unknown>): void => {
    try {
      frame?.contentWindow?.postMessage({ channel: AUTH_CHANNEL, v: AUTH_VERSION, ...msg }, authOrigin);
    } catch {
      /* the frame is gone */
    }
  };

  const onMessage = (e: MessageEvent): void => {
    if (e.origin !== authOrigin || !frame || e.source !== frame.contentWindow) return;
    const d = e.data as Record<string, unknown> | null;
    if (!d || d.channel !== AUTH_CHANNEL) return;
    if (d.type === 'session') {
      ready = true;
      if (helloTimer) clearInterval(helloTimer);
      helloTimer = null;
      current = parseSession(d);
      for (const fn of listeners) fn(current);
    } else if (d.type === 'token' && typeof d.id === 'number') {
      const done = waiting.get(d.id);
      waiting.delete(d.id);
      done?.(typeof d.token === 'string' && d.token ? d.token : null);
    }
  };

  const ensureFrame = (): void => {
    if (frame) return;
    win.addEventListener('message', onMessage);
    const f = win.document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.setAttribute('tabindex', '-1');
    f.title = 'Token Tails account';
    f.style.cssText = 'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
    f.src = `${authOrigin}/badcat-account?bridge=1&origin=${encodeURIComponent(win.location.origin)}`;
    win.document.body.appendChild(f);
    frame = f;
    let tries = 0;
    helloTimer = setInterval(() => {
      if (ready || ++tries > HELLO_TRIES) {
        if (helloTimer) clearInterval(helloTimer);
        helloTimer = null;
        return;
      }
      post({ type: 'hello' });
    }, HELLO_RETRY_MS);
  };

  ensureFrame();

  return {
    session: () => current,
    onSession(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    token() {
      ensureFrame();
      const id = ++seq;
      return new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          resolve(null);
        }, TOKEN_TIMEOUT_MS);
        waiting.set(id, (t) => {
          clearTimeout(timer);
          resolve(t);
        });
        post({ type: 'getToken', id });
      });
    },
    signIn(returnUrl) {
      win.location.assign(`${authOrigin}/badcat-account?return=${encodeURIComponent(returnUrl)}`);
    },
    async signOut() {
      post({ type: 'signOut' });
      current = current ? { signedIn: false, guest: false, verified: false } : null;
      for (const fn of listeners) fn(current);
    },
    dispose() {
      if (helloTimer) clearInterval(helloTimer);
      win.removeEventListener('message', onMessage);
      frame?.remove();
      frame = null;
      for (const done of waiting.values()) done(null);
      waiting.clear();
      listeners.clear();
    },
  };
}
