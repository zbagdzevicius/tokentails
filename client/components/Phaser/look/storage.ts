/**
 * localStorage with an in-memory fallback, for the look settings (plan G7 "Render tiers": the
 * graphics setting and reduced motion must work without storage).
 *
 * Every access is wrapped in try/catch: storage throws in private windows, with blocked site
 * data, in previews and in thumbnails. A value written while storage refuses is kept in memory
 * for the rest of the page's life, so a setting changed in such a window still applies to the
 * next game mount in that tab.
 *
 * Pure module: no Phaser import (Jest, SSR).
 */

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Values kept for this page when storage is unavailable; `null` is an explicit "cleared". */
const memory = new Map<string, string | null>();

export const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** The stored value: storage first, then this page's memory; `null` when neither has one. */
export function readSetting(key: string, storage: StorageLike | null = defaultStorage()): string | null {
  try {
    if (storage) {
      const value = storage.getItem(key);
      if (value !== null) return value;
    }
  } catch {
    // Fall through to memory.
  }
  return memory.has(key) ? memory.get(key) ?? null : null;
}

/**
 * Saves (or with `null` clears) a value. Always kept in memory; returns true when storage took
 * it too, false when only memory has it.
 */
export function writeSetting(
  key: string,
  value: string | null,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  memory.set(key, value);
  try {
    if (!storage) return false;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Tests only: forget the in-memory values. */
export function resetMemorySettings(): void {
  memory.clear();
}
