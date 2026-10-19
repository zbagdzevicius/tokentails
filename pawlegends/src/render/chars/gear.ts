// Ported from Pink Paw Knight (swordcat) at commit 7714dcb: src/characters/Accessories.js, Armour.js, Sword.js (worn and held gear; TypeScript rewrite at low segment counts, not a copy)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
/**
 * Gear recipes for the chibi builder: armour, capes, hats, weapons. Each adds rigid pieces to the character's one
 * skinned mesh through the assembly context (chibi.ts `Assembly`), in bone bind space (H units, facing +Z, the
 * character's left is +X). Segment counts go through `A.seg` so Low builds lighter meshes.
 */
import * as THREE from 'three';
import { C, mat, mix, shade, type Assembly, type Col, type RGB } from './chibi';

export const STEEL = 0xc9d0d8;
export const STEEL_DARK = 0x8e96a2;
export const BRASS = 0xe8c27a;
export const LEATHER = 0x6b4429;
export const WOOD = 0xb08a55;
/** Kibble Corp uniform charcoal (close to but never the Woof navy 0x3d5a9e, so team-colour reads stay clean). */
export const KIBBLE = 0x34363f;

type Flat = number | string | RGB;
const rgbOf = (c: Col): RGB => (typeof c === 'function' ? [1, 1, 1] : Array.isArray(c) ? (c as RGB) : C(c as Flat as number));

/** Two-sided add for open shells (PPK `both`). */
function both(A: Assembly, bone: Parameters<Assembly['add']>[0], geo: THREE.BufferGeometry, m: THREE.Matrix4 | undefined, color: Col, inner?: Col): void {
  const back = flip(geo);
  A.add(bone, geo, { m, color });
  A.add(bone, back, { m, color: inner ?? (typeof color === 'function' ? color : mix(rgbOf(color), [0, 0, 0], 0.35)) });
}

function flip(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.clone() : geo.clone();
  if (g.index) {
    const idx = g.index.array as Uint16Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** PPK breastplate (lathe on the chest) with a gorget rim and an optional gold ':3' coin crest. */
export function breastplate(A: Assembly, o: { color?: number; trim?: number; coin?: boolean } = {}): void {
  const w = A.w;
  const prof = [[0.085, 0.3], [0.125, 0.335], [0.14, 0.4], [0.138, 0.48], [0.118, 0.56], [0.082, 0.615]].map(([r, y]) => new THREE.Vector2(r, y - 0.4));
  const g = new THREE.LatheGeometry(prof, A.seg(16, 8)).scale(1.08 * w, 1, 1.05 * (0.85 + 0.15 * w));
  A.add('chest', g, { color: o.color ?? STEEL });
  A.add('chest', new THREE.TorusGeometry(0.09 * w, 0.012, 4, A.seg(16, 8)), { m: mat([0, 0.212, 0], [Math.PI / 2, 0, 0], [1.08, 1.05, 1]), color: o.trim ?? BRASS });
  A.add('chest', new THREE.TorusGeometry(0.135 * w, 0.008, 3, A.seg(18, 8)), { m: mat([0, -0.06, 0], [Math.PI / 2, 0, 0], [1.08, 1.05, 1]), color: o.trim ?? BRASS });
  if (o.coin) {
    const z = 0.14 * 1.05 * (0.85 + 0.15 * w) + 0.004;
    A.add('chest', new THREE.CylinderGeometry(0.032, 0.032, 0.012, A.seg(12, 8)).rotateX(Math.PI / 2), { m: mat([0, 0.05, z]), color: 0xf2c94c });
    A.add('chest', new THREE.TorusGeometry(0.03, 0.005, 3, A.seg(12, 8)), { m: mat([0, 0.05, z + 0.006]), color: 0xd9a441 });
  }
}

/** Chunky toy-knight pauldrons (PPK Armour, one dome per side, brass rim). */
export function pauldrons(A: Assembly, color: Col, rim: Col = BRASS, k = 1): void {
  const w = A.w;
  for (const side of [1, -1]) {
    const r = 0.092 * k;
    const lm = new THREE.Matrix4().makeTranslation(side * 0.148 * w, 0.165, 0).multiply(mat([0, 0, 0], [0, 0, -side * 0.3]));
    A.add('chest', new THREE.SphereGeometry(r, A.seg(12, 7), A.seg(6, 4), 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.85, 1.08), { m: lm, color });
    A.add('chest', new THREE.TorusGeometry(r * 0.98, 0.012, 3, A.seg(14, 8)), { m: lm.clone().multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0], [1, 1.08, 1])), color: rim });
  }
}

/** A short shoulder mantle around the neck in the team colour: the big up-facing patch the iso camera reads. */
export function mantle(A: Assembly, color: Col, trim: Col, o: { r?: number; y?: number; drop?: number } = {}): void {
  const w = A.w;
  const r = o.r ?? 0.2;
  const g = new THREE.SphereGeometry(r, A.seg(16, 9), A.seg(5, 3), 0, Math.PI * 2, Math.PI * 0.2, Math.PI * (o.drop ?? 0.27)).scale(1.12 * w, 0.62, 0.95);
  both(A, 'chest', g, mat([0, o.y ?? 0.13, -0.01]), color);
  const rimY = Math.cos(Math.PI * (0.2 + (o.drop ?? 0.27))) * r * 0.62;
  const rimR = Math.sin(Math.PI * (0.2 + (o.drop ?? 0.27))) * r;
  A.add('chest', new THREE.TorusGeometry(rimR, 0.012, 3, A.seg(18, 10)), { m: mat([0, (o.y ?? 0.13) + rimY, -0.01], [Math.PI / 2, 0, 0], [1.12 * w, 0.95, 1]), color: trim });
}

/** Cape down the back (PPK sway cape as a rigid panel on the chest), with a trim hem. */
export function cape(A: Assembly, color: Col, hem: Col, o: { len?: number; top?: number; bot?: number } = {}): void {
  const w = A.w;
  const len = o.len ?? 0.34;
  const top = (o.top ?? 0.13) * w;
  const bot = (o.bot ?? 0.24) * w;
  const arc = 2.4;
  const g = new THREE.CylinderGeometry(top, bot, len, A.seg(10, 6), 2, true, Math.PI - arc / 2, arc);
  both(A, 'chest', g, mat([0, 0.19 - len / 2, -0.03]), (_v, _n, lp) => (lp.y < -len / 2 + 0.03 ? rgbOf(hem) : rgbOf(color)));
}

/**
 * Hood (PPK `hood`, a soft draped shell): a crown cap over the skull that stops short of the ears (they poke out of
 * it, so the cat silhouette survives the iso lens), a drape over the sides and back of the head with the face open
 * wide, and a soft tip falling to the nape. No brim: a rim there read as a bucket hat from above.
 */
export function hood(A: Assembly, color: Col, trim: Col): void {
  const at = mat([0, 0.168, -0.012], [-0.12, 0, 0], [1.1, 0.98, 1.06]);
  const crown = new THREE.SphereGeometry(0.192, A.seg(14, 9), A.seg(4, 3), 0, Math.PI * 2, 0, Math.PI * 0.2);
  both(A, 'head', crown, at, color);
  // the drape: sides and back from the crown to below the jaw, the front left open (+Z is the face)
  const open = 1.85;
  const drape = new THREE.SphereGeometry(0.2, A.seg(14, 8), A.seg(5, 3), Math.PI / 2 + open / 2, Math.PI * 2 - open, Math.PI * 0.2, Math.PI * 0.52);
  both(A, 'head', drape, at, (_v, _n, lp) => (lp.y < -0.11 ? rgbOf(trim) : rgbOf(color)));
  // a soft point falling to the nape
  A.add('head', new THREE.ConeGeometry(0.06, 0.17, A.seg(8, 5)), { m: mat([0, 0.25, -0.17], [-1.9, 0, 0]), color });
}

/** Knight helmet (Sir Brutus): a dome in `color` with a brass band, nasal and a crest of `plume`. */
export function helmet(A: Assembly, color: Col, band: Col, plume: Col, o: { y?: number; r?: number } = {}): void {
  const r = o.r ?? 0.2;
  const y = o.y ?? 0.2;
  A.add('head', new THREE.SphereGeometry(r, A.seg(16, 9), A.seg(7, 4), 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.12, 0.92, 1.08), { m: mat([0, y, -0.01]), color });
  A.add('head', new THREE.CylinderGeometry(r * 1.13, r * 1.15, 0.035, A.seg(16, 9), 1, true), { m: mat([0, y + 0.005, -0.01], [0, 0, 0], [1, 1, 0.96]), color: band });
  // crest: a row of rounded plume tufts over the top
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    A.add('head', new THREE.SphereGeometry(0.05, A.seg(6, 5), A.seg(5, 4)).scale(0.55, 1, 1), { m: mat([0, y + r * 0.9 + 0.04 - t * 0.03, 0.08 - t * 0.2]), color: plume });
  }
}

/** Kibble Corp security cap (PPK `sergeantCap`, bigger): crown in `color`, dark visor, brass band and badge. */
export function securityCap(A: Assembly, color: Col, o: { y?: number; r?: number; z?: number; crest?: Col } = {}): void {
  const r = o.r ?? 0.17;
  const y = o.y ?? 0.3;
  const z0 = o.z ?? -0.01;
  A.add('head', new THREE.CylinderGeometry(r * 1.05, r, 0.09, A.seg(14, 8)), { m: mat([0, y, z0], [0.12, 0, 0]), color });
  A.add('head', new THREE.SphereGeometry(r * 1.05, A.seg(14, 8), 3, 0, Math.PI * 2, 0, Math.PI * 0.3).scale(1, 0.5, 1), { m: mat([0, y + 0.03, z0], [0.12, 0, 0]), color });
  A.add('head', new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.012, A.seg(10, 6), 1, false, -0.95, 1.9), { m: mat([0, y - 0.035, z0 + 0.01 + r * 0.55], [0.35, 0, 0]), color: 0x1e2228 });
  A.add('head', new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.022, A.seg(14, 8), 1, true), { m: mat([0, y - 0.03, z0], [0.12, 0, 0]), color: BRASS });
  A.add('head', new THREE.CylinderGeometry(0.03, 0.03, 0.01, 6).rotateX(Math.PI / 2), { m: mat([0, y + 0.0, z0 + 0.01 + r * 1.02], [0.12, 0, 0]), color: 0xf2c94c });
  // a gold crest on the crown: the cap's mark from the iso camera (a pup guard's cap has none)
  if (o.crest !== undefined) {
    A.add('head', new THREE.OctahedronGeometry(0.05, 0).scale(1, 0.55, 1), { m: mat([0, y + 0.075, z0 + 0.01], [0, Math.PI / 4, 0]), color: o.crest });
    A.add('head', new THREE.TorusGeometry(r * 0.62, 0.012, 3, A.seg(12, 8)), { m: mat([0, y + 0.058, z0], [Math.PI / 2 + 0.12, 0, 0]), color: o.crest });
  }
}

/** A uniform jacket over the torso (Kibble Corp guards): chest and belly shells in `color` with brass buttons. */
export function jacket(A: Assembly, color: Col, o: { buttons?: boolean; chest?: boolean } = {}): void {
  const w = A.w;
  if (o.chest !== false) A.add('chest', new THREE.SphereGeometry(0.165, A.seg(12, 7), A.seg(9, 5)).scale(1.03 * w, 1.28, 0.95), { color });
  A.add('hips', new THREE.SphereGeometry(0.155, A.seg(12, 7), A.seg(8, 5)).scale(1.03 * w, 0.92, 0.98), { m: mat([0, 0.03, 0]), color });
  A.add('hips', new THREE.TorusGeometry(0.152 * w, 0.014, 3, A.seg(16, 8)), { m: mat([0, 0.02, 0], [Math.PI / 2, 0, 0], [1.04, 0.98, 1]), color: LEATHER });
  if (o.buttons !== false) for (const y of [0.0, 0.08]) A.add('chest', new THREE.SphereGeometry(0.012, 5, 4), { m: mat([0, y, 0.15]), color: BRASS });
}

/** A team armband on the left upper arm. */
export function armband(A: Assembly, color: Col): void {
  A.add('shoulderL', new THREE.CylinderGeometry(0.052, 0.052, 0.035, A.seg(10, 6), 1, true), { m: mat([0, -0.06, 0]), color });
}

/** Cloth tunic (squires, PPK `tunic`): a flared skirt on the hips and a chest shell. */
export function tunic(A: Assembly, color: Col, trim: Col): void {
  const w = A.w;
  A.add('chest', new THREE.SphereGeometry(0.165, A.seg(10, 6), A.seg(7, 4)).scale(1.03 * w, 1.26, 0.95), { color });
  const g = new THREE.CylinderGeometry(0.15 * w, 0.2 * w, 0.14, A.seg(10, 6), 1, true);
  both(A, 'hips', g, mat([0, -0.02, 0]), (_v, _n, lp) => (lp.y < -0.05 ? rgbOf(trim) : rgbOf(color)));
}

/** Clem's sword on the weapon socket (PPK Sword.js 'borrowed': extruded blade, brass guard, leather grip). */
export function sword(A: Assembly, o: { len?: number; blade?: number; guard?: number; wide?: number } = {}): void {
  const len = o.len ?? 0.7;
  const w0 = 0.041 * (o.wide ?? 1);
  const w1 = 0.031 * (o.wide ?? 1);
  const s = new THREE.Shape();
  s.moveTo(-w0, 0);
  s.lineTo(-w1, len - 0.1);
  s.lineTo(0, len);
  s.lineTo(w1, len - 0.1);
  s.lineTo(w0, 0);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -0.006);
  const bc = C(o.blade ?? 0xe8eef7);
  A.add('weapon', blade, { color: (_v, n, lp) => (Math.abs(n.z) < 0.5 ? mix(bc, [1, 1, 1], 0.4) : Math.abs(lp.x) < 0.008 && lp.y < len * 0.6 ? shade(o.blade ?? 0xe8eef7, 0.35) : bc) });
  A.add('weapon', new THREE.BoxGeometry(0.2, 0.026, 0.034), { m: mat([0, 0, 0]), color: o.guard ?? BRASS });
  A.add('weapon', new THREE.CylinderGeometry(0.016, 0.016, 0.11, 6), { m: mat([0, -0.06, 0]), color: LEATHER });
  A.add('weapon', new THREE.SphereGeometry(0.024, 6, 4), { m: mat([0, -0.128, 0]), color: o.guard ?? BRASS });
}

/** Short recurve bow in the left paw (PPK `shortBow`), plus a quiver on the back. */
export function shortBow(A: Assembly, wood: Col = 0x7a5230, grip: Col = 0x4a2e1f, pose?: string, at?: THREE.Vector3, tilt = 0): void {
  const half = 0.24;
  const belly = 0.06;
  const curl = 0.03;
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = (k / 10) * 2 - 1;
    pts.push(new THREE.Vector3(0, t * half, belly * (1 - t * t) - (curl * Math.max(0, Math.abs(t) - 0.75)) / 0.25));
  }
  // upright and facing forward at the left paw in `pose` (else PPK's paw-local placement)
  const m = pose && at ? A.posed('pawL', pose, mat([at.x, at.y, at.z], [0, 0, tilt])) : mat([0, -0.035, 0.03], [0.12, 0, 0]);
  A.add('pawL', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), A.seg(12, 8), 0.014, 4, false), { m, color: wood });
  A.add('pawL', new THREE.CylinderGeometry(0.018, 0.018, 0.07, 6), { m: m.clone().multiply(mat([0, 0, belly])), color: grip });
  // a bright, thick-enough string so the bow reads as a bow (not a stick) from the iso camera
  A.add('pawL', new THREE.CylinderGeometry(0.0065, 0.0065, half * 2, 3), { m: m.clone().multiply(mat([0, 0, -curl])), color: 0xfffbea });
}

export function quiver(A: Assembly, color: Col = LEATHER, fletch: Col = 0xffffff): void {
  A.add('chest', new THREE.CylinderGeometry(0.045, 0.04, 0.26, A.seg(8, 5)), { m: mat([0.06, 0.08, -0.17], [0.35, 0, -0.4]), color });
  for (let i = 0; i < 3; i++) A.add('chest', new THREE.ConeGeometry(0.02, 0.06, 3), { m: mat([0.1 + i * 0.014, 0.23 + (i % 2) * 0.01, -0.21 + i * 0.008], [0.35, 0, -0.4]), color: i === 1 ? 0xc2353b : fletch });
}

/** Huge round tower shield on the left paw (PPK `towerShield`): face in `color`, crest ring, rim, brass boss. */
export function towerShield(A: Assembly, color: Col, crest: Col, rim: Col = 0x8c6a4a, r = 0.3, pose?: string, at?: THREE.Vector3): void {
  // the face turned forward (+Z) and a little out to the left in `pose`; cylinder axis = +Y, so turn +Y to +Z
  const m = pose && at
    ? A.posed('pawL', pose, mat([at.x, at.y, at.z], [Math.PI / 2, 0.35, 0]))
    : new THREE.Matrix4().makeTranslation(0.05, -0.06, 0.07).multiply(mat([0, 0, 0], [0, -0.35, 0])).multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0]));
  const face = rgbOf(color);
  const cr = rgbOf(crest);
  A.add('pawL', new THREE.CylinderGeometry(r, r, 0.035, A.seg(16, 10), 1), {
    m,
    color: (v, n) => (n.y > 0.5 ? (Math.abs(Math.hypot(v.x, v.z) - r * 0.68) < 0.03 ? cr : face) : mix(face, [0, 0, 0], 0.3)),
  });
  A.add('pawL', new THREE.TorusGeometry(r, 0.022, 3, A.seg(18, 10)), { m: m.clone().multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0])), color: rim });
  A.add('pawL', new THREE.SphereGeometry(0.07, A.seg(8, 6), 3, 0, Math.PI * 2, 0, Math.PI / 2), { m: m.clone().multiply(mat([0, 0.016, 0])), color: BRASS });
}

/** Claw gauntlets (Cacklejaw): a dark cuff and three curved claws on each paw. */
export function clawGauntlets(A: Assembly, cuff: Col, claw: Col = 0xe3ebf4, k = 1): void {
  for (const s of ['L', 'R'] as const) {
    A.add(`paw${s}`, new THREE.SphereGeometry(0.056, A.seg(8, 5), A.seg(6, 4)).scale(1, 0.9, 1.1), { m: mat([0, -0.032, 0.006]), color: cuff });
    A.add(`elbow${s}`, new THREE.CylinderGeometry(0.052, 0.058, 0.06, A.seg(8, 5), 1, true), { m: mat([0, -0.085, 0]), color: BRASS });
    for (const dx of [-0.026, 0, 0.026]) A.add(`paw${s}`, new THREE.ConeGeometry(0.012 * k, 0.1 * k, 4), { m: mat([dx * k, -0.06 - 0.04 * k, 0.035 * k], [0.5, 0, 0]), color: claw });
  }
}

/** Armoured boots and gauntlets (heroes with plate): cover the coat feet and paws. */
export function boots(A: Assembly, color: Col, cuff: Col = BRASS): void {
  for (const s of ['L', 'R'] as const) {
    A.add(`foot${s}`, new THREE.SphereGeometry(1, A.seg(8, 6), 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.06, 0.06, 0.082), { m: mat([0, -0.03, 0.025]), color });
    A.add(`knee${s}`, new THREE.CylinderGeometry(0.055, 0.058, 0.035, A.seg(8, 5), 1, true), { m: mat([0, -0.075, 0]), color: cuff });
  }
}
export function gauntlets(A: Assembly, color: Col): void {
  for (const s of ['L', 'R'] as const) A.add(`paw${s}`, new THREE.SphereGeometry(0.054, A.seg(8, 5), A.seg(6, 4)).scale(1, 0.85, 1.05), { m: mat([0, -0.035, 0.006]), color });
}

/** Small held props for minions. */
export function woodenSword(A: Assembly): void {
  A.add('pawR', new THREE.BoxGeometry(0.035, 0.36, 0.014), { m: mat([0, 0.12, 0.05], [0.25, 0, 0]), color: WOOD });
  A.add('pawR', new THREE.BoxGeometry(0.11, 0.02, 0.026), { m: mat([0, -0.03, 0.02], [0.25, 0, 0]), color: 0x8a6440 });
}
/** A baton in the right paw (pup guards); with `tip`, Bengas's toasting fork: a long handle with an ember tip. */
export function baton(A: Assembly, color: Col = 0x22252c, tip: Col = BRASS, len = 0.3): void {
  A.add('pawR', new THREE.CylinderGeometry(0.018, 0.022, len, 5), { m: mat([0, 0.09 + (len - 0.3) / 2, 0.05], [0.25, 0, 0]), color });
  A.add('pawR', new THREE.SphereGeometry(0.026, 5, 3), { m: mat([0, 0.24 + (len - 0.3), 0.09 + (len - 0.3) * 0.25]), color: tip });
}

// Sim v9 shelter champions' gear (Lambo, Avietė, Bengas, Gabė), from their Token Tails card accessories.

/** Lambo's tangled festive lights: a cord across the chest and over a shoulder, octahedron bulbs in alternating colours. */
export function lightString(A: Assembly, cord: Col, bulbs: readonly Col[]): void {
  const w = A.w;
  const pts: THREE.Vector3[] = [];
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    // a loose diagonal loop from the left shoulder, round the front of the belly, up the back to the right shoulder
    const a = Math.PI * 0.15 + t * Math.PI * 1.7;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.17 * w, 0.17 - t * 0.2 + Math.sin(t * Math.PI) * 0.02, Math.sin(a) * 0.15 + 0.01));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  A.add('chest', new THREE.TubeGeometry(curve, A.seg(18, 10), 0.009, 3, false), { color: cord });
  const count = 7;
  for (let i = 0; i < count; i++) {
    const p = curve.getPoint((i + 0.5) / count);
    A.add('chest', new THREE.OctahedronGeometry(0.028, 0).scale(0.8, 1.15, 0.8), { m: mat([p.x * 1.08, p.y - 0.02, p.z * 1.08]), color: bulbs[i % bulbs.length] });
  }
}

/** Avietė's sparks (her card's coins): small bright octahedra floating at the shoulders and hips. */
export function sparkOrbs(A: Assembly, color: Col): void {
  const at: readonly (readonly [number, number, number])[] = [[0.22, 0.2, 0.06], [-0.22, 0.16, 0.08], [0.2, -0.02, -0.1], [-0.18, 0.02, -0.12]];
  for (const [x, y, z] of at) A.add('chest', new THREE.OctahedronGeometry(0.032, 0), { m: mat([x * A.w, y, z], [0.4, 0.6, 0]), color });
}

/** Bengas's camellia crown: a ring of flower heads with leaves round the top of the head. */
export function flowerCrown(A: Assembly, flower: Col, leaf: Col): void {
  const n = A.detail >= 0.7 ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sin(a) * 0.17;
    const z = Math.cos(a) * 0.16 - 0.01;
    A.add('head', new THREE.SphereGeometry(0.038, A.seg(6, 4), A.seg(4, 3)).scale(1, 0.7, 1), { m: mat([x, 0.22, z]), color: i % 2 === 0 ? flower : mix(rgbOf(flower), [1, 1, 1], 0.35) });
    A.add('head', new THREE.SphereGeometry(0.022, 4, 3).scale(1.6, 0.4, 0.8), { m: mat([x * 1.08, 0.205, z * 1.08], [0, -a, 0]), color: leaf });
  }
  A.add('head', new THREE.TorusGeometry(0.168, 0.008, 3, A.seg(14, 8)), { m: mat([0, 0.212, -0.01], [Math.PI / 2, 0, 0]), color: leaf });
}

/** Gabė's wings: two soft feathered panels on her back. */
export function wings(A: Assembly, color: Col): void {
  for (const side of [1, -1]) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(0.2, 0.16, 0.3, 0.06);
    s.quadraticCurveTo(0.24, 0.0, 0.27, -0.06);
    s.quadraticCurveTo(0.16, -0.06, 0.18, -0.13);
    s.quadraticCurveTo(0.08, -0.08, 0, 0);
    const g = new THREE.ShapeGeometry(s, 3);
    both(A, 'chest', g, mat([side * 0.05, 0.12, -0.16], [0.25, side > 0 ? -0.5 : Math.PI + 0.5, 0], [1, 1, 1]), color, mix(rgbOf(color), [0.8, 0.85, 1], 0.4));
  }
}

/** Gabė's heart balloon: a heart (two lobes and a point) floating above her right shoulder on a thin string. */
export function heartFloat(A: Assembly, color: Col): void {
  const y = 0.62;
  for (const side of [1, -1]) A.add('chest', new THREE.SphereGeometry(0.055, A.seg(8, 5), A.seg(6, 4)), { m: mat([-0.2 + side * 0.04, y, -0.05]), color });
  A.add('chest', new THREE.ConeGeometry(0.075, 0.1, A.seg(8, 5)), { m: mat([-0.2, y - 0.06, -0.05], [Math.PI, 0, 0]), color });
  A.add('chest', new THREE.CylinderGeometry(0.003, 0.003, 0.4, 3), { m: mat([-0.19, y - 0.31, -0.05], [0, 0, 0.05]), color: 0xfff6e8 });
}
export function yarnSling(A: Assembly, yarn: Col): void {
  A.add('pawR', new THREE.SphereGeometry(0.07, 6, 4), { m: mat([0, -0.07, 0.04]), color: yarn });
  A.add('pawR', new THREE.TorusGeometry(0.07, 0.008, 3, 8), { m: mat([0, -0.07, 0.04], [0.6, 0.4, 0]), color: mix(rgbOf(yarn), [0, 0, 0], 0.3) });
}
export function slingshot(A: Assembly): void {
  A.add('pawR', new THREE.CylinderGeometry(0.014, 0.014, 0.16, 4), { m: mat([0, 0.02, 0.04]), color: WOOD });
  for (const s of [1, -1]) A.add('pawR', new THREE.CylinderGeometry(0.012, 0.012, 0.09, 4), { m: mat([s * 0.03, 0.13, 0.04], [0, 0, -s * 0.45]), color: WOOD });
  A.add('pawR', new THREE.OctahedronGeometry(0.04, 0), { m: mat([0, 0.2, 0.02]), color: 0xd9a441 });
}
