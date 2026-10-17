/**
 * On-device store for the face decal and the clip opener (IndexedDB `bcd-photo`, GDD 6.1 step 5).
 * Every IndexedDB access is wrapped; any failure (private mode, in-app webviews, quota, no IndexedDB in Node)
 * falls back to an in-memory map for this session. Never throws, never hangs: the open and every request race a
 * 1.5 s timeout (WebKit has shipped `indexedDB.open` calls that fire no event at all), and reading the
 * `indexedDB` getter itself is guarded (it throws a SecurityError in sandboxed frames and with site data blocked).
 */
import type { FaceDecal } from '../types';

export interface StoredCat {
  face?: FaceDecal;
  opener?: { media: Blob; kind: 'photo' | 'video' };
}

export interface PhotoStore {
  put(catIndex: number, rec: StoredCat): Promise<void>;
  get(catIndex: number): Promise<StoredCat | null>;
  remove(catIndex: number): Promise<void>;
  /** Moves a slot's record to another slot (the target is replaced; an empty source clears the target). */
  move(from: number, to: number): Promise<void>;
  /** false once the store has fallen back to memory. */
  readonly persistent: boolean;
}

export const DB_NAME = 'bcd-photo';
/** Cat slots 0..MAX_CAT_SLOTS-1 (free: slot 0 only, Club: up to 5, GDD 9.2 / 13.6). */
export const MAX_CAT_SLOTS = 5;

/** Pure: a valid slot index, or -1. */
export function slotKey(catIndex: number): number {
  return Number.isInteger(catIndex) && catIndex >= 0 && catIndex < MAX_CAT_SLOTS ? catIndex : -1;
}
const STORE = 'cats';

type IdbLike = Pick<IDBFactory, 'open'>;

/** Longest wait for an IndexedDB open or request before the store falls back to memory. */
export const IDB_TIMEOUT_MS = 1500;

function defaultIdb(): IdbLike | undefined {
  try {
    return (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}

/** Resolve with `p`, or reject after `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('indexeddb timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function createPhotoStore(idbArg?: IdbLike, timeoutMs = IDB_TIMEOUT_MS): PhotoStore {
  const idb = arguments.length > 0 ? idbArg : defaultIdb();
  const mem = new Map<number, StoredCat>();
  let persistent = !!idb;
  let dbp: Promise<IDBDatabase | null> | null = null;

  const fail = (): null => {
    persistent = false;
    return null;
  };

  const db = (): Promise<IDBDatabase | null> => {
    if (!persistent || !idb) return Promise.resolve(null);
    if (!dbp) {
      const open = new Promise<IDBDatabase | null>((resolve) => {
        try {
          const req = idb.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            try {
              if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
            } catch {
              /* handled by onerror */
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(fail());
          req.onblocked = () => resolve(fail());
        } catch {
          resolve(fail());
        }
      });
      dbp = withTimeout(open, timeoutMs).catch(() => fail());
    }
    return dbp;
  };

  const tx = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | null): Promise<T | undefined> =>
    db().then((d) =>
      withTimeout(
        new Promise<T | undefined>((resolve, reject) => {
          if (!d) return reject(new Error('no db'));
          try {
            const t = d.transaction(STORE, mode);
            const r = fn(t.objectStore(STORE));
            t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error);
          } catch (e) {
            reject(e);
          }
        }),
        timeoutMs,
      ),
    );

  return {
    get persistent() {
      return persistent;
    },
    async put(catIndex, rec) {
      if (slotKey(catIndex) < 0) return;
      mem.set(catIndex, rec);
      try {
        await tx('readwrite', (s) => s.put(rec, catIndex));
      } catch {
        fail();
      }
    },
    async get(catIndex) {
      if (slotKey(catIndex) < 0) return null;
      if (mem.has(catIndex)) return mem.get(catIndex) ?? null;
      try {
        const r = await tx<StoredCat>('readonly', (s) => s.get(catIndex));
        if (r && typeof r === 'object') {
          mem.set(catIndex, r);
          return r;
        }
        return null;
      } catch {
        fail();
        return null;
      }
    },
    async remove(catIndex) {
      if (slotKey(catIndex) < 0) return;
      mem.delete(catIndex);
      try {
        await tx('readwrite', (s) => s.delete(catIndex));
      } catch {
        fail();
      }
    },
    async move(from, to) {
      if (from === to || slotKey(from) < 0 || slotKey(to) < 0) return;
      const rec = await this.get(from);
      if (rec) await this.put(to, rec);
      else await this.remove(to);
      await this.remove(from);
    },
  };
}

let shared: PhotoStore | null = null;
/** Lazily created app-wide store (no IndexedDB handle at module top level). */
export function photoStore(): PhotoStore {
  if (!shared) shared = createPhotoStore();
  return shared;
}
