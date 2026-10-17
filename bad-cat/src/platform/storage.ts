/**
 * Save data store (GDD 13.6): localStorage under `bcd:v1:`, every access in try/catch.
 * When storage is blocked (private mode, sandboxed iframe, quota) the store keeps working in memory and
 * reports `persistent: false` so the UI can say "this browser only". Never throws.
 */
import type { Store } from '../types';

export const STORE_PREFIX = 'bcd:v1:';

/** Minimal Storage shape (lets tests inject a throwing or fake backend). */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  readonly length?: number;
  key?(i: number): string | null;
}

export interface MemoryStore extends Store {
  /** Remove one key (memory and backend). Never throws. */
  remove(k: string): void;
  /** Keys (without prefix) currently known, from the backend when readable plus memory. */
  keys(): string[];
}

function resolveBackend(): StorageLike | null {
  try {
    const g = globalThis as { localStorage?: StorageLike };
    const ls = g.localStorage; // the getter itself may throw (Safari with cookies blocked)
    if (!ls) return null;
    const probe = `${STORE_PREFIX}__probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/**
 * Create the store. `backend` overrides `localStorage` (tests); pass `null` to force memory only.
 */
export function createStore(prefix = STORE_PREFIX, backend?: StorageLike | null): MemoryStore {
  let ls: StorageLike | null;
  if (backend === undefined) ls = resolveBackend();
  else if (backend === null) ls = null;
  else {
    try {
      const probe = `${prefix}__probe`;
      backend.setItem(probe, '1');
      backend.removeItem(probe);
      ls = backend;
    } catch {
      ls = null;
    }
  }
  const mem = new Map<string, string>();
  let persistent = ls !== null;

  const store: MemoryStore = {
    get persistent() {
      return persistent;
    },
    get<T>(k: string, fallback: T): T {
      let raw: string | null | undefined = mem.get(k);
      if (raw === undefined && ls) {
        try {
          raw = ls.getItem(prefix + k);
        } catch {
          raw = null;
        }
        if (raw !== null && raw !== undefined) mem.set(k, raw);
      }
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    set<T>(k: string, v: T): boolean {
      let raw: string;
      try {
        raw = JSON.stringify(v);
      } catch {
        return false;
      }
      if (raw === undefined) return false;
      mem.set(k, raw);
      if (!ls) return false;
      try {
        ls.setItem(prefix + k, raw);
        return true;
      } catch {
        // Quota or blocked mid-session: keep playing from memory, flag as browser-only.
        persistent = false;
        return false;
      }
    },
    remove(k: string): void {
      mem.delete(k);
      if (!ls) return;
      try {
        ls.removeItem(prefix + k);
      } catch {
        /* ignore */
      }
    },
    keys(): string[] {
      const out = new Set(mem.keys());
      if (ls && typeof ls.key === 'function') {
        try {
          const n = ls.length ?? 0;
          for (let i = 0; i < n; i++) {
            const key = ls.key(i);
            if (key && key.startsWith(prefix) && !key.endsWith('__probe')) out.add(key.slice(prefix.length));
          }
        } catch {
          /* ignore */
        }
      }
      return [...out];
    },
  };
  return store;
}
