// Save data in localStorage. Owned by the META-UI lane. Pure apart from loadSave/writeSave/clearSave (node-importable).
// CONTRACT (used by meta/dev.ts and the smoke test): SAVE_KEY, SAVE_VERSION, defaultSave, migrate, loadSave, writeSave,
// clearSave, isUnlocked, recordResult. migrate() accepts anything (null, garbage, older/future versions, partial
// objects, wrong types) and never throws.
import { BELLS, CAMPAIGN, STAGE_ORDER, type QualityMode, type RunResult, type StageId } from '../core/types';

export const SAVE_KEY = 'meowrun.save';
export const SAVE_VERSION = 1;

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
}

const MAX = 1e12;

export function defaultSettings(): Settings {
  return { master: 1, music: 0.6, sfx: 1, quality: 'auto', reducedMotion: false, shake: 1 };
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
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
function num(v: unknown, lo: number, hi: number, fallback: number, int = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const n = int ? Math.floor(v) : v;
  return Math.min(hi, Math.max(lo, n));
}
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

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
      },
      tutorialDone: bool(raw.tutorialDone, false),
      endingSeen: bool(raw.endingSeen, false),
      totals: { runs: num(t.runs, 0, MAX, 0, true), fish: num(t.fish, 0, MAX, 0, true), distance: num(t.distance, 0, MAX, 0) },
    };
  } catch {
    return defaultSave();
  }
}

/** meadow always; each campaign stage after the previous one is finished; endless after meadow. */
export function isUnlocked(save: SaveData, id: StageId): boolean {
  if (save.unlockAll || id === 'meadow') return true;
  if (id === 'endless') return !!save.stages.meadow?.finished;
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
