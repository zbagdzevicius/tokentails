/**
 * Feel pass B1: the one camera setting, "Camera height", replacing the old wheel, pinch and slider zoom. Five fixed
 * steps, closest first: Close 0.88, Normal 1 (the default), High 1.12, Higher 1.25, Max 1.4. It is a factor on the
 * fixed framing distance (camera/frame.ts frameDist), so the camera stays fixed on the hero at every step (no pinch,
 * no free zoom); only the distance changes. Remembered per device (browser storage, a convenience only: missing,
 * blocked or unknown storage gives Normal). On desktop each wheel notch or +/− moves one step, clamped at the ends.
 *
 * PvP: every step is allowed in PvP too (every player has the same setting, as in Mobile Legends). What a team sees
 * is decided in the sim (sim/map/brush.ts visibleTo: bushes and stealth, no distance fog), and the snapshot a seat
 * draws leaves hidden units out, so a further camera reveals nothing hidden.
 */
export type CameraHeight = 'close' | 'normal' | 'high' | 'higher' | 'max';
/** The steps, closest first. */
export const CAMERA_STEPS: readonly CameraHeight[] = Object.freeze(['close', 'normal', 'high', 'higher', 'max'] as const);
export const CAMERA_HEIGHTS: Readonly<Record<CameraHeight, number>> = Object.freeze({ close: 0.88, normal: 1, high: 1.12, higher: 1.25, max: 1.4 });
export const CAMERA_HEIGHT_LABELS: Readonly<Record<CameraHeight, string>> = Object.freeze({ close: 'Close', normal: 'Normal', high: 'High', higher: 'Higher', max: 'Max' });
/** The furthest step's factor: what view-sized bounds (shadow box, outer dressing) must cover. */
export const CAMERA_HEIGHT_MAX = CAMERA_HEIGHTS.max;
export const CAMERA_HEIGHT_KEY = 'pawlegends.camHeight.v1';
/** Window event sent by saveCameraHeight (detail: the step), so an open Settings row follows the wheel. */
export const CAMERA_HEIGHT_EVENT = 'pl:camheight';
/** Desktop wheel: a wheel event steps only after this long (ms) without wheel events (one step per notch or burst). */
export const WHEEL_STEP_MS = 140;

/** A stored or passed value as a step: any step name, anything else Normal. */
export function parseCameraHeight(v: unknown): CameraHeight {
  return typeof v === 'string' && (CAMERA_STEPS as readonly string[]).includes(v) ? (v as CameraHeight) : 'normal';
}

export function loadCameraHeight(): CameraHeight {
  try {
    return parseCameraHeight(localStorage.getItem(CAMERA_HEIGHT_KEY));
  } catch {
    return 'normal';
  }
}

export function saveCameraHeight(h: CameraHeight): void {
  try {
    localStorage.setItem(CAMERA_HEIGHT_KEY, h);
  } catch {
    /* storage blocked: the step is not remembered */
  }
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(CAMERA_HEIGHT_EVENT, { detail: h }));
}

/** The distance factor of a step. */
export const heightFactor = (h: CameraHeight): number => CAMERA_HEIGHTS[parseCameraHeight(h)];

/** One step further out (`dir` > 0) or closer (`dir` < 0), clamped at the ends (no wrap); 0 keeps the step. */
export function stepHeight(h: CameraHeight, dir: number): CameraHeight {
  const i = CAMERA_STEPS.indexOf(parseCameraHeight(h));
  const j = Math.max(0, Math.min(CAMERA_STEPS.length - 1, i + Math.sign(dir || 0)));
  return CAMERA_STEPS[j];
}

/** A desktop wheel notch or +/−: away from you (deltaY > 0) is one step further out, toward you one step closer. */
export function wheelHeight(h: CameraHeight, deltaY: number): CameraHeight {
  return stepHeight(h, deltaY);
}

/** Whether a wheel event at `now` (ms) may move a step, `last` being the time of the previous wheel event (any, stepped or not). */
export const wheelReady = (now: number, last: number): boolean => !(now - last < WHEEL_STEP_MS);
