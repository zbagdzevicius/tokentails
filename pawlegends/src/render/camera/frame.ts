/**
 * Feel pass B1 (docs/plans/moba/FEEL-PASS.md): the match camera is FIXED, as in Mobile Legends. It follows the
 * player's hero rigidly (no lane lead, no look-ahead, no fight lean or pull-back, no zoom punch, no smoothing, no
 * pinch zoom, no map-edge clamp), so the hero always sits at the same screen spot (HERO_AT). The only other camera
 * movements are: the minimap hold-to-peek (returns in PEEK_RETURN_S), the aim pan of the longest skills (AIM_PAN),
 * and a capped shake (SHAKE_MAX_M). Render only.
 */

const DEG = Math.PI / 180;

/** Camera pitch (rad down from the horizon), the same at every distance. */
export const PITCH = 52 * DEG;
/** Vertical field of view (deg) in landscape. */
export const FOV = 36;
/** The hero's screen spot: share of the width from the left, share of the height from the top. */
export const HERO_AT = Object.freeze({ x: 0.5, y: 0.54 });
/**
 * Ground width (m) across the hero's row on landscape phones: 26 m at 667 CSS px wide, 30 m at 844, linear between
 * and clamped outside.
 */
export const PHONE_WIDTH = Object.freeze({ w0: 667, m0: 26, w1: 844, m1: 30 });
/** Desktop and tablet distance (m): 27.8 m of ground across the hero's row at 1440x900. */
export const DESKTOP_DIST = 26.7;
/** Portrait screens fit this much ground (m) across the hero's row. */
export const PORTRAIT_WIDTH = 18;
/** Minimap peek and aim pan: the camera returns to the hero over this long (s), easing out. */
export const PEEK_RETURN_S = 0.15;
/** Aim pan (only the longest skills): starts past this share of the visible half-width, at most `max` m. */
export const AIM_PAN = Object.freeze({ share: 0.85, max: 6 });
/** Camera shake: the most the view may move (m), and how long a kick lasts (s). */
export const SHAKE_MAX_M = 0.25;
export const SHAKE_MAX_S = 0.12;

/** Landscape phone (≤ 480 CSS px tall, at least 1.6:1). */
export const isPhoneLandscape = (w: number, h: number): boolean => h <= 480 && w / Math.max(1, h) >= 1.6;

/** tan of half the horizontal FOV for a `w` × `h` viewport. */
export function tanHalfH(w: number, h: number, fovDeg = FOV): number {
  return Math.tan((fovDeg * DEG) / 2) * (Math.max(1, w) / Math.max(1, h));
}

/** The ground width (m) a landscape phone shows across the hero's row, else null (desktop, tablet, portrait). */
export function phoneGroundWidth(w: number, h: number): number | null {
  if (!isPhoneLandscape(w, h)) return null;
  const P = PHONE_WIDTH;
  const k = Math.max(0, Math.min(1, (w - P.w0) / (P.w1 - P.w0)));
  return P.m0 + (P.m1 - P.m0) * k;
}

/**
 * Camera distance (m) to the hero for a `w` × `h` CSS px viewport at camera height 1: a phone fits its ground width
 * across the hero's row (D = width / (2·tan(hFov/2))), a portrait screen PORTRAIT_WIDTH, anything else DESKTOP_DIST.
 */
export function frameDist(w: number, h: number): number {
  const pw = phoneGroundWidth(w, h);
  if (pw !== null) return pw / (2 * tanHalfH(w, h));
  if (h > w) return PORTRAIT_WIDTH / (2 * tanHalfH(w, h));
  return DESKTOP_DIST;
}

/** Ground width (m) across the hero's row at distance `d`. */
export const groundWidthAt = (d: number, w: number, h: number): number => 2 * d * tanHalfH(w, h);

/**
 * The view offset (three.js setViewOffset `y`, CSS px) that puts the camera's focus HERO_AT.y down the screen: the
 * rendered window moves up by (HERO_AT.y − 0.5) of the height.
 */
export const viewOffsetY = (h: number): number => -(HERO_AT.y - 0.5) * h;
export const viewOffsetX = (w: number): number => -(HERO_AT.x - 0.5) * w;

/**
 * Aim pan (m) for a skill of `range` m when `halfWidth` m of ground shows on each side of the hero: 0 unless the
 * skill reaches past AIM_PAN.share of it, then the overshoot, at most AIM_PAN.max.
 */
export function aimPan(range: number, halfWidth: number): number {
  if (!(range > 0) || !(halfWidth > 0)) return 0;
  return Math.max(0, Math.min(AIM_PAN.max, range - AIM_PAN.share * halfWidth));
}

/** Ease-out share (1 → 0) of a peek or pan still applied `t` s after its release. */
export function returnShare(t: number, dur = PEEK_RETURN_S): number {
  if (!(t > 0)) return 1;
  if (t >= dur) return 0;
  const u = t / dur;
  return (1 - u) * (1 - u);
}
