/**
 * The modes lane's save slot (`save.slot('modes')`, core/app/save.ts): last picks, the kart look, a Grand Prix in
 * progress, trophies, time-trial records and ghosts, battle record. Device only. `migrateModes` accepts anything
 * (an older shape, garbage, undefined) and returns a valid current shape, so a bad blob never breaks the menu.
 */
import type { BodyId, CatSpec, KartLook, Personality } from '../types';
import { save } from '../core/app/save';
import { CUP_IDS, TRACK_IDS, type CupId } from '../content/ids';
import { isWildPick, type WildPick } from './mutators';

/** F13: at most two notches of comeback ease in a cup (gp/cup.ts EASE_NOTCH each). */
export const EASE_MAX = 2;

/** Class picks: 0..2 are the classes, 3 = Mirror (150cc numbers, mirrored tracks). */
export type ClassPick = 0 | 1 | 2 | 3;

/** One racer of a Grand Prix field (the same 8 cats race all four races). */
export interface CupRacer {
  name: string;
  cat: CatSpec;
  kart: KartLook;
  ai?: Personality;
  pinkPawId?: string;
  player?: boolean;
  hat?: number;
}

export interface CupRun {
  cupId: CupId;
  cls: ClassPick;
  seed: number;
  /** next race index 0..3 (4 = all raced, podium pending) */
  race: number;
  field: CupRacer[];
  /** points per field index */
  points: number[];
  /** place in the last race per field index (tie-break), 0 before race 1 */
  lastPlaces: number[];
  /** places per race per field index */
  history: number[][];
  /** field index of the rival, -1 = none */
  rival: number;
  /**
   * F13 comeback: notches the AI skill is eased by for the next race (0..EASE_MAX, gp/cup.ts). A 6th–8th place more
   * than 8 s back adds one, a win clears it. Applied when the grid is built; the field's own skills never change.
   */
  ease: number;
  /** what the last race did to the ease (the standings note): 'eased', 'restored' or '' */
  easeNews: '' | 'eased' | 'restored';
}

/** F13: the setup a menu tile starts in one tap, per mode (the racer is the cat id; see ModesSave.last). */
export interface ModeMemo {
  /** the cat picked on this mode's racer screen ('own', 'tofu' or a Pink Paw id); '' = the current look */
  cat: string;
  /** the mode's picks were made once (the tile starts at once from then on) */
  set: boolean;
}

export type MemoMode = 'gp' | 'race' | 'tt' | 'battle';
export const MEMO_MODES: readonly MemoMode[] = ['gp', 'race', 'tt', 'battle'];

export interface TtRecord {
  /** best time, seconds */
  best: number;
  /** SIM_VERSION the record (and its ghost) was set in */
  simVersion: number;
  /** encoded ghost (share ghost codec), absent when it did not fit or is from another version */
  ghost?: string;
  /** checkpoint split times of the best run, seconds */
  splits?: number[];
  /** best medal earned here: 0 none, 1 bronze, 2 silver, 3 gold */
  medal: number;
}

export type GhostPick = 'pb' | 'dev' | 'off';

export interface ModesSave {
  v: 1;
  /** the menu has been reached once (first boot runs the FTUE race instead) */
  menuSeen: boolean;
  last: { cls: ClassPick; cupId: CupId; ttTrack: string; ttCls: ClassPick; ghost: GhostPick; focus: string; quickTrack: string; quickCls: ClassPick; quickWild: WildPick };
  /** F13: per mode, the racer and whether its picks were made (class, cup and track picks are in `last`) */
  memo: Record<MemoMode, ModeMemo>;
  /** the player's racer: 'own' (the cat maker's cat), 'tofu' (default) or a Pink Paw id */
  look: { cat: string; body: BodyId; paint: number; hat: number; number: number };
  cup: CupRun | null;
  /** best trophy per `cupId:classPick`: 1 gold, 2 silver, 3 bronze */
  trophies: Record<string, number>;
  /** finished cups per `cupId:classPick` */
  cupsDone: Record<string, number>;
  /** time trial per `trackId:classPick` */
  tt: Record<string, TtRecord>;
  /** dev ghost times per `simVersion:trackSig:classPick` (cache, seconds; null = the dev bot did not finish) */
  devTimes: Record<string, number | null>;
  battle: { played: number; wins: number };
  /** last rival's name (the next GP picks another) */
  lastRival: string;
}

export const DEFAULT_MODES: ModesSave = {
  v: 1,
  menuSeen: false,
  last: { cls: 0, cupId: 'kibble', ttTrack: 'kitchen', ttCls: 0, ghost: 'pb', focus: 'gp', quickTrack: 'kitchen', quickCls: 0, quickWild: 'none' },
  memo: { gp: { cat: '', set: false }, race: { cat: '', set: false }, tt: { cat: '', set: false }, battle: { cat: '', set: false } },
  look: { cat: 'own', body: 0, paint: 0, hat: 0, number: 7 },
  cup: null,
  trophies: {},
  cupsDone: {},
  tt: {},
  devTimes: {},
  battle: { played: 0, wins: 0 },
  lastRival: '',
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const int = (v: unknown, d: number, lo: number, hi: number): number => Math.round(num(v, d, lo, hi));
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

function clsPick(v: unknown, d: ClassPick): ClassPick {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : d;
}

function numMap(v: unknown, lo: number, hi: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && isFinite(x)) out[k] = Math.max(lo, Math.min(hi, x));
  return out;
}

function migrateCup(v: unknown): CupRun | null {
  if (!isObj(v)) return null;
  const cupId = v.cupId as CupId;
  if (!CUP_IDS.includes(cupId)) return null;
  const field = Array.isArray(v.field) ? (v.field as CupRacer[]).filter((r) => isObj(r) && typeof r.name === 'string' && isObj(r.cat) && isObj(r.kart)) : [];
  if (field.length !== 8 || field.filter((r) => r.player).length !== 1) return null;
  const arr = (a: unknown) => (Array.isArray(a) && a.length === 8 ? a.map((x) => num(x, 0, 0, 999)) : new Array<number>(8).fill(0));
  const history = Array.isArray(v.history) ? (v.history as unknown[]).filter((h) => Array.isArray(h) && h.length === 8).map((h) => (h as unknown[]).map((x) => int(x, 8, 1, 8))) : [];
  const race = int(v.race, 0, 0, 4);
  return {
    cupId,
    cls: clsPick(v.cls, 0),
    seed: int(v.seed, 1, 0, 0x7fffffff),
    race,
    field,
    points: arr(v.points),
    lastPlaces: arr(v.lastPlaces),
    history: history.slice(0, race),
    rival: int(v.rival, -1, -1, 7),
    ease: int(v.ease, 0, 0, EASE_MAX),
    easeNews: v.easeNews === 'eased' || v.easeNews === 'restored' ? v.easeNews : '',
  };
}

/**
 * The per-mode memory. A save from before it (no `memo`) counts a mode as set when the player already raced it, so
 * a returning player's tiles start in one tap at once.
 */
function migrateMemo(v: unknown, raw: Record<string, unknown>): Record<MemoMode, ModeMemo> {
  const src = isObj(v) ? v : null;
  const out = {} as Record<MemoMode, ModeMemo>;
  const keys = (x: unknown) => (isObj(x) ? Object.keys(x).length : 0);
  const battle = isObj(raw.battle) ? raw.battle : {};
  const last = isObj(raw.last) ? raw.last : {};
  const before: Record<MemoMode, boolean> = {
    gp: keys(raw.cupsDone) > 0 || isObj(raw.cup) || keys(raw.trophies) > 0,
    race: typeof last.quickTrack === 'string' && (last.quickTrack !== DEFAULT_MODES.last.quickTrack || last.quickCls !== DEFAULT_MODES.last.quickCls),
    tt: keys(raw.tt) > 0,
    battle: typeof battle.played === 'number' && battle.played > 0,
  };
  for (const m of MEMO_MODES) {
    const x = src && isObj(src[m]) ? (src[m] as Record<string, unknown>) : {};
    out[m] = { cat: str(x.cat, '').slice(0, 32), set: src ? x.set === true : before[m] };
  }
  return out;
}

function migrateTt(v: unknown): Record<string, TtRecord> {
  const out: Record<string, TtRecord> = {};
  if (!isObj(v)) return out;
  for (const [k, r] of Object.entries(v)) {
    if (!isObj(r) || typeof r.best !== 'number' || !isFinite(r.best) || r.best <= 0) continue;
    out[k] = {
      best: r.best,
      simVersion: int(r.simVersion, 0, 0, 255),
      ghost: typeof r.ghost === 'string' && r.ghost.length < 20000 ? r.ghost : undefined,
      splits: Array.isArray(r.splits) ? (r.splits as unknown[]).filter((x): x is number => typeof x === 'number' && isFinite(x)).slice(0, 64) : undefined,
      medal: int(r.medal, 0, 0, 3),
    };
  }
  return out;
}

/** Any stored value → a valid current `ModesSave` (runs on every load, accepts its own output). */
export function migrateModes(raw: unknown): ModesSave {
  const d = DEFAULT_MODES;
  const v = isObj(raw) ? raw : {};
  const last = isObj(v.last) ? v.last : {};
  const look = isObj(v.look) ? v.look : {};
  const ttTrack = str(last.ttTrack, d.last.ttTrack);
  const quickTrack = str(last.quickTrack, d.last.quickTrack);
  const devTimes: Record<string, number | null> = {};
  if (isObj(v.devTimes)) for (const [k, x] of Object.entries(v.devTimes)) if (x === null || (typeof x === 'number' && isFinite(x) && x > 0)) devTimes[k] = x as number | null;
  const battle = isObj(v.battle) ? v.battle : {};
  return {
    v: 1,
    menuSeen: v.menuSeen === true,
    last: {
      cls: clsPick(last.cls, d.last.cls),
      cupId: CUP_IDS.includes(last.cupId as CupId) ? (last.cupId as CupId) : d.last.cupId,
      ttTrack: (TRACK_IDS as readonly string[]).includes(ttTrack) ? ttTrack : d.last.ttTrack,
      ttCls: clsPick(last.ttCls, d.last.ttCls),
      ghost: last.ghost === 'dev' || last.ghost === 'off' ? last.ghost : 'pb',
      focus: str(last.focus, d.last.focus).slice(0, 24),
      quickTrack: (TRACK_IDS as readonly string[]).includes(quickTrack) ? quickTrack : d.last.quickTrack,
      quickCls: clsPick(last.quickCls, d.last.quickCls),
      quickWild: isWildPick(last.quickWild) ? last.quickWild : d.last.quickWild,
    },
    memo: migrateMemo(v.memo, v),
    look: {
      cat: str(look.cat, d.look.cat).slice(0, 32),
      body: int(look.body, 0, 0, 5) as BodyId,
      paint: int(look.paint, 0, 0, 63),
      hat: int(look.hat, 0, 0, 8),
      number: int(look.number, 7, 0, 99),
    },
    cup: migrateCup(v.cup),
    trophies: numMap(v.trophies, 1, 3),
    cupsDone: numMap(v.cupsDone, 0, 1e6),
    tt: migrateTt(v.tt),
    devTimes,
    battle: { played: int(battle.played, 0, 0, 1e6), wins: int(battle.wins, 0, 0, 1e6) },
    lastRival: str(v.lastRival, '').slice(0, 24),
  };
}

export const modesSlot = () => save.slot<ModesSave>('modes', DEFAULT_MODES, migrateModes);

export const clsKey = (cupOrTrack: string, cls: ClassPick): string => `${cupOrTrack}:${cls}`;
