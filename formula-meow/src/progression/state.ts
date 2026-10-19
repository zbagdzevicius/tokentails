/**
 * The progression save slot (`save.slot('progression')`, core/app/save.ts): fish, owned and equipped cosmetics,
 * unlocks, trophies, medals, achievements, lifetime stats, rival records and the daily challenges. Device-only.
 *
 * `migrateProg(raw, core)` turns whatever is stored into the current shape. It runs on every load, so it accepts its
 * own output; on first use it reads the shell's v1 progress (`core` slot: races, unlocked class, best times) so an
 * existing player keeps their classes and gets a small welcome-back bonus.
 */
import type { BodyId, RaceClass } from '../types';
import type { Progress } from '../core/app/save';
import { PAINT_PRESETS } from '../content/cosmetics';

export interface LifetimeStats {
  races: number;
  finishes: number;
  wins: number;
  podiums: number;
  /** metres driven (circuits only) */
  distance: number;
  hitsDealt: number;
  hitsTaken: number;
  miniTurbos: [number, number, number];
  tricks: number;
  coins: number;
  itemsUsed: number;
  overtakes: number;
  pounces: number;
  slipstreams: number;
  shortcuts: number;
  respawns: number;
  battleWins: number;
  /** races per body id (favourite body) */
  bodyRaces: number[];
  /** races per mode */
  modeRaces: Record<string, number>;
}

export interface Loadout {
  body: BodyId;
  /** PAINT_PRESETS index */
  paint: number;
  number: number;
  /** HAT_IDS index (0 none) */
  hat: number;
  /** TRAIL_IDS index (0 none) */
  trail: number;
  /** a playable Pink Paw cat's id, or null for your own cat (cat maker) / Tofu */
  cat: string | null;
}

export interface DailyState {
  /** UTC day number (share/daily dayNoFor) the challenges below belong to */
  day: number;
  /** challenge ids picked for that day */
  ids: string[];
  progress: number[];
  done: boolean[];
  /** the all-three bonus was paid */
  swept: boolean;
  /** consecutive days with at least one challenge done */
  streak: number;
  /** last day a challenge was done */
  lastDone: number;
  /** best streak ever */
  bestStreak: number;
}

export interface ProgSave {
  v: 1;
  fish: number;
  /** lifetime fish earned */
  fishTotal: number;
  owned: { bodies: number[]; hats: number[]; trails: number[]; cats: string[] };
  equip: Loadout;
  /** highest class unlocked (mirrors the shell's core progress both ways) */
  classUnlocked: RaceClass;
  mirror: boolean;
  /** best cup place by `${cupId}:${cls}` (+ `m` for mirror), 1..3 only */
  trophies: Record<string, number>;
  /** time trial medals by `${trackId}:${cls}`: 1 gold, 2 silver, 3 bronze */
  medals: Record<string, number>;
  /** achievement id → UTC day number it was earned */
  achievements: Record<string, number>;
  stats: LifetimeStats;
  /** best lap in seconds by `${trackId}:${cls}:${modifiers}` */
  bestLaps: Record<string, number>;
  /** track ids with a podium (trails), raced (Globetrotter), with a shortcut taken (Shortcut Scout) */
  podiumTracks: string[];
  racedTracks: string[];
  shortcutTracks: string[];
  /** head-to-head against rivals by name */
  rivals: Record<string, { w: number; l: number }>;
  lastRival: string | null;
  /** the rival of the cup in progress (kept for its four races) */
  cupRival: { cupId: string; name: string } | null;
  daily: DailyState;
  /** dare wins already counted (share's rivalry ledger total), for Ghostbuster */
  ghostWins: number;
  /** ids the player has not looked at yet in the garage ("NEW" badges) */
  fresh: string[];
}

export function emptyStats(): LifetimeStats {
  return {
    races: 0,
    finishes: 0,
    wins: 0,
    podiums: 0,
    distance: 0,
    hitsDealt: 0,
    hitsTaken: 0,
    miniTurbos: [0, 0, 0],
    tricks: 0,
    coins: 0,
    itemsUsed: 0,
    overtakes: 0,
    pounces: 0,
    slipstreams: 0,
    shortcuts: 0,
    respawns: 0,
    battleWins: 0,
    bodyRaces: [0, 0, 0, 0, 0, 0],
    modeRaces: {},
  };
}

export function emptyDaily(): DailyState {
  return { day: 0, ids: [], progress: [], done: [], swept: false, streak: 0, lastDone: 0, bestStreak: 0 };
}

export const DEFAULT_LOADOUT: Loadout = Object.freeze({ body: 0, paint: 0, number: 7, hat: 0, trail: 0, cat: null }) as Loadout;

export function defaultProg(): ProgSave {
  return {
    v: 1,
    fish: 0,
    fishTotal: 0,
    owned: { bodies: [0, 1, 2], hats: [0], trails: [0], cats: [] },
    equip: { ...DEFAULT_LOADOUT },
    classUnlocked: 0,
    mirror: false,
    trophies: {},
    medals: {},
    achievements: {},
    stats: emptyStats(),
    bestLaps: {},
    podiumTracks: [],
    racedTracks: [],
    shortcutTracks: [],
    rivals: {},
    lastRival: null,
    cupRival: null,
    daily: emptyDaily(),
    ghostWins: -1,
    fresh: [],
  };
}

/** Fish for a returning v1 player: 5 per race they already ran, at most 200. */
export function welcomeBackFish(races: number): number {
  return Math.max(0, Math.min(200, Math.floor(races) * 5));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const int = (v: unknown, d: number, lo: number, hi: number): number => Math.floor(num(v, d, lo, hi));
const nums = (v: unknown, lo: number, hi: number): number[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi))] : []);
const strs = (v: unknown, max = 64): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= max))] : []);
function numRecord(v: unknown, lo: number, hi: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && isFinite(x) && x >= lo && x <= hi) out[k] = x;
  return out;
}

function sanitizeStats(v: unknown): LifetimeStats {
  const s = isObj(v) ? v : {};
  const e = emptyStats();
  const out: LifetimeStats = { ...e };
  for (const k of Object.keys(e) as Array<keyof LifetimeStats>) {
    if (k === 'miniTurbos' || k === 'bodyRaces' || k === 'modeRaces') continue;
    (out as unknown as Record<string, number>)[k] = num(s[k], 0, 0);
  }
  const mt = Array.isArray(s.miniTurbos) ? s.miniTurbos : [];
  out.miniTurbos = [num(mt[0], 0, 0), num(mt[1], 0, 0), num(mt[2], 0, 0)];
  const br = Array.isArray(s.bodyRaces) ? s.bodyRaces : [];
  out.bodyRaces = [0, 1, 2, 3, 4, 5].map((i) => num(br[i], 0, 0));
  out.modeRaces = numRecord(s.modeRaces, 0, Infinity);
  return out;
}

function sanitizeDaily(v: unknown): DailyState {
  const d = isObj(v) ? v : {};
  const ids = strs(d.ids, 40).slice(0, 3);
  const prog = Array.isArray(d.progress) ? d.progress : [];
  const done = Array.isArray(d.done) ? d.done : [];
  return {
    day: int(d.day, 0, 0, 1e6),
    ids,
    progress: ids.map((_, i) => num(prog[i], 0, 0)),
    done: ids.map((_, i) => done[i] === true),
    swept: d.swept === true,
    streak: int(d.streak, 0, 0, 1e6),
    lastDone: int(d.lastDone, 0, 0, 1e6),
    bestStreak: int(d.bestStreak, 0, 0, 1e6),
  };
}

function sanitizeLoadout(v: unknown, owned: ProgSave['owned']): Loadout {
  const l = isObj(v) ? v : {};
  const body = int(l.body, 0, 0, 5) as BodyId;
  const hat = int(l.hat, 0, 0, 8);
  const trail = int(l.trail, 0, 0, 5);
  const cat = typeof l.cat === 'string' && owned.cats.includes(l.cat) ? l.cat : null;
  return {
    body: owned.bodies.includes(body) ? body : 0,
    paint: int(l.paint, 0, 0, PAINT_PRESETS.length - 1),
    number: int(l.number, 7, 0, 99),
    hat: owned.hats.includes(hat) ? hat : 0,
    trail: owned.trails.includes(trail) ? trail : 0,
    cat,
  };
}

/**
 * Stored data (any shape, or undefined) → the current save. `core` is the shell's progress, read on first use only
 * (the v1 migration) and to keep the class unlock in step.
 */
export function migrateProg(raw: unknown, core?: Pick<Progress, 'races' | 'unlocked'> | null): ProgSave {
  const d = defaultProg();
  if (!isObj(raw) || raw.v !== 1) {
    // first load: bring a v1 player's progress over
    if (core) {
      d.classUnlocked = Math.max(0, Math.min(2, Math.floor(core.unlocked || 0))) as RaceClass;
      d.stats.races = Math.max(0, Math.floor(core.races || 0));
      d.stats.finishes = d.stats.races;
      d.fish = d.fishTotal = welcomeBackFish(d.stats.races);
    }
    return d;
  }
  const r = raw;
  const o = isObj(r.owned) ? r.owned : {};
  const owned = {
    bodies: [...new Set([0, 1, 2, ...nums(o.bodies, 0, 5)])].sort(),
    hats: [...new Set([0, ...nums(o.hats, 0, 8)])].sort(),
    trails: [...new Set([0, ...nums(o.trails, 0, 5)])].sort(),
    cats: strs(o.cats, 32),
  };
  const rivals: ProgSave['rivals'] = {};
  if (isObj(r.rivals))
    for (const [k, x] of Object.entries(r.rivals)) if (isObj(x) && k.length <= 32) rivals[k] = { w: int(x.w, 0, 0, 1e6), l: int(x.l, 0, 0, 1e6) };
  const cupRival = isObj(r.cupRival) && typeof r.cupRival.cupId === 'string' && typeof r.cupRival.name === 'string' ? { cupId: r.cupRival.cupId, name: r.cupRival.name } : null;
  const unlocked = Math.max(int(r.classUnlocked, 0, 0, 2), core ? Math.max(0, Math.min(2, Math.floor(core.unlocked || 0))) : 0) as RaceClass;
  return {
    v: 1,
    fish: int(r.fish, 0, 0, 1e9),
    fishTotal: int(r.fishTotal, 0, 0, 1e9),
    owned,
    equip: sanitizeLoadout(r.equip, owned),
    classUnlocked: unlocked,
    mirror: r.mirror === true,
    trophies: numRecord(r.trophies, 1, 3),
    medals: numRecord(r.medals, 1, 3),
    achievements: numRecord(r.achievements, 0, 1e6),
    stats: sanitizeStats(r.stats),
    bestLaps: numRecord(r.bestLaps, 0.01, 1e5),
    podiumTracks: strs(r.podiumTracks),
    racedTracks: strs(r.racedTracks),
    shortcutTracks: strs(r.shortcutTracks),
    rivals,
    lastRival: typeof r.lastRival === 'string' ? r.lastRival : null,
    cupRival,
    daily: sanitizeDaily(r.daily),
    ghostWins: int(r.ghostWins, -1, -1, 1e6),
    fresh: strs(r.fresh),
  };
}
