/**
 * Match history and saved replays (MATCH-MOMENTS.md §1): the last HISTORY_MAX matches as summary rows, and the replay
 * records of the last REPLAY_MAX solo matches. Stored on this device (localStorage); when the cloud progress blob
 * lands (gap P2) the rows move into it. Display only: nothing here is ever posted, and no match counter is derived
 * from it (match-derived counters are written only inside the server's /live save).
 */
import type { ReplayRecord } from '../sim/api';

export const HISTORY_KEY = 'tt.pawlegends.history.v1';
export const REPLAYS_KEY = 'tt.pawlegends.replays.v1';
export const HISTORY_MAX = 20;
export const REPLAY_MAX = 5;

export type HistoryMode = 'skirmish' | 'classic' | 'blitz' | 'party' | 'pvp' | 'practice';

export interface HistoryEntry {
  /** Unique per match on this device. */
  id: string;
  /** When the match ended (ms since epoch). */
  at: number;
  hero: string;
  /** The champion's display name that match (a worn card's cat name), or null. */
  heroName?: string | null;
  mode: HistoryMode;
  difficulty: string;
  outcome: 'won' | 'lost' | 'draw';
  /** S / A / B / C, or null (a forfeit, an unscored match). */
  grade: string | null;
  k: number;
  d: number;
  a: number;
  seconds: number;
  /** The best moment's title ("Triple Pounce"), or null. */
  best?: string | null;
  simVersion: number;
  /** A replay record is kept for this match (the newest REPLAY_MAX solo matches). */
  replay: boolean;
  /** The reason a match has no replay ('party': party matches; else none kept). */
  noReplay?: 'party' | null;
}

export interface KVStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const store = (): KVStore | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const read = <T>(s: KVStore | null, key: string, fallback: T): T => {
  try {
    const raw = s?.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
};

const write = (s: KVStore | null, key: string, v: unknown): boolean => {
  try {
    s?.setItem(key, JSON.stringify(v));
    return !!s;
  } catch {
    return false;
  }
};

const isEntry = (e: unknown): e is HistoryEntry => {
  const x = e as Partial<HistoryEntry> | null;
  return !!x && typeof x.id === 'string' && typeof x.hero === 'string' && typeof x.at === 'number' && typeof x.k === 'number';
};

/** The saved rows, newest first (bad rows are dropped). */
export function loadHistory(s: KVStore | null = store()): HistoryEntry[] {
  const v = read<unknown>(s, HISTORY_KEY, []);
  return Array.isArray(v) ? v.filter(isEntry).slice(0, HISTORY_MAX) : [];
}

/** The saved replay records by entry id. */
export function loadReplays(s: KVStore | null = store()): Record<string, ReplayRecord> {
  const v = read<unknown>(s, REPLAYS_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, ReplayRecord>) : {};
}

export function replayOf(id: string, s: KVStore | null = store()): ReplayRecord | null {
  const r = loadReplays(s)[id];
  return r && typeof r.inputs === 'string' && typeof r.seed === 'number' ? r : null;
}

let counter = 0;
export const newEntryId = (now: number): string => `${now.toString(36)}-${(counter++ % 1296).toString(36)}`;

/**
 * Add a match: the row goes first (HISTORY_MAX kept); a solo record is kept and the oldest past REPLAY_MAX dropped.
 * When storage is full the replays give way first (oldest out), then the row is saved without one. Returns the
 * saved row.
 */
export function recordMoment(entry: Omit<HistoryEntry, 'replay'>, record: ReplayRecord | null, s: KVStore | null = store()): HistoryEntry {
  const rows = loadHistory(s);
  const replays = loadReplays(s);
  let kept = false;
  if (record && !entry.noReplay) {
    replays[entry.id] = record;
    kept = true;
  }
  const row: HistoryEntry = { ...entry, replay: kept };
  const next = [row, ...rows.filter((r) => r.id !== row.id)].slice(0, HISTORY_MAX);
  // newest REPLAY_MAX replays only, and only of rows still listed
  const order = next.filter((r) => replays[r.id]).map((r) => r.id);
  const keep = new Set(order.slice(0, REPLAY_MAX));
  for (const id of Object.keys(replays)) if (!keep.has(id)) delete replays[id];
  for (const r of next) r.replay = keep.has(r.id);
  // full storage: drop the oldest replays one by one until the write fits
  let ids = order.slice(0, REPLAY_MAX);
  while (!write(s, REPLAYS_KEY, replays) && ids.length > 0) {
    const oldest = ids[ids.length - 1];
    delete replays[oldest];
    ids = ids.slice(0, -1);
    const r = next.find((x) => x.id === oldest);
    if (r) r.replay = false;
  }
  write(s, HISTORY_KEY, next);
  return next[0];
}

/** "2:05". */
export const clock = (seconds: number): string => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;

/** "5 min ago", "Yesterday", "Nov 12". Pure. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'Yesterday';
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const MODE_LABEL: Readonly<Record<HistoryMode, string>> = Object.freeze({ skirmish: 'Skirmish 3v3', classic: 'Classic 5v5', blitz: 'Blitz', party: 'Party', pvp: 'PvP', practice: 'Practice' });
