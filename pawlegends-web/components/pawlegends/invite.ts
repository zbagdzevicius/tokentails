/**
 * Invite links on the web (backend `pawlegends/growth`): `pawlegends.app/?ref=CODE` goes on to `/play?ref=CODE`
 * (routes.json `playQueryKeys`). The page keeps the code on this device and drops it from the address bar; once the
 * visitor is signed in (invites belong to accounts) it is redeemed once with `POST /pawlegends/growth/invite/redeem`.
 * The friend then finishes 3 verified matches and both claim a coat in the game's Social sheet. Free: no purchase.
 *
 * Storage is a per-device convenience only, every access wrapped. No React here: the window, storage and fetch are
 * passed in, so every rule is unit-tested.
 */
import type { ApiResult, KeyStorage } from "./checkout";

export const PAWLEGENDS_REF_KEY = "tt.pawlegends.ref.v1";
/** A kept code is tried for this long (a visitor who never signs in leaves no code behind for ever). */
export const PENDING_REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CODE = /^[A-HJ-NP-Z2-9]{7}$/;

/** The `ref` of a query string, cleaned (case, spaces and dashes ignored), or null. */
export function refOf(search: string): string | null {
  try {
    const raw = new URLSearchParams(search).get("ref");
    if (!raw || raw.length > 20) return null;
    const code = raw.replace(/[\s-]/g, "").toUpperCase();
    return CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

interface Pending {
  code: string;
  at: number;
}

export function readPendingRef(storage: KeyStorage | null, now = Date.now()): string | null {
  try {
    const raw = storage?.getItem(PAWLEGENDS_REF_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pending>;
    if (typeof p.code !== "string" || !CODE.test(p.code) || typeof p.at !== "number" || now - p.at > PENDING_REF_TTL_MS) {
      storage?.removeItem(PAWLEGENDS_REF_KEY);
      return null;
    }
    return p.code;
  } catch {
    return null;
  }
}

export function clearPendingRef(storage: KeyStorage | null): void {
  try {
    storage?.removeItem(PAWLEGENDS_REF_KEY);
  } catch {
    // blocked storage
  }
}

/**
 * Keeps the link's code (the newest link wins) and answers the address without `ref`, or null when there was none.
 * The caller puts that address in the bar (history.replaceState), so a reload or a shared screenshot does not carry it.
 */
export function captureRef(href: string, storage: KeyStorage | null, now = Date.now()): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!url.searchParams.has("ref")) return null;
  const code = refOf(url.search);
  if (code) {
    try {
      storage?.setItem(PAWLEGENDS_REF_KEY, JSON.stringify({ code, at: now }));
    } catch {
      // blocked storage: the code lives for this page view only (redeemed now if signed in)
    }
  }
  url.searchParams.delete("ref");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What the page tells the player after a redeem try (null: say nothing, e.g. no connection: try again later). */
export function redeemNote(result: Pick<ApiResult<unknown>, "ok" | "status" | "code">): { text: string | null; done: boolean } {
  if (result.ok) return { text: "Invite accepted! Finish 3 matches and you both get a coat.", done: true };
  switch (result.code) {
    case "PAWLEGENDS_INVITE_SELF":
      return { text: null, done: true };
    case "PAWLEGENDS_INVITE_USED":
      return { text: "You have already accepted an invite.", done: true };
    case "PAWLEGENDS_INVITE_DEVICE":
      return { text: "This device has already accepted an invite.", done: true };
    case "PAWLEGENDS_INVITE_NOT_ELIGIBLE":
      return { text: "Invites are for new players and players back after 21 days.", done: true };
    case "PAWLEGENDS_INVITE_UNKNOWN":
      return { text: "That invite link has expired.", done: true };
    case "PAWLEGENDS_INVITE_FULL":
      return { text: "Your friend has too many open invites right now.", done: true };
  }
  // a guest session (403 without a code), a network error or a 429: keep the code and try again later
  return { text: null, done: false };
}
