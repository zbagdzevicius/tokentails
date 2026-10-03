/**
 * A guest merge that could not finish (plan G1): the guest's anonymous ID token is kept in
 * sessionStorage so `POST /user/guest/merge` can run again on the next ready account profile in
 * this tab, after a reload and after the email is verified.
 *
 * The anonymous Firebase user is gone once the player signed in to the existing account, so this
 * token cannot be refreshed: the retry works only until it expires (Firebase ID tokens live an
 * hour). The copy says so. Kept in sessionStorage, like the access token, never localStorage.
 *
 * The entry names the account it was meant for (`targetUid`): it is cleared on sign-out, and an
 * entry read while a different account is signed in is dropped, never merged into that account.
 */

export const PENDING_MERGE_KEY = "tt.pendingMerge";

/** Firebase ID tokens live one hour; used when the token's own expiry cannot be read. */
const DEFAULT_LIFETIME_MS = 60 * 60 * 1000;

export interface PendingMerge {
  guestToken: string;
  /** Epoch ms after which the backend would reject the token. */
  expiresAt: number;
  /** Firebase uid of the account the guest was meant to merge into. */
  targetUid: string;
}

/** Reads `exp` from the token (no verification: only to know when to stop retrying). */
export function tokenExpiry(token: string, now = Date.now()): number {
  try {
    const raw = token.startsWith("fb") ? token.slice(2) : token;
    const part = raw.split(".")[1];
    if (!part) return now + DEFAULT_LIFETIME_MS;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const exp = Number(json?.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : now + DEFAULT_LIFETIME_MS;
  } catch {
    return now + DEFAULT_LIFETIME_MS;
  }
}

export function savePendingMerge(guestToken: string, targetUid: string | null | undefined, now = Date.now()): void {
  if (!targetUid) {
    // No account to tie it to: a retry could land anywhere, so none is kept.
    clearPendingMerge();
    return;
  }
  try {
    const value: PendingMerge = { guestToken, expiresAt: tokenExpiry(guestToken, now), targetUid };
    sessionStorage.setItem(PENDING_MERGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the retry is lost; the copy never promised more than this tab.
  }
}

/**
 * The pending merge for the signed-in account `uid`, or null. An expired entry, a malformed one,
 * and one meant for a different account are removed.
 */
export function readPendingMerge(uid: string | null | undefined, now = Date.now()): PendingMerge | null {
  try {
    const raw = sessionStorage.getItem(PENDING_MERGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingMerge>;
    if (
      typeof value?.guestToken !== "string" ||
      typeof value.expiresAt !== "number" ||
      typeof value.targetUid !== "string" ||
      value.expiresAt <= now ||
      !uid ||
      value.targetUid !== uid
    ) {
      sessionStorage.removeItem(PENDING_MERGE_KEY);
      return null;
    }
    return { guestToken: value.guestToken, expiresAt: value.expiresAt, targetUid: value.targetUid };
  } catch {
    return null;
  }
}

export function clearPendingMerge(): void {
  try {
    sessionStorage.removeItem(PENDING_MERGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/**
 * Whether a failed merge is worth retrying: a network error, a server error, or an account that
 * is not verified yet. 409 (the monthly limit) and other 4xx answers are final.
 */
export function isRetryableMergeError(status: number | null | undefined, code?: string | null): boolean {
  if (!status) return true;
  if (status >= 500) return true;
  return status === 403 && code === "EMAIL_UNVERIFIED";
}
