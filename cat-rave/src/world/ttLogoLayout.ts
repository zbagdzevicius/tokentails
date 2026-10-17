/**
 * Token Tails, the rave's host, in the world: where the hero sign and the booth-side marks sit. Pure data and
 * math (no three.js), so the layout tests can check it never covers the DJ, the Arc plate, the moon's centre
 * or an ad slot in the hero shot.
 *
 * Hero sign: the official lockup (ringed cat + TOKEN TAILS wordmark) hung behind and above the DJ booth, in
 * front of the upper half of the moon, its bottom edge just over the DJ's headphones. Phones (portrait) fit the
 * sign to the hero camera (portraitSignPose): a crown on the moon's top edge, under the HUD, clear of the DJ.
 * Booth sides: the cat mark on a dark plate on the left and right faces of the light box.
 */
import { MOON } from '../ads/slots';

/** Official lockup, client/public/logo/logo-text.webp (600 x 337), copied to public/brand/. */
export const TT_LOGO_FILE = 'brand/tokentails-logo.webp';
export const TT_LOGO_ASPECT = 600 / 337;
/** Official cat mark, client/public/logo/logo.webp (240 x 280). */
export const TT_CAT_FILE = 'brand/tokentails-cat.webp';
export const TT_CAT_ASPECT = 240 / 280;

export interface SignPose {
  /** Centre of the sign face (m). The face looks down +Z, towards the hero camera. */
  x: number;
  y: number;
  z: number;
  /** Face size (m), w / h = TT_LOGO_ASPECT. */
  w: number;
  h: number;
}

const pose = (bottom: number, h: number, z: number): SignPose => Object.freeze({ x: 0, y: bottom + h / 2, z, w: h * TT_LOGO_ASPECT, h });

/**
 * Landscape: 2 m tall from 4.6 m up, 4 m behind the booth centre. Portrait: 1.2 m tall from 4.3 m. High enough
 * that the high big-crowd hero camera (parallax pulls a near sign down the moon) never puts it over the moon's
 * centre; low enough for the low cat-eye phone camera to keep it under the HUD.
 */
export const TT_SIGN = Object.freeze({
  landscape: pose(4.6, 2.0, -4),
  portrait: pose(4.3, 1.2, -4),
});

export const ttSignPose = (portrait: boolean): SignPose => (portrait ? TT_SIGN.portrait : TT_SIGN.landscape);

/** The world moves the moon lower and further back on portrait screens (world/index.ts resize). */
export function moonFor(portrait: boolean, moon: { center: readonly [number, number, number]; radius: number } = MOON) {
  const c = moon.center;
  return {
    center: (portrait ? [c[0], c[1] - 8, c[2] * 1.2] : [c[0], c[1], c[2]]) as readonly [number, number, number],
    radius: moon.radius,
  };
}

/**
 * Portrait (phone) sign framing. A phone's narrow view changes a lot between the low cat-eye hero (few cats)
 * and the high hero over a big crowd, so the phone sign is fitted to the camera instead of hung at one height:
 * - width: `widthFrac` of the screen (readable at every crowd size, ~130 CSS px on a 390 px phone);
 * - height: crowning the moon's top edge (`crownOverlap` of the sign over the disc) when that edge is in view,
 *   else as high as the HUD allows (`topNdc`; the counter and the Arc pill cover the screen above ~0.46);
 * - never lower than `djClearDeg` over the DJ's headphones or (where there is room) `moonClearDeg` over the moon's centre: the sign
 *   shrinks rather than cover them. On a short phone (iPhone SE: ~60 px between the HUD and the DJ) a sign
 *   `minH` tall sits on that floor and may tuck under the HUD's bottom edge: the DJ always wins.
 */
export const PORTRAIT_FIT = Object.freeze({
  z: -4,
  widthFrac: 0.33,
  topNdc: 0.42,
  crownOverlap: 0.3,
  djClearDeg: 0.6,
  moonClearDeg: 0.6,
  minH: 0.5,
  maxH: 3.2,
});

/**
 * The phone HUD (raised total, next cat, status line, Arc pill; taller with the demo banner) is a fixed CSS
 * height, so a short phone loses more of its screen to it. Sign top limit (NDC) for a HUD whose bottom edge is
 * `hudBottomPx` down a viewport `heightPx` tall, with `HUD_GAP_PX` clear under it. The world measures the real
 * HUD (`.rv-counter`: 215 px on a 390 x 844 phone, 230 with the demo banner, 213 on a 375 x 667 phone).
 */
export const HUD_GAP_PX = 10;
export const PHONE_HUD_PX = 230;
export const hudTopNdc = (heightPx: number, hudBottomPx: number = PHONE_HUD_PX) =>
  Math.min(0.85, Math.max(0.05, 1 - (2 * (hudBottomPx + HUD_GAP_PX)) / Math.max(1, heightPx)));

export function portraitSignPose(cam: Cam, topNdc: number = PORTRAIT_FIT.topNdc): SignPose {
  const f = PORTRAIT_FIT;
  const rad = Math.PI / 180;
  const d = Math.max(1, cam.z - f.z);
  const tv = Math.tan((cam.fov / 2) * rad);
  const yAt = (elevDeg: number) => cam.y + d * Math.tan(elevDeg * rad);
  let h = Math.min(f.maxH, Math.max(f.minH, (f.widthFrac * 2 * d * tv * cam.aspect) / TT_LOGO_ASPECT));
  const m = moonFor(true);
  const mc = { x: m.center[0], y: m.center[1], z: m.center[2] };
  const moonCentre = elevation(mc, cam);
  const moonR = (Math.asin(m.radius / Math.hypot(mc.x - cam.x, mc.y - cam.y, cam.z - mc.z)) * 180) / Math.PI;
  const hudTop = yAt(cam.pitch + Math.atan(topNdc * tv) / rad);
  const top = Math.min(yAt(moonCentre + moonR) + h * (1 - f.crownOverlap), hudTop);
  // Elevations seen from the camera, converted to heights at the sign's depth.
  const dj = elevation({ x: 0, y: DJ_TOP_Y, z: 0 }, cam);
  const djFloor = yAt(dj + f.djClearDeg);
  // Keep off the moon's centre unless that leaves a sign under 60% of its width target (a short phone over a
  // big crowd, where the HUD hides the moon's top): then readability wins over the moon.
  const moonFloor = Math.max(djFloor, yAt(moonCentre + f.moonClearDeg));
  const floor = top - moonFloor >= 0.6 * h ? moonFloor : djFloor;
  if (top - h >= floor) return pose(top - h, h, f.z);
  if (top - floor >= f.minH) return pose(floor, top - floor, f.z);
  return pose(floor, f.minH, f.z);
}

/** Cat-mark plates on the booth's side faces (booth 2.4 x 1.1 x 1.2 m): plate size, height of its centre. */
export const TT_SIDE_PLATE = Object.freeze({ w: 0.66, h: 0.66, y: 0.6 });
/** Cat mark height on the plate (clear space round it). */
export const TT_SIDE_MARK_H = 0.5;

/**
 * Top of the DJ kitten (headphones and ears, at the beat's highest bob) in the hero shot (m). The DJ stands
 * at the booth centre; scale LAYOUT.djScale on a 1.1 m booth.
 */
export const DJ_TOP_Y = 2.75;

/** Beat pulse of the sign's brightness: a steady glow lifted on each kick, softer with reduced motion. */
export function signLevel(kick: number, energy: number, drop: number, reduced: boolean): number {
  const k = Math.min(1, Math.max(0, kick)) * (0.4 + 0.6 * Math.min(1, Math.max(0, energy)));
  const pulse = 0.22 * k + 0.08 * Math.min(1, Math.max(0, drop));
  return 1.1 + (reduced ? pulse * 0.4 : pulse);
}

export interface Cam {
  x: number;
  y: number;
  z: number;
  /** Pitch (deg, + up) of the view direction. */
  pitch: number;
  /** Vertical fov (deg) and aspect (w / h). */
  fov: number;
  aspect: number;
}

/** Vertical angle (deg, + up, relative to the horizon) of a point from a camera looking down -Z. */
export const elevation = (p: { y: number; z: number; x?: number }, cam: { x: number; y: number; z: number }) =>
  (Math.atan2(p.y - cam.y, Math.hypot((p.x ?? 0) - cam.x, cam.z - p.z)) * 180) / Math.PI;

/** Horizontal angle (deg, + right) of a point from a camera looking down -Z. */
export const azimuth = (p: { x: number; z: number }, cam: { x: number; z: number }) =>
  (Math.atan2(p.x - cam.x, cam.z - p.z) * 180) / Math.PI;

/** Screen NDC y (-1 bottom .. 1 top) of a world elevation (deg) for a camera. */
export function ndcY(elevDeg: number, cam: Cam): number {
  const rad = Math.PI / 180;
  return Math.tan((elevDeg - cam.pitch) * rad) / Math.tan((cam.fov / 2) * rad);
}

/** Angular box (deg) of the sign seen from a camera: left/right/bottom/top. */
export function signBox(s: SignPose, cam: { x: number; y: number; z: number }) {
  const left = azimuth({ x: s.x - s.w / 2, z: s.z }, cam);
  const right = azimuth({ x: s.x + s.w / 2, z: s.z }, cam);
  const bottom = elevation({ x: s.x, y: s.y - s.h / 2, z: s.z }, cam);
  const top = elevation({ x: s.x, y: s.y + s.h / 2, z: s.z }, cam);
  return { left, right, bottom, top };
}

/**
 * Fraction (0..1) of the moon's disc the sign's bounding box covers, seen from `cam` (sampled on a grid; the
 * lockup is a cut-out, so the real cover is smaller still).
 */
export function moonCover(
  s: SignPose,
  cam: { x: number; y: number; z: number },
  moon: { center: readonly [number, number, number]; radius: number },
): number {
  const c = { x: moon.center[0], y: moon.center[1], z: moon.center[2] };
  const mh = azimuth(c, cam);
  const mv = elevation(c, cam);
  const d = Math.hypot(c.x - cam.x, c.y - cam.y, cam.z - c.z);
  const r = (Math.asin(moon.radius / d) * 180) / Math.PI;
  const b = signBox(s, cam);
  let inDisc = 0;
  let covered = 0;
  const n = 120;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const h = mh - r + ((i + 0.5) / n) * 2 * r;
      const v = mv - r + ((j + 0.5) / n) * 2 * r;
      if (Math.hypot(h - mh, v - mv) > r) continue;
      inDisc += 1;
      if (h >= b.left && h <= b.right && v >= b.bottom && v <= b.top) covered += 1;
    }
  }
  return inDisc ? covered / inDisc : 0;
}
