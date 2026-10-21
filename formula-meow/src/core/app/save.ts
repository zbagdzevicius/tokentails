/**
 * Save (iteration 2 contract, integrator-owned): one versioned blob in localStorage, `fm:save` =
 * `{ v: 2, settings, slots }`. Each lane keeps its own slot (`modes`, `progression`, `audio-ui`, and the shell's
 * `core`), so lanes never write each other's data. Every read and write is guarded (private mode, blocked storage,
 * thumbnails): without storage the game runs with defaults for the session.
 *
 * Migration: the first load of v2 copies the v1 keys (`fm:settings`, `fm:progress`) in once; the v1 keys stay for a
 * release so a rollback loses nothing. Device-only: nothing is sent anywhere.
 */
import type { RaceClass } from '../../types';

export type Colourblind = 'off' | 'deut' | 'prot' | 'trit';

export interface Settings {
  autoGas: boolean;
  oneThumb: boolean;
  reducedMotion: boolean;
  muted: boolean;
  cls: RaceClass;
  // iteration 2
  musicVol: number;
  sfxVol: number;
  voiceVol: number;
  colourblind: Colourblind;
  highContrast: boolean;
  /** 1 = default; 0.85..1.5 */
  textScale: number;
  captions: boolean;
  haptics: boolean;
  /** 'en' (shipped) or 'xx' (pseudo-locale for QA) */
  lang: string;
}

/** The shell's own progress (FTUE counters, class unlocks, best times): the `core` slot. */
export interface Progress {
  races: number;
  /** highest unlocked class (GDD 5.4) */
  unlocked: RaceClass;
  /** FTUE: times each action was done (hints stop at 2) */
  pounces: number;
  drifts: number;
  /** best race time per `mode:track:class:modifiers` (B36; v1 keys `track:class` are migrated) */
  bestTimes: Record<string, number>;
}

export interface SaveBlob {
  v: 2;
  settings: Settings;
  slots: Record<string, unknown>;
}

const KEY = 'fm:save';
const V1 = { settings: 'fm:settings', progress: 'fm:progress' } as const;

const inAppWebview = typeof navigator !== 'undefined' && /Instagram|FBAN|FBAV|TikTok|musical_ly|Bytedance/i.test(navigator.userAgent);
const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  autoGas: false,
  oneThumb: true,
  reducedMotion: prefersReduced,
  muted: inAppWebview,
  cls: 0,
  musicVol: 0.8,
  sfxVol: 1,
  voiceVol: 1,
  colourblind: 'off',
  highContrast: false,
  textScale: 1,
  captions: false,
  haptics: true,
  lang: 'en',
}) as Settings;

export const DEFAULT_PROGRESS: Progress = Object.freeze({ races: 0, unlocked: 0, pounces: 0, drifts: 0, bestTimes: {} }) as Progress;

/** Best-time key (B36): Daily Cup and dares never mix with normal races. */
export function bestKey(mode: string, trackId: string, cls: number, modifiers: number): string {
  return `${mode}:${trackId}:${cls}:${modifiers}`;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readJson(s: StorageLike | null, k: string): unknown {
  try {
    const raw = s?.getItem(k);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** v1 progress → v2 `core` slot: best times keyed `track:class` become `race:track:class:0`. */
export function migrateProgressV1(v: unknown): Progress {
  const p = isObj(v) ? v : {};
  const bestTimes: Record<string, number> = {};
  if (isObj(p.bestTimes))
    for (const [k, t] of Object.entries(p.bestTimes)) {
      if (typeof t !== 'number' || !isFinite(t)) continue;
      const parts = k.split(':');
      if (parts.length === 2) bestTimes[bestKey('race', parts[0], Number(parts[1]) || 0, 0)] = t;
      else bestTimes[k] = t;
    }
  const num = (x: unknown, d: number) => (typeof x === 'number' && isFinite(x) ? x : d);
  const unlocked = Math.max(0, Math.min(2, Math.floor(num(p.unlocked, 0)))) as RaceClass;
  return { races: num(p.races, 0), unlocked, pounces: num(p.pounces, 0), drifts: num(p.drifts, 0), bestTimes };
}

function sanitizeSettings(v: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(isObj(v) ? v : {}) } as Settings;
  if (![0, 1, 2].includes(s.cls)) s.cls = 0;
  // a damaged volume falls back to its default (it used to become 0: silently muted)
  for (const k of ['musicVol', 'sfxVol', 'voiceVol'] as const) {
    const n = typeof s[k] === 'number' ? s[k] : Number.NaN;
    s[k] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_SETTINGS[k];
  }
  s.textScale = Math.max(0.85, Math.min(1.5, Number(s.textScale) || 1));
  if (!['off', 'deut', 'prot', 'trit'].includes(s.colourblind)) s.colourblind = 'off';
  if (typeof s.lang !== 'string') s.lang = 'en';
  return s;
}

/** Load the blob (migrating v1 once). Pure on the given storage, so it is unit tested. */
export function loadBlob(s: StorageLike | null = store()): SaveBlob {
  const cur = readJson(s, KEY);
  if (isObj(cur) && cur.v === 2) {
    return { v: 2, settings: sanitizeSettings(cur.settings), slots: isObj(cur.slots) ? { ...cur.slots } : {} };
  }
  const blob: SaveBlob = { v: 2, settings: sanitizeSettings(readJson(s, V1.settings)), slots: {} };
  const p1 = readJson(s, V1.progress);
  if (p1 != null) blob.slots.core = migrateProgressV1(p1);
  writeBlob(blob, s);
  return blob;
}

function writeBlob(b: SaveBlob, s: StorageLike | null = store()): boolean {
  try {
    if (!s) return false;
    s.setItem(KEY, JSON.stringify(b));
    return true;
  } catch {
    /* storage unavailable: this session only */
    return false;
  }
}

export interface SaveSlot<T> {
  get(): T;
  set(v: T): void;
  /** mutate and save */
  update(fn: (v: T) => void): T;
}

/**
 * The blob is cached for reads, but every write re-reads `fm:save` first and replaces only what it owns (one slot,
 * or the settings keys it changes): a second tab writing its own lanes' slots in the meantime keeps them. A
 * `storage` event from another tab drops the cache, and lanes that keep a slot in memory hear `onExternalChange`.
 */
export class Save {
  private blob: SaveBlob | null = null;
  private listeners: Array<(s: Settings) => void> = [];
  private external: Array<() => void> = [];

  constructor(private readonly storage: () => StorageLike | null = store) {}

  private get b(): SaveBlob {
    if (!this.blob) this.blob = loadBlob(this.storage());
    return this.blob;
  }

  /**
   * The blob as stored right now (another tab may have written since the cache was filled). Without readable
   * storage, or after a write that did not land (quota, blocked), the cache is the session's only copy: keep it.
   */
  private fresh(): SaveBlob {
    if (this.unsynced) return this.b;
    const cur = readJson(this.storage(), KEY);
    if (isObj(cur) && cur.v === 2) this.blob = { v: 2, settings: sanitizeSettings(cur.settings), slots: isObj(cur.slots) ? { ...cur.slots } : {} };
    return this.b;
  }

  /** true once a write failed: storage no longer holds this session's state */
  private unsynced = false;

  private write(): void {
    if (!writeBlob(this.b, this.storage())) this.unsynced = true;
  }

  settings(): Settings {
    return this.b.settings;
  }

  setSettings(next: Partial<Settings>): Settings {
    const b = this.fresh();
    b.settings = sanitizeSettings({ ...b.settings, ...next });
    this.write();
    for (const fn of this.listeners) fn(b.settings);
    return b.settings;
  }

  onSettings(fn: (s: Settings) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((x) => x !== fn));
  }

  /** Another tab wrote `fm:save`: lanes that keep a slot in memory reload it. */
  onExternalChange(fn: () => void): () => void {
    this.external.push(fn);
    return () => (this.external = this.external.filter((x) => x !== fn));
  }

  /** A `storage` event (key null = the whole storage was cleared). */
  storageChanged(key: string | null): void {
    if (key !== null && key !== KEY) return;
    this.blob = null;
    for (const fn of [...this.external]) {
      try {
        fn();
      } catch (err) {
        console.warn('[save] external change listener failed', err);
      }
    }
  }

  /**
   * A lane's slot. `migrate` turns whatever is stored (an older shape, or undefined on first use) into the current
   * shape; it runs on every load, so it must accept its own output.
   */
  slot<T>(name: string, defaults: T, migrate?: (stored: unknown) => T): SaveSlot<T> {
    const read = (b: SaveBlob): T => {
      const raw = b.slots[name];
      if (migrate) return migrate(raw);
      if (raw === undefined) return structuredCloneSafe(defaults);
      return isObj(raw) && isObj(defaults) ? ({ ...defaults, ...raw } as T) : (raw as T);
    };
    return {
      get: () => read(this.b),
      set: (v: T) => {
        this.fresh().slots[name] = v;
        this.write();
      },
      update: (fn: (v: T) => void) => {
        const b = this.fresh();
        const v = read(b);
        fn(v);
        b.slots[name] = v;
        this.write();
        return v;
      },
    };
  }

  /** Tests: forget the cached blob. */
  reset(): void {
    this.blob = null;
    this.unsynced = false;
  }
}

function structuredCloneSafe<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}

export const save = new Save();
try {
  if (typeof window !== 'undefined') window.addEventListener('storage', (e) => save.storageChanged(e.key));
} catch {
  /* no window (tests, workers) */
}

/** The shell's `core` slot (v1 progress lives here after migration). */
export const coreSlot = (): SaveSlot<Progress> => save.slot<Progress>('core', DEFAULT_PROGRESS, (raw) => (raw === undefined ? migrateProgressV1(readJson(store(), V1.progress)) : migrateProgressV1(raw)));
