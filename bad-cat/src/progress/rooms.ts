/**
 * My rooms (GDD 6.4, 13.6 key `rooms`): rooms made in the Room Maker on this device, newest first, max 30
 * (the oldest drops). Saving the same payload again updates it (title, cleared flag, build time).
 */
import type { MyRoom, Store } from '../types';

export const KEY_ROOMS = 'rooms';
export const MY_ROOMS_CAP = 30;
const CODE_RE = /^[A-Za-z0-9_-]{1,2000}$/;

export function sanitizeMyRoom(raw: unknown): MyRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== 'string' || !CODE_RE.test(r.code)) return null;
  const txt = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, n) : '');
  const out: MyRoom = {
    code: r.code,
    title: txt(r.title, 24),
    author: txt(r.author, 12),
    cleared: r.cleared === true,
    at: typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0 ? r.at : 0,
  };
  if (Array.isArray(r.ancestors)) {
    const a = r.ancestors.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(x)).slice(0, 3);
    if (a.length) out.ancestors = a;
  }
  if (typeof r.buildMs === 'number' && Number.isFinite(r.buildMs) && r.buildMs >= 0) out.buildMs = Math.floor(r.buildMs);
  const clear = sanitizeClear(r.clear);
  if (clear) out.clear = clear;
  if (typeof r.feedId === 'string' && /^[A-Za-z0-9]{8}$/.test(r.feedId)) out.feedId = r.feedId;
  if (r.inFeed === true) out.inFeed = true;
  return out;
}

/** Most ticks of a clear run (a boss room, the cuddle and the sim's slack). */
const CLEAR_MAX_TICKS = 2777;

/** Phase 2: the maker's clear run as input runs `[dir 0..8, speed 0..2, buttons 0..7, count]`, or null. */
export function sanitizeClear(raw: unknown): [number, number, number, number][] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > CLEAR_MAX_TICKS) return null;
  let total = 0;
  const out: [number, number, number, number][] = [];
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 4 || !r.every((n) => Number.isInteger(n))) return null;
    const [dir, speed, buttons, count] = r as number[];
    if (dir < 0 || dir > 8 || speed < 0 || speed > 2 || buttons < 0 || buttons > 7 || count < 1) return null;
    total += count;
    if (total > CLEAR_MAX_TICKS) return null;
    out.push([dir, speed, buttons, count]);
  }
  return out;
}

/** Phase 2: remember the server id of a published room (and whether it went to the feed). */
export function markMyRoomFeed(store: Store, code: string, feedId: string, inFeed: boolean): void {
  try {
    const list = myRooms(store).map((x) => (x.code === code ? { ...x, feedId, inFeed: inFeed || !!x.inFeed } : x));
    store.set(KEY_ROOMS, list);
  } catch {
    /* never throws */
  }
}

export function myRooms(store: Store): MyRoom[] {
  try {
    const raw = store.get<unknown>(KEY_ROOMS, []);
    const list = Array.isArray(raw) ? (raw.map(sanitizeMyRoom).filter(Boolean) as MyRoom[]) : [];
    return list.sort((a, b) => b.at - a.at).slice(0, MY_ROOMS_CAP);
  } catch {
    return [];
  }
}

export function saveMyRoom(store: Store, raw: MyRoom): void {
  try {
    const r = sanitizeMyRoom(raw);
    if (!r) return;
    if (!r.at) r.at = Date.now();
    const prev = myRooms(store).find((x) => x.code === r.code);
    if (prev) {
      r.cleared = r.cleared || prev.cleared; // a cleared room stays cleared
      if (!r.clear && prev.clear) r.clear = prev.clear;
      if (!r.feedId && prev.feedId) r.feedId = prev.feedId;
      if (prev.inFeed) r.inFeed = true;
    }
    const list = [r, ...myRooms(store).filter((x) => x.code !== r.code)].slice(0, MY_ROOMS_CAP);
    store.set(KEY_ROOMS, list);
  } catch {
    /* never throws */
  }
}

export function removeMyRoom(store: Store, code: string): void {
  try {
    store.set(KEY_ROOMS, myRooms(store).filter((x) => x.code !== code));
  } catch {
    /* never throws */
  }
}
