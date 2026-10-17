/**
 * L-CROWD: one low-poly kitten standing upright on its hind legs, both front paws raised next to
 * its head (the meme pose), merged into a single geometry with a per-vertex part id (`aPart`) so
 * the vertex shader can animate head, arms, ears and tail without bones. Local space: feet at
 * y = 0, facing +Z, about 1.25 tall to the raised paws. ~400 triangles (SPEC.md budget).
 *
 * Proportions (reference stills): a tall torso (about 2:1 height to width) with a visible band
 * between the paws, a round head on top, short thick fluffy forearms angled ~30° out from vertical
 * so the hands sit above the ears (a "U" round the head), and big glowing pads.
 */
import {
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  Float32BufferAttribute,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PART = { body: 0, head: 1, ear: 2, arm: 3, paw: 4, foot: 5, tail: 6 } as const;

/** Shared with the impostor SDF and the shader pivots (keep in sync with shaders.ts). */
export const CAT_SHAPE = Object.freeze({
  /** Torso: short and chubby (kitten, not meerkat): round-2 review, height -15%, width +15%. */
  body: { y: 0.32, r: [0.175, 0.306, 0.161] as const },
  /** Big kitten head (+20%). */
  head: { y: 0.81, r: [0.22, 0.2, 0.21] as const },
  /** High shoulders (arms raised lift them): shorter forearms, a tight "U" round the head. */
  shoulder: { x: 0.17, y: 0.66, z: 0.03 },
  /** Hands raised above the ears either side of the head: the meme's "U" (visible from behind). */
  paw: { x: 0.37, y: 1.12, z: 0.02, r: 0.12 },
  /** Forearm radius: fluffy but not sausages now that the paws reach above the ears. */
  armR: 0.1,
  ear: { x: 0.145, y: 0.97 },
  neckY: 0.64,
});

function tag(g: BufferGeometry, part: number): BufferGeometry {
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  g.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  return g;
}

export function buildCatGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const S = CAT_SHAPE;

  // Torso: a tall soft capsule-ish ellipsoid, a little fuller at the hips.
  const body = new SphereGeometry(1, 8, 5);
  const bp = body.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    const hips = 1 + 0.12 * Math.max(0, -y); // pear: wider low
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
    // Ears: flat triangular cones, tilted out.
    const ear = new ConeGeometry(0.09, 0.15, 4, 1, true);
    ear.rotateY(Math.PI / 4);
    ear.scale(1, 1, 0.5);
    ear.rotateZ(-side * 0.32);
    ear.translate(side * S.ear.x, S.ear.y, -0.005);
    parts.push(tag(ear, PART.ear));

    // Forearm: shoulder → paw, a short thick capsule (fluffy, not a stick).
    const dx = S.paw.x - S.shoulder.x;
    const dy = S.paw.y - S.shoulder.y;
    const len = Math.hypot(dx, dy);
    const arm = new CapsuleGeometry(S.armR, Math.max(0.01, len - S.armR), 1, 6);
    arm.rotateZ(-side * Math.atan2(dx, dy));
    arm.translate(side * (S.shoulder.x + dx / 2), S.shoulder.y + dy / 2, (S.shoulder.z + S.paw.z) / 2);
    parts.push(tag(arm, PART.arm));

    // Paw: a round mitten; the shader paints the glowing hot-pink pads on its front and top.
    const paw = new SphereGeometry(1, 7, 5);
    // A flat, wide mitten (wider than the forearm), not a round cap on a stick.
    paw.scale(S.paw.r * 1.2, S.paw.r * 0.92, S.paw.r * 0.95);
    paw.translate(side * S.paw.x, S.paw.y, S.paw.z);
    parts.push(tag(paw, PART.paw));

    // Feet.
    const foot = new SphereGeometry(1, 5, 2);
    foot.scale(0.075, 0.05, 0.11);
    foot.translate(side * 0.085, 0.045, 0.05);
    parts.push(tag(foot, PART.foot));
  }

  // Tail: curls up behind (the hero shot sees the cats' backs).
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0.14, -0.12),
    new Vector3(0.02, 0.1, -0.3),
    new Vector3(0.07, 0.28, -0.38),
    new Vector3(0.1, 0.48, -0.33),
  ]);
  const tail = new TubeGeometry(curve, 4, 0.036, 4, false);
  parts.push(tag(tail, PART.tail));

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('cat geometry merge failed');
  merged.computeBoundingSphere();
  return merged;
}
