// Save data in localStorage. Owned by the META-UI lane. Pure apart from loadSave/writeSave/clearSave (node-importable).
// CONTRACT (used by meta/dev.ts and the smoke test): SAVE_KEY, SAVE_VERSION, defaultSave, migrate, loadSave, writeSave,
// clearSave, isUnlocked, recordResult. migrate() accepts anything (null, garbage, older/future versions, partial
// objects, wrong types) and never throws.
// Version 2 (iteration 2, ITERATION2.md): settings.capture + settings.clipVertical, player, wardrobe, daily, ugcStats,
// trails. A v1 save migrates by filling those with defaults; nothing from v1 is lost.
import { BELLS, CAMPAIGN, STAGE_ORDER, UGC_STAGES, type QualityMode, type RunResult, type StageId } from '../core/types';

export const SAVE_KEY = 'meowrun.save';
export const SAVE_VERSION = 2;

/** clip capture: auto = on wherever MediaRecorder + canvas.captureStream exist (CLIP lane decides), on, off */
export type CaptureMode = 'auto' | 'on' | 'off';
/** the Wardrobe's equipped look: 6 base-36 chars, one per slot (src/wardrobe/look.ts) */
export const DEFAULT_LOOK_CODE = '000000';
export const NAME_MAX = 14;
export const TRAILS_MAX = 30;

export interface StageProgress {
  /** [finished, all 7 bells, score target] ever earned */
  stars: [boolean, boolean, boolean];
  best: number;
  bestBells: number;
  plays: number;
  finished: boolean;
}
export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: QualityMode;
  reducedMotion: boolean;
  shake: number;
  /** v2: rolling clip capture (CLIP lane) */
  capture: CaptureMode;
  /** v2: clips default to the vertical 9:16 crop */
  clipVertical: boolean;
}
/** v2: a course made in the Trail Maker (TRAILS lane owns the code format) */
export interface TrailEntry {
  code: string;
  name: string;
  best: number;
  /** finished at least once (a trail must be finished by its maker before it can be shared) */
  finished: boolean;
  /** Date.now() of the last edit */
  at: number;
}
/** v2: lifetime counters the Wardrobe unlocks read (each lane bumps its own) */
export interface UgcStats {
  bestChain: number;
  tricks: number;
  clips: number;
  photos: number;
  shares: number;
  challengesWon: number;
  dailyPlays: number;
  trailsFinished: number;
}
export interface SaveData {
  v: number;
  stages: Partial<Record<StageId, StageProgress>>;
  /** endless best distance and score */
  endlessBest: { score: number; distance: number };
  /** dev.unlockAll */
  unlockAll: boolean;
  settings: Settings;
  tutorialDone: boolean;
  endingSeen: boolean;
  totals: { runs: number; fish: number; distance: number };
  /** v2: the name shown on share cards, challenge links and ghosts ('' = not asked yet) */
  player: { name: string };
  /** v2: equipped look code + item keys the player has already seen (for NEW badges) */
  wardrobe: { look: string; seen: string[] };
  /** v2: today's Daily Run best (day = UTC 'YYYY-MM-DD'; a different day means no best yet) */
  daily: { day: string; best: number; distance: number };
  ugcStats: UgcStats;
  /** v2: the player's own trails, newest first */
  trails: { mine: TrailEntry[] };
}

const MAX = 1e12;

export function defaultSettings(): Settings {
  return { master: 1, music: 0.6, sfx: 1, quality: 'auto', reducedMotion: false, shake: 1, capture: 'auto', clipVertical: true };
}
export function defaultUgcStats(): UgcStats {
  return { bestChain: 0, tricks: 0, clips: 0, photos: 0, shares: 0, challengesWon: 0, dailyPlays: 0, trailsFinished: 0 };
}
export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    stages: {},
    endlessBest: { score: 0, distance: 0 },
    unlockAll: false,
    settings: defaultSettings(),
    tutorialDone: false,
    endingSeen: false,
    totals: { runs: 0, fish: 0, distance: 0 },
    player: { name: '' },
    wardrobe: { look: DEFAULT_LOOK_CODE, seen: [] },
    daily: { day: '', best: 0, distance: 0 },
    ugcStats: defaultUgcStats(),
    trails: { mine: [] },
  };
}

/** A display name safe for cards and links: letters, digits, space, _ . - only; trimmed; at most NAME_MAX chars. */
export function sanitizeName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
function num(v: unknown, lo: number, hi: number, fallback: number, int = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const n = int ? Math.floor(v) : v;
  return Math.min(hi, Math.max(lo, n));
}
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function migrateTrail(raw: unknown): TrailEntry | null {
  if (!isObj(raw) || typeof raw.code !== 'string' || !raw.code || raw.code.length > 600) return null;
  return {
    code: raw.code,
    name: sanitizeName(raw.name) || 'My trail',
    best: num(raw.best, 0, MAX, 0),
    finished: bool(raw.finished, false),
    at: num(raw.at, 0, 1e14, 0),
  };
}
function migrateStats(raw: unknown): UgcStats {
  const r = isObj(raw) ? raw : {};
  const d = defaultUgcStats();
  const out = { ...d };
  for (const k of Object.keys(d) as (keyof UgcStats)[]) out[k] = num(r[k], 0, MAX, 0, true);
  return out;
}

function migrateStage(raw: unknown): StageProgress | null {
  if (!isObj(raw)) return null;
  const st = Array.isArray(raw.stars) ? raw.stars : [];
  const stars: [boolean, boolean, boolean] = [st[0] === true, st[1] === true, st[2] === true];
  const finished = bool(raw.finished, false) || stars[0];
  return {
    stars,
    best: num(raw.best, 0, MAX, 0),
    bestBells: num(raw.bestBells, 0, BELLS, 0, true),
    plays: num(raw.plays, 0, MAX, 0, true),
    finished,
  };
}

/** Turn anything into a valid SaveData. */
export function migrate(raw: unknown): SaveData {
  try {
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        return defaultSave();
      }
    }
    const d = defaultSave();
    if (!isObj(raw)) return d;
    const stages: SaveData['stages'] = {};
    const rs = isObj(raw.stages) ? raw.stages : {};
    for (const id of STAGE_ORDER) {
      const p = migrateStage(rs[id]);
      if (p) stages[id] = p;
    }
    const s = isObj(raw.settings) ? raw.settings : {};
    const ds = d.settings;
    const eb = isObj(raw.endlessBest) ? raw.endlessBest : {};
    const t = isObj(raw.totals) ? raw.totals : {};
    const pl = isObj(raw.player) ? raw.player : {};
    const wr = isObj(raw.wardrobe) ? raw.wardrobe : {};
    const dy = isObj(raw.daily) ? raw.daily : {};
    const tr = isObj(raw.trails) ? raw.trails : {};
    const look = typeof wr.look === 'string' && /^[0-9a-z]{6}$/.test(wr.look) ? wr.look : DEFAULT_LOOK_CODE;
    const seen = Array.isArray(wr.seen) ? [...new Set(wr.seen.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 32))].slice(0, 300) : [];
    const mine = Array.isArray(tr.mine) ? tr.mine.map(migrateTrail).filter((x): x is TrailEntry => !!x).slice(0, TRAILS_MAX) : [];
    return {
      v: SAVE_VERSION,
      stages,
      endlessBest: { score: num(eb.score, 0, MAX, 0), distance: num(eb.distance, 0, MAX, 0) },
      unlockAll: bool(raw.unlockAll, false),
      settings: {
        master: num(s.master, 0, 1, ds.master),
        music: num(s.music, 0, 1, ds.music),
        sfx: num(s.sfx, 0, 1, ds.sfx),
        quality: s.quality === 'low' || s.quality === 'high' || s.quality === 'auto' ? s.quality : ds.quality,
        reducedMotion: bool(s.reducedMotion, ds.reducedMotion),
        shake: num(s.shake, 0, 1, ds.shake),
        capture: s.capture === 'on' || s.capture === 'off' || s.capture === 'auto' ? s.capture : ds.capture,
        clipVertical: bool(s.clipVertical, ds.clipVertical),
      },
      tutorialDone: bool(raw.tutorialDone, false),
      endingSeen: bool(raw.endingSeen, false),
      totals: { runs: num(t.runs, 0, MAX, 0, true), fish: num(t.fish, 0, MAX, 0, true), distance: num(t.distance, 0, MAX, 0) },
      player: { name: sanitizeName(pl.name) },
      wardrobe: { look, seen },
      daily: {
        day: typeof dy.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dy.day) ? dy.day : '',
        best: num(dy.best, 0, MAX, 0),
        distance: num(dy.distance, 0, MAX, 0),
      },
      ugcStats: migrateStats(raw.ugcStats),
      trails: { mine },
    };
  } catch {
    return defaultSave();
  }
}

/** meadow always; each campaign stage after the previous one is finished; endless after meadow. */
export function isUnlocked(save: SaveData, id: StageId): boolean {
  if (save.unlockAll || id === 'meadow') return true;
  // iteration 2: the Daily Run opens with endless; the Trail Maker is always open
  if (id === 'trail') return true;
  if (id === 'endless' || id === 'daily') return !!save.stages.meadow?.finished;
  const i = CAMPAIGN.indexOf(id);
  return i > 0 && !!save.stages[CAMPAIGN[i - 1]]?.finished;
}

/** Merge a run into the save (pure: returns a new object). */
export function recordResult(save: SaveData, r: RunResult): { save: SaveData; newBest: boolean; unlocked: StageId[] } {
  const next = migrate(JSON.parse(JSON.stringify(save)));
  const before = STAGE_ORDER.filter((id) => isUnlocked(next, id));
  next.totals.runs++;
  next.totals.fish += r.fish;
  next.totals.distance += r.distance;
  let newBest = false;
  // daily / trail runs: totals only (the SHARE lane keeps save.daily, the TRAILS lane keeps save.trails)
  if (UGC_STAGES.includes(r.stageId)) return { save: next, newBest, unlocked: [] };
  if (r.stageId === 'endless') {
    newBest = r.score > next.endlessBest.score;
    next.endlessBest = { score: Math.max(next.endlessBest.score, r.score), distance: Math.max(next.endlessBest.distance, r.distance) };
  }
  const p = next.stages[r.stageId] ?? { stars: [false, false, false], best: 0, bestBells: 0, plays: 0, finished: false };
  p.plays++;
  if (r.stageId !== 'endless') newBest = r.finished && r.score > p.best;
  if (r.finished) {
    p.finished = true;
    p.best = Math.max(p.best, r.score);
    p.bestBells = Math.max(p.bestBells, r.bellCount);
    p.stars = [p.stars[0] || r.stars[0], p.stars[1] || r.stars[1], p.stars[2] || r.stars[2]];
  }
  next.stages[r.stageId] = p;
  if (r.stageId === 'meadow' && r.finished) next.tutorialDone = true;
  const unlocked = STAGE_ORDER.filter((id) => isUnlocked(next, id) && !before.includes(id));
  return { save: next, newBest, unlocked };
}

export function loadSave(): SaveData {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? migrate(s) : defaultSave();
  } catch {
    return defaultSave();
  }
}
/** false when storage is blocked or full (the game plays on without saving) */
export function writeSave(s: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked */
  }
}
