/**
 * The in-app host's backend calls (sign-in). The web host uses the Next client's API wrapper; the app has no Next
 * page, so this is the same contract, small: the lowercase `accesstoken` header with the `fb`-prefixed Firebase ID
 * token, a 428 GUEST_SESSION_REQUIRED answered once with `POST /user/guest/session` and one retry, and a status 0 for
 * a network failure or a timeout (never a throw). The token stays here: nothing of it reaches the game.
 *
 * Auth rules per call:
 * - `none`: no token (public reads);
 * - `guest`: a token is needed; with no Firebase user yet the host makes the lazy anonymous guest first (online only);
 * - `account`: a signed-in, non-anonymous account only; anything else answers 401 without a request.
 */

export type AuthRule = "none" | "guest" | "account";

export interface ApiAnswer {
  status: number;
  body: unknown;
  code: string | null;
  /** Seconds from `Retry-After` on a 429. */
  retryAfter?: number;
}

export interface HostApiDeps {
  origin: string;
  fetch: typeof fetch;
  /** The current user's `fb`-prefixed ID token, or null with no user. */
  token(): Promise<string | null>;
  /** A signed-in, non-anonymous account. */
  isAccount(): boolean;
  /** Makes sure a Firebase user exists (the lazy anonymous guest); false offline or on failure. */
  ensureUser(): Promise<boolean>;
  timeoutMs?: number;
}

export interface CallOptions {
  auth: AuthRule;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export const API_TIMEOUT_MS = 20_000;

export class HostApi {
  private guestSession: Promise<boolean> | null = null;

  constructor(private readonly deps: HostApiDeps) {}

  async call(method: string, path: string, options: CallOptions): Promise<ApiAnswer> {
    if (options.auth === "account" && !this.deps.isAccount()) return { status: 401, body: null, code: null };
    let token: string | null = null;
    if (options.auth !== "none") {
      token = await this.deps.token();
      if (!token && options.auth === "guest" && (await this.deps.ensureUser())) token = await this.deps.token();
      if (!token) return { status: 401, body: null, code: null };
    }
    let answer = await this.send(method, path, options, token);
    if (answer.status === 428 && answer.code === "GUEST_SESSION_REQUIRED" && options.auth === "guest") {
      if (await this.ensureGuestSession()) answer = await this.send(method, path, options, await this.deps.token());
    }
    return answer;
  }

  /** `POST /user/guest/session` once per page (shared by concurrent calls); false when it failed. */
  ensureGuestSession(): Promise<boolean> {
    if (!this.guestSession) {
      this.guestSession = (async () => {
        const token = await this.deps.token();
        if (!token) return false;
        const r = await this.send("POST", "/user/guest/session", { auth: "guest" }, token);
        return r.status >= 200 && r.status < 300;
      })();
      // a failure may be retried by a later call
      void this.guestSession.then((ok) => {
        if (!ok) this.guestSession = null;
      });
    }
    return this.guestSession;
  }

  /** A new Firebase user (sign-in, sign-out): its guest session is its own. */
  resetGuestSession(): void {
    this.guestSession = null;
  }

  private async send(method: string, path: string, options: CallOptions, token: string | null): Promise<ApiAnswer> {
    const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.accesstoken = token;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.deps.timeoutMs ?? API_TIMEOUT_MS) : null;
    const onAbort = () => controller?.abort();
    options.signal?.addEventListener("abort", onAbort);
    let response: Response;
    try {
      response = await this.deps.fetch(`${this.deps.origin}${path}`, {
        method,
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch {
      return { status: 0, body: null, code: null };
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
    let body: unknown = null;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    const code = body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : null;
    const answer: ApiAnswer = { status: response.status, body, code };
    if (response.status === 429) {
      const retry = Number(response.headers?.get?.("retry-after"));
      if (Number.isFinite(retry) && retry > 0) answer.retryAfter = retry;
    }
    return answer;
  }
}
