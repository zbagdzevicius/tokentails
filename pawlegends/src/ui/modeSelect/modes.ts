/**
 * Home and Mode Select (docs/plans/moba/HOME-MODES.md §5): the one registry of game modes. It generalises the old
 * 3v3 Quick | 5v5 Classic toggle (ui/lobby/matchMode.ts, whose localStorage key it still reads) into tiles with art,
 * a state (live, locked, coming soon or a timed event) and the variants each mode offers (vs Bots, Co-op, PvP, With
 * Friends). The one play path (Nov 12): PLAY → mode → variant → champion select → match (or queue, or party lobby).
 *
 * Plug-in points: v22's Blitz and the PLAY-picker tiles, Ranked's `rank` line and timed events register here with
 * `registerMode` (or by editing `BASE_MODES`); the screens only read `modeList()`. Nothing here invents a number: a
 * mode that does not exist yet is `soon` or `locked`, never live, and an event shows a countdown only when it has a
 * real `endsAt`.
 *
 * Pure apart from the guarded localStorage helpers at the end.
 */
import type { MapId, Mutator } from '../../sim/api';
import { loadMatchMode, type MatchMode } from '../lobby/matchMode';
import { rankedGateText, RANKED_MAP, type RankedStatus } from '../../meta/ranked';

export type ModeId = 'blitz' | 'skirmish' | 'classic' | 'ranked' | 'cannon' | 'practice' | 'twist' | 'onelane' | 'duel' | 'boss' | (string & {});
/** A mode's variant (the second step after PLAY): solo vs bots, co-op vs bots, PvP, or a party with friends. */
export type Queue = 'bots' | 'coop' | 'pvp' | 'friends';
export type Variant = Queue;
/** The order the variant cards show in. */
export const VARIANTS: readonly Queue[] = Object.freeze(['bots', 'coop', 'pvp', 'friends'] as Queue[]);
export type ModeState = 'live' | 'locked' | 'soon' | { event: { startsAt?: number; endsAt: number } };

export interface ModeDef {
  id: ModeId;
  name: string;
  /** The map a match of this mode plays (undefined: the default 3v3 map). */
  map?: MapId;
  size: '3v3' | '5v5' | '1v1' | '';
  /** "~8 min". */
  minutes: string;
  /** The variants this mode supports (the others are not shown). */
  queues: readonly Queue[];
  /** File stem under assets/modes/ (`<art>-256.webp`, `<art>-512.webp`). */
  art: string;
  /** Sim v28: the art ships in this one size only (`<art>-<artPx>.webp`), for every quality tier. */
  artPx?: number;
  state: ModeState;
  /** Replaces the meta line when locked ("Unlocks after 5 matches"). */
  lockText?: string;
  /** Ranked: the player's rank line under the name. */
  rank?: { tier: string; lp?: number };
  /** The "i" popover: two or three short rule lines. */
  rules: readonly string[];
  /** A "NEW" ribbon. */
  isNew?: boolean;
  /** Short line under the mode pill on Home ("vs Bots" is added by the queue). */
  short?: string;
  /** Sim v22+: the sim mutator a match of this mode plays (Blitz 'blitz'; sim v27 Cannon Chaos, Practice, the twist). */
  mutator?: Mutator;
  /** Sim v27: the Practice ground: no rewards, any champion, nothing saved. */
  practice?: boolean;
}

/** The modes this build ships (HOME-MODES.md §5 default table; sim v22 made Blitz live, minutes from the v22 probe). */
export const BASE_MODES: readonly ModeDef[] = Object.freeze([
  {
    // Sim v22 (WR-BS-PLAN.md §5, docs/plans/moba/BLITZ.md): the 3-minute Crossing match, solo against bots at launch
    id: 'blitz',
    name: 'Blitz',
    map: 'crossing',
    size: '3v3',
    minutes: '~3 min',
    queues: ['bots'],
    art: 'blitz',
    state: 'live',
    mutator: 'blitz',
    rules: ['3v3 on the Crossing in about 3 minutes: start at level 4, double XP.', 'Kibble Cannon at 0:20, Sudden Death at 2:30.'],
  },
  {
    id: 'skirmish',
    name: 'Skirmish',
    map: 'crossing',
    size: '3v3',
    minutes: '~7 min',
    art: 'skirmish',
    state: 'live',
    // Nov 12: Co-op is Skirmish's variant (the separate "Co-op vs Bots" tile was the same match)
    queues: ['bots', 'coop', 'pvp', 'friends'],
    rules: ['3v3 on Purrhaven Crossing: one bridge, two lanes.', 'Destroy the enemy core to win.', 'Solo vs bots, co-op vs bots, PvP or with friends.'],
  },
  {
    id: 'classic',
    name: 'Classic',
    map: 'hearthwood',
    size: '5v5',
    minutes: '~13 min',
    art: 'classic',
    state: 'live',
    // the matchmaker's co-op queue and friend parties play 3v3 (PROTO 4: `classic` is the 10-player PvP queue)
    queues: ['bots', 'pvp'],
    rules: ['5v5 on Hearthwood Divide: three lanes and a jungle.', 'Take towers and objectives, then the core.'],
  },
  // Gap plan P4: Ranked opens by itself when enough players are online (GET /pawlegends/ranked/status). Until the
  // first answer it is locked with the fallback line; `rankedModeDef` replaces it with the live gate.
  rankedModeDef(null),
  {
    // Sim v27 (docs/plans/moba/V27.md §3): the Kibble Cannon every 20 s, short cooldowns, about 5 minutes
    id: 'cannon',
    name: 'Cannon Chaos',
    map: 'crossing',
    size: '3v3',
    minutes: '~5 min',
    queues: ['bots'],
    art: 'cannon',
    state: 'live',
    isNew: true,
    mutator: 'cannon',
    rules: ['The Kibble Cannon from 0:15 and again 20 s after every shot: grab it, blast towers and heroes.', 'Start at level 3, cooldowns 30% shorter, about 5 minutes.'],
  },
  {
    // Sim v27 (V27.md §2): the solo sandbox, no rewards
    id: 'practice',
    name: 'Practice',
    map: 'crossing',
    size: '',
    minutes: 'Sandbox',
    queues: ['bots'],
    art: 'coop',
    state: 'live',
    isNew: true,
    mutator: 'practice',
    practice: true,
    rules: ['Your champion on the Crossing with three training dummies: one stands, one walks, one waits under a tower.', 'Reset, level up and refresh cooldowns any time. Any champion, no rewards.'],
  },
  {
    // Sim v28 (docs/plans/moba/V28.md §2): ARAM-like, one lane, no recall
    id: 'onelane',
    name: 'One Lane Brawl',
    map: 'crossing',
    size: '3v3',
    minutes: '~6 min',
    queues: ['bots'],
    art: 'onelane',
    artPx: 256,
    state: 'live',
    isNew: true,
    mutator: 'onelane',
    rules: ['3v3 on Sunny Lane only: one lane, nonstop fights.', 'Start at level 3, Fish twice as fast. No Nap and no fountain heal: grab the Fish Snacks.', 'Sunset 5:00, time up 8:00.'],
  },
  {
    // Sim v28 (V28.md §3): 1v1, first to 2 takedowns or the first tower
    id: 'duel',
    name: 'Duel',
    map: 'crossing',
    size: '1v1',
    minutes: '~3 min',
    queues: ['bots'],
    art: 'duel',
    artPx: 256,
    state: 'live',
    isNew: true,
    mutator: 'duel',
    rules: ['1v1 on Sunny Lane with its minions.', 'First to 2 takedowns or the first tower wins.', 'Start at level 3; no Nap, Fish Snacks heal. Time up at 5:00.'],
  },
  // Sim v28 (V28.md §4): Boss Weekend, Friday to Monday 00:00 UTC; meta/liveops.ts re-registers it from the server
  bossModeDef(bossWeekend(Date.now())),
] satisfies ModeDef[]);


/**
 * Sim v28 (V28.md §4): Boss Weekend's baked schedule (the server's `bossWeekend`): Friday 00:00 UTC to Monday 00:00 UTC
 * every week. Returns the weekend running now, else the next one. Pure.
 */
export function bossWeekend(now: number): { startsAt: number; endsAt: number } {
  const DAY_MS = 86_400_000;
  const d = new Date(now);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // days since the last Friday (Friday 0 … Thursday 6)
  const sinceFri = (new Date(day).getUTCDay() + 2) % 7;
  const fri = day - sinceFri * DAY_MS;
  const mon = fri + 3 * DAY_MS;
  return now < mon ? { startsAt: fri, endsAt: mon } : { startsAt: fri + 7 * DAY_MS, endsAt: mon + 7 * DAY_MS };
}

/** Sim v28: the Boss Weekend tile for a weekend window (an event: live inside it, "Next: Fri" before it). Pure. */
export function bossModeDef(win: { startsAt: number; endsAt: number }): ModeDef {
  return {
    id: 'boss',
    name: 'Boss Weekend',
    map: 'crossing',
    size: '3v3',
    minutes: '~5 min',
    queues: ['bots'],
    art: 'boss', artPx: 256,
    state: { event: { startsAt: win.startsAt, endsAt: win.endsAt } },
    mutator: 'boss',
    short: 'Co-op vs Mega Brutus',
    rules: ['Your team of three against Mega Brutus on the Sunny Lane bridge.', 'Red circles are his Ground Pound and Meteor Paw: step out before they fill.', 'He calls pups at 66% and 33% and enrages at 5:30. Fell him before 6:30.'],
  };
}

/**
 * Sim v27 (V27.md §4): the Weekly Twist tile, from the server's live-ops `twist` (meta/liveops.ts registers it with a
 * timed event state). Skirmish on the Crossing vs bots under the week's rule set. Pure.
 */
export function twistModeDef(t: { id: Mutator; name: string; rules: readonly string[]; endsAt: number }): ModeDef {
  return {
    id: 'twist',
    name: t.name,
    map: 'crossing',
    size: '3v3',
    minutes: '~8 min',
    queues: ['bots'],
    art: 'skirmish',
    state: { event: { endsAt: t.endsAt } },
    mutator: t.id,
    short: 'Weekly Twist',
    rules: ['Weekly Twist: Skirmish on the Crossing with this week’s rule.', ...t.rules],
  };
}

/**
 * The Ranked tile from the live gate (gap plan P4, SOCIAL-RANKED.md §7.1, §7.9): 3v3 on the Crossing, PvP only, solo
 * or duo, never a bot. Live while the gate is open; locked with "Opens at 24 online · 9 now" while it is closed (and
 * with the fallback line before the first answer). The gate is the switch: there is no flag. Pure.
 */
export function rankedModeDef(st: RankedStatus | null, rank?: ModeDef['rank']): ModeDef {
  const open = !!st?.open;
  return {
    id: 'ranked',
    name: 'Ranked',
    map: RANKED_MAP,
    size: '3v3',
    minutes: '~7 min',
    queues: ['pvp'],
    art: 'ranked',
    state: open ? 'live' : 'locked',
    ...(open ? {} : { lockText: rankedGateText(st) }),
    rank: rank ?? { tier: 'Unranked' },
    rules: [
      '3v3 on the Crossing against players only: no bots. Solo or duo.',
      'Win to climb Kitten, Tabby, Alley, Lion and Legend. Kitten and Tabby never lose points.',
      open ? `Open now · ${st!.online} players online.` : `Opens by itself at ${st?.need ?? 24} players online.`,
    ],
  };
}

const extra: ModeDef[] = [];

/** Another worktree's mode (v22 Blitz, a timed event): replaces the base entry with the same id, else appends. */
export function registerMode(m: ModeDef): void {
  const i = extra.findIndex((x) => x.id === m.id);
  if (i >= 0) extra[i] = m;
  else extra.push(m);
}

/** Sim v27: drop a registered mode (the Weekly Twist when the server turns it off); a base entry comes back. */
export function unregisterMode(id: ModeId): void {
  const i = extra.findIndex((x) => x.id === id);
  if (i >= 0) extra.splice(i, 1);
}

/** Tests only. */
export function resetModes(): void {
  extra.length = 0;
}

const ORDER = { event: 0, live: 1, locked: 2, soon: 3 } as const;

/** Every mode, in display order: live and event tiles first (registry order), then locked, then coming soon. */
export function modeList(now = Date.now()): ModeDef[] {
  // sim v28: the base Boss Weekend tile follows the baked schedule at `now` (live ops re-registers it from the server)
  const all = BASE_MODES.map((b) => extra.find((x) => x.id === b.id) ?? (b.id === 'boss' ? bossModeDef(bossWeekend(now)) : b));
  for (const x of extra) if (!all.some((m) => m.id === x.id)) all.push(x);
  const rank = (m: ModeDef): number => {
    const s = effectiveState(m, now);
    return s === 'event' ? ORDER.live : ORDER[s];
  };
  return all.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map((x) => x.m);
}

export const modeById = (id: string, list: readonly ModeDef[] = modeList()): ModeDef | undefined => list.find((m) => m.id === id);

/** The state a tile shows at `now`: an event before its start or after its end is `soon`. Pure. */
export function effectiveState(m: Pick<ModeDef, 'state'>, now: number): 'live' | 'locked' | 'soon' | 'event' {
  const s = m.state;
  if (typeof s === 'string') return s;
  if (s.event.startsAt !== undefined && now < s.event.startsAt) return 'soon';
  return now < s.event.endsAt ? 'event' : 'soon';
}

/** Can a match of this mode start now? */
export const playable = (m: Pick<ModeDef, 'state'>, now: number): boolean => {
  const s = effectiveState(m, now);
  return s === 'live' || s === 'event';
};

/** "2d 4h", "3h 12m", "9m" (never below "1m"). Pure. */
export function countdownText(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

/** The small line under a tile's name: the lock text, "Coming soon", "Next: Fri", or "5v5 · ~15 min". Pure. */
export function metaLine(m: ModeDef, now: number): string {
  const s = effectiveState(m, now);
  if (s === 'locked') return m.lockText ?? 'Locked';
  if (s === 'soon') {
    if (typeof m.state === 'object' && m.state.event.startsAt !== undefined && now < m.state.event.startsAt)
      return `Next: ${new Date(m.state.event.startsAt).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}`;
    return 'Coming soon';
  }
  return [m.size, m.minutes].filter(Boolean).join(' · ');
}

export const QUEUE_LABEL: Readonly<Record<Queue, string>> = Object.freeze({ bots: 'vs Bots', coop: 'Co-op', pvp: 'PvP', friends: 'With Friends' });

/** Each variant card's line under its name. */
export const VARIANT_LINE: Readonly<Record<Queue, string>> = Object.freeze({
  bots: 'Solo against bots',
  coop: 'Team up with players vs bots',
  pvp: 'Players vs players',
  friends: 'Party up, invite, share a code',
});

/** The mode pill on Home: "Classic 5v5 · vs Bots". Pure. */
export function pillText(m: Pick<ModeDef, 'name' | 'size'> & { practice?: boolean }, q: Queue): string {
  // sim v27: the Practice ground is a sandbox, not a bots match
  if (m.practice) return `${m.name} · Sandbox`;
  return `${m.name}${m.size ? ` ${m.size}` : ''} · ${QUEUE_LABEL[q]}`;
}

/** The queue a mode falls back to when the saved one is not offered (its first). Pure. */
export const queueFor = (m: Pick<ModeDef, 'queues'>, q: Queue | null | undefined): Queue => (q && m.queues.includes(q) ? q : (m.queues[0] ?? 'bots'));

/**
 * Why a variant the mode supports cannot start in this build (no party server, no PvP sim), or null. Pure.
 * `pvpLock`: the PvP match-count lock line for this mode (null: open).
 */
export function variantLock(q: Queue, available: readonly Queue[], pvpLock: string | null = null): string | null {
  if (q === 'pvp' && pvpLock) return pvpLock;
  if (available.includes(q)) return null;
  if (q === 'pvp') return 'PvP is offline right now';
  return 'Needs the party server (offline right now)';
}

/** The old toggle's value for a mode (the app still saves it, so the pick and party screens keep their map). */
export const legacyMode = (id: ModeId): MatchMode => (id === 'classic' ? 'classic' : id === 'blitz' ? 'blitz' : 'skirmish');

// ------------------------------------------------------------------------------------------ the saved selection

const KEY = 'pawlegends.mode.v1';

export interface ModeChoice {
  mode: ModeId;
  queue: Queue;
}

/**
 * The saved mode and queue (a per-viewer convenience). Migration: no new key yet → the old toggle's value, `'quick'`
 * → Skirmish (sim v22 stores 'blitz' | 'skirmish' | 'classic', each its tile) and `'classic'` → Classic, vs Bots. A saved mode that is gone or not playable falls back to Skirmish.
 */
export function loadModeChoice(list: readonly ModeDef[] = modeList(), now = Date.now()): ModeChoice {
  let raw: Partial<ModeChoice> | null = null;
  try {
    const s = globalThis.localStorage?.getItem(KEY);
    raw = s ? (JSON.parse(s) as Partial<ModeChoice>) : null;
  } catch {
    raw = null;
  }
  let id: string = String(raw?.mode ?? loadMatchMode());
  let q = raw?.queue as Queue | undefined;
  // Nov 12: the "Co-op vs Bots" tile is Skirmish's Co-op variant now
  if (id === 'coop') {
    id = 'skirmish';
    q = 'coop';
  }
  const m = modeById(id, list);
  const ok = m && playable(m, now) ? m : (modeById('skirmish', list) ?? list.find((x) => playable(x, now)) ?? list[0]);
  return { mode: ok.id, queue: queueFor(ok, q) };
}

export function saveModeChoice(c: ModeChoice): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(c));
  } catch {
    /* a blocked store: the choice holds for this visit */
  }
}
