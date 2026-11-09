/**
 * PERF-IOS P3-3 / P1-2: the per-device performance choices, kept in localStorage (they survive an app relaunch; the
 * old sessionStorage tier reset on every launch).
 *
 * - Battery saver (30 fps): a visible Settings row. Off by default; it turns on by itself (`by: 'auto'`) when the
 *   thermal governor sees sustained throttling or iOS Low Power Mode is on, unless the player chose it themselves
 *   (`by: 'user'`), which the game never overrides.
 * - The governor's last step, so a phone that ended a match hot starts the next one a step lower (one step cooler).
 * Storage may be blocked (private mode): every read falls back to the defaults, every write is best effort.
 */
const SAVER_KEY = 'pawlegends.batterySaver';
const STEP_KEY = 'pawlegends.perfStep';

export interface SaverPref {
  on: boolean;
  by: 'default' | 'user' | 'auto';
}

let mem: SaverPref | null = null;

export function batterySaver(): SaverPref {
  if (mem) return mem;
  try {
    const v = JSON.parse(localStorage.getItem(SAVER_KEY) ?? 'null') as Partial<SaverPref> | null;
    if (v && typeof v.on === 'boolean' && (v.by === 'user' || v.by === 'auto')) return (mem = { on: v.on, by: v.by });
  } catch {
    /* blocked or malformed */
  }
  return (mem = { on: false, by: 'default' });
}

function store(p: SaverPref): void {
  mem = p;
  try {
    localStorage.setItem(SAVER_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

/** The player's own choice (Settings). */
export function setBatterySaver(on: boolean): void {
  store({ on, by: 'user' });
}

/** The game turns it on (throttling, Low Power Mode). Returns true when it changed; a player's choice always wins. */
export function autoBatterySaver(): boolean {
  const p = batterySaver();
  if (p.by === 'user' || p.on) return false;
  store({ on: true, by: 'auto' });
  return true;
}

/**
 * The game's own Battery saver ends once its cause is gone (the governor above its 30 fps step, no Low Power Mode, the
 * OS not hot), so one warm session never locks a phone to 30 fps for good. A player's choice is never touched.
 * Returns true when it changed.
 */
export function releaseAutoSaver(): boolean {
  const p = batterySaver();
  if (p.by !== 'auto' || !p.on) return false;
  mem = { on: false, by: 'default' };
  try {
    localStorage.removeItem(SAVER_KEY);
  } catch {
    /* storage blocked */
  }
  return true;
}

export function savedPerfStep(): number {
  try {
    const n = Number(localStorage.getItem(STEP_KEY));
    return Number.isFinite(n) && n > 0 ? Math.min(6, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

export function savePerfStep(step: number): void {
  try {
    localStorage.setItem(STEP_KEY, String(Math.max(0, step | 0)));
  } catch {
    /* storage blocked */
  }
}

/** Tests: forget the in-memory copy. */
export function resetPerfPrefs(): void {
  mem = null;
}
