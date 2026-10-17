/**
 * Tiny JSON client for the badcat backend routes (BADCAT_ROUTES). Rules:
 * - base = env.apiUrl; no base (or the Club UI flag off) = offline: every call resolves to null with ZERO requests;
 * - 8 s timeout, `credentials: 'omit'`, never an `accesstoken` header (the game has no accounts in the MVP);
 * - never throws: network, HTTP and JSON errors all resolve to `{ ok: false }`.
 */

export const API_TIMEOUT_MS = 8000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiResult<T> {
  ok: boolean;
  status: number; // HTTP status, 0 = network/timeout/offline
  data: T | null;
}

export interface ApiClient {
  readonly online: boolean;
  readonly base: string | null;
  get<T>(path: string, query?: Record<string, string | number>): Promise<ApiResult<T>>;
  post<T>(path: string, body: unknown): Promise<ApiResult<T>>;
}

/** https only (http allowed for localhost dev); trailing slashes trimmed; anything else = offline. */
export function sanitizeApiBase(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

const OFFLINE: ApiResult<never> = Object.freeze({ ok: false, status: 0, data: null });

export function createApi(rawBase: string | null | undefined, opts: { fetch?: FetchLike; timeoutMs?: number; enabled?: boolean } = {}): ApiClient {
  const base = opts.enabled === false ? null : sanitizeApiBase(rawBase);
  const timeoutMs = opts.timeoutMs ?? API_TIMEOUT_MS;

  async function call<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
    if (!base) return OFFLINE;
    const f: FetchLike | undefined = opts.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
    if (!f) return OFFLINE;
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
      const res = await Promise.race([
        f(base + path, { ...init, credentials: 'omit', mode: 'cors', signal: ctrl?.signal }),
        timeout,
      ]);
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
    online: base !== null,
    base,
    get<T>(path: string, query?: Record<string, string | number>) {
      let p = path;
      if (query) {
        const q = Object.entries(query)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&');
        if (q) p += `?${q}`;
      }
      return call<T>(p, { method: 'GET', headers: { accept: 'application/json' } });
    },
    post<T>(path: string, body: unknown) {
      return call<T>(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
    },
  };
}
