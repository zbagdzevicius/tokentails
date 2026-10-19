/**
 * The "big hand" (GDD 3.3, feel lane): a human hand comes down, scoops the kart up, carries it to the spot the sim
 * will put it back on (the same sample, facing forward, `placeOnTrack` with the line offset clamped to ±2 m) and sets
 * it down over the 1.2 s respawn, then rises away. Render only: `carryPose` is a pure function of the respawn
 * progress, so the kart, the hand and the chase camera agree every frame.
 */
import { Group, Mesh, type Material, type Object3D } from 'three';
import { Surface } from '../../types';
import { PHYS } from '../../tuning';
import type { BuiltTrack } from '../track/build';
import { queryTrack, type TrackHit } from '../track/query';
import { GeoBuilder } from './geo';
import { toonMaterial } from './toon';

const SKIN = 0xf2c6a0;
const SKIN_D = 0xd9a77f;
const CUFF = 0x3aa8ff;

let mat: Material | null = null;
function handMaterial(): Material {
  if (!mat) {
    mat = toonMaterial({ vertexColors: true });
    mat.userData.shared = true;
  }
  return mat;
}

/**
 * A cartoon hand, palm down, fingers curled to cup a kart; origin at the palm centre, fingers toward +z, and the arm
 * reaching up out of the sky, leaning forward (away from the chase camera behind the kart, so it never fills the view).
 */
export function buildHand(): Object3D {
  const g = new GeoBuilder();
  g.box(1.4, 0.4, 1.3, SKIN, { y: 0.2 });
  // four fingers over the kart's nose, curled down at the tips
  for (let i = 0; i < 4; i++) {
    const x = -0.52 + i * 0.35;
    const len = i === 0 || i === 3 ? 0.55 : 0.7;
    g.cyl(0.15, 0.16, len, 7, SKIN, { x, y: 0.12, z: 0.65 + len / 2 - 0.05, rx: Math.PI / 2 });
    g.cyl(0.14, 0.15, 0.45, 7, SKIN_D, { x, y: -0.12, z: 0.65 + len - 0.05, rx: Math.PI / 2 + 1.0 });
  }
  // thumb on the right, angled down
  g.cyl(0.16, 0.18, 0.65, 7, SKIN, { x: 0.85, y: 0.0, z: 0.2, rz: 0.9, rx: 0.3 });
  // wrist going up, then the sleeve up into the sky
  g.cyl(0.42, 0.5, 0.8, 10, SKIN, { y: 0.75, z: -0.15, sz: 0.8 });
  g.cyl(0.58, 0.58, 0.45, 10, CUFF, { y: 1.3, z: -0.15, sz: 0.85 }, { vary: 0 });
  g.cyl(0.62, 0.62, 7, 10, CUFF, { y: 4.9, z: -0.15, sz: 0.85 });
  const m = new Mesh(g.build(), handMaterial());
  m.name = 'respawn-hand';
  const root = new Group();
  root.add(m);
  m.rotation.x = 0.4;
  return root;
}

export interface CarryPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** hand position (above the kart) and how open it is */
  hx: number;
  hy: number;
  hz: number;
  hVisible: boolean;
}

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road, wallL: 0, wallR: 0, branch: -1 };
const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const RESPAWN_TICKS = Math.round(PHYS.respawnDelay * 60);

/** Where the sim will put the kart back (mirrors `placeOnTrack(ctx, k, si, clamp(line[si], −2, 2))`). */
export function respawnSpot(t: BuiltTrack, si: number, out: { x: number; y: number; z: number; heading: number }): void {
  const i = ((si % t.n) + t.n) % t.n;
  const lat = Math.max(-2, Math.min(2, t.line[i]));
  out.x = t.px[i] - t.tz[i] * lat;
  out.z = t.pz[i] + t.tx[i] * lat;
  queryTrack(t, out.x, out.z, i, hit);
  out.y = hit.y;
  out.heading = Math.atan2(t.tx[i], t.tz[i]);
}

const to = { x: 0, y: 0, z: 0, heading: 0 };

/**
 * The carried pose at respawn progress `ticksLeft` (respawnTicks, counting down to 0), from the kart's frozen spot
 * `from` to the respawn spot on sample `si`.
 */
export function carryPose(t: BuiltTrack, si: number, from: { x: number; y: number; z: number; heading: number }, ticksLeft: number, out: CarryPose): CarryPose {
  respawnSpot(t, si, to);
  const p = 1 - Math.max(0, Math.min(1, ticksLeft / RESPAWN_TICKS));
  let dh = to.heading - from.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  if (p < 0.28) {
    // the hand comes down onto the kart
    const u = p / 0.28;
    out.x = from.x;
    out.y = from.y;
    out.z = from.z;
    out.heading = from.heading;
    out.hx = from.x;
    out.hz = from.z;
    out.hy = from.y + 1.5 + 9 * (1 - smooth(u)) * (1 - smooth(u));
  } else if (p < 0.86) {
    // up, over and down: an arc to the new spot, turning to face forward
    const u = smooth((p - 0.28) / 0.58);
    out.x = from.x + (to.x - from.x) * u;
    out.z = from.z + (to.z - from.z) * u;
    out.y = from.y + (to.y - from.y) * u + 3.4 * Math.sin(u * Math.PI);
    out.heading = from.heading + dh * u;
    out.hx = out.x;
    out.hz = out.z;
    out.hy = out.y + 1.5;
  } else {
    // set down, the hand lets go and rises
    const u = (p - 0.86) / 0.14;
    out.x = to.x;
    out.z = to.z;
    out.y = to.y + 0.35 * (1 - u);
    out.heading = to.heading;
    out.hx = to.x;
    out.hz = to.z;
    out.hy = to.y + 1.5 + 4 * u * u;
  }
  out.hVisible = true;
  return out;
}
