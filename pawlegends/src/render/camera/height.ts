/**
 * Feel pass B1: the one camera setting, "Camera height" (Normal / High), replacing the old wheel, pinch and slider
 * zoom. It is a factor on the fixed framing distance (camera/frame.ts frameDist) and is remembered per device
 * (browser storage, a convenience only: missing or blocked storage gives Normal). On desktop the wheel switches
 * between the two steps.
 */
export type CameraHeight = 'normal' | 'high';
export const CAMERA_HEIGHTS: Readonly<Record<CameraHeight, number>> = Object.freeze({ normal: 1, high: 1.12 });
export const CAMERA_HEIGHT_KEY = 'pawlegends.camHeight.v1';
/** Window event sent by saveCameraHeight (detail: the step), so an open Settings row follows the wheel. */
export const CAMERA_HEIGHT_EVENT = 'pl:camheight';

export function loadCameraHeight(): CameraHeight {
  try {
    return localStorage.getItem(CAMERA_HEIGHT_KEY) === 'high' ? 'high' : 'normal';
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
export const heightFactor = (h: CameraHeight): number => CAMERA_HEIGHTS[h];

/** A desktop wheel turn: away from you (deltaY > 0) is High, toward you Normal; a zero delta keeps the step. */
export function wheelHeight(h: CameraHeight, deltaY: number): CameraHeight {
  if (deltaY > 0) return 'high';
  if (deltaY < 0) return 'normal';
  return h;
}
