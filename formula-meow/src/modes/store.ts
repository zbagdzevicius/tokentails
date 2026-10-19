/**
 * The modes lane's save slot (`save.slot('modes')`, core/app/save.ts): last picks, the kart look, a Grand Prix in
 * progress, trophies, time-trial records and ghosts, battle record. Device only. `migrateModes` accepts anything
 * (an older shape, garbage, undefined) and returns a valid current shape, so a bad blob never breaks the menu.
 */
import type { BodyId, CatSpec, KartLook, Personality } from '../types';
import { save } from '../core/app/save';
import { CUP_IDS, TRACK_IDS, type CupId } from '../content/ids';

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
}

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
  last: { cls: ClassPick; cupId: CupId; ttTrack: string; ttCls: ClassPick; ghost: GhostPick; focus: string };
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
  last: { cls: 0, cupId: 'kibble', ttTrack: 'kitchen', ttCls: 0, ghost: 'pb', focus: 'gp' },
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
  };
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
    },
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
