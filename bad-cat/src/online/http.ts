/**
 * The online module's JSON client. Same rules as money/api.ts (https only, 8 s timeout, `credentials: 'omit'`,
 * never throws) plus the one Phase 2 addition: signed-in calls carry the lowercase `accesstoken` header with the
 * Firebase ID token (`fb` prefix), as every Token Tails API call does.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpResult<T> {
  ok: boolean;
  /** HTTP status, 0 = network error, timeout or offline. */
  status: number;
  data: T | null;
}

export const HTTP_TIMEOUT_MS = 8000;
const OFFLINE: HttpResult<never> = Object.freeze({ ok: false, status: 0, data: null });

export interface Http {
  readonly base: string | null;
  get<T>(path: string, opts?: { token?: string | null; query?: Record<string, string | number> }): Promise<HttpResult<T>>;
  post<T>(path: string, body: unknown, opts?: { token?: string | null }): Promise<HttpResult<T>>;
}

/** https origins only (http only for localhost dev builds); anything else is offline. */
export function sanitizeBase(raw: string | null | undefined, dev = false): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.username || u.password) return null;
    if (u.protocol === 'https:') return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
    if (u.protocol === 'http:' && local && dev) return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
    return null;
  } catch {
    return null;
  }
}

/** A Firebase ID token for the header: `fb` + the JWT, or null when it does not look like one. */
export function accessToken(token: string | null | undefined): string | null {
  if (typeof token !== 'string') return null;
  const t = token.startsWith('fb') ? token : `fb${token}`;
  return /^fb[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t) && t.length < 8000 ? t : null;
}

export function createHttp(base: string | null, opts: { fetch?: FetchLike; timeoutMs?: number } = {}): Http {
  const timeoutMs = opts.timeoutMs ?? HTTP_TIMEOUT_MS;

  async function call<T>(path: string, init: RequestInit, token?: string | null): Promise<HttpResult<T>> {
    if (!base) return OFFLINE;
    const f: FetchLike | undefined = opts.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
    if (!f) return OFFLINE;
    const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
    const t = accessToken(token);
    if (t) headers.accesstoken = t;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      const timeout = new Promise<never>((_, rej) => {
        timer = setTimeout(() => {
          try {
            ctrl?.abort();
          } catch {
            /* ignore */
          }
          rej(new Error('timeout'));
        }, timeoutMs);
      });
      const res = await Promise.race([f(base + path, { ...init, headers, credentials: 'omit', mode: 'cors', signal: ctrl?.signal }), timeout]);
      let data: T | null = null;
      try {
        const text = await res.text();
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        data = null;
      }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    base,
    get<T>(path: string, o: { token?: string | null; query?: Record<string, string | number> } = {}) {
      const q = o.query ? `?${new URLSearchParams(Object.entries(o.query).map(([k, v]) => [k, String(v)])).toString()}` : '';
      return call<T>(path + q, { method: 'GET' }, o.token);
    },
    post<T>(path: string, body: unknown, o: { token?: string | null } = {}) {
      return call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }, o.token);
    },
  };
}
