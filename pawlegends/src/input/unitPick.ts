/**
 * Body picking (TARGETING.md §2): which unit a click or a tap on the field lands on. Each unit is a selection
 * cylinder (League's model: a body radius and a height, separate from the sim's gameplay radius) standing where the
 * renderer DRAWS it (after the visual push-apart), projected to the screen as a capsule from feet to head with its
 * projected width. A point inside the capsule (or within a small pad outside it) hits the unit. A point inside a body
 * always beats a pad around another one (a click squarely on a minion next to a hero takes the minion). Where capsules
 * overlap, enemy heroes win (Wild Rift: a champion beats a minion under the same finger), then minions and monsters,
 * then structures; within a kind the body whose centre line is nearer wins, and the unit already targeted gets a
 * small hysteresis bonus so a pick in a clump does not flip between two bodies.
 *
 * The scoring core (`pickBody`) is pure and unit-tested; `screenBodies` does the three.js projection with one layout
 * read per pick. Client only: it decides which id a command carries, nothing in the sim.
 */
import * as THREE from 'three';
import type { EntitySnap } from '../sim/api';

type Kind = EntitySnap['kind'];

/** Selection cylinder per kind (m): radius and height. Heroes take their model's height when the view knows it. */
export const PICK_BODY: Readonly<Record<Kind, { r: number; h: number }>> = Object.freeze({
  hero: { r: 0.7, h: 2.7 },
  minion: { r: 0.5, h: 1.6 },
  tower: { r: 1.6, h: 6.2 },
  core: { r: 3, h: 5.5 },
  boss: { r: 1.5, h: 3.2 },
  camp: { r: 0.8, h: 1.7 },
  pudding: { r: 2, h: 3 },
  fountain: { r: 0, h: 0 },
  pickup: { r: 0, h: 0 },
});

/**
 * Pick tuning (px at a 1:1 canvas): `pad` is how far outside the drawn body a click still hits (heroes forgive more);
 * `bias` is subtracted from the score, so where bodies overlap the higher bias wins (a hero over a minion at up to
 * bias.hero − bias.minion px of difference); `stick` is the bonus for the unit already targeted (hysteresis).
 * Touch multiplies `pad` by `touchPad` (a fingertip is wider than a cursor).
 */
export const PICK = Object.freeze({
  pad: { hero: 18, unit: 8, structure: 6 },
  bias: { hero: 20, unit: 4, structure: 0 },
  stick: 6,
  touchPad: 1.5,
  /** Added to a pad-only hit (point outside the body), so any body that contains the point wins over it. */
  outside: 40,
});

const group = (k: string): 'hero' | 'unit' | 'structure' => (k === 'hero' ? 'hero' : k === 'tower' || k === 'core' ? 'structure' : 'unit');

/** A body on screen (client px): feet point, head point and the projected half width. */
export interface ScreenBody {
  fx: number;
  fy: number;
  hx: number;
  hy: number;
  r: number;
}

/** Distance (px) from (sx, sy) to the body's capsule; 0 inside it. `axis` gets the distance to the centre line. */
export function bodyGapPx(b: ScreenBody, sx: number, sy: number, out?: { axis: number }): number {
  const vx = b.hx - b.fx;
  const vy = b.hy - b.fy;
  const l2 = vx * vx + vy * vy;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((sx - b.fx) * vx + (sy - b.fy) * vy) / l2)) : 0;
  const axis = Math.hypot(sx - (b.fx + vx * k), sy - (b.fy + vy * k));
  if (out) out.axis = axis;
  return Math.max(0, axis - b.r);
}

export interface PickOpts {
  /** Multiplies the pads (touch: PICK.touchPad). */
  padScale?: number;
  /** The unit already targeted (lock, current attack): PICK.stick px of hysteresis. */
  prefer?: number | null;
}

const _ax = { axis: 0 };

/**
 * The unit under (sx, sy): the best-scoring candidate whose capsule (plus its kind's pad) contains the point, else
 * null. Score = gap − bias + a 0..3 px tie-break by the distance to the body's centre line − stick for `prefer`,
 * + PICK.outside when the point is only in the pad (outside the body).
 */
export function pickBody<T extends { id: number; kind: string }>(cands: readonly T[], bodyOf: (c: T) => ScreenBody | null, sx: number, sy: number, o: PickOpts = {}): T | null {
  const scale = o.padScale ?? 1;
  let best: T | null = null;
  let bs = Infinity;
  for (const c of cands) {
    const b = bodyOf(c);
    if (!b) continue;
    const g = group(c.kind);
    const gap = bodyGapPx(b, sx, sy, _ax);
    if (gap > PICK.pad[g] * scale) continue;
    let s = gap - PICK.bias[g] + Math.min(3, (3 * _ax.axis) / Math.max(1, b.r)) + (gap > 0 ? PICK.outside : 0);
    if (o.prefer != null && c.id === o.prefer) s -= PICK.stick;
    if (s < bs) {
      bs = s;
      best = c;
    }
  }
  return best;
}

const _v = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Where a unit is drawn (m, three.js x/z), and the height of its model (m) when the view knows it. */
export interface DrawnLookup {
  at(id: number, kind: string): { x: number; z: number } | null;
  height?(id: number, kind: string): number | undefined;
}

/**
 * A `bodyOf` for pickBody: projects each unit's selection cylinder where it is drawn (`look`, else its sim position
 * `x`/`y` mm). One getBoundingClientRect per call, not per unit (audit P7).
 */
export function screenBodies(camera: THREE.Camera, canvas: HTMLElement, look?: DrawnLookup): (u: { id: number; kind: string; x: number; y: number }) => ScreenBody | null {
  const rect = canvas.getBoundingClientRect();
  camera.updateMatrixWorld();
  _right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
  _right.normalize();
  const px = (x: number, y: number, z: number): { x: number; y: number; on: boolean } => {
    _v.set(x, y, z).project(camera);
    return { x: rect.left + (_v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-_v.y * 0.5 + 0.5) * rect.height, on: _v.z < 1 && _v.z > -1 };
  };
  return (u) => {
    const spec = PICK_BODY[u.kind as Kind];
    if (!spec || spec.h <= 0 || rect.width <= 0) return null;
    const d = look?.at(u.id, u.kind);
    const x = d && Number.isFinite(d.x) ? d.x : u.x / 1000;
    const z = d && Number.isFinite(d.z) ? d.z : -u.y / 1000;
    const h = look?.height?.(u.id, u.kind) ?? spec.h;
    const f = px(x, 0, z);
    if (!f.on) return null;
    const hd = px(x, h, z);
    const mid = px(x, h / 2, z);
    const side = px(x + _right.x * spec.r, h / 2, z + _right.z * spec.r);
    return { fx: f.x, fy: f.y, hx: hd.x, hy: hd.y, r: Math.hypot(side.x - mid.x, side.y - mid.y) };
  };
}
