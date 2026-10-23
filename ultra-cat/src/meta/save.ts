// Save data in localStorage. Owned by the META-UI lane. Pure apart from loadSave/writeSave (node-importable).
// CONTRACT: SAVE_KEY, defaultSave, migrate, loadSave, writeSave.
// migrate() accepts anything (null, garbage, older or future versions, partial objects, wrong types,
// unknown ids, out-of-range numbers), fills and clamps field by field, keeps the tabby owned and never throws.
import {
  CAT_ORDER,
  LEVEL_ORDER,
  SAVE_VERSION,
  UPGRADE_IDS,
  UPGRADE_MAX,
  type CatId,
  type CatProgress,
  type LevelProgress,
  type SaveData,
  type Settings,
} from '../core/types';

export const SAVE_KEY = 'ultracat.save';

/** Hard ceilings so a hand-edited save cannot overflow the UI. */
export const MAX_CATNIP = 9_999_999;
const MAX_COUNT = 1e9;
const MAX_DAMAGE = 1e12;

/** Phones start on LOW (no shadows, pixel ratio 1); desktops on HIGH. Node (tests) counts as desktop. */
const coarse = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

export function defaultSettings(): Settings {
  return { master: 1, music: 0.6, sfx: 1, shake: 1, quality: coarse() ? 'low' : 'high' };
}

export function defaultSave(): SaveData {
  const cats = {} as SaveData['cats'];
  for (const id of CAT_ORDER) cats[id] = { owned: id === 'tabby', upgrades: { power: 0, speed: 0, fur: 0, ultra: 0 } } satisfies CatProgress;
  return {
    v: SAVE_VERSION,
    catnip: 0,
    selectedCat: 'tabby',
    cats,
    levels: {},
    settings: defaultSettings(),
    tutorialDone: false,
    totals: { runs: 0, damage: 0, catnipEarned: 0 },
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A finite number clamped to [lo, hi], or the fallback. */
function num(v: unknown, lo: number, hi: number, fallback: number, int = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const n = int ? Math.floor(v) : v;
  return Math.min(hi, Math.max(lo, n));
}
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

function migrateSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  return {
    master: num(raw.master, 0, 1, d.master),
    music: num(raw.music, 0, 1, d.music),
    sfx: num(raw.sfx, 0, 1, d.sfx),
    shake: num(raw.shake, 0, 1, d.shake),
    quality: raw.quality === 'low' || raw.quality === 'high' ? raw.quality : d.quality,
  };
}

function migrateCat(id: CatId, raw: unknown): CatProgress {
  const upgrades = { power: 0, speed: 0, fur: 0, ultra: 0 };
  const owned = id === 'tabby' ? true : isObj(raw) ? bool(raw.owned, false) : false;
  if (isObj(raw) && isObj(raw.upgrades)) {
    for (const u of UPGRADE_IDS) upgrades[u] = num(raw.upgrades[u], 0, UPGRADE_MAX, 0, true);
  }
  return { owned, upgrades };
}

const countTrue = (a: readonly boolean[]) => a.reduce((n, b) => n + (b ? 1 : 0), 0);

function migrateLevel(raw: unknown): LevelProgress | null {
  if (!isObj(raw)) return null;
  const o = Array.isArray(raw.objectives) ? raw.objectives : [];
  const objectives: [boolean, boolean, boolean] = [o[0] === true, o[1] === true, o[2] === true];
  // a star per objective ever met: stars can never be below the objectives already collected
  const stars = Math.max(num(raw.stars, 0, 3, 0, true), countTrue(objectives));
  return { stars, objectives, best: num(raw.best, 0, MAX_DAMAGE, 0), plays: num(raw.plays, 0, MAX_COUNT, 0, true) };
}

/** Turn anything (older or future versions, partial or corrupt data, even a JSON string) into a valid SaveData. */
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
    // v0 (POC builds) had no versioned save; anything newer than us is read best-effort field by field.
    const cats = {} as SaveData['cats'];
    const rawCats = isObj(raw.cats) ? raw.cats : {};
    for (const id of CAT_ORDER) cats[id] = migrateCat(id, rawCats[id]);
    const levels: SaveData['levels'] = {};
    const rawLevels = isObj(raw.levels) ? raw.levels : {};
    for (const id of LEVEL_ORDER) {
      const lp = migrateLevel(rawLevels[id]);
      if (lp) levels[id] = lp;
    }
    const sel = raw.selectedCat;
    const selectedCat: CatId = typeof sel === 'string' && (CAT_ORDER as readonly string[]).includes(sel) && cats[sel as CatId].owned ? (sel as CatId) : 'tabby';
    const t = isObj(raw.totals) ? raw.totals : {};
    return {
      v: SAVE_VERSION,
      catnip: num(raw.catnip, 0, MAX_CATNIP, 0, true),
      selectedCat,
      cats,
      levels,
      settings: migrateSettings(raw.settings),
      tutorialDone: bool(raw.tutorialDone, false),
      totals: {
        runs: num(t.runs, 0, MAX_COUNT, 0, true),
        damage: num(t.damage, 0, MAX_DAMAGE, 0),
        catnipEarned: num(t.catnipEarned, 0, MAX_COUNT, 0, true),
      },
    };
  } catch {
    return defaultSave(); // getters that throw, proxies, anything weird
  }
}

export function loadSave(): SaveData {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? migrate(s) : defaultSave();
  } catch {
    return defaultSave();
  }
}

/** Returns false when storage is blocked or full (the game plays on without saving). */
export function writeSave(s: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
