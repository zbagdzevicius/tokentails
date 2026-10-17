/**
 * L-CROWD: one low-poly kitten standing upright on its hind legs, cheering with its mitten paws up at
 * its cheeks, merged into a single geometry with a per-vertex part id (`aPart`) so the vertex shader
 * can animate head, arms, ears, tail and the flag without bones. Local space: feet at y = 0, facing
 * +Z, about 1.05 tall to the ear tips (1.14 to the flag top). <= 400 triangles.
 *
 * Silhouette (Oct 17 reviews): raised forearms with pink-tipped paws read as phallic from behind, and
 * a stubby arm out to the side still read as a knob on a rod from above. Now there is no visible arm:
 * the round mitten paws sit right at the cheeks ("paws up" kitten pose), joined to the shoulder by a
 * stub the mitten almost hides. A chubby pear body, a big round head with two pointed ears, and a
 * thick tail that starts at the lower back and curls up like a question mark. The glowing beans are
 * on the palm (booth side) only; from behind the paws are plain fur, and a pink collar carries the glow.
 *
 * The flag (PART.pole + PART.cloth) is held in the cat's +X paw. Every cat has it in the mesh;
 * the shader collapses it to a point for cats without a country (`aFlag < 0`) and turns the cloth
 * round its pole towards the camera, so it is never seen edge-on as a sliver.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PART = { body: 0, head: 1, ear: 2, arm: 3, paw: 4, foot: 5, tail: 6, pole: 7, cloth: 8 } as const;

/** Shared with the impostor SDF and the shader pivots (keep in sync with shaders.ts). */
export const CAT_SHAPE = Object.freeze({
  /** Torso: short and chubby (kitten, not meerkat). */
  body: { y: 0.32, r: [0.175, 0.306, 0.161] as const },
  /** Big kitten head. */
  head: { y: 0.81, r: [0.22, 0.2, 0.21] as const },
  /** Shoulders just under the head. */
  shoulder: { x: 0.14, y: 0.58, z: 0.05 },
  /** Mitten paws at the cheeks, just in front of the head's sides (never above the ears). */
  paw: { x: 0.235, y: 0.68, z: 0.12, r: 0.095 },
  /**
   * The stub joining mitten and shoulder, thinner than the mitten (0.06 vs 0.095) and almost
   * hidden by it: no arm to read as a rod from any side.
   */
  armR: 0.06,
  ear: { x: 0.145, y: 0.97 },
  neckY: 0.64,
  /** Pink glowing collar band on the body under the head (local y range). */
  collar: { y0: 0.53, y1: 0.585 },
  /** Tail root on the lower back (the curl pivots here). */
  tail: { y: 0.24, z: -0.13 },
  /**
   * The flag in the +X paw: a short pole through the mitten, clear of the ear, the cloth flying
   * outwards from its top just above ear height. Cloth aspect 3:2 (matches the atlas cells).
   */
  flag: { x: 0.25, z: 0.12, y0: 0.6, y1: 1.14, poleR: 0.012, w: 0.24, h: 0.16 },
});

function tag(g: BufferGeometry, part: number): BufferGeometry {
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  return g;
}

/** A copy of `g` facing the other way (winding and normals flipped): the back of a one-sided plane. */
function backFace(g: BufferGeometry): BufferGeometry {
  const b = g.clone();
  const idx = b.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  const n = b.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return b;
}

export interface CatGeometryOptions {
  /** Include the flag pole and cloth (default true; holograms leave it out). */
  flag?: boolean;
}

export function buildCatGeometry(opts: CatGeometryOptions = {}): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const S = CAT_SHAPE;

  // Torso: a soft ellipsoid, fuller at the hips (pear).
  const body = new SphereGeometry(1, 8, 5);
  const bp = body.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    const hips = 1 + 0.12 * Math.max(0, -y);
    bp.setX(i, bp.getX(i) * hips);
    bp.setZ(i, bp.getZ(i) * hips);
  }
  body.computeVertexNormals();
  body.scale(S.body.r[0], S.body.r[1], S.body.r[2]);
  body.translate(0, S.body.y, 0);
  parts.push(tag(body, PART.body));

  // Head: big kitten head, a little wider than tall.
  const head = new SphereGeometry(1, 9, 6);
  head.scale(S.head.r[0], S.head.r[1], S.head.r[2]);
  head.translate(0, S.head.y, 0.01);
  parts.push(tag(head, PART.head));

  for (const side of [-1, 1]) {
    // Ears: flat triangular cones, tilted out (big enough to read from above).
    const ear = new ConeGeometry(0.1, 0.17, 4, 1, true);
    ear.rotateY(Math.PI / 4);
    ear.scale(1, 1, 0.5);
    ear.rotateZ(-side * 0.32);
    ear.translate(side * S.ear.x, S.ear.y, -0.005);
    parts.push(tag(ear, PART.ear));

    // The stub from the shoulder up to the cheek mitten (mostly inside the mitten and the body).
    const dx = S.paw.x - S.shoulder.x;
    const dy = S.paw.y - S.shoulder.y;
    const dz = S.paw.z - S.shoulder.z;
    const len = Math.hypot(dx, dy);
    // An open 5-sided tube (its ends are inside the mitten and the body): no capsule budget spent.
    const arm = new CylinderGeometry(S.armR, S.armR * 1.1, len, 5, 1, true);
    arm.rotateZ(-side * Math.atan2(dx, dy));
    arm.rotateX(Math.atan2(dz, len) * 0.5);
    arm.translate(side * (S.shoulder.x + dx / 2), S.shoulder.y + dy / 2, S.shoulder.z + dz / 2);
    parts.push(tag(arm, PART.arm));

    // Paw: a round, slightly flattened mitten (wider than tall); the shader paints the pink paw
    // print on its palm (+Z, booth side) only.
    const paw = new SphereGeometry(1, 7, 4);
    paw.scale(S.paw.r * 1.05, S.paw.r * 1.0, S.paw.r * 0.9);
    paw.translate(side * S.paw.x, S.paw.y, S.paw.z);
    parts.push(tag(paw, PART.paw));

    // Feet.
    const foot = new SphereGeometry(1, 5, 2);
    foot.scale(0.075, 0.05, 0.11);
    foot.translate(side * 0.085, 0.045, 0.05);
    parts.push(tag(foot, PART.foot));
  }

  // Tail: thick and fluffy, from the lower back up into a curl (the hero shot sees the backs).
  // Fullest near the root, tapering to a soft tip; never a thin wire hanging low.
  const T = S.tail;
  const curve = new CatmullRomCurve3([
    new Vector3(0, T.y, T.z),
    new Vector3(0.04, T.y + 0.04, -0.27),
    new Vector3(0.1, T.y + 0.2, -0.33),
    new Vector3(0.08, T.y + 0.36, -0.27),
  ]);
  const TUB = 6;
  const RAD = 5;
  const tail = new TubeGeometry(curve, TUB, 0.06, RAD, false);
  const tp = tail.getAttribute('position');
  const c = new Vector3();
  for (let i = 0; i <= TUB; i++) {
    const t = i / TUB;
    curve.getPointAt(t, c);
    // Full near the root, tapering to a soft tip (a uniform tube with a ball end read as a limb).
    const k = t < 0.3 ? 1 + 0.25 * (t / 0.3) : 1.25 - 0.85 * ((t - 0.3) / 0.7);
    for (let j = 0; j <= RAD; j++) {
      const v = i * (RAD + 1) + j;
      tp.setXYZ(v, c.x + (tp.getX(v) - c.x) * k, c.y + (tp.getY(v) - c.y) * k, c.z + (tp.getZ(v) - c.z) * k);
    }
  }
  tail.computeVertexNormals();
  parts.push(tag(tail, PART.tail));
  // A round tuft closes the tip.
  const tip = new SphereGeometry(0.026, 5, 3);
  curve.getPointAt(1, c);
  tip.translate(c.x, c.y, c.z);
  parts.push(tag(tip, PART.tail));

  if (opts.flag !== false) {
    const F = S.flag;
    // Pole: thin, from just under the mitten to the cloth's top edge (the mitten hides the grip).
    const pole = new CylinderGeometry(F.poleR, F.poleR, F.y1 - F.y0, 4, 1, true);
    pole.translate(F.x, (F.y0 + F.y1) / 2, F.z);
    parts.push(tag(pole, PART.pole));
    // Cloth: front and back faces (one-sided material); 4 columns so the shader can ripple it.
    const cloth = new PlaneGeometry(F.w, F.h, 4, 1);
    cloth.translate(F.x + F.w / 2, F.y1 - F.h / 2, F.z + 0.002);
    const back = backFace(cloth);
    back.translate(0, 0, -0.004);
    parts.push(tag(cloth, PART.cloth), tag(back, PART.cloth));
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('cat geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}
