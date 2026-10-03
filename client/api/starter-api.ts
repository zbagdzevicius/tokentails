import { errorCodeOf, ErrorCode } from "@/shared-contracts/errors";
import type { StarterBreed } from "@/shared-contracts/enums";
import type { CatNameErrorCode, NameReportReason } from "@/shared-contracts/name";
import { apiFetch, apiUrl, currentAccessToken, rawApiFetch } from "./api";

/*
 * Meet your cat (plan G3), client side of the 3c routes:
 *
 *   POST   /user/starter              commit the starter once (409 STARTER_LOCKED means done)
 *   GET    /blessing/featured?limit=3 three real rescue cats (public, cached 10 min)
 *   GET    /blessing/featured/names   their names, reserved for starters
 *   POST   /user/following/:id        follow a real cat (guests allowed)
 *   DELETE /user/following/:id        unfollow
 *   PUT    /cat/:id/name              one free rename per 30 days (guests allowed)
 *   POST   /cat/:id/report            report a player cat name (registered players)
 *
 * Every call carries the lowercase `accesstoken` header with the `fb`-prefixed Firebase token. The
 * guest writes go through `apiFetch` with `guestSession: true`, so a transient guest's first write
 * gets 428 GUEST_SESSION_REQUIRED, creates the guest session once and is retried once (F5.5).
 */

const jsonHeaders = (): Record<string, string> => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  accesstoken: currentAccessToken(),
});

/** The committed starter as `POST /user/starter` returns it (the whitelisted STARTER_VIEW). */
export interface IStarterCat {
  _id: string;
  name: string;
  starterBreed?: StarterBreed;
  starterLockedAt?: string;
  spriteImg?: string;
  catImg?: string;
  type?: string;
  tier?: string;
  status?: Record<string, number>;
  isStarter?: boolean;
  isGuestStarter?: boolean;
}

export interface IStarterOnboarding {
  state: "pending" | "done";
  starterChosenAt?: string;
  skipped?: boolean;
  version?: number;
}

export interface IStarterCommit {
  breed: StarterBreed;
  name?: string;
  skipped?: boolean;
}

/**
 * - `committed`: this call locked the starter.
 * - `locked`: 409 STARTER_LOCKED. The starter was chosen already (another tab, a retry after a lost
 *   answer, or an existing account): the client treats it as done.
 * - `invalid`: 400 with a NAME_* code; the name step shows the message.
 * - `failed`: any other answer. `offline` is true when the request never reached the server, so
 *   the caller keeps the localStorage draft and retries later.
 */
export type StarterCommitResult =
  | { status: "committed"; cat: IStarterCat; onboarding: IStarterOnboarding }
  | { status: "locked" }
  | { status: "invalid"; code: CatNameErrorCode }
  | { status: "failed"; httpStatus: number | null; offline: boolean };

const NAME_CODES: ReadonlyArray<string> = [
  ErrorCode.NAME_TOO_SHORT,
  ErrorCode.NAME_TOO_LONG,
  ErrorCode.NAME_CHARS,
  ErrorCode.NAME_RESERVED,
  ErrorCode.NAME_BLOCKED,
];

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * The reveal waits for the commit's answer (review 4a #3), so a request that hangs must not hold
 * the player there: after this long it counts as offline and the draft is kept. If the server did
 * take it, the next visit's retry gets 409 STARTER_LOCKED, which is done.
 */
export const STARTER_COMMIT_TIMEOUT_MS = 10_000;

const commitStarter = async (body: IStarterCommit): Promise<StarterCommitResult> => {
  let response: Response;
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), STARTER_COMMIT_TIMEOUT_MS) : null;
  try {
    response = await apiFetch(
      `${apiUrl}/user/starter`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
        ...(controller ? { signal: controller.signal } : {}),
      },
      { guestSession: true, requireAccount: false },
    );
  } catch {
    return { status: "failed", httpStatus: null, offline: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
  const json = await readJson(response);
  if (response.ok) {
    const value = (json || {}) as { cat?: IStarterCat; onboarding?: IStarterOnboarding };
    if (value.cat && value.onboarding) {
      return { status: "committed", cat: value.cat, onboarding: value.onboarding };
    }
    return { status: "failed", httpStatus: response.status, offline: false };
  }
  const code = errorCodeOf(json);
  if (response.status === 409 && code === ErrorCode.STARTER_LOCKED) {
    return { status: "locked" };
  }
  if (response.status === 400 && code && NAME_CODES.includes(code)) {
    return { status: "invalid", code: code as CatNameErrorCode };
  }
  return { status: "failed", httpStatus: response.status, offline: false };
};

/** A real rescue cat from `GET /blessing/featured` (whitelisted fields only). */
export interface IFeaturedCat {
  _id: string;
  name: string;
  status: string;
  excerpt?: string;
  image?: string;
  catAvatar?: string;
  catImg?: string;
  shelter?: { _id: string; name: string; slug?: string };
}

/** Public and cached; never throws (an empty list skips the step). */
const featured = async (limit = 3): Promise<IFeaturedCat[]> => {
  try {
    const response = await rawApiFetch(`${apiUrl}/blessing/featured?limit=${limit}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const json = await readJson(response);
    return Array.isArray(json) ? (json as IFeaturedCat[]).filter((cat) => !!cat?._id && !!cat?.name) : [];
  } catch {
    return [];
  }
};

/** Names a starter may not take (the featured real cats). Never throws. */
const featuredNames = async (): Promise<string[]> => {
  try {
    const response = await rawApiFetch(`${apiUrl}/blessing/featured/names`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const json = (await readJson(response)) as { names?: unknown } | null;
    return Array.isArray(json?.names) ? json!.names.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
};

export type FollowResult = { ok: true; following: string[] } | { ok: false; httpStatus: number | null };

const followRequest = async (method: "POST" | "DELETE", blessingId: string): Promise<FollowResult> => {
  try {
    const response = await apiFetch(
      `${apiUrl}/user/following/${encodeURIComponent(blessingId)}`,
      { method, headers: jsonHeaders() },
      { guestSession: true, requireAccount: false },
    );
    if (!response.ok) return { ok: false, httpStatus: response.status };
    const json = (await readJson(response)) as { following?: unknown } | null;
    const following = Array.isArray(json?.following) ? (json!.following as string[]) : [];
    return { ok: true, following };
  } catch {
    return { ok: false, httpStatus: null };
  }
};

const follow = (blessingId: string) => followRequest("POST", blessingId);
const unfollow = (blessingId: string) => followRequest("DELETE", blessingId);

/**
 * - `renamed`: stored (or unchanged).
 * - `invalid`: a NAME_* code.
 * - `cooldown`: 409 inside the 30-day window; `nextRenameAt` says when (decision #22).
 * - `frozen`: 409 for any other reason (minted, not a committed starter).
 */
export type RenameResult =
  | { status: "renamed"; cat: { _id: string; name: string; nameChangedAt?: string; nextRenameAt?: string } }
  | { status: "invalid"; code: CatNameErrorCode }
  | { status: "cooldown"; nextRenameAt: string | null }
  | { status: "frozen"; message: string | null }
  | { status: "failed"; httpStatus: number | null };

const renameCat = async (catId: string, name: string): Promise<RenameResult> => {
  let response: Response;
  try {
    response = await apiFetch(
      `${apiUrl}/cat/${encodeURIComponent(catId)}/name`,
      { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ name }) },
      { guestSession: true, requireAccount: false },
    );
  } catch {
    return { status: "failed", httpStatus: null };
  }
  const json = (await readJson(response)) as Record<string, unknown> | null;
  if (response.ok && json && typeof json.cat === "object" && json.cat) {
    return { status: "renamed", cat: json.cat as { _id: string; name: string } };
  }
  const code = errorCodeOf(json);
  if (response.status === 400 && code && NAME_CODES.includes(code)) {
    return { status: "invalid", code: code as CatNameErrorCode };
  }
  if (response.status === 409) {
    const next = json?.nextRenameAt;
    if (typeof next === "string") return { status: "cooldown", nextRenameAt: next };
    const message = typeof json?.message === "string" ? json.message : null;
    return { status: "frozen", message };
  }
  return { status: "failed", httpStatus: response.status };
};

/** Reports a player cat's name. Registered players only, so a guest gets the sign-in sheet. */
const reportName = async (catId: string, reason: NameReportReason, note?: string): Promise<boolean> => {
  try {
    const response = await apiFetch(
      `${apiUrl}/cat/${encodeURIComponent(catId)}/report`,
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify(note ? { reason, note } : { reason }) },
      { guestSession: false, requireAccount: "sign-in" },
    );
    return response.ok;
  } catch {
    return false;
  }
};

export const STARTER_API = {
  commitStarter,
  featured,
  featuredNames,
  follow,
  unfollow,
  renameCat,
  reportName,
};
