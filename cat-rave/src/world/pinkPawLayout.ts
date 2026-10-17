/**
 * Pink Paw, the shelter the rave raises money for, in the world: where its lit sign sits. Pure data and math (no
 * three.js), so the layout tests can check it never covers the DJ, the Token Tails sign, the Arc plate, the moon's
 * centre or an ad slot in the hero shot, and stays under the phone HUD.
 *
 * The sign: the shelter's round logo (a white disc) with a pink neon rim and a soft pink glow, and a small dark
 * caption plate under it ("ALL PROCEEDS → / PINK PAW SHELTER"). It floats on stage left, behind the booth and
 * the DJ, in front of the lower left of the moon. Landscape keeps one pose; phones (portrait) fit it to the hero
 * camera (`pinkPawPortraitPose`): in the gap between the screen's left edge and the DJ, under the HUD.
 */
import { AD_SLOTS, moonRingOffset } from '../ads/slots';
import { DJ_TOP_Y, moonFor, portraitSignPose, type Cam, type SignPose } from './ttLogoLayout';

/** The shelter's logo, client/public/logo/shelters/pink-paw.webp (400 x 400, round, transparent corners). */
export const PP_LOGO_FILE = 'brand/pink-paw-logo.webp';
export const PP_LOGO_ALT = 'Rožinė pėdutė (Pink Paw) shelter logo: a cat’s paw holding a daisy';
/** Caption lines on the plate under the logo. */
export const PP_CAPTION = Object.freeze(['ALL PROCEEDS →', 'PINK PAW SHELTER'] as const);

/**
 * Sign geometry in units of the disc's diameter (the sign group is scaled by the pose's `s`): disc centred on
 * the origin, the caption plate under it.
 */
export const PP_PARTS = Object.freeze({
  /** Neon rim round the disc (outer radius). */
  rim: 0.535,
  /** Soft glow quad (side). */
  glow: 1.9,
  caption: Object.freeze({ w: 1.12, h: 0.34, y: -0.5 - 0.07 - 0.17 }),
});
/** Extent of the sign (disc + rim + caption plate) round its origin, in disc diameters. */
export const PP_BOUNDS = Object.freeze({
  left: -Math.max(PP_PARTS.rim, PP_PARTS.caption.w / 2),
  right: Math.max(PP_PARTS.rim, PP_PARTS.caption.w / 2),
  top: PP_PARTS.rim,
  bottom: PP_PARTS.caption.y - PP_PARTS.caption.h / 2,
});

export interface PinkPawPose {
  /** Centre of the disc (m); the face looks down +Z towards the hero camera. */
  x: number;
  y: number;
  z: number;
  /** Disc diameter (m). */
  s: number;
}

/** World box (m) of the whole sign. */
export const ppBox = (p: PinkPawPose) => ({
  left: p.x + PP_BOUNDS.left * p.s,
  right: p.x + PP_BOUNDS.right * p.s,
  top: p.y + PP_BOUNDS.top * p.s,
  bottom: p.y + PP_BOUNDS.bottom * p.s,
  z: p.z,
});

/**
 * Landscape: stage left, 1.5 m behind the booth centre, a 1.35 m disc centred 2.65 m up. In the hero shot it
 * sits between the left edge of the DJ and the moon's left rim, under the Token Tails sign, above the crowd's
 * heads; the screens, moon-ring banners and blimps stay clear of it.
 */
export const PP_LANDSCAPE: PinkPawPose = Object.freeze({ x: -2.05, y: 2.65, z: -1.5, s: 1.35 });

/** Half width (m) of the DJ kitten with its headphones (djScale 1.75), for the phone fit's clearance. */
export const DJ_HALF_W = 0.72;

/**
 * Portrait (phone) fit, in screen terms: disc `widthFrac` of the screen width, its top `hudGapNdc` under the HUD,
 * centred at `cx` (NDC) unless that would reach within `djGapNdc` of the DJ or the Token Tails sign (then it moves
 * left, and shrinks if the gap is too narrow). The sign stays at depth `z`.
 */
export const PP_PORTRAIT_FIT = Object.freeze({
  z: -1.5,
  widthFrac: 0.25,
  cx: -0.6,
  edgeNdc: 0.94,
  djGapNdc: 0.05,
  hudGapNdc: 0.03,
  minS: 0.3,
  maxS: 3,
});

const RAD = Math.PI / 180;

/** Camera basis for a camera at `cam` looking down -Z, pitched by `cam.pitch` (deg). */
function basis(cam: Cam) {
  const p = cam.pitch * RAD;
  const tv = Math.tan((cam.fov / 2) * RAD);
  return { sp: Math.sin(p), cp: Math.cos(p), tv, th: tv * cam.aspect };
}

/** Screen NDC (x, y) and forward depth of a world point seen from a camera looking down -Z (yaw 0). */
export function project(pt: { x: number; y: number; z: number }, cam: Cam) {
  const { sp, cp, tv, th } = basis(cam);
  const dx = pt.x - cam.x;
  const dy = pt.y - cam.y;
  const dz = pt.z - cam.z;
  const depth = dy * sp - dz * cp;
  const up = dy * cp + dz * sp;
  return { x: dx / (th * depth), y: up / (tv * depth), depth };
}

/** World point on the plane z = `z` that the camera sees at NDC (nx, ny), and its forward depth. */
export function unproject(nx: number, ny: number, z: number, cam: Cam) {
  const { sp, cp, tv, th } = basis(cam);
  // Direction with a unit forward component: right * nx*th + up * ny*tv + forward.
  const dir = { x: nx * th, y: ny * tv * cp + sp, z: ny * tv * sp - cp };
  const t = (z - cam.z) / dir.z;
  return { x: cam.x + dir.x * t, y: cam.y + dir.y * t, z, depth: t };
}

/** NDC box of the sign seen from a camera. */
export function ppNdcBox(p: PinkPawPose, cam: Cam) {
  const b = ppBox(p);
  const tl = project({ x: b.left, y: b.top, z: b.z }, cam);
  const br = project({ x: b.right, y: b.bottom, z: b.z }, cam);
  return { left: tl.x, right: br.x, top: tl.y, bottom: br.y };
}

/** NDC x of the DJ's left edge (headphones), at the height of its head. */
export const djLeftNdc = (cam: Cam) => project({ x: -DJ_HALF_W, y: DJ_TOP_Y - 0.4, z: 0 }, cam).x;

/** NDC x of the Token Tails sign's left edge (its nearer corner on screen). */
export function ttLeftNdc(tt: SignPose, cam: Cam): number {
  const x = tt.x - tt.w / 2;
  return Math.min(project({ x, y: tt.y - tt.h / 2, z: tt.z }, cam).x, project({ x, y: tt.y + tt.h / 2, z: tt.z }, cam).x);
}

/** NDC box of the left moon-ring ad banner (`moon-1`, portrait placement) seen from a phone camera. */
export function moonAdNdcBox(cam: Cam) {
  const slot = AD_SLOTS.find((s) => s.kind === 'moon' && s.index === 0)!;
  const c = moonFor(true).center;
  const o = moonRingOffset(0, true);
  const p = { x: c[0] + o[0], y: c[1] + o[1], z: c[2] + o[2] };
  const tl = project({ x: p.x - slot.w / 2, y: p.y + slot.h / 2, z: p.z }, cam);
  const br = project({ x: p.x + slot.w / 2, y: p.y - slot.h / 2, z: p.z }, cam);
  return { left: tl.x, right: br.x, top: tl.y, bottom: br.y };
}

/**
 * NDC x of the rightmost edge of the fixed ad slots on the left of the stage (LED screen, floor banners, tower
 * wraps) that a camera sees on the screen's left side at the sign's height (NDC y `yMin`..`yMax`); -Infinity if none.
 * A far phone camera brings `screen-1` and `banner-1` into the frame's left edge.
 */
export function leftAdsRightNdc(cam: Cam, yMin = -0.4, yMax = 1): number {
  let right = -Infinity;
  for (const slot of AD_SLOTS) {
    if (slot.kind === 'blimp' || slot.kind === 'moon' || slot.pos[0] >= 0) continue;
    const rx = (Math.cos(slot.yaw) * slot.w) / 2;
    const rz = (-Math.sin(slot.yaw) * slot.w) / 2;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const p = project({ x: slot.pos[0] + sx * rx, y: slot.pos[1] + (sy * slot.h) / 2, z: slot.pos[2] + sx * rz }, cam);
        if (p.depth <= 0.1) continue;
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    if (xs.length < 4) continue;
    if (Math.max(...ys) < yMin || Math.min(...ys) > yMax || Math.min(...xs) > 0) continue;
    right = Math.max(right, Math.max(...xs));
  }
  return right;
}

export function pinkPawPortraitPose(cam: Cam, topNdc: number): PinkPawPose {
  const f = PP_PORTRAIT_FIT;
  const { tv, th } = basis(cam);
  const spanX = PP_BOUNDS.right - PP_BOUNDS.left; // sign width in disc diameters
  // NDC width of the sign at the wanted size; then fit it between the screen edge and the DJ.
  let w = f.widthFrac * 2 * spanX;
  const rightLimit = Math.min(djLeftNdc(cam), ttLeftNdc(portraitSignPose(cam, topNdc), cam)) - f.djGapNdc;
  // Left: the screen edge, or the right edge of a left-side ad slot a far camera brings into the frame.
  const leftLimit = Math.max(-f.edgeNdc, leftAdsRightNdc(cam) + f.djGapNdc);
  const room = rightLimit - leftLimit;
  if (w > room) w = Math.max(0.05, room);
  const cx = Math.max(leftLimit + w / 2, Math.min(f.cx, rightLimit - w / 2));
  // Under the HUD, and under the left moon-ring ad banner where it hangs over the same strip of screen.
  let top = topNdc - f.hudGapNdc;
  const ad = moonAdNdcBox(cam);
  if (ad.right > cx - w / 2 && ad.left < cx + w / 2) top = Math.min(top, ad.bottom - f.hudGapNdc);
  // Depth at the sign's plane: the disc's NDC height follows from its world size at that depth.
  // Iterate once for depth (it depends a little on the screen height through the camera's pitch).
  let depth = unproject(cx, top, f.z, cam).depth;
  let s = 0;
  let y = 0;
  let x = 0;
  for (let i = 0; i < 3; i += 1) {
    s = (w / spanX) * th * depth;
    s = Math.min(f.maxS, Math.max(f.minS, s));
    const discNdcH = s / (tv * depth);
    const centreNdcY = top - PP_BOUNDS.top * discNdcH;
    const pt = unproject(cx, centreNdcY, f.z, cam);
    depth = pt.depth;
    x = pt.x;
    y = pt.y;
  }
  return { x, y, z: f.z, s };
}

/** Beat pulse of the glow and rim (the disc itself stays a steady, readable white). */
export function ppGlowLevel(kick: number, energy: number, drop: number, reduced: boolean): number {
  const k = Math.min(1, Math.max(0, kick)) * (0.4 + 0.6 * Math.min(1, Math.max(0, energy)));
  const pulse = 0.35 * k + 0.15 * Math.min(1, Math.max(0, drop));
  return 1 + (reduced ? pulse * 0.4 : pulse);
}
