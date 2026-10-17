/**
 * Embed bridge, game side: `{ns:'tt-pawlegends', v:1, type, ...}` (POC.md §11.1; pattern: swordcat
 * src/core/embed.js). Active only inside a frame with `?embed=1`. A message is accepted only from window.parent
 * and an allowlisted origin (VITE_EMBED_ORIGINS, comma-separated; localhost:3000 only in dev; plus the page's own
 * origin when the parent is same-origin, so a Vercel preview or a local dev port still reaches its host). The first valid
 * `hello` fixes the host origin; every post goes to it, never to '*'. Nothing is posted before the first hello, so
 * the host keeps saying hello until it hears `ready`. No accesstoken or Firebase token ever crosses.
 */
export const EMBED_NS = 'tt-pawlegends';
export const EMBED_VERSION = 1;
export const DEFAULT_EMBED_ORIGINS = 'https://tokentails.com,https://www.tokentails.com';
export const DEV_EMBED_ORIGINS = 'http://localhost:3000';

/** POC.md §11.1 types, plus the additive `offer{offer}` (a host that runs the server offer engine; optional). */
export const HOST_TYPES = Object.freeze(['hello', 'session', 'roster', 'entitlements', 'audio', 'pause', 'resume', 'purchase-result', 'app', 'offer'] as const);
export type HostType = (typeof HOST_TYPES)[number];
/**
 * POC.md §11.1 types, plus the additive `notify{where}` (Legends Pass notify-me): the game sends it only when the
 * host announced support with `app{notify: true}`, so an older host never sees it.
 */
export const GAME_TYPES = Object.freeze(['ready', 'match-result', 'purchase-intent', 'share', 'paused', 'notify'] as const);
export type GameType = (typeof GAME_TYPES)[number];

export interface HostMessage {
  type: HostType;
  [k: string]: unknown;
}

/** Parse a comma-separated origin list into normalised origins (invalid entries dropped). */
export function parseOrigins(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !out.includes(u.origin)) out.push(u.origin);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function allowedOrigins(env: { VITE_EMBED_ORIGINS?: string; DEV?: boolean } = import.meta.env): string[] {
  const raw = typeof env.VITE_EMBED_ORIGINS === 'string' && env.VITE_EMBED_ORIGINS.trim() ? env.VITE_EMBED_ORIGINS : DEFAULT_EMBED_ORIGINS;
  return parseOrigins(env.DEV ? `${raw},${DEV_EMBED_ORIGINS}` : raw);
}

/**
 * The allowlist plus the page's own origin when the parent frame is same-origin (the swordcat `withSameOrigin`
 * rule): the game is served under the host at /pawlegends-game/, so a preview or dev origin the build-time list
 * never named is still its own host. A cross-origin parent throws on `parent.location.origin`: the list stays as is.
 */
export function withSameOrigin(allowed: readonly string[], win: { location?: { origin?: string }; parent?: unknown }): string[] {
  let own: string | null = null;
  try {
    const o = win.location?.origin;
    const po = (win.parent as { location?: { origin?: string } } | undefined)?.location?.origin;
    if (typeof o === 'string' && o && o !== 'null' && o === po) own = o;
  } catch {
    own = null;
  }
  return own && !allowed.includes(own) ? [...allowed, own] : [...allowed];
}

/** The host message in `data`, or null when it is not ours (wrong ns, version or type). Pure. */
export function parseHostMessage(data: unknown): HostMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.ns !== EMBED_NS || m.v !== EMBED_VERSION || typeof m.type !== 'string') return null;
  if (!(HOST_TYPES as readonly string[]).includes(m.type)) return null;
  return m as HostMessage;
}

/** Accept an event? `fixed` is the host origin after the first hello (or null before). Pure. */
export function acceptOrigin(origin: string, allow: readonly string[], fixed: string | null): boolean {
  return fixed ? origin === fixed : allow.includes(origin);
}

export interface Bridge {
  readonly active: boolean;
  post(type: GameType, payload?: Record<string, unknown>): boolean;
  on(handler: (m: HostMessage) => void): void;
}

/** Install on the page. Inactive (posts nothing) unless framed with ?embed=1. */
export function installBridge(win: Window = window, version = String(import.meta.env.VITE_PAWLEGENDS_BUILD ?? 'dev')): Bridge {
  const framed = win.parent !== win && new URLSearchParams(win.location.search).get('embed') === '1';
  const handlers: ((m: HostMessage) => void)[] = [];
  const allow = framed ? withSameOrigin(allowedOrigins(), win) : allowedOrigins();
  let host: string | null = null;
  const post = (type: GameType, payload: Record<string, unknown> = {}): boolean => {
    if (!framed || !host) return false;
    win.parent.postMessage({ ...payload, ns: EMBED_NS, v: EMBED_VERSION, type }, host);
    return true;
  };
  if (framed) {
    win.document.documentElement.dataset.embed = '1';
    win.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== win.parent || !acceptOrigin(e.origin, allow, host)) return;
      const m = parseHostMessage(e.data);
      if (!m) return;
      if (m.type === 'hello') {
        host = e.origin;
        post('ready', { version });
      }
      for (const h of handlers) h(m);
    });
  }
  return { active: framed, post, on: (h) => void handlers.push(h) };
}
