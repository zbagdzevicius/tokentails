/**
 * A hint that this browser has had a Firebase session (Task 6b review #4). The landing loads its
 * optional auth read (Firebase) only when it is set, so a first-time, signed-out visitor never
 * downloads or starts Firebase auth there. The auth provider sets it whenever Firebase reports a
 * user (anonymous included) and clears it when Firebase reports none.
 *
 * Only a hint: no uid, no token. Storage can be blocked, so every access is guarded; a missing
 * hint just means the landing shows the signed-out labels.
 */
export const SESSION_HINT_KEY = "tt-had-session";

export function hasSessionHint(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSessionHint(on: boolean): void {
  try {
    if (typeof window === "undefined") return;
    if (on) window.localStorage.setItem(SESSION_HINT_KEY, "1");
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage blocked: the landing falls back to the signed-out labels.
  }
}
