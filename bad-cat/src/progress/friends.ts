/**
 * Friends board (GDD 6.3, 13.6 key `ghosts`): dare ghosts received in links, stored locally, at most 50
 * overall (oldest dropped). One entry per friend per room (same cat code and name: the better score
 * stays); the same ghost twice is stored once. Hidden ghosts ("hide this one") never come back.
 */
import type { FriendGhost, Store } from '../types';

export const KEY_GHOSTS = 'ghosts';
export const FRIENDS_CAP = 50;
export const HIDDEN_CAP = 200;
export const GHOST_MAX_CHARS = 4000;

interface GhostStore {
  list: FriendGhost[];
  hidden: string[];
}

/** Short stable hash of a ghost payload (FNV-1a 32, base36) for the hide list. */
export function ghostHash(ghost: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ghost.length; i++) {
    h ^= ghost.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
const hideKey = (roomId: string, ghost: string) => `${roomId}|${ghostHash(ghost)}`;

export function sanitizeFriend(raw: unknown): FriendGhost | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.roomId !== 'string' || !g.roomId || g.roomId.length > 64) return null;
  if (typeof g.ghost !== 'string' || !g.ghost || g.ghost.length > GHOST_MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(g.ghost)) return null;
  const score = typeof g.score === 'number' && Number.isFinite(g.score) && g.score >= 0 ? Math.floor(g.score) : 0;
  return {
    roomId: g.roomId,
    ghost: g.ghost,
    catCode: typeof g.catCode === 'string' && g.catCode.length <= 32 && /^[A-Za-z0-9_-]*$/.test(g.catCode) ? g.catCode : '',
    name: typeof g.name === 'string' ? g.name.replace(/[\u0000-\u001f]/g, '').slice(0, 12) : '',
    score,
    at: typeof g.at === 'number' && Number.isFinite(g.at) && g.at > 0 ? g.at : 0,
    simVersion: typeof g.simVersion === 'number' && Number.isInteger(g.simVersion) && g.simVersion > 0 && g.simVersion < 256 ? g.simVersion : 0,
  };
}

export function readGhosts(store: Store): GhostStore {
  try {
    const raw = store.get<Partial<GhostStore> | null>(KEY_GHOSTS, null);
    const list = raw && Array.isArray(raw.list) ? (raw.list.map(sanitizeFriend).filter(Boolean) as FriendGhost[]) : [];
    const hidden = raw && Array.isArray(raw.hidden) ? raw.hidden.filter((h): h is string => typeof h === 'string' && h.length <= 80).slice(-HIDDEN_CAP) : [];
    return { list: list.slice(-FRIENDS_CAP * 2), hidden };
  } catch {
    return { list: [], hidden: [] };
  }
}

/** The board for one room, best score first. */
export function friends(store: Store, roomId: string): FriendGhost[] {
  const { list, hidden } = readGhosts(store);
  const hid = new Set(hidden);
  return list.filter((g) => g.roomId === roomId && !hid.has(hideKey(g.roomId, g.ghost))).sort((a, b) => b.score - a.score || b.at - a.at);
}

export function saveFriend(store: Store, raw: FriendGhost): void {
  try {
    const g = sanitizeFriend(raw);
    if (!g) return;
    if (!g.at) g.at = Date.now();
    const data = readGhosts(store);
    if (data.hidden.includes(hideKey(g.roomId, g.ghost))) return;
    const same = (x: FriendGhost) => x.roomId === g.roomId && (x.ghost === g.ghost || (!!g.catCode && x.catCode === g.catCode && x.name === g.name));
    const prev = data.list.find(same);
    if (prev && prev.score > g.score) return; // keep the better run of this friend
    let list = data.list.filter((x) => !same(x));
    list.push(g);
    if (list.length > FRIENDS_CAP) list = list.sort((a, b) => a.at - b.at).slice(list.length - FRIENDS_CAP);
    store.set(KEY_GHOSTS, { list, hidden: data.hidden });
  } catch {
    /* never throws */
  }
}

export function hideFriend(store: Store, roomId: string, ghost: string): void {
  try {
    const data = readGhosts(store);
    const key = hideKey(roomId, ghost);
    const hidden = [...data.hidden.filter((h) => h !== key), key].slice(-HIDDEN_CAP);
    store.set(KEY_GHOSTS, { list: data.list.filter((g) => !(g.roomId === roomId && g.ghost === ghost)), hidden });
  } catch {
    /* never throws */
  }
}
