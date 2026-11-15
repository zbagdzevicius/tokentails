/**
 * gaps6 coat drop: the evolving forms of the two new Mythic coats, as one vertex-coloured geometry per stage (render
 * only; render/skins/coatTrail.ts draws them in one instanced mesh round the hero and swaps the geometry when the stage
 * changes, the same stages as the Mythic parade: levels 4, 7, 10 or 2, 4, 6 takedowns).
 *
 * The local frame is the hero's: +X ahead (a model faces +X at rotation.y 0), +Y up, metres. `size` is the hero's drawn
 * height and half width (HeroView measures the built model), so the pieces sit round the body whatever the build.
 *
 * | Stage | Chairman of the Board (Sir Brutus)                | Mega Meal (Meatball)                                   |
 * |-------|---------------------------------------------------|--------------------------------------------------------|
 * | 1     | (the new hire: the mesh's tie and gold band only) | the slider: a patty ring with a pink glaze round him   |
 * | 2     | a green stock-chart arrow over his helmet         | the double: bun, two patties, cheese and lettuce       |
 * | 3     | + the gold office-chair back behind him           | a three-patty tower                                    |
 * | 4     | the full gold chair mech: seat, arms, five wheels | five patties, a floating top bun with flags, the tray  |
 * |       | and a giant gold fountain pen at his side         |                                                        |
 *
 * Widths are capped (the gallery review: "the throne is wide at MOBA zoom"): nothing reaches past 0.8 of the hero's
 * relation ring, so allies next to him stay visible.
 */
import * as THREE from 'three';

export const FORM_STAGES = 4;

export interface FormSize {
  /** Drawn height of the hero (m). */
  h: number;
  /** Half width of the hero's body (m). */
  r: number;
}

type Paint = (p: THREE.Vector3, n: THREE.Vector3) => number;

/** Bake a colour (a constant or per vertex) into a non-indexed copy with normals. */
function paint(g: THREE.BufferGeometry, f: number | Paint, m?: THREE.Matrix4): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (m) ng.applyMatrix4(m);
  ng.computeVertexNormals();
  const pos = ng.getAttribute('position');
  const nor = ng.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    c.setHex(typeof f === 'number' ? f : f(p, n));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g !== ng) g.dispose();
  return ng;
}

function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of gs) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of gs) {
    const c = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// ---------------------------------------------------------------------------------------------- Chairman of the Board

const GOLD = 0xf4c23a;
const GOLD_DEEP = 0xc08a24;
const VELVET = 0xd8486a;
const VELVET_DEEP = 0xa02848;
const CHART = 0x3ad06a;
const CHART_DEEP = 0x1f8a40;
const INK = 0x26222e;

/** The stock-chart arrow: a zig-zag line rising to an arrowhead, built twice (crossed) so it reads from any side. */
function chartArrow(s: FormSize, out: THREE.BufferGeometry[]): void {
  const y0 = s.h * 1.02;
  const k = s.h * 0.12;
  const pts: [number, number][] = [[-1.4, 0], [-0.5, 0.7], [0.1, 0.25], [1.1, 1.3]];
  for (const ry of [0, Math.PI / 2]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay) * k;
      const ang = Math.atan2(by - ay, bx - ax);
      const rot = new THREE.Matrix4().makeRotationY(ry);
      out.push(paint(new THREE.BoxGeometry(len, k * 0.28, k * 0.28), CHART, rot.clone().multiply(M(((ax + bx) / 2) * k, y0 + ((ay + by) / 2) * k, 0, 0, 0, ang))));
    }
    const head = new THREE.ConeGeometry(k * 0.45, k * 0.75, 4);
    const rot = new THREE.Matrix4().makeRotationY(ry);
    const [ex, ey] = pts[pts.length - 1];
    out.push(paint(head, CHART_DEEP, rot.multiply(M(ex * k, y0 + ey * k, 0, 0, 0, Math.atan2(1.05, 1) - Math.PI / 2))));
  }
}

/** The chair back behind him: a gold frame with a pink velvet cushion and a gold crest. */
function chairBack(s: FormSize, out: THREE.BufferGeometry[]): void {
  const w = Math.min(s.r * 1.5, s.h * 0.55);
  const x = -s.r * 0.85;
  const y0 = s.h * 0.2;
  const y1 = s.h * 0.82;
  const hgt = y1 - y0;
  out.push(paint(new THREE.BoxGeometry(s.h * 0.06, hgt, w), GOLD_DEEP, M(x, (y0 + y1) / 2, 0)));
  out.push(paint(new THREE.BoxGeometry(s.h * 0.05, hgt * 0.84, w * 0.8), (_p, n) => (n.x > 0.5 ? VELVET : VELVET_DEEP), M(x + s.h * 0.04, (y0 + y1) / 2, 0)));
  // the frame's rounded top and the crest
  out.push(paint(new THREE.CylinderGeometry(w / 2, w / 2, s.h * 0.07, 16, 1, false, 0, Math.PI), GOLD, M(x, y1, 0, 0, 0, Math.PI / 2, 1, 1, 0.45).multiply(M(0, 0, 0, 0, Math.PI / 2, 0))));
  out.push(paint(new THREE.OctahedronGeometry(s.h * 0.07, 0), GOLD, M(x, y1 + w * 0.25, 0, 0, 0, 0, 0.6, 1, 0.6)));
}

/** The full mech under him: the seat, the armrests, the gas-lift column, a five-star base on wheels and the pen. */
function chairMech(s: FormSize, out: THREE.BufferGeometry[]): void {
  const w = Math.min(s.r * 1.5, s.h * 0.55);
  const seatY = s.h * 0.2;
  out.push(paint(new THREE.BoxGeometry(s.r * 1.3, s.h * 0.06, w * 0.95), (_p, n) => (n.y > 0.5 ? VELVET : GOLD_DEEP), M(-s.r * 0.25, seatY, 0)));
  for (const side of [1, -1]) {
    out.push(paint(new THREE.BoxGeometry(s.r * 0.9, s.h * 0.05, s.h * 0.07), GOLD, M(-s.r * 0.35, s.h * 0.36, side * w * 0.5)));
    out.push(paint(new THREE.CylinderGeometry(s.h * 0.025, s.h * 0.025, s.h * 0.16, 6), GOLD_DEEP, M(-s.r * 0.1, s.h * 0.28, side * w * 0.5)));
  }
  out.push(paint(new THREE.CylinderGeometry(s.h * 0.04, s.h * 0.05, seatY - s.h * 0.05, 8), GOLD_DEEP, M(-s.r * 0.25, (seatY + s.h * 0.05) / 2, 0)));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const len = Math.min(s.r * 0.95, s.h * 0.34);
    const cx = -s.r * 0.25 + Math.cos(a) * len * 0.5;
    const cz = Math.sin(a) * len * 0.5;
    out.push(paint(new THREE.BoxGeometry(len, s.h * 0.035, s.h * 0.05), GOLD, M(cx, s.h * 0.055, cz, 0, -a, 0)));
    out.push(paint(new THREE.SphereGeometry(s.h * 0.04, 8, 5), INK, M(-s.r * 0.25 + Math.cos(a) * len, s.h * 0.035, Math.sin(a) * len)));
  }
  // the giant gold fountain pen standing at his right, nib down (the gallery's lance)
  const px = s.r * 0.15;
  const pz = -w * 0.62;
  out.push(paint(new THREE.CylinderGeometry(s.h * 0.035, s.h * 0.035, s.h * 0.62, 8), (p) => (Math.abs(p.y - s.h * 0.6) < s.h * 0.03 ? GOLD_DEEP : p.y > s.h * 0.75 ? GOLD : INK), M(px, s.h * 0.55, pz, 0.12, 0, 0)));
  out.push(paint(new THREE.ConeGeometry(s.h * 0.035, s.h * 0.14, 6).rotateX(Math.PI), GOLD, M(px, s.h * 0.17, pz - s.h * 0.03, 0.12, 0, 0)));
}

function boardStage(stage: number, s: FormSize): THREE.BufferGeometry | null {
  if (stage <= 1) return null;
  const out: THREE.BufferGeometry[] = [];
  chartArrow(s, out);
  if (stage >= 3) chairBack(s, out);
  if (stage >= 4) chairMech(s, out);
  return merge(out);
}

// ----------------------------------------------------------------------------------------------------- Mega Meal

const BUN = 0xe0a048;
const BUN_PALE = 0xf6d8a0;
const BUN_DEEP = 0xb8702a;
const PATTY = 0x6a3a1e;
const PATTY_HI = 0x8a4a26;
const CHEDDAR = 0xffc23a;
const LETTUCE = 0x6cc040;
const GLAZE = 0xff7aa8;
const TRAY = 0xf4c23a;
const TRAY_RIM = 0xb8202a;
const SESAME = 0xfff4dc;
const FLAG_A = 0xff6f91;
const FLAG_B = 0x5fb8ff;

/** One ring layer round his body: a torus at `y` (ring radius `rr`, tube `t`). */
function ring(out: THREE.BufferGeometry[], y: number, rr: number, t: number, color: number | Paint): void {
  out.push(paint(new THREE.TorusGeometry(rr, t, 6, 20).rotateX(Math.PI / 2), color, M(0, y, 0)));
}

function towerStage(stage: number, s: FormSize): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [];
  const R = s.r * 0.86;
  const t = Math.max(0.06, s.h * 0.055);
  const patty = (p: THREE.Vector3, n: THREE.Vector3): number => (Math.abs(n.y) > 0.6 ? PATTY_HI : Math.sin(Math.atan2(p.z, p.x) * 14) > 0.7 ? PATTY_HI : PATTY);
  const cheese = (y: number): void => {
    ring(out, y, R * 1.02, t * 0.35, CHEDDAR);
    for (const a of [0.4, 1.9, 3.3, 4.9]) out.push(paint(new THREE.ConeGeometry(t * 0.45, t * 1.6, 5).rotateX(Math.PI), CHEDDAR, M(Math.cos(a) * R * 1.08, y - t * 0.6, Math.sin(a) * R * 1.08)));
  };
  if (stage === 1) {
    // the slider: one patty ring with its pink glaze
    ring(out, s.h * 0.2, R, t * 1.3, patty);
    ring(out, s.h * 0.2 + t * 0.9, R * 0.98, t * 0.5, GLAZE);
    return merge(out);
  }
  // the bottom bun under every bigger form
  ring(out, s.h * 0.1, R * 0.98, t * 1.2, (_p, n) => (n.y < -0.3 ? BUN_DEEP : BUN));
  const layers = stage === 2 ? 2 : stage === 3 ? 3 : 5;
  // the tower stops under his chin so the face reads between the patties and the bun (the gallery's "face squashed
  // inside the tower, still readable")
  const top = stage === 4 ? s.h * 0.52 : stage === 3 ? s.h * 0.44 : s.h * 0.36;
  for (let i = 0; i < layers; i++) {
    const y = s.h * 0.1 + t * 1.6 + ((top - s.h * 0.1 - t * 1.6) * i) / Math.max(1, layers - 1);
    ring(out, y, R * (1 - i * 0.02), t * 1.05, patty);
    if (i < layers - 1 || stage === 2) cheese(y + t * 0.9);
  }
  if (stage === 2) {
    // the lettuce frill round the double
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out.push(paint(new THREE.ConeGeometry(t * 1.1, t * 1.8, 4).scale(1, 1, 0.3), LETTUCE, M(Math.cos(a) * R * 1.1, s.h * 0.42, Math.sin(a) * R * 1.1, 0, -a, Math.PI / 2 + 0.4)));
    }
  }
  if (stage === 4) {
    // the top bun floats over his head with two toothpick flags; the golden tray under him
    const bunY = s.h * 1.05;
    out.push(paint(new THREE.SphereGeometry(R * 0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.6, 1), (_p, n) => (n.y > 0.3 ? BUN : BUN_PALE), M(0, bunY, 0)));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39996;
      const k = R * 0.35 * Math.sqrt((i + 0.5) / 9);
      out.push(paint(new THREE.SphereGeometry(t * 0.18, 4, 3).scale(1, 0.5, 1.7), SESAME, M(Math.cos(a) * k, bunY + R * 0.3 * Math.sqrt(Math.max(0, 1 - (k / (R * 0.5)) ** 2)) + 0.01, Math.sin(a) * k, 0, a, 0)));
    }
    for (const [dz, c] of [[R * 0.18, FLAG_A], [-R * 0.18, FLAG_B]] as const) {
      out.push(paint(new THREE.CylinderGeometry(t * 0.08, t * 0.08, s.h * 0.35, 4), 0xe8d2a8, M(0, bunY + s.h * 0.2, dz)));
      out.push(paint(new THREE.BoxGeometry(s.h * 0.12, s.h * 0.07, t * 0.1), c, M(s.h * 0.06, bunY + s.h * 0.33, dz)));
    }
    const tw = Math.min(R * 2.1, s.r * 2.2);
    out.push(paint(new THREE.BoxGeometry(tw, s.h * 0.025, tw * 0.8), TRAY, M(0, s.h * 0.012, 0)));
    for (const [x, z, sx, sz] of [[0, tw * 0.4, tw, 0.08], [0, -tw * 0.4, tw, 0.08], [tw * 0.5, 0, 0.08, tw * 0.8], [-tw * 0.5, 0, 0.08, tw * 0.8]] as const)
      out.push(paint(new THREE.BoxGeometry(sx, s.h * 0.05, sz), TRAY_RIM, M(x, s.h * 0.03, z)));
  }
  return merge(out);
}

/** The geometry of `kind`'s form at `stage` (1..4) for a hero of `size`; null when the stage draws nothing. */
export function formGeometry(kind: 'board' | 'tower', stage: number, size: FormSize): THREE.BufferGeometry | null {
  return kind === 'board' ? boardStage(stage, size) : towerStage(stage, size);
}
