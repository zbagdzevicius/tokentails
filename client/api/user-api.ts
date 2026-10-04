import { IMatch } from "@/models/match";
import { IProfile } from "@/models/profile";
import {
  IAirdropProgression,
  IAirdropTierClaimResponse,
} from "@/models/airdrop";
import { getPlatform } from "@/analytics/platform";
import { GameType } from "@/models/game";
import type { ErrorCode } from "@/shared-contracts/errors";
import type { HeistRunLog } from "@/shared-contracts/heist-bridge";
import {
  ApiError,
  apiFetch,
  apiUrl,
  currentAccessToken,
  getAuthBridge,
  rawApiFetch,
  readErrorCode,
  waitForLocalStorageKey,
} from "./api";

const baseHeaders: HeadersInit = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

const authHeaders = (): HeadersInit => ({
  ...baseHeaders,
  accesstoken: sessionStorage.getItem("accesstoken") || "",
});

/**
 * `GET /user/profile`. Throws `ApiError` (status and F5.6 code) on any non-2xx answer, so the auth
 * runtime can tell a 403 EMAIL_UNVERIFIED or a 409 ACCOUNT_CONFLICT from an outage. An anonymous
 * user without a guest document gets the transient template profile (F5.5).
 */
const profile = async (signal?: AbortSignal): Promise<IProfile> => {
  const response = await rawApiFetch(`${apiUrl}/user/profile`, {
    method: "GET",
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorCode(response));
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
  }).then((response) => jsonOrThrow<IGuestMergeResult>(response));
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
 * `POST /user/catbassadors/referral` (decision #12). Sent only by the auth runtime, once, when a
 * profile reports `promotedNow` (F5.7).
 */
const referral = async (referrerId: string): Promise<unknown> =>
  rawApiFetch(`${apiUrl}/user/catbassadors/referral`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ referrerId }),
  }).then((response) => jsonOrThrow<unknown>(response));

const leaderboard = async (): Promise<IProfile[]> => {
  return fetch(`${apiUrl}/user/leaderboard`, {
    method: "GET",
    headers: baseHeaders,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return [];
    })
    .then();
};

const leaderboardCatnip = async (): Promise<IProfile[]> => {
  return fetch(`${apiUrl}/user/leaderboard/catnip`, {
    method: "GET",
    headers: baseHeaders,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return [];
    })
    .then();
};

const leaderboardPawMatchLevel = async (
  level: string,
  top: number = 120,
): Promise<
  Array<{
    _id: string;
    name: string;
    levelScore: number;
    match3ScoreCount: number;
  }>
> => {
  return fetch(`${apiUrl}/user/leaderboard/paw-match/${level}?top=${top}`, {
    method: "GET",
    headers: baseHeaders,
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return [];
    })
    .then();
};

const leaderboardPawMatchLevelPosition = async (
  level: string,
): Promise<{
  position: number | null;
  levelScore: number;
  match3ScoreCount: number;
}> => {
  return fetch(`${apiUrl}/user/leaderboard/paw-match/${level}/position`, {
    method: "GET",
    headers: authHeaders(),
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      return { position: null, levelScore: 0, match3ScoreCount: 0 };
    })
    .then();
};

/** A real 1-based place, or null (an error, no place yet, or garbage). */
const validPosition = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const leaderboardPosition = async (): Promise<number | null> => {
  return fetch(`${apiUrl}/user/leaderboard/position`, {
    method: "GET",
    headers: authHeaders(),
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      // No place rather than a made-up one (this used to answer "999", shown as a real rank).
      return { position: null };
    })
    .then((v) => validPosition(v?.position));
};

const leaderboardCatnipPosition = async (): Promise<number | null> => {
  return fetch(`${apiUrl}/user/leaderboard/catnip/position`, {
    method: "GET",
    headers: authHeaders(),
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      }

      console.warn(JSON.stringify(response));
      // No place rather than a made-up one (this used to answer "999", shown as a real rank).
      return { position: null };
    })
    .then((v) => validPosition(v?.position));
};

const saveCodex = async (): Promise<Partial<IProfile>> => {
  return fetch(`${apiUrl}/user/codex`, {
    method: "GET",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {};
  });
};

const saveProfileTwitter = (profile: Partial<IProfile>) => {
  return fetch(`${apiUrl}/user/profile/${profile._id}/twitter`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(profile),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    throw response;
  });
};

/** Longest wait, in seconds, before retrying a throttled save once. */
const MAX_SAVE_RETRY_WAIT = 60;

/** Thrown by saveMatch when the save was rate limited even after one retry. */
export class MatchSaveThrottledError extends Error {
  constructor() {
    super("Match save was rate limited");
    this.name = "MatchSaveThrottledError";
    // Keeps `instanceof` working when TypeScript compiles classes to ES5.
    Object.setPrototypeOf(this, MatchSaveThrottledError.prototype);
  }
}

const saveMatch = async (
  match: IMatch
): Promise<Partial<IProfile> | null> => {
  await waitForLocalStorageKey();
  const body = JSON.stringify({
    ...match,
    platform: match.platform ?? getPlatform(),
  });
  const post = () =>
    fetch(`${apiUrl}/user/catbassadors/live`, {
      method: "POST",
      body,
      headers: authHeaders(),
    });

  let response = await post();
  // 429: players sharing an address, or fast retries. Wait out the window once
  // rather than drop the run.
  if (response.status === 429) {
    const wait = Number(response.headers.get("Retry-After"));
    if (!(wait > 0 && wait <= MAX_SAVE_RETRY_WAIT)) {
      throw new MatchSaveThrottledError();
    }
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    response = await post();
    if (response.status === 429) throw new MatchSaveThrottledError();
  }
  if (response.ok) {
    return response.json();
  }

  console.warn(JSON.stringify(response));
  return null;
};

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

/** The body a Catnip Heist save posts: the type and the replay log. `points` is ignored server side. */
export interface HeistMatch {
  type: typeof GameType.CATNIP_HEIST;
  replay: HeistRunLog;
  platform?: IMatch["platform"];
}

/**
 * `POST /user/catbassadors/live` for callers that handle every outcome (the Heist host page). Unlike
 * `saveMatch` it never waits for a token (no `waitForLocalStorageKey`), never retries a 429 on its
 * own and never throws: it returns `{ ok, status, code }`. A 428 GUEST_SESSION_REQUIRED creates the
 * guest session once and retries once (the API wrapper); a 403 never opens the sheet.
 */
const saveMatchDetailed = async (
  match: IMatch | HeistMatch,
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

/**
 * Before a claim: with no Firebase user at all (a visitor whose anonymous sign-in failed, or a
 * signed-out optional page), `waitForLocalStorageKey` would wait forever and the tap would do
 * nothing. Open the AuthSheet instead and go on only once the player signed in. Without an auth
 * provider on the page the old wait stays (known issue, docs/CLIENT.md).
 */
const tokenForClaim = async (reason: string): Promise<boolean> => {
  if (currentAccessToken()) return true;
  const requireAccount = getAuthBridge().requireAccount;
  if (!requireAccount) {
    await waitForLocalStorageKey();
    return true;
  }
  return (await requireAccount(reason)) === "signed-in";
};

const redeem = async (): Promise<{ tails: number }> => {
  if (!(await tokenForClaim("claim-rewards"))) return { tails: 0 };
  // A side-effecting GET (the Daily Spin): a guest gets the sheet, then one retry (G1).
  return apiFetch(
    `${apiUrl}/user/catbassadors/lives/redeem`,
    { method: "GET", headers: authHeaders() },
    { requireAccount: "claim-rewards" }
  ).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return { tails: 0 };
  });
};

const airdropProgression = async (): Promise<IAirdropProgression | null> => {
  await waitForLocalStorageKey();
  return fetch(`${apiUrl}/user/airdrop/progression`, {
    method: "GET",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }
    console.warn(JSON.stringify(response));
    return null;
  });
};

const claimAirdropTier = async (
  tierId: string
): Promise<IAirdropTierClaimResponse> => {
  if (!(await tokenForClaim("claim-rewards"))) {
    return { success: false, message: "Sign in to claim this reward." };
  }
  return apiFetch(`${apiUrl}/user/airdrop/claim/${tierId}`, {
    method: "POST",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return { success: false, message: "Unable to claim this tier right now." };
  });
};

const claimAirdropChallenge = async (
  challengeId: string
): Promise<IAirdropTierClaimResponse> => {
  if (!(await tokenForClaim("claim-rewards"))) {
    return { success: false, message: "Sign in to claim this reward." };
  }
  return apiFetch(`${apiUrl}/user/airdrop/challenge/claim/${challengeId}`, {
    method: "POST",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {
      success: false,
      message: "Unable to claim this challenge reward right now.",
    };
  });
};

const claimAirdropMilestone = async (
  milestoneId: string
): Promise<IAirdropTierClaimResponse> => {
  if (!(await tokenForClaim("claim-rewards"))) {
    return { success: false, message: "Sign in to claim this reward." };
  }
  return apiFetch(`${apiUrl}/user/airdrop/milestone/claim/${milestoneId}`, {
    method: "POST",
    headers: authHeaders(),
  }).then((response) => {
    if (response.ok) {
      return response.json();
    }

    console.warn(JSON.stringify(response));
    return {
      success: false,
      message: "Unable to claim this milestone reward right now.",
    };
  });
};

export const USER_API = {
  profile,
  guestSession,
  guestMerge,
  deleteGuest,
  deleteMe,
  referral,
  leaderboard,
  leaderboardCatnip,
  leaderboardPawMatchLevel,
  leaderboardPawMatchLevelPosition,
  leaderboardPosition,
  leaderboardCatnipPosition,
  saveProfileTwitter,
  saveMatch,
  saveMatchDetailed,
  redeem,
  saveCodex,
  airdropProgression,
  claimAirdropTier,
  claimAirdropChallenge,
  claimAirdropMilestone,
};
