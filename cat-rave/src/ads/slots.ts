/**
 * Moon Rave ad slots: 20 physical places in the world, $100 each. Same ids, kinds and pixel sizes as the
 * backend (backend/src/rave/ads/rave-ads.slots.ts; its spec checks this file). Pure data + math, no three.js.
 *
 * World: booth at the origin, hero camera on +Z looking towards -Z, the moon far away on -Z (radius 70 at
 * z = -260). Every slot keeps out of the hero camera's view of the moon and the DJ:
 *
 *   screens (2)   giant 16:9 LED screens flanking the stage, outside the moon's disc in the hero shot
 *   banners (6)   4:1 LED banners on short posts round the floor edge (ring r = 14), two-sided
 *   towers  (6)   1:3 wraps on 11 m laser towers further out (ring r = 21), two-sided
 *   blimps  (4)   2:1 screens under small blimps circling the floor; they climb over the hero sightline
 *                 to the moon instead of crossing it
 *   moon    (2)   3:1 banners hanging on a neon ring round the moon, left and right of its disc
 */

export type AdKind = 'screen' | 'banner' | 'tower' | 'blimp' | 'moon';

export const AD_KINDS: Readonly<Record<AdKind, { count: number; px: readonly [number, number]; label: string; short: string }>> = Object.freeze({
  screen: { count: 2, px: [1280, 720], label: 'Giant LED screen by the stage', short: 'Screen' },
  banner: { count: 6, px: [1200, 300], label: 'Floor-edge LED banner', short: 'Banner' },
  tower: { count: 6, px: [400, 1200], label: 'Laser tower wrap', short: 'Tower' },
  blimp: { count: 4, px: [1000, 500], label: 'Blimp over the crowd', short: 'Blimp' },
  moon: { count: 2, px: [1200, 400], label: 'Moon-ring banner', short: 'Moon ring' },
});

export const AD_PRICE_USD = 100;

/** The moon (config.ts LAYOUT.moon), kept here so this file stays three-free and testable. */
export const MOON = Object.freeze({ radius: 70, center: [0, 22, -260] as const });
/** Moon-ring radius: clear of the disc (70) by more than half a moon banner. */
export const MOON_RING_R = 92;
/**
 * Angle (deg, up from horizontal) of the moon-ring banners on the ring. Landscape: 18° (beside the disc;
 * at 30° a 16:9 laptop hero frame (1280x720) cut them off at the top edge). Portrait phones (aspect < PORTRAIT_ASPECT): 60°, closer to the top of the disc, so
 * both banners are inside the narrow hero frame instead of just past its edges.
 */
export const MOON_RING_DEG = Object.freeze({ landscape: 18, portrait: 60 });
export const PORTRAIT_ASPECT = 0.8;

/** Offset from the moon centre of moon-ring banner `index` (0 left, 1 right). */
export function moonRingOffset(index: number, portrait = false): readonly [number, number, number] {
  const side = index === 0 ? -1 : 1;
  const a = ((portrait ? MOON_RING_DEG.portrait : MOON_RING_DEG.landscape) * Math.PI) / 180;
  // z 31.5: in front of the ring's tube (z 30 ± 0.55), so the neon line never cuts through the banner.
  return [side * MOON_RING_R * Math.cos(a), MOON_RING_R * Math.sin(a), 31.5];
}

/** Where a slot shows up, for the purchase sheet (camera shots, SPEC.md "Shots"). */
export const AD_SEEN_IN: Readonly<Record<AdKind, string>> = Object.freeze({
  screen: 'Mostly desktop: hero shot, orbit and DJ moves (phones: only as the camera moves)',
  banner: 'Mostly desktop: orbit, crowd and top shots, round the floor (phones: only as the camera moves)',
  tower: 'Mostly desktop: orbit and wide shots, round the edge of the floor',
  blimp: 'Every device (desktop and phones): floats over the crowd in the hero, top and orbit shots as it passes',
  moon: 'Every device (desktop and phones): the hero shot, beside the moon',
});

export interface AdSlot {
  id: string;
  kind: AdKind;
  index: number;
  /** World size of the ad face (m), aspect = px aspect. */
  w: number;
  h: number;
  /** Centre of the ad face at rest (blimps: t = 0). Moon slots: offset from the moon centre. */
  pos: readonly [number, number, number];
  /** Rotation about +Y; the face normal is (sin yaw, 0, cos yaw). Blimps face the camera instead. */
  yaw: number;
  /** Shows the ad on both sides (free-standing banners, tower wraps, blimps). */
  twoSided: boolean;
  /** Blimps: orbit phase (rad). */
  phase?: number;
}

const yawTo = (from: readonly [number, number, number], to: readonly [number, number]) => Math.atan2(to[0] - from[0], to[1] - from[2]);

function build(): AdSlot[] {
  const out: AdSlot[] = [];
  const add = (kind: AdKind, index: number, s: Omit<AdSlot, 'id' | 'kind' | 'index'>) => out.push({ id: `${kind}-${index + 1}`, kind, index, ...s });
  const aspect = (k: AdKind) => AD_KINDS[k].px[0] / AD_KINDS[k].px[1];

  // Screens: left then right, angled towards the hero camera (~ (0, 3, 10)).
  [-1, 1].forEach((side, i) => {
    const pos = [side * 12.5, 4.6, -20] as const;
    add('screen', i, { w: 6, h: 6 / aspect('screen'), pos, yaw: yawTo(pos, [0, 10]), twoSided: false });
  });
  // Banners: ring r = 14, at ±40°, ±95°, ±140° from -Z, facing the booth. Bottom edge 1.25 m (over the cats).
  const bannerAngles = [-40, 40, -95, 95, -140, 140];
  bannerAngles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const pos = [Math.sin(a) * 14, 1.25 + 1.1 / 2, -Math.cos(a) * 14] as const;
    add('banner', i, { w: 1.1 * aspect('banner'), h: 1.1, pos, yaw: yawTo(pos, [0, 0]), twoSided: true });
  });
  // Towers: ring r = 21, at ±72°, ±116°, ±160°; wrap from 1.8 m to 6.3 m.
  const towerAngles = [-72, 72, -116, 116, -160, 160];
  towerAngles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const h = 4.5;
    const pos = [Math.sin(a) * 21, 1.8 + h / 2, -Math.cos(a) * 21] as const;
    add('tower', i, { w: h * aspect('tower'), h, pos, yaw: yawTo(pos, [0, 0]), twoSided: true });
  });
  // Blimps: four on one orbit, a quarter turn apart.
  for (let i = 0; i < 4; i += 1) {
    const phase = (i / 4) * Math.PI * 2;
    const p = blimpPosition(phase, 0);
    add('blimp', i, { w: 3.2, h: 3.2 / aspect('blimp'), pos: [p.x, p.y, p.z], yaw: 0, twoSided: true, phase });
  }
  // Moon ring: upper left and upper right of the disc (MOON_RING_DEG up the ring), slightly in front of the moon
  // (offsets from its centre), above the screens in the hero shot.
  [0, 1].forEach((i) => {
    add('moon', i, { w: 30, h: 10, pos: moonRingOffset(i), yaw: 0, twoSided: false });
  });
  return out;
}

/** Blimp orbit: centre (0, 5.6, 4), radius 15, one turn every `period` seconds. */
export const BLIMP_ORBIT = Object.freeze({ cx: 0, cz: 4, r: 15, y: 5.6, climb: 11, period: 140 });

/**
 * Blimp centre at orbit angle `phase` after `t` seconds. Past z = -2 (towards the moon) it climbs up to
 * 10 m, so from the hero camera it passes above the frame instead of over the moon.
 */
export function blimpPosition(phase: number, t: number): { x: number; y: number; z: number } {
  const o = BLIMP_ORBIT;
  const a = phase + (t / o.period) * Math.PI * 2;
  const x = o.cx + Math.sin(a) * o.r;
  const z = o.cz - Math.cos(a) * o.r;
  const k = Math.min(1, Math.max(0, (-z - 2) / 9));
  return { x, y: o.y + o.climb * k * k, z };
}

export const AD_SLOTS: readonly AdSlot[] = Object.freeze(build());
export const AD_SLOT_IDS: readonly string[] = Object.freeze(AD_SLOTS.map((s) => s.id));
export const adSlot = (id: string | null | undefined): AdSlot | null => AD_SLOTS.find((s) => s.id === id) ?? null;

/** Pixel aspect (w / h) of a slot's image. */
export const slotAspect = (s: { kind: AdKind }) => AD_KINDS[s.kind].px[0] / AD_KINDS[s.kind].px[1];

/** "Banner 3" style name for lists and the mini-map. */
export const slotLabel = (s: AdSlot) => `${AD_KINDS[s.kind].short} ${s.index + 1}`;

/**
 * Angular position (degrees) of a world point seen from `cam` looking along -Z, level: `h` left/right,
 * `v` up/down. Used by the layout tests to keep slots off the moon and the DJ in the hero shot.
 */
export function viewAngles(p: { x: number; y: number; z: number }, cam: { x: number; y: number; z: number }) {
  const dz = cam.z - p.z;
  return { h: (Math.atan2(p.x - cam.x, dz) * 180) / Math.PI, v: (Math.atan2(p.y - cam.y, Math.hypot(p.x - cam.x, dz)) * 180) / Math.PI, d: Math.hypot(p.x - cam.x, p.y - cam.y, dz) };
}

/** World centre of a slot at time `t` (moon slots: relative to `moonCenter`). */
export function slotCenter(
  s: AdSlot,
  t = 0,
  moonCenter: readonly [number, number, number] = MOON.center,
  portrait = false,
): { x: number; y: number; z: number } {
  if (s.kind === 'blimp') return blimpPosition(s.phase ?? 0, t);
  if (s.kind === 'moon') {
    const o = portrait ? moonRingOffset(s.index, true) : s.pos;
    return { x: moonCenter[0] + o[0], y: moonCenter[1] + o[1], z: moonCenter[2] + o[2] };
  }
  return { x: s.pos[0], y: s.pos[1], z: s.pos[2] };
}

/** Mini-map ring radius (fraction of the map) per kind: banners inside, then blimps, screens, towers. */
const MAP_RING: Record<Exclude<AdKind, 'moon'>, number> = { banner: 0.24, blimp: 0.31, screen: 0.34, tower: 0.42 };

/**
 * Mini-map position (0..1, top = far side / moon) of a slot, for the purchase sheet: each slot at its
 * world bearing from the booth, on a ring per kind so no two marks overlap.
 */
export function miniMapPoint(s: AdSlot): { x: number; y: number } {
  if (s.kind === 'moon') return { x: 0.5 + (s.pos[0] > 0 ? 0.3 : -0.3), y: 0.08 };
  const c = slotCenter(s, 0);
  const a = Math.atan2(c.x, -c.z);
  const r = MAP_RING[s.kind];
  return { x: 0.5 + Math.sin(a) * r, y: 0.55 - Math.cos(a) * r };
}
