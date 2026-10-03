/**
 * Referral capture (plan F5.7, decision #12). `?ref=<user id>` from any page is stored once in
 * `localStorage` under `tt.pendingRef` (the first referrer wins) and sent to
 * `POST /user/catbassadors/referral` only when a profile comes back with `promotedNow: true`, that
 * is, when a guest has just become an account. The backend pays once per referred account, ever.
 */
export const PENDING_REF_KEY = "tt.pendingRef";

/** Referrers are user ids (MongoDB ObjectIds); anything else is ignored, never stored. */
const OBJECT_ID = /^[a-f0-9]{24}$/i;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Private modes and blocked storage throw on access.
    return null;
  }
}

function first(value: unknown): string {
  if (Array.isArray(value)) return first(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

export function isReferrerId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID.test(value);
}

/**
 * Stores `ref` unless a referrer is already stored, or `ref` is not a user id, or it is the
 * player's own id. Returns the stored value (old or new), or null.
 */
export function capturePendingRef(
  ref: unknown,
  ownId?: string | null,
  store: StorageLike | null = storage()
): string | null {
  if (!store) return null;
  try {
    const existing = store.getItem(PENDING_REF_KEY);
    if (isReferrerId(existing)) return existing;
    const candidate = first(ref);
    if (!isReferrerId(candidate) || (ownId && candidate === ownId)) return null;
    store.setItem(PENDING_REF_KEY, candidate);
    return candidate;
  } catch {
    return null;
  }
}

/** `ref` from a URL search string (`?ref=...`), for pages that read `location` directly. */
export function refFromSearch(search: string): string | null {
  try {
    return new URLSearchParams(search).get("ref");
  } catch {
    return null;
  }
}

export function readPendingRef(store: StorageLike | null = storage()): string | null {
  try {
    const value = store?.getItem(PENDING_REF_KEY) ?? null;
    return isReferrerId(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingRef(store: StorageLike | null = storage()): void {
  try {
    store?.removeItem(PENDING_REF_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Called with every fetched profile. Sends the stored referrer once when the profile reports a
 * fresh promotion, then clears it whatever the answer (the backend decides eligibility, and a
 * refused referral is final). A network failure keeps it for the next promotion notice.
 */
export async function sendPendingRefOnPromotion(
  profile: { _id?: string; promotedNow?: boolean } | null | undefined,
  send: (referrerId: string) => Promise<unknown>,
  store: StorageLike | null = storage()
): Promise<"sent" | "skipped" | "failed"> {
  if (!profile?.promotedNow) return "skipped";
  const ref = readPendingRef(store);
  if (!ref) return "skipped";
  if (profile._id && ref === profile._id) {
    clearPendingRef(store);
    return "skipped";
  }
  try {
    await send(ref);
    clearPendingRef(store);
    return "sent";
  } catch (error) {
    if (error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number") {
      // The backend answered (refused, already referred, window closed): do not retry.
      clearPendingRef(store);
    }
    return "failed";
  }
}
