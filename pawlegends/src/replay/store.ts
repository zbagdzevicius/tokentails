/**
 * Match history and saved replays (MATCH-MOMENTS.md §1): the last HISTORY_MAX matches as summary rows, and the replay
 * records of the last REPLAY_MAX matches (solo, party and PvP: every listed match keeps its replay while the device has
 * room). Stored on this device (localStorage). Display only: nothing here is ever posted, and no match counter is
 * derived from it (match-derived counters are written only inside the server's /live save).
 *
 * Founder, Nov 18 ("in recordings I can see only past match recording"): only the newest 5 solo matches kept a
 * replay, party and PvP matches kept none, and a replay plays only on the sim version it was made with (the sim
 * changes about daily). Now every match keeps one, and when the device is full the replays an update already retired
 * (another sim version) give way first.
 */
import type { PartyReplayRecord, PvpReplayRecord, ReplayRecord } from '../sim/api';
import { SIM_VERSION } from '../sim/version';
import { DETECTOR_V } from './highlights/version';
import type { HighlightReel } from './highlights/rules';

export const HISTORY_KEY = 'tt.pawlegends.history.v1';
export const REPLAYS_KEY = 'tt.pawlegends.replays.v1';
export const HISTORY_MAX = 20;
export const REPLAY_MAX = 20;

/** A kept replay: solo (v1), party (v2) or PvP (v3). */
export type StoredReplay = ReplayRecord | PartyReplayRecord | PvpReplayRecord;

/** 'coop' (Nov 19): a matchmade Co-op match vs bots (rows saved before say 'party'). */
export type HistoryMode = 'skirmish' | 'classic' | 'blitz' | 'party' | 'coop' | 'pvp' | 'practice';

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
  /** A replay record is kept for this match (the newest REPLAY_MAX matches, while the device has room). */
  replay: boolean;
  /** Rows saved before Nov 18 2026: 'party' = a party or PvP match, which kept no replay then. */
  noReplay?: 'party' | null;
  /** The player's seat in the match (party and PvP; absent = slot 0). The replay is watched from it. */
  slot?: number;
  /** HIGHLIGHTS.md: the match's highlight reel (cached; recomputed when the detector or the record changes). */
  highlights?: HighlightReel | null;
  /** gaps5 polish 3: ticks of the player's emotes (the detector's optional sidecar; solo matches with a replay). */
  emotes?: number[];
  /** MATCH-HISTORY.md: `finalHash:ticks`, the key the account's history row carries (its replay is found by it). */
  key?: string;
  /** Sim v34: the 3v3 pool map the match played (omitted on the Crossing and on rows saved before Nov 17 2026). */
  map?: string;
  /**
   * Nov 19 2026 (Profile → Matches rows): the stats line of the account's row, kept on the device too, so a guest's
   * row shows it. Omitted when 0 and on rows saved before. The mutator other than 'none' names an Arcade match.
   */
  mutator?: string;
  lv?: number;
  cs?: number;
  fish?: number;
  dmg?: number;
  dmgTop?: number;
  kp?: number;
  score?: [number, number];
  toys?: number;
  /**
   * Founder, Nov 19 ("I can't see stats of last match"): both teams' scoreboard from the match's own result, so the
   * match's full detail shows at once, before (or without) the account's row. Rows saved before Nov 19 have none.
   */
  board?: LocalBoard;
  /** The account save of this match (the host's `save-result` for `save.id`), shown on the row until the account lists it. */
  save?: RowSave;
}

/** The device row's stats line from the match's own per-slot stats (the account row's rule, history.model.ts
 * `rowStats`): a 0 is left out. Pure. */
export function statsLine(
  stats: readonly { slot: number; kills: number; assists: number; heroDamage: number; level: number; fish: number; toys: number; lastHits: number }[],
  slot: number,
  teamKills: readonly [number, number],
): Partial<Pick<HistoryEntry, 'lv' | 'cs' | 'fish' | 'dmg' | 'dmgTop' | 'kp' | 'score' | 'toys'>> {
  const me = stats.find((s) => s.slot === slot);
  if (!me) return {};
  const n = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const out: Partial<Pick<HistoryEntry, 'lv' | 'cs' | 'fish' | 'dmg' | 'dmgTop' | 'kp' | 'score' | 'toys'>> = {};
  if (n(me.level)) out.lv = n(me.level);
  if (n(me.lastHits)) out.cs = n(me.lastHits);
  if (n(me.fish)) out.fish = n(me.fish);
  if (n(me.heroDamage)) {
    out.dmg = n(me.heroDamage);
    out.dmgTop = Math.max(out.dmg, ...stats.map((s) => n(s.heroDamage)));
  }
  const [ours, theirs] = [n(teamKills[0]), n(teamKills[1])];
  if (ours) out.kp = Math.min(100, Math.round((100 * (n(me.kills) + n(me.assists))) / ours));
  if (ours + theirs) out.score = [ours, theirs];
  if (n(me.toys)) out.toys = Math.min(4, n(me.toys));
  return out;
}

/**
 * Where a match's account save stands: `saving` (posted), `saved`, `queued` (kept on the device: signed out or
 * offline), `failed` (the server failed; retried), `rejected` (refused; `code` says why), `off` (never posted: `why`).
 */
export type SaveState = 'saving' | 'saved' | 'queued' | 'failed' | 'rejected' | 'off';
export interface RowSave {
  /** The host's match id (a solo save) or the party room (a party or PvP save). */
  id?: string;
  st: SaveState;
  code?: string;
  /** `off`: 'practice' (never saved), 'device' (no account host), or the relay's unscored reason. */
  why?: string;
}

/** One seat of a kept scoreboard (the account's history row keeps the same numbers). */
export interface LocalPlayer {
  s: number;
  t: 0 | 1;
  h: string;
  /** The display name (a party name or yours), else null: the champion's name is shown. */
  n: string | null;
  bot: boolean;
  lv: number;
  k: number;
  d: number;
  a: number;
  hd: number;
  dt: number;
  td: number;
  hs: number;
  f: number;
  ty: number;
  cs: number;
  g: string | null;
}
export interface LocalBoard {
  winner: 0 | 1 | -1;
  reason: string | null;
  mvp: number | null;
  svp: number | null;
  mutator?: string;
  players: LocalPlayer[];
}

/** Most emote ticks a row keeps. */
export const EMOTES_MAX = 60;

/** The emote sidecar a row may keep: whole non-negative ticks, sorted, at most EMOTES_MAX (else undefined). Pure. */
export function cleanEmotes(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((t): t is number => typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < 1e7).slice(0, EMOTES_MAX);
  return out.length ? out.sort((a, b) => a - b) : undefined;
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
export function loadReplays(s: KVStore | null = store()): Record<string, StoredReplay> {
  const v = read<unknown>(s, REPLAYS_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, StoredReplay>) : {};
}

/**
 * The record to keep for a match. Founder, Nov 19 (Watch said "Replay not available"): a party, co-op or PvP match's
 * MatchEnd carries a display stub (`inputs: ''`, `party: {room, slot, record}`), and that stub was stored, so the viewer
 * refused every Quick Play, party and PvP replay ("Party match replays are not available yet"). The real record is `party.record`
 * (PartyReplayRecord or PvpReplayRecord), null when the relay sent none. Rows saved Nov 18-19 are read the same way. Pure.
 */
export function keptRecord(r: unknown): StoredReplay | null {
  const x = r as { party?: { record?: unknown } | null } | null;
  if (x && typeof x === 'object' && x.party !== undefined && x.party !== null && typeof x.party === 'object') {
    const inner = x.party.record;
    return isStoredReplay(inner) && (inner as { party?: unknown }).party === undefined ? inner : null;
  }
  return isStoredReplay(r) ? r : null;
}

/** A stored record that can be read: a seed, and one stream (solo) or one per human seat (party, PvP). Pure. */
export function isStoredReplay(r: unknown): r is StoredReplay {
  const x = r as { inputs?: unknown; seed?: unknown; humans?: unknown } | null;
  if (!x || typeof x.seed !== 'number') return false;
  if (typeof x.inputs === 'string') return true;
  return Array.isArray(x.inputs) && Array.isArray(x.humans) && x.inputs.length === x.humans.length && x.inputs.every((i) => typeof i === 'string');
}

export function replayOf(id: string, s: KVStore | null = store()): StoredReplay | null {
  return keptRecord(loadReplays(s)[id]);
}

/** Can this device play the row's replay: 'watch', 'older' (another game version), or 'none' (none kept). */
export function replayState(row: Pick<HistoryEntry, 'id' | 'replay'>, s: KVStore | null = store(), simVersion = SIM_VERSION): 'watch' | 'older' | 'none' {
  if (!row.replay) return 'none';
  const r = replayOf(row.id, s);
  if (!r) return 'none';
  return r.simVersion === simVersion ? 'watch' : 'older';
}

/** A host `save-result` for match `id`: the row that posted it takes the status. Returns the row when it changed. */
export function noteSave(id: string, st: SaveState, code: string | null = null, s: KVStore | null = store()): HistoryEntry | null {
  const rows = loadHistory(s);
  const row = rows.find((r) => r.save?.id === id);
  if (!row || !row.save) return null;
  // a later "saving" never takes back a final answer
  if (st === 'saving' && row.save.st !== 'saving') return null;
  if (row.save.st === st && (row.save.code ?? null) === code) return null;
  row.save = { id, st, ...(code ? { code } : {}) };
  write(s, HISTORY_KEY, rows);
  return row;
}

/** The solo record of a row (the highlights strip, the Legend Moment clip), or null for a party or PvP one. Pure. */
export const soloRecord = (r: StoredReplay | null): ReplayRecord | null => (r && typeof r.inputs === 'string' ? (r as ReplayRecord) : null);

let counter = 0;
export const newEntryId = (now: number): string => `${now.toString(36)}-${(counter++ % 1296).toString(36)}`;

/**
 * Add a match: the row goes first (HISTORY_MAX kept); its record is kept and the oldest past REPLAY_MAX dropped.
 * When storage is full the replays give way first (those of another sim version, which cannot play here, then the
 * oldest), then the row is saved without one. Returns the saved row.
 */
export function recordMoment(entry: Omit<HistoryEntry, 'replay'>, record: StoredReplay | null, s: KVStore | null = store(), simVersion = SIM_VERSION): HistoryEntry {
  const rows = loadHistory(s);
  const replays = loadReplays(s);
  let kept = false;
  const rec = keptRecord(record);
  if (rec && !entry.noReplay) {
    replays[entry.id] = rec;
    kept = true;
  }
  const emotes = kept ? cleanEmotes(entry.emotes) : undefined;
  const { emotes: _drop, ...rest } = entry;
  const row: HistoryEntry = { ...rest, replay: kept, ...(emotes ? { emotes } : {}) };
  const next = [row, ...rows.filter((r) => r.id !== row.id)].slice(0, HISTORY_MAX);
  // newest REPLAY_MAX replays only, and only of rows still listed
  const order = next.filter((r) => replays[r.id]).map((r) => r.id);
  const keep = new Set(order.slice(0, REPLAY_MAX));
  for (const id of Object.keys(replays)) if (!keep.has(id)) delete replays[id];
  for (const r of next) r.replay = keep.has(r.id);
  // full storage: drop replays one by one until the write fits, those of another sim version first, then the oldest
  // (never the new one while another can go)
  const listed = order.slice(0, REPLAY_MAX).filter((id) => id !== row.id).reverse();
  const ver = (id: string): number | undefined => keptRecord(replays[id])?.simVersion;
  const victims = [...listed.filter((id) => ver(id) !== simVersion), ...listed.filter((id) => ver(id) === simVersion), ...(replays[row.id] ? [row.id] : [])];
  while (!write(s, REPLAYS_KEY, replays) && victims.length > 0) {
    const id = victims.shift()!;
    delete replays[id];
    const r = next.find((x) => x.id === id);
    if (r) r.replay = false;
  }
  write(s, HISTORY_KEY, next);
  return next[0];
}

/** The record key a reel belongs to (`seed:finalHash:ticks`). Pure. */
export const recordKey = (r: Pick<ReplayRecord, 'seed' | 'finalHash' | 'ticks'>): string => `${r.seed}:${r.finalHash}:${r.ticks}`;

/** A cached reel that still holds: this detector version, this record. Pure. */
export function reelValid(reel: HighlightReel | null | undefined, record: Pick<ReplayRecord, 'seed' | 'finalHash' | 'ticks'> | null): reel is HighlightReel {
  return !!reel && !!record && reel.v === 1 && reel.detector === DETECTOR_V && reel.key === recordKey(record) && Array.isArray(reel.list);
}

/** The row's cached reel when it is still valid, else null (recompute). */
export function reelOf(id: string, s: KVStore | null = store()): HighlightReel | null {
  const row = loadHistory(s).find((r) => r.id === id);
  const record = replayOf(id, s);
  return row && reelValid(row.highlights, record) ? row.highlights : null;
}

/** Cache a reel on its row (written after the row; a full storage only means it is computed again). */
export function saveReel(id: string, reel: HighlightReel, s: KVStore | null = store()): boolean {
  const rows = loadHistory(s);
  const row = rows.find((r) => r.id === id);
  if (!row) return false;
  row.highlights = reel;
  return write(s, HISTORY_KEY, rows);
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

export const MODE_LABEL: Readonly<Record<HistoryMode, string>> = Object.freeze({ skirmish: 'Skirmish 3v3', classic: 'Classic 5v5', blitz: 'Blitz', party: 'Party', coop: 'Co-op', pvp: 'PvP', practice: 'Practice' });
