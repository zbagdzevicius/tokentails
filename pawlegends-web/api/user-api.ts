import { IProfile } from "@/models/profile";
import { getPlatform } from "@/analytics/platform";
import { GameType } from "@/models/game";
import { errorCodeOf, type ErrorCode } from "@/shared-contracts/errors";
import type { PawlegendsPartyResult, PawlegendsReplay } from "@/components/pawlegends/bridge";
import type { PawlegendsApiFetchResult, PawlegendsApiRoute } from "@/components/pawlegends/apiBridge";
import { ApiError, apiFetch, apiUrl, currentAccessToken, rawApiFetch, readError, readErrorCode } from "./api";

/**
 * The backend calls Paw Legends makes (api.tokentails.com, the shared account backend): the profile, the guest
 * session and merge, account and guest deletion, match saves, party tickets and the game API ops. pawlegends-app
 * imports the types from here too (`MatchSaveResult`, `PartyTicketResult`).
 */
const baseHeaders: HeadersInit = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

const authHeaders = (): HeadersInit => ({
  ...baseHeaders,
  accesstoken: currentAccessToken(),
});

/**
 * `GET /user/profile`. Throws `ApiError` (status and F5.6 code) on any non-2xx answer, so the auth
 * runtime can tell a 403 EMAIL_UNVERIFIED or a 409 ACCOUNT_CONFLICT from an outage. An anonymous
 * user without a guest document gets the transient template profile (F5.5). `token` (already
 * `fb`-prefixed) wins over the stored one, so a browser that blocks sessionStorage still signs in.
 */
const profile = async (signal?: AbortSignal, token?: string): Promise<IProfile> => {
  const response = await rawApiFetch(`${apiUrl}/user/profile`, {
    method: "GET",
    headers: token ? { ...baseHeaders, accesstoken: token } : authHeaders(),
    signal,
  });
  if (!response.ok) {
    const { code, message } = await readError(response);
    throw new ApiError(response.status, code, message);
  }
  return response.json();
};

/** Throws `ApiError` for a non-2xx answer, else returns the parsed body. */
const jsonOrThrow = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorCode(response));
  }
  return response.json() as Promise<T>;
};

/**
 * `POST /user/guest/session` (F5.5): creates the guest document and guest starter for the current
 * anonymous user, idempotently. `appCheckToken` goes in the lowercase `x-firebase-appcheck` header.
 * Called once per uid by the auth runtime, never directly by features.
 */
const guestSession = async (appCheckToken?: string | null): Promise<IProfile> => {
  const headers: Record<string, string> = { ...(authHeaders() as Record<string, string>) };
  if (appCheckToken) headers["x-firebase-appcheck"] = appCheckToken;
  return rawApiFetch(`${apiUrl}/user/guest/session`, { method: "POST", headers }).then((response) =>
    jsonOrThrow<IProfile>(response)
  );
};

export interface IGuestMergeResult {
  success: boolean;
  merged: boolean;
  state?: string;
  gamesMoved?: number;
  tailsCredited?: number;
}

/**
 * `POST /user/guest/merge` (G1): moves a guest's progress into the signed-in account. The guest is
 * named by its anonymous ID token, sent `fb`-prefixed in the lowercase `x-guest-token` header.
 * Resumable: calling it again continues an interrupted merge.
 */
const guestMerge = async (guestIdToken: string): Promise<IGuestMergeResult> => {
  const token = guestIdToken.startsWith("fb") ? guestIdToken : `fb${guestIdToken}`;
  return rawApiFetch(`${apiUrl}/user/guest/merge`, {
    method: "POST",
    headers: { ...(authHeaders() as Record<string, string>), "x-guest-token": token },
  }).then(async (response) => {
    if (!response.ok) {
      // The body's message is kept: a 429 is either the 30-day limit or the general rate limiter,
      // and only the message tells them apart (pendingMerge `isMergeCooldown`).
      const body = await (typeof response.clone === "function" ? response.clone() : response).json().catch(() => null);
      const message = body && typeof body.message === "string" ? body.message : undefined;
      throw new ApiError(response.status, errorCodeOf(body), message);
    }
    return response.json() as Promise<IGuestMergeResult>;
  });
};

/** `DELETE /user/guest`: "Erase guest progress" (the guest doc, starter, runs and anonymous user). */
const deleteGuest = async (): Promise<{ success: boolean }> =>
  rawApiFetch(`${apiUrl}/user/guest`, { method: "DELETE", headers: authHeaders() }).then((response) =>
    jsonOrThrow<{ success: boolean }>(response)
  );

/**
 * `DELETE /user/me` (G9, decision #4): deletes the signed-in account. On iOS pass a fresh Sign in
 * with Apple authorization code so the backend can revoke the Apple token.
 */
const deleteMe = async (appleAuthorizationCode?: string): Promise<{ success?: boolean }> =>
  rawApiFetch(`${apiUrl}/user/me`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify(appleAuthorizationCode ? { appleAuthorizationCode } : {}),
  }).then((response) => jsonOrThrow<{ success?: boolean }>(response));


/**
 * What `saveMatchDetailed` reports: the HTTP status (0 for a network failure or an abort) and the
 * F5.6 error code, so the caller decides what to do with the run (plan G2 layer 3).
 */
export interface MatchSaveResult {
  ok: boolean;
  status: number;
  code: ErrorCode | null;
  /** The parsed body of a 2xx answer (the user's new totals). */
  body?: unknown;
  /** Seconds from `Retry-After` on a 429, when the server sent a usable one. */
  retryAfter?: number;
  /**
   * On a 409 `HEIST_DUPLICATE`: the body's `mine` (true when the stored row is the caller's), when
   * the backend sends it. Absent otherwise.
   */
  mine?: boolean;
}

/**
 * The body a Pawlegends save posts (POC.md §11.5): the type and the match replay in `pawlegends`. The
 * backend re-simulates it; no score field is read.
 */
export interface PawlegendsMatch {
  type: typeof GameType.PAWLEGENDS;
  /** A solo replay (v:1, re-simulated), or a party result (v:2, checked against the relay's stored room log). */
  pawlegends: PawlegendsReplay | PawlegendsPartyResult;
  platform?: ReturnType<typeof getPlatform>;
}

/**
 * `POST /user/catbassadors/live` for callers that handle every outcome (the Heist host page). Unlike
 * `saveMatch` it never waits for a token (no `waitForLocalStorageKey`), never retries a 429 on its
 * own and never throws: it returns `{ ok, status, code }`. A 428 GUEST_SESSION_REQUIRED creates the
 * guest session once and retries once (the API wrapper); a 403 never opens the sheet.
 */
const saveMatchDetailed = async (
  match: PawlegendsMatch,
  options: { signal?: AbortSignal } = {}
): Promise<MatchSaveResult> => {
  const body = JSON.stringify({
    ...match,
    platform: match.platform ?? getPlatform(),
  });
  let response: Response;
  try {
    response = await apiFetch(
      `${apiUrl}/user/catbassadors/live`,
      { method: "POST", body, headers: authHeaders(), signal: options.signal },
      { guestSession: true, requireAccount: false }
    );
  } catch {
    return { ok: false, status: 0, code: null };
  }
  if (response.ok) {
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { ok: true, status: response.status, code: null, body: parsed };
  }
  // A 409 body may say whose row the duplicate is; read it from a copy (readErrorCode reads the body).
  const duplicateCopy = response.status === 409 && typeof response.clone === "function" ? response.clone() : null;
  const code = await readErrorCode(response);
  const result: MatchSaveResult = { ok: false, status: response.status, code };
  if (duplicateCopy) {
    try {
      const mine = ((await duplicateCopy.json()) as { mine?: unknown } | null)?.mine;
      if (typeof mine === "boolean") result.mine = mine;
    } catch {
      // No JSON body: whose row it is stays unknown.
    }
  }
  if (response.status === 429) {
    const wait = Number(response.headers?.get?.("Retry-After"));
    if (wait > 0 && Number.isFinite(wait)) result.retryAfter = wait;
  }
  return result;
};

/** What `pawlegendsPartyTicket` reports: the ticket, or the HTTP status and code (0 for a network failure). */
export interface PartyTicketResult {
  ticket: string | null;
  status: number;
  code: ErrorCode | null;
}

/**
 * `POST /pawlegends/party/ticket` (MULTIPLAYER.md §5.2): a 60 s single-use party ticket for the caller (an account or
 * a guest: a 428 creates the guest session once, like a save). Never throws; the ticket is handed to the game and
 * never stored or logged. 503 `PAWLEGENDS_PARTY_TICKET_UNAVAILABLE` means the backend has no ticket secret: the game
 * then plays as an unscored guest.
 */
const pawlegendsPartyTicket = async (options: { signal?: AbortSignal } = {}): Promise<PartyTicketResult> => {
  let response: Response;
  try {
    response = await apiFetch(
      `${apiUrl}/pawlegends/party/ticket`,
      { method: "POST", body: "{}", headers: authHeaders(), signal: options.signal },
      { guestSession: true, requireAccount: false }
    );
  } catch {
    return { ticket: null, status: 0, code: null };
  }
  if (!response.ok) return { ticket: null, status: response.status, code: await readErrorCode(response) };
  try {
    const body = (await response.json()) as { ticket?: unknown } | null;
    return { ticket: typeof body?.ticket === "string" ? body.ticket : null, status: response.status, code: null };
  } catch {
    return { ticket: null, status: response.status, code: null };
  }
};

/**
 * One game API op through the host (docs/plans/moba/SOCIAL-RANKED.md §13): the route comes from the host's own allowlist
 * (`components/pawlegends/apiBridge.ts`), never from the game. "none" sends no token; "any" lets a 428 create the guest
 * session (a guest may report); a registered-only route never opens the AuthSheet (the caller checked sign-in first).
 * Never throws for an HTTP answer; a network failure answers status 0.
 */
const pawlegendsApiCall = async (route: PawlegendsApiRoute): Promise<PawlegendsApiFetchResult> => {
  const init: RequestInit = {
    method: route.method,
    headers: route.auth === "none" ? baseHeaders : authHeaders(),
    ...(route.body ? { body: JSON.stringify(route.body) } : {}),
  };
  let response: Response;
  try {
    response =
      route.auth === "none"
        ? await rawApiFetch(`${apiUrl}${route.path}`, init)
        : await apiFetch(`${apiUrl}${route.path}`, init, { guestSession: route.auth === "any", requireAccount: false });
  } catch {
    return { status: 0, body: null };
  }
  let body: unknown = null;
  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }
  return { status: response.status, body };
};

export const USER_API = {
  pawlegendsApiCall,
  profile,
  guestSession,
  guestMerge,
  deleteGuest,
  deleteMe,
  saveMatchDetailed,
  pawlegendsPartyTicket,
};
