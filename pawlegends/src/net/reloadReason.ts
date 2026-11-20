/**
 * Why this page loaded (docs/plans/moba/M1A-IMPL.md §4.3, founder 2026-11-20: a reload by our own update is never an
 * early leave). Whoever reloads the app for an update marks it first: the game's web update (app.ts `updates.reload`)
 * and the native shell's OTA apply (pawlegends-app/src/shell/ota.ts, the same key in the same localStorage). The game
 * takes the mark once at boot; for a while after, the relay hello says `hint.reload: 'update'`, so a seat lost to that
 * reload counts as a drop.
 */

/** Shared with pawlegends-app/src/shell/ota.ts (`KEYS.updateReload`): keep equal. */
export const UPDATE_RELOAD_KEY = 'pl.reload.update';
/** A mark older than this at boot is not this boot's (a reload that never happened, an app killed meanwhile). */
const MARK_FRESH_MS = 2 * 60_000;
/** How long after such a boot the hello still says so (the relay keeps the same 10 minutes). */
export const UPDATE_RELOAD_HELLO_MS = 10 * 60_000;

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const local = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

let bootedByUpdateAt = 0;

/** Mark the reload about to happen as our own update's. */
export function markUpdateReload(now = Date.now(), kv: KV | null = local()): void {
  try {
    kv?.setItem(UPDATE_RELOAD_KEY, String(now));
  } catch {
    /* storage blocked: the reload is then an ordinary one */
  }
}

/** At boot: take the mark (once). True when this page was loaded by our own update. */
export function takeUpdateReload(now = Date.now(), kv: KV | null = local()): boolean {
  let at = 0;
  try {
    at = Number(kv?.getItem(UPDATE_RELOAD_KEY) ?? 0) || 0;
    kv?.removeItem(UPDATE_RELOAD_KEY);
  } catch {
    return false;
  }
  if (at <= 0 || now - at > MARK_FRESH_MS || at > now + 5000) return false;
  bootedByUpdateAt = now;
  return true;
}

/** This page was loaded by our own update a short while ago (the relay hello's `hint.reload`). */
export function updateReloaded(now = Date.now()): boolean {
  return bootedByUpdateAt > 0 && now - bootedByUpdateAt < UPDATE_RELOAD_HELLO_MS;
}

/** Tests only. */
export function resetUpdateReload(): void {
  bootedByUpdateAt = 0;
}
