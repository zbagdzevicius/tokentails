/**
 * "Move to another device" save code (GDD 13.6): base64url of the deflated JSON of the save keys.
 * Format: `BCD1z<base64url>` (deflate-raw) or `BCD1j<base64url>` (plain JSON, when CompressionStream is
 * missing). Import validates every key and only writes known keys; entitlements never move this way
 * (purchases move by "Restore purchases").
 */
import type { Store } from '../types';
import { KEY_DAYS, KEY_PREVIEW_DAYS, KEY_PROFILE, pruneDays, readDays, sanitizeDayRecord, sanitizeProfile, PREVIEW_DAYS_CAP, type DayMap } from '../platform/records';
import { KEY_PREVIEW_STREAK, KEY_STREAK, readStreak } from './streak';
import { KEY_RAPSHEET, readRapSheet } from './rapsheet';
import { KEY_SEASON, sanitizeSeasonData } from './season';
import { KEY_BEST, readBest } from './days';
import { KEY_COSMETICS, ownedCosmeticDefs, readOwned, wearOwned } from './cosmetics';
import { getEntitlements, ownsCosmetic } from '../platform/entitlements';
import { COSMETICS } from '../types';
import { KEY_GHOSTS, readGhosts } from './friends';
import { KEY_ROOMS, myRooms } from './rooms';

export const SAVE_CODE_PREFIX = 'BCD1';
export const SAVE_CODE_MAX = 1_400_000; // chars; the localStorage budget is 1 MB
/** Every save key that moves to another device (never `entitlements`: purchases move by "Restore purchases"). */
export const SAVE_KEYS = [
  KEY_PROFILE,
  KEY_DAYS,
  KEY_PREVIEW_DAYS,
  KEY_BEST,
  KEY_STREAK,
  KEY_PREVIEW_STREAK,
  KEY_RAPSHEET,
  KEY_SEASON,
  KEY_COSMETICS,
  KEY_GHOSTS,
  KEY_ROOMS,
] as const;

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hasStreams = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buf);
}

/** Inflate piece by piece and give up past `limit` bytes, so a crafted code cannot exhaust memory. */
async function inflateCapped(bytes: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

export function collectSave(store: Store): Record<string, unknown> {
  const out: Record<string, unknown> = { v: 1 };
  for (const k of SAVE_KEYS) {
    const v = store.get<unknown>(k, undefined);
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

export async function exportSaveCode(store: Store, opts: { compress?: boolean } = {}): Promise<string> {
  const json = JSON.stringify(collectSave(store));
  const bytes = new TextEncoder().encode(json);
  if (opts.compress !== false && hasStreams()) {
    try {
      return `${SAVE_CODE_PREFIX}z${toB64url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
    } catch {
      /* fall back to plain */
    }
  }
  return `${SAVE_CODE_PREFIX}j${toB64url(bytes)}`;
}

export interface ImportResult {
  ok: boolean;
  keys: string[];
  error?: 'format' | 'version' | 'too-large' | 'storage';
}

/** Decode a save code without writing (validation, preview). */
export async function decodeSaveCode(code: string): Promise<Record<string, unknown> | null> {
  const c = (code ?? '').replace(/\s+/g, '');
  if (c.length > SAVE_CODE_MAX || !c.startsWith(SAVE_CODE_PREFIX)) return null;
  const mode = c.charAt(SAVE_CODE_PREFIX.length);
  try {
    let bytes = fromB64url(c.slice(SAVE_CODE_PREFIX.length + 1));
    if (mode === 'z') {
      if (!hasStreams()) return null;
      const inflated = await inflateCapped(bytes, 4 * SAVE_CODE_MAX);
      if (!inflated) return null;
      bytes = inflated;
    } else if (mode !== 'j') return null;
    if (bytes.length > 4 * SAVE_CODE_MAX) return null;
    const data = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Replace this device's save with the code's content (only known, validated keys). Never throws. */
export async function importSaveCode(store: Store, code: string): Promise<ImportResult> {
  try {
    if ((code ?? '').length > SAVE_CODE_MAX) return { ok: false, keys: [], error: 'too-large' };
    const data = await decodeSaveCode(code);
    if (!data) return { ok: false, keys: [], error: 'format' };
    if (data.v !== 1) return { ok: false, keys: [], error: 'version' };
    // Validate through a scratch store so readers apply their sanitising.
    const scratch = scratchStore(data);
    const clean: Record<string, unknown> = {};
    if (data[KEY_PROFILE] !== undefined) {
      // A save code moves cats, never purchases: a collar or hat that is neither earned (the code's or this
      // device's season and streak items) nor owned on this device (entitlements) comes off.
      const prof = sanitizeProfile(data[KEY_PROFILE]);
      const ent = getEntitlements(store);
      const earned = [...ownedCosmeticDefs(scratch), ...ownedCosmeticDefs(store)];
      const owns = (slot: 'collar' | 'hat', id: number): boolean => earned.some((c) => c.slot === slot && c.id === id) || ownsCosmetic(ent, slot, id);
      const owned = {
        collars: COSMETICS.filter((c) => c.slot === 'collar' && owns('collar', c.id)).map((c) => c.id),
        hats: COSMETICS.filter((c) => c.slot === 'hat' && owns('hat', c.id)).map((c) => c.id),
      };
      clean[KEY_PROFILE] = { ...prof, cats: prof.cats.map((c) => wearOwned(c, owned)) };
    }
    if (data[KEY_DAYS] !== undefined) clean[KEY_DAYS] = pruneDays(readDays(scratch));
    if (data[KEY_BEST] !== undefined) clean[KEY_BEST] = readBest(scratch);
    if (data[KEY_STREAK] !== undefined) clean[KEY_STREAK] = readStreak(scratch);
    if (data[KEY_PREVIEW_STREAK] !== undefined) clean[KEY_PREVIEW_STREAK] = readStreak(scratch, undefined, KEY_PREVIEW_STREAK);
    if (data[KEY_PREVIEW_DAYS] !== undefined) clean[KEY_PREVIEW_DAYS] = previewDays(data[KEY_PREVIEW_DAYS]);
    if (data[KEY_RAPSHEET] !== undefined) clean[KEY_RAPSHEET] = readRapSheet(scratch);
    if (data[KEY_SEASON] !== undefined) {
      const s = sanitizeSeasonData(data[KEY_SEASON]);
      if (s) clean[KEY_SEASON] = s;
    }
    if (data[KEY_COSMETICS] !== undefined) clean[KEY_COSMETICS] = { owned: readOwned(scratch) };
    if (data[KEY_GHOSTS] !== undefined) clean[KEY_GHOSTS] = readGhosts(scratch);
    if (data[KEY_ROOMS] !== undefined) clean[KEY_ROOMS] = myRooms(scratch);
    const keys = Object.keys(clean);
    // A memory-only store (private mode, storage blocked) returns false from set() although it kept the value for
    // this session: that is not a failed import. Only a write that a persistent store rejects is.
    const memoryOnly = store.persistent === false;
    let ok = true;
    for (const k of keys) ok = (store.set(k, clean[k]) || memoryOnly) && ok;
    return ok ? { ok: true, keys } : { ok: false, keys, error: 'storage' };
  } catch {
    return { ok: false, keys: [], error: 'format' };
  }
}

function previewDays(raw: unknown): DayMap {
  const out: DayMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n > 0 || n < -100_000) continue;
    const r = sanitizeDayRecord(v);
    if (r) out[String(n)] = r;
  }
  return pruneDays(out, PREVIEW_DAYS_CAP);
}

function scratchStore(data: Record<string, unknown>): Store {
  return {
    persistent: false,
    get<T>(k: string, fallback: T): T {
      return (k in data ? (data[k] as T) : fallback) ?? fallback;
    },
    set() {
      return false;
    },
  };
}
