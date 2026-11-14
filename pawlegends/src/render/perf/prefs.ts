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

/**
 * Gaps round 3 (hud-controls): the match frame rate the player picks, 30 / 60 / 90 / 120 fps (Settings "Frame rate").
 * Per device (a display's refresh rate is the device's own, so it does not follow the account). 60 by default, as
 * before; Battery saver and the governor's 30 fps step still hold the match at 30 (app.ts). 90 and 120 are offered only
 * where the display refreshes that fast (`refreshHz`, measured from requestAnimationFrame at boot).
 */
export const FPS_CHOICES = Object.freeze([30, 60, 90, 120] as const);
export type FpsChoice = (typeof FPS_CHOICES)[number];
const FPS_KEY = 'pawlegends.fps';
const HZ_KEY = 'pawlegends.displayHz';
let fpsMem: FpsChoice | null = null;

export function matchFps(): FpsChoice {
  if (fpsMem) return fpsMem;
  try {
    const n = Number(localStorage.getItem(FPS_KEY));
    if ((FPS_CHOICES as readonly number[]).includes(n)) return (fpsMem = n as FpsChoice);
  } catch {
    /* blocked */
  }
  return (fpsMem = 60);
}

export function setMatchFps(f: FpsChoice): void {
  fpsMem = f;
  try {
    localStorage.setItem(FPS_KEY, String(f));
  } catch {
    /* storage blocked */
  }
}

/**
 * The display's refresh rate (Hz) from requestAnimationFrame intervals (ms): the median, snapped to a common rate
 * (60, 90, 120, 144; anything under 50 reads as 60, the floor every target supports). Pure.
 */
export function refreshFromIntervals(ms: readonly number[]): number {
  const ok = ms.filter((x) => x > 2 && x < 50).sort((a, b) => a - b);
  if (ok.length < 10) return 60;
  const hz = 1000 / ok[Math.floor(ok.length / 2)];
  const rates = [60, 75, 90, 120, 144, 165];
  let best = 60;
  for (const r of rates) if (Math.abs(hz - r) < Math.abs(hz - best)) best = r;
  return hz < 50 ? 60 : best;
}

/** The measured refresh rate this device last reported (60 until measured). */
export function refreshHz(): number {
  try {
    const n = Number(localStorage.getItem(HZ_KEY));
    return Number.isFinite(n) && n >= 60 && n <= 240 ? n : 60;
  } catch {
    return 60;
  }
}

export function saveRefreshHz(hz: number): void {
  try {
    localStorage.setItem(HZ_KEY, String(Math.round(hz)));
  } catch {
    /* storage blocked */
  }
}

/** The frame rates Settings offers on a display of `hz`: 30 and 60 always, 90 and 120 when the display keeps up. */
export function fpsChoicesFor(hz: number): FpsChoice[] {
  return FPS_CHOICES.filter((f) => f <= 60 || hz >= f - 5);
}

/** Tests: forget the in-memory copy. */
export function resetPerfPrefs(): void {
  mem = null;
  fpsMem = null;
}
