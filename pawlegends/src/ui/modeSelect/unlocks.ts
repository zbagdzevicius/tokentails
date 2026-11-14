/**
 * Mode unlocking (docs/plans/moba/MODE-UNLOCKS.md, founder ask Nov 14): never more than 3 big mode tiles for any
 * player. Skirmish and Classic are always big; the third ("spotlight") is a live event, a mode the player just
 * unlocked, the last mode they chose, the Weekly Twist or Practice. Every other mode is a small icon in the "More
 * modes" strip, locked (grey, padlock, progress) until the player's finished matches and wins reach its row in
 * `MODE_UNLOCKS`.
 *
 * Data: an unlock is the id `mode.<id>` in the profile's `unlocks` (already synced and union-merged across devices; no
 * backend change). The thresholds read the profile's `matches` and `wins`, which max-merge across devices and never go
 * down. Events and featured modes are never locked while live.
 *
 * Pure apart from the guarded localStorage helpers at the end.
 */
import { effectiveState, type ModeDef, type ModeId } from './modes';

export interface Need {
  matches?: number;
  wins?: number;
}
export interface Counts {
  matches: number;
  wins: number;
}
export type UnlockProfile = Counts & { unlocks: readonly string[] };

/** Always big, slots 1 and 2. */
export const CORE: readonly ModeId[] = Object.freeze(['skirmish', 'classic']);
/** Open from the first match: the core and the Practice sandbox. */
export const OPEN_MODES: readonly ModeId[] = Object.freeze(['skirmish', 'classic', 'practice']);
/** Timed events: never locked (live inside their window, "Next: Fri" outside it). */
export const EVENT_MODES: readonly ModeId[] = Object.freeze(['boss', 'twist']);

/**
 * The unlock ladder, simple to complex (MLBB Ranked at Lv 8, Wild Rift Ranked at Lv 10, Brawl Stars' Trophy Road).
 * Tuning is one edit here. Counts are finished matches and wins (Practice never counts).
 */
export const MODE_UNLOCKS: readonly { id: ModeId; need: Need }[] = Object.freeze([
  // the results' "Quick Blitz?" offer after a loss lands on an unlocked Blitz
  { id: 'blitz', need: { matches: 1 } },
  { id: 'duel', need: { matches: 2 } },
  { id: 'onelane', need: { wins: 1 } },
  { id: 'cannon', need: { matches: 4 } },
  { id: 'ranked', need: { matches: 10, wins: 3 } },
]);
/** A registered mode with no row (round 4 or later) waits for this, so nothing new lands big by accident. */
export const DEFAULT_NEED: Need = Object.freeze({ matches: 4 });
/** A player with this many matches and no `mode.` id at all played before mode unlocking shipped: every mode opens. */
export const VETERAN_MATCHES = 10;
/** The Weekly Twist bends Skirmish's rules: it takes the spotlight only after this many matches (the strip before). */
export const TWIST_SPOTLIGHT_MATCHES = 4;

export const MODE_PREFIX = 'mode.';
export const unlockId = (id: ModeId): string => `${MODE_PREFIX}${id}`;
/** Cosmetic counts skip these ids (they are mode unlocks, not items). */
export const isModeUnlock = (u: string): boolean => u.startsWith(MODE_PREFIX);

/** The mode's unlock condition, or null when it is never gated (open, an event). Pure. */
export function needOf(id: ModeId): Need | null {
  if (OPEN_MODES.includes(id) || EVENT_MODES.includes(id)) return null;
  return MODE_UNLOCKS.find((u) => u.id === id)?.need ?? DEFAULT_NEED;
}

export const meets = (need: Need, c: Counts): boolean => c.matches >= (need.matches ?? 0) && c.wins >= (need.wins ?? 0);

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 'es'}`;

/** "Finish 2 matches", "Win 1 match", "Finish 10 matches and win 3". Pure. */
export function needText(need: Need): string {
  const m = need.matches ?? 0;
  const w = need.wins ?? 0;
  if (m > 0 && w > 0) return `Finish ${plural(m, 'match')} and win ${w}`;
  if (w > 0) return `Win ${plural(w, 'match')}`;
  return `Finish ${plural(m, 'match')}`;
}

/**
 * The progress toward a mode's unlock: `pct` 0..1 (the ring), `line` for the strip icon ("Finish 1 match",
 * "1/2 matches", "4/10 matches"), `short` for the lock sentence ("1/2", "4/10, 1/3"). Null: never gated. Pure.
 */
export function progressOf(id: ModeId, c: Counts): { pct: number; line: string; short: string; need: Need } | null {
  const need = needOf(id);
  if (!need) return null;
  const parts: { done: number; of: number; unit: 'match' | 'win' }[] = [];
  if (need.matches) parts.push({ done: Math.min(c.matches, need.matches), of: need.matches, unit: 'match' });
  if (need.wins) parts.push({ done: Math.min(c.wins, need.wins), of: need.wins, unit: 'win' });
  if (!parts.length) return { pct: 1, line: '', short: '', need };
  const pct = parts.reduce((s, p) => s + p.done / p.of, 0) / parts.length;
  // the strip line: a first step reads as the action ("Finish 1 match"); otherwise the first unmet count
  const open = parts.find((p) => p.done < p.of) ?? parts[parts.length - 1];
  const line =
    parts.length === 1 && open.of === 1 && open.done === 0
      ? needText(need)
      : `${open.done}/${open.of} ${open.unit === 'match' ? (open.of === 1 ? 'match' : 'matches') : open.of === 1 ? 'win' : 'wins'}`;
  return { pct, line, short: parts.map((p) => `${p.done}/${p.of}`).join(', '), need };
}

/** "Finish 2 matches (1/2)": the lock line for toasts, the nav and screen readers. Pure. */
export function lockLine(id: ModeId, c: Counts): string {
  const pr = progressOf(id, c);
  return pr ? `${needText(pr.need)} (${pr.short})` : '';
}

/**
 * Is this mode open to this player at `now`? Open modes and events always; a live (non-event) mode when its
 * condition is met or `mode.<id>` is in the profile's unlocks. A featured mode is an event while featured (live ops
 * registers it with a timed state), so it is open during its window only. Pure.
 */
export function isUnlocked(m: Pick<ModeDef, 'id' | 'state'>, p: UnlockProfile, now: number): boolean {
  const need = needOf(m.id);
  if (!need) return true;
  if (effectiveState(m, now) === 'event') return true;
  return meets(need, p) || p.unlocks.includes(unlockId(m.id));
}

/** The ladder modes whose condition this match crossed and that no device announced yet (results banner). Pure. */
export function newlyUnlocked(before: Counts, after: UnlockProfile): ModeId[] {
  return MODE_UNLOCKS.filter((u) => !meets(u.need, before) && meets(u.need, after) && !after.unlocks.includes(unlockId(u.id))).map((u) => u.id);
}

/** Every gated mode id (the ladder's, then any other the registry lists). Pure. */
export function gatedIds(all: readonly Pick<ModeDef, 'id'>[] = []): ModeId[] {
  const out = MODE_UNLOCKS.map((u) => u.id);
  for (const m of all) if (needOf(m.id) && !out.includes(m.id)) out.push(m.id);
  return out;
}

/**
 * The ids to add so the profile records what is open: every gated mode whose condition is met, and every gated mode
 * for a veteran account (VETERAN_MATCHES or more and no `mode.` id yet: it played before this build; a new account
 * gets `mode.blitz` at its first match, so it never qualifies later). Silent (no banner, no NEW). Pure.
 */
export function silentUnlocks(p: UnlockProfile, all: readonly Pick<ModeDef, 'id'>[] = []): { add: string[]; veteran: boolean } {
  const ids = gatedIds(all);
  const veteran = p.matches >= VETERAN_MATCHES && !p.unlocks.some(isModeUnlock);
  const add = ids.filter((id) => (veteran || meets(needOf(id)!, p)) && !p.unlocks.includes(unlockId(id))).map(unlockId);
  return { add, veteran };
}

/**
 * First run of this build on a device: the player keeps every mode they already had. A veteran (VETERAN_MATCHES or
 * more matches, or "played MOBAs before") gets them all; anyone else gets the modes in their saved choice, their match
 * history (`tt.pawlegends.history.v1`: Blitz) and Ranked when a ranked card shows games. Silent. Pure.
 */
export function migrateUnlocks(
  p: UnlockProfile & { veteran?: boolean },
  src: { saved?: string | null; history?: readonly string[]; rankedPlayed?: boolean },
  all: readonly Pick<ModeDef, 'id'>[] = [],
): string[] {
  const ids = gatedIds(all);
  const keep = new Set<string>();
  if (p.matches >= VETERAN_MATCHES || p.veteran) for (const id of ids) keep.add(id);
  if (src.saved && ids.includes(src.saved)) keep.add(src.saved);
  for (const h of src.history ?? []) if (ids.includes(h)) keep.add(h);
  if (src.rankedPlayed) keep.add('ranked');
  for (const id of ids) if (meets(needOf(id)!, p)) keep.add(id);
  return [...keep].map(unlockId).filter((u) => !p.unlocks.includes(u));
}

/** The per-player NEW state (display only): modes unlocked by a match and not played yet, and those already shown. */
export interface ModeLocal {
  /** Unlocked at a results screen, no match of it finished yet: NEW and the spotlight claim. */
  fresh: string[];
  /** Fresh modes Mode Select already announced (the unlock animation and the PLAY dot play once). */
  seen: string[];
}

export interface Layout {
  big: ModeDef[];
  more: ModeDef[];
}

/** The strip's order: Practice, the ladder (simple to complex), then everything else in registry order. */
const stripRank = (id: ModeId): number => {
  if (id === 'practice') return 0;
  const i = MODE_UNLOCKS.findIndex((u) => u.id === id);
  return i >= 0 ? 1 + i : 100;
};

/**
 * The 3 big tiles and the strip (layout A). Slot 1 Skirmish, slot 2 Classic, slot 3 the first that applies of:
 * 1. Boss Weekend inside its window, then a featured mode (live ops, not Skirmish or Classic);
 * 2. the newest mode unlocked at a results screen and not played yet (NEW);
 * 3. the last mode the player chose (if open to them);
 * 4. the Weekly Twist (after TWIST_SPOTLIGHT_MATCHES matches);
 * 5. Practice.
 * `list` is already per player (`playerModes`): a locked mode has state 'locked'. Never more than 3 big. Pure.
 */
export function layoutModes(list: readonly ModeDef[], c: Counts, local: ModeLocal, now: number, choice?: ModeId | null): Layout {
  const by = (id: ModeId): ModeDef | undefined => list.find((m) => m.id === id);
  const live = (m: ModeDef | undefined): m is ModeDef => !!m && (effectiveState(m, now) === 'live' || effectiveState(m, now) === 'event');
  const big: ModeDef[] = CORE.map(by).filter((m): m is ModeDef => !!m);
  const isEvent = (m: ModeDef | undefined): m is ModeDef => !!m && effectiveState(m, now) === 'event';
  const notCore = (m: ModeDef): boolean => !CORE.includes(m.id);
  const fresh = MODE_UNLOCKS.map((u) => u.id)
    .concat(local.fresh.filter((id) => !MODE_UNLOCKS.some((u) => u.id === id)))
    .filter((id) => local.fresh.includes(id))
    .reverse()
    .map(by)
    .find(live);
  const chosen = choice ? by(choice) : undefined;
  const twist = by('twist');
  const spot =
    (isEvent(by('boss')) ? by('boss') : undefined) ??
    list.find((m) => isEvent(m) && notCore(m) && !EVENT_MODES.includes(m.id)) ??
    fresh ??
    (live(chosen) && notCore(chosen) ? chosen : undefined) ??
    (isEvent(twist) && c.matches >= TWIST_SPOTLIGHT_MATCHES ? twist : undefined) ??
    (live(by('practice')) ? by('practice') : undefined) ??
    list.find((m) => live(m) && notCore(m));
  if (spot && !big.includes(spot)) big.push(spot);
  const top = big.slice(0, 3);
  const more = list
    .filter((m) => !top.includes(m))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => stripRank(a.m.id) - stripRank(b.m.id) || a.i - b.i)
    .map((x) => x.m);
  return { big: top, more };
}

/**
 * The registry as this player sees it: a gated mode they have not unlocked is `locked` with its lock line and
 * progress; NEW follows the player (fresh and unplayed), and each mode carries its slot (`big` or `more`), big first.
 * Pure.
 */
export function playerModes(list: readonly ModeDef[], p: UnlockProfile, local: ModeLocal, now: number, choice?: ModeId | null): ModeDef[] {
  const per = list.map((m): ModeDef => {
    const open = isUnlocked(m, p, now);
    const fresh = local.fresh.includes(m.id);
    // NEW is per player now: a mode this player unlocked at a results screen and has not played yet (the registry's
    // static ribbon from v27/v28 is dropped: on a strip of goals it said nothing about this player)
    const isNew = open && fresh;
    if (open) {
      const { isNew: _drop, ...rest } = m;
      void _drop;
      return { ...rest, ...(isNew ? { isNew: true } : {}), ...(fresh && !local.seen.includes(m.id) ? { fresh: true } : {}) };
    }
    const pr = progressOf(m.id, p)!;
    const { isNew: _n, liveLine: _l, ...rest } = m;
    void _n;
    void _l;
    return { ...rest, state: 'locked', lockText: lockLine(m.id, p), progress: { pct: pr.pct, line: pr.line } };
  });
  const { big, more } = layoutModes(per, p, local, now, choice);
  return [...big.map((m) => ({ ...m, slot: 'big' as const })), ...more.map((m) => ({ ...m, slot: 'more' as const }))];
}

/** Fresh modes Mode Select has not announced yet (the PLAY button's NEW dot). Pure. */
export const unseenFresh = (local: ModeLocal): string[] => local.fresh.filter((id) => !local.seen.includes(id));

/** A finished match of `id`: it is no longer NEW and gives up its spotlight claim. Pure. */
export function notePlayed(local: ModeLocal, id: ModeId): ModeLocal {
  if (!local.fresh.includes(id)) return local;
  return { fresh: local.fresh.filter((x) => x !== id), seen: local.seen.filter((x) => x !== id) };
}

// ------------------------------------------------------------------------------------------ the local state

/**
 * The NEW state, as two short comma lists so they ride the synced device settings (meta/progressCloud.ts SYNCED_KEYS
 * carries strings up to 32 characters; every ladder id together is 32). The migration flag is per device.
 */
export const MODES_NEW_KEY = 'pawlegends.modes.new';
export const MODES_SEEN_KEY = 'pawlegends.modes.seen';
export const MODES_MIGRATED_KEY = 'pawlegends.modes.v1';

const ID = /^[a-z0-9_-]{1,24}$/;
const readList = (k: string): string[] => {
  try {
    const v = globalThis.localStorage?.getItem(k);
    return v ? [...new Set(v.split(',').filter((x) => ID.test(x)))] : [];
  } catch {
    return [];
  }
};
const write = (k: string, v: string): void => {
  try {
    globalThis.localStorage?.setItem(k, v);
  } catch {
    /* a blocked store: the NEW state holds for this visit only */
  }
};

export function loadModeLocal(): ModeLocal {
  const fresh = readList(MODES_NEW_KEY);
  return { fresh, seen: readList(MODES_SEEN_KEY).filter((x) => fresh.includes(x)) };
}

export function saveModeLocal(l: ModeLocal): void {
  write(MODES_NEW_KEY, l.fresh.join(','));
  write(MODES_SEEN_KEY, l.seen.join(','));
}

/** Has this device run the first-run migration? (A blocked store says yes: no migration without a store.) */
export function modesMigrated(): boolean {
  try {
    const s = globalThis.localStorage;
    return !s || s.getItem(MODES_MIGRATED_KEY) === '1';
  } catch {
    return true;
  }
}

export function markModesMigrated(): void {
  write(MODES_MIGRATED_KEY, '1');
}
