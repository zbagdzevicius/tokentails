/**
 * Desktop bindings (POC.md §9): PPK's `moba` preset (INPUT.presets.moba, lifted as data) remapped to MOBA defaults.
 * PPK gives right-click move, A attack-move and S stop; Pawlegends adds Q/W/E/R casts, D Paw Trick, B Nap, 1/2
 * talents, Space centre, Tab scoreboard and Esc menu. No binding uses Ctrl, Alt, Meta or an F-key.
 */
import { PPK_INPUT_PRESETS } from './ppkInput.data.js';

export type Action = 'move' | 'attackMove' | 'stop' | 'q' | 'w' | 'e' | 'r' | 'trick' | 'nap' | 'talent1' | 'talent2' | 'centre' | 'scoreboard' | 'menu';

type Keys = Record<string, readonly string[]>;
const ppk = ((PPK_INPUT_PRESETS as Record<string, { keys?: Keys }>).moba?.keys ?? {}) as Keys;

const only = (codes: readonly string[] | undefined, fallback: readonly string[]): string[] => {
  const ok = (codes ?? []).filter((c) => !/^(Control|Alt|Meta|F\d+)/.test(c));
  return ok.length > 0 ? ok : [...fallback];
};

/** action → event codes ('Mouse0' left, 'Mouse2' right). */
export const MOBA_BINDINGS: Readonly<Record<Action, readonly string[]>> = Object.freeze({
  move: only(ppk.move, ['Mouse2']),
  attackMove: only(ppk.attackMove, ['KeyA']),
  // PPK binds stop to S and H; H stays free in Pawlegends.
  stop: only(ppk.stop?.filter((c) => c === 'KeyS'), ['KeyS']),
  q: ['KeyQ'],
  w: ['KeyW'],
  e: ['KeyE'],
  r: ['KeyR'],
  trick: ['KeyD'],
  nap: ['KeyB'],
  talent1: ['Digit1'],
  talent2: ['Digit2'],
  centre: ['Space'],
  scoreboard: ['Tab'],
  menu: ['Escape'],
});

const BY_CODE = new Map<string, Action>();
for (const [a, codes] of Object.entries(MOBA_BINDINGS) as [Action, readonly string[]][]) for (const c of codes) if (!BY_CODE.has(c)) BY_CODE.set(c, a);

export const actionFor = (code: string): Action | null => BY_CODE.get(code) ?? null;

/** Display label of the first key bound to `a` ("Q", "Space", "RMB"). */
export function keyLabel(a: Action): string {
  const c = MOBA_BINDINGS[a][0] ?? '';
  if (c === 'Mouse2') return 'RMB';
  if (c === 'Mouse0') return 'LMB';
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (c === 'Escape') return 'Esc';
  return c;
}

// ---------------------------------------------------------------------------------------- control options

/**
 * Desktop control options (Settings): how Q/W/E/R/D cast and whether left-click moves. Quick cast is the default
 * from the first match (press = cast at the cursor); "Aim on hold" keeps press-to-aim, release-to-cast. Trackpad
 * mode (left-click moves and attacks, hold to steer) is Auto by default: it turns itself on for a player who clicks
 * the ground with the left button and never right-clicks (trackpadAutoRule). Browser storage, a convenience only:
 * it may be missing or throw, and the defaults are used then.
 */
export type CastMode = 'quick' | 'hold';
export type TrackpadPref = 'auto' | 'on' | 'off';
/** Desktop cursor size (Settings): Normal 32 px, Large 48 px. */
export type CursorSize = 'normal' | 'large';
/** Touch Attack button priority (Settings "Target first"): Heroes (default), Lowest HP %, Closest. */
export type TargetFirst = 'heroes' | 'lowest' | 'closest';

const CAST_KEY = 'pawlegends.castMode';
const PAD_KEY = 'pawlegends.trackpad';
/** Auto mode switched trackpad mode on once (it stays on in later matches; the toast shows only that once). */
const PAD_SEEN_KEY = 'pawlegends.trackpadSeen';
const CURSOR_KEY = 'pawlegends.cursorSize';
/** GAPS A5 (touch): what the Attack button hits first, and the optional last-hit and tower buttons (off by default). */
const TARGET_KEY = 'pawlegends.targetFirst';
const LASTHIT_KEY = 'pawlegends.lastHitButton';
const TOWER_KEY = 'pawlegends.towerButton';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage blocked: the choice lasts this page only */
  }
}

/** In-memory copy, so a blocked storage still keeps the choice for this page. */
const mem: { cast?: CastMode; pad?: TrackpadPref; seen?: boolean; cursor?: CursorSize; target?: TargetFirst; lastHit?: boolean; tower?: boolean } = {};

export function castMode(): CastMode {
  return mem.cast ?? (read(CAST_KEY) === 'hold' ? 'hold' : 'quick');
}

export function setCastMode(m: CastMode): void {
  mem.cast = m;
  write(CAST_KEY, m);
}

export function trackpadPref(): TrackpadPref {
  if (mem.pad) return mem.pad;
  const v = read(PAD_KEY);
  return v === 'on' || v === 'off' ? v : 'auto';
}

export function setTrackpadPref(p: TrackpadPref): void {
  mem.pad = p;
  write(PAD_KEY, p);
}

export function cursorSize(): CursorSize {
  return mem.cursor ?? (read(CURSOR_KEY) === 'large' ? 'large' : 'normal');
}

export function setCursorSize(c: CursorSize): void {
  mem.cursor = c;
  write(CURSOR_KEY, c);
}

/** Did Auto switch trackpad mode on (now or in an earlier match)? */
export function trackpadDetected(): boolean {
  return mem.seen ?? read(PAD_SEEN_KEY) === '1';
}

export function markTrackpadDetected(): void {
  mem.seen = true;
  write(PAD_SEEN_KEY, '1');
}

/** Left-click moves and attacks: On, or Auto once it has switched itself on. */
export const trackpadOn = (): boolean => {
  const p = trackpadPref();
  return p === 'on' || (p === 'auto' && trackpadDetected());
};

export function targetFirst(): TargetFirst {
  if (mem.target) return mem.target;
  const v = read(TARGET_KEY);
  return v === 'lowest' || v === 'closest' ? v : 'heroes';
}

export function setTargetFirst(t: TargetFirst): void {
  mem.target = t;
  write(TARGET_KEY, t);
}

/** The touch last-hit button (MLBB Advanced Aim): off by default. */
export function lastHitButton(): boolean {
  return mem.lastHit ?? read(LASTHIT_KEY) === '1';
}

export function setLastHitButton(on: boolean): void {
  mem.lastHit = on;
  write(LASTHIT_KEY, on ? '1' : '0');
}

/** The touch tower button: off by default. */
export function towerButton(): boolean {
  return mem.tower ?? read(TOWER_KEY) === '1';
}

export function setTowerButton(on: boolean): void {
  mem.tower = on;
  write(TOWER_KEY, on ? '1' : '0');
}

/** Tests: forget the in-memory copy (storage is read again). */
export function resetControlPrefs(): void {
  delete mem.cast;
  delete mem.pad;
  delete mem.seen;
  delete mem.cursor;
  delete mem.target;
  delete mem.lastHit;
  delete mem.tower;
}

/** Auto trackpad: how long the opening watch lasts (ms of match play) and how many left-clicks on the ground it needs. */
export const TRACKPAD_AUTO = Object.freeze({ ms: 8000, clicks: 2 });

/**
 * Auto trackpad rule: 'never' once the right button was pressed (a mouse player, never switched), 'switch' when the
 * player has played at least TRACKPAD_AUTO.ms and left-clicked the ground at least TRACKPAD_AUTO.clicks times
 * without a right-click, else 'wait'.
 */
export function trackpadAutoRule(s: { playMs: number; groundClicks: number; rightPressed: boolean }): 'switch' | 'never' | 'wait' {
  if (s.rightPressed) return 'never';
  return s.playMs >= TRACKPAD_AUTO.ms && s.groundClicks >= TRACKPAD_AUTO.clicks ? 'switch' : 'wait';
}
