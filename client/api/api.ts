import { errorCodeOf, ErrorCode } from "@/shared-contracts/errors";

export const apiUrl = process.env.NEXT_PUBLIC_BE_URL;

/**
 * Known issue (docs/CLIENT.md, plan section 7): polls every second, forever, until a token exists.
 * Left unchanged on purpose for the callers that still await it; new code (the auth runtime,
 * `requireAccount`, the guest session) never uses it.
 */
export function waitForLocalStorageKey(key: string = "accesstoken") {
  return new Promise((resolve) => {
    const checkKey = () => {
      if (sessionStorage.getItem(key) !== null) {
        resolve(sessionStorage.getItem(key));
      } else {
        setTimeout(checkKey, 1000); // Check every 100ms
      }
    };
    checkKey();
  });
}

export const getAuthHeaders = () => ({
  accesstoken: sessionStorage.getItem("accesstoken"),
});

/** The stored `fb`-prefixed Firebase token, or "" (never throws, also during SSR). */
export function currentAccessToken(): string {
  try {
    return sessionStorage.getItem("accesstoken") || "";
  } catch {
    return "";
  }
}

/** A non-2xx answer with its F5.6 error code, for callers that need the status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | null,
    message?: string
  ) {
    super(message || `Request failed with status ${status}`);
    this.name = "ApiError";
    // Keeps `instanceof` working when TypeScript compiles classes to ES5.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/** Reads the error code from a response body without consuming the original response. */
export async function readErrorCode(response: Response): Promise<ErrorCode | null> {
  try {
    const copy = typeof response.clone === "function" ? response.clone() : response;
    return errorCodeOf(await copy.json());
  } catch {
    return null;
  }
}

/**
 * What the auth runtime (FirebaseAuthContext) plugs in, so this module never imports React or
 * Firebase. Every hook is optional: without a provider on the page the wrapper only fetches.
 */
export interface AuthBridge {
  /** Creates the guest document once (POST /user/guest/session). Resolves true when it exists. */
  ensureGuestSession?: () => Promise<boolean>;
  /** Opens the AuthSheet; resolves when the player signed in or closed it (F5.7). */
  requireAccount?: (reason: string) => Promise<"signed-in" | "dismissed">;
  /** 403 EMAIL_UNVERIFIED: show the verification state. */
  onEmailUnverified?: () => void;
  /** 409 ACCOUNT_CONFLICT: show the conflict state. */
  onAccountConflict?: () => void;
}

let bridge: AuthBridge = {};

/** Installs the auth hooks (one provider per page). Returns a function that removes them. */
export function setAuthBridge(next: AuthBridge): () => void {
  bridge = next;
  return () => {
    if (bridge === next) bridge = {};
  };
}

export function getAuthBridge(): AuthBridge {
  return bridge;
}

export interface ApiFetchOptions {
  /**
   * On 428 GUEST_SESSION_REQUIRED, create the guest session once and retry once. Default: on for
   * writes, off for GETs, so reading the lobby never creates a guest document (F5.5: the first
   * write does).
   */
  guestSession?: boolean;
  /**
   * On 403 GUEST_FORBIDDEN, open the AuthSheet with this reason and retry once after sign-in.
   * `false` returns the 403 as is. Default: `claim-rewards` for writes, `false` for GETs.
   */
  requireAccount?: string | false;
}

const isWrite = (init?: RequestInit) => (init?.method || "GET").toUpperCase() !== "GET";

/** The same headers with `accesstoken` replaced by the current token (it changes on sign-in). */
function withCurrentToken(headers: HeadersInit | undefined): HeadersInit | undefined {
  if (!headers) return headers;
  const token = currentAccessToken();
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    if (!headers.has("accesstoken")) return headers;
    const next = new Headers(headers);
    next.set("accesstoken", token);
    return next;
  }
  if (Array.isArray(headers)) {
    return headers.map(
      ([name, value]): [string, string] => [name, name.toLowerCase() === "accesstoken" ? token : value]
    );
  }
  const record = headers as Record<string, string>;
  return "accesstoken" in record ? { ...record, accesstoken: token } : record;
}

/** The fetch the wrapper itself uses: never the intercepted one, so a call is handled once. */
const rawFetch = (): typeof fetch => {
  const current = globalThis.fetch as typeof fetch & { __ttOriginal?: typeof fetch };
  return current.__ttOriginal ?? current;
};

/** Plain `fetch` that skips the interceptor, for calls whose caller handles every status itself. */
export function rawApiFetch(input: string, init?: RequestInit): Promise<Response> {
  return rawFetch()(input, init);
}

/**
 * `fetch` for backend calls with the F5.7 auth status handling:
 *
 * - 428 GUEST_SESSION_REQUIRED: `POST /user/guest/session` once (shared by concurrent calls), then
 *   one retry with the same body.
 * - 403 GUEST_FORBIDDEN: `requireAccount(reason)`, then one retry when the player signed in.
 * - 403 EMAIL_UNVERIFIED: the verification state. 409 ACCOUNT_CONFLICT: the conflict state.
 *
 * Every other answer is returned untouched. The body must be replayable (a string or nothing),
 * which every API module sends.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {}
): Promise<Response> {
  const write = isWrite(init);
  const allowSession = options.guestSession ?? write;
  const reason = options.requireAccount ?? (write ? "claim-rewards" : false);
  const send = (fresh: boolean) =>
    rawFetch()(input, fresh ? { ...init, headers: withCurrentToken(init.headers) } : init);

  let response = await send(false);
  if (response.status !== 428 && response.status !== 403 && response.status !== 409) {
    return response;
  }
  const code = await readErrorCode(response);

  if (response.status === 428 && code === ErrorCode.GUEST_SESSION_REQUIRED) {
    if (allowSession && bridge.ensureGuestSession && (await bridge.ensureGuestSession())) {
      response = await send(true);
    }
    return response;
  }
  if (response.status === 403 && code === ErrorCode.GUEST_FORBIDDEN) {
    if (reason && bridge.requireAccount && (await bridge.requireAccount(reason)) === "signed-in") {
      response = await send(true);
    }
    return response;
  }
  if (response.status === 403 && code === ErrorCode.EMAIL_UNVERIFIED) {
    bridge.onEmailUnverified?.();
  } else if (response.status === 409 && code === ErrorCode.ACCOUNT_CONFLICT) {
    bridge.onAccountConflict?.();
  }
  return response;
}

/**
 * Writes a guest may make that create the guest document on first use (428 then
 * `POST /user/guest/session`): the score save, the starter, the cat's state and name, following
 * a blessing. Every other intercepted call never creates a session, so a background read on an
 * optional page (entity metadata, quest search) writes nothing.
 */
const GUEST_WRITE_PATHS: RegExp[] = [
  /^\/user\/catbassadors\/live$/,
  /^\/user\/starter$/,
  /^\/user\/following\/[^/]+$/,
  /^\/cat\/(?!(adopt|sale|stake|stake-reward|rates?|redeem)$)[^/]+(\/name)?$/,
];

/**
 * Player-initiated actions that open the AuthSheet on 403 GUEST_FORBIDDEN, with the reason that
 * names it (decision #64). Anything not listed returns its 403 untouched: background calls must
 * never open the sheet by themselves ("optional pages never force a modal").
 */
const GATED_ACTIONS: Array<[RegExp, string]> = [
  [/^\/image\/create-checkout/, "purchase"],
  [/^\/image\/portrait(\/|$)/, "purchase"],
  [/^\/web3\/(create-payment|confirm-payment|confirm|open)$/, "purchase"],
  [/^\/cat\/(adopt|sale|stake|stake-reward)(\/|$)/, "adopt"],
  [/^\/comment$/, "sign-in"],
  [/^\/user\/like$/, "sign-in"],
  [/^\/user\/profile\/[^/]+\/twitter$/, "sign-in"],
  [/^\/ticket$/, "support"],
];

/**
 * The handling a plain `fetch` to the backend gets from the interceptor. Opt-in only: a guest
 * session for the guest writes above, the sheet for the player actions above, nothing for the
 * rest (and nothing for GETs). Callers that need more use `apiFetch` with explicit options.
 */
export function interceptOptions(path: string, init?: RequestInit): ApiFetchOptions {
  if (!isWrite(init)) return { guestSession: false, requireAccount: false };
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const gated = GATED_ACTIONS.find(([pattern]) => pattern.test(clean));
  return {
    guestSession: GUEST_WRITE_PATHS.some((pattern) => pattern.test(clean)),
    requireAccount: gated ? gated[1] : false,
  };
}

/**
 * Routes backend calls made with plain `fetch` (the other API modules) through the same handling
 * for the opt-in routes in `interceptOptions`. Only requests to `apiUrl` with a replayable body
 * are touched; everything else goes straight through. Installed by the auth provider in the
 * browser; idempotent. Returns an uninstall function.
 */
export function installApiInterceptor(target: typeof globalThis = globalThis): () => void {
  const current = target.fetch as typeof fetch & { __ttOriginal?: typeof fetch };
  if (!current || current.__ttOriginal || !apiUrl) return () => undefined;
  const original = current;
  const base = apiUrl.replace(/\/+$/, "");
  const intercepted = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    const body = init?.body;
    const replayable = body === undefined || body === null || typeof body === "string";
    if (!url || !url.startsWith(base) || !replayable) {
      return original(input, init);
    }
    return apiFetch(url, init ?? {}, interceptOptions(url.slice(base.length), init));
  }) as typeof fetch & { __ttOriginal?: typeof fetch };
  intercepted.__ttOriginal = original;
  target.fetch = intercepted;
  return () => {
    if (target.fetch === intercepted) target.fetch = original;
  };
}
