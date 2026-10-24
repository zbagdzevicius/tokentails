/**
 * Render bug from the trailer v3.7 review (render only; nothing under src/sim changes): Cacklejaw's Pack Hunt maul
 * slammed his head and torso into the hero he hunted (Gabė, under the CACKLEJAW card). The slam key pitched the body
 * 0.4 + 0.7 rad forward on top of the 0.3 m root lunge, which threw the skull 2.1 m ahead of his sim position while the
 * victim stands at sim reach (≈1.6-2.6 m). The slam now leans no further than the corkscrew that follows it.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeHero } from '../../src/render/chars';
import { compileClip, ROOT_INDEX } from '../../src/render/anim/compile';
import { sampleClip, sampleScalar } from '../../src/render/anim/sampler';
import { BONES } from '../../src/render/anim/masks';
import { RootState } from '../../src/render/anim/root';
import { BONE_INDEX } from '../../src/render/chars/skeleton';
import { MOVES } from '../../src/render/moves/cacklejaw';

/** The maul posed at `t` (bones and root motion): how far ahead of the sim position (m) the skull and the claws reach. */
function reachAt(t: number): { skull: number; body: number } {
  const ch = makeHero('cacklejaw', 1, null, { detail: 0.62 });
  const c = MOVES.slots.r.onHit!;
  const bin = compileClip(c, ch.rig, ch.anim.profile.idle);
  const Qb = Array.from({ length: BONES }, () => new THREE.Quaternion());
  const Pb = Array.from({ length: BONES }, () => new THREE.Vector3());
  sampleClip(bin, t, Qb, Pb, new Float32Array(BONES).fill(1), 1, 0, { k: 0 });
  for (let b = 0; b < BONES; b++) {
    ch.rig.bones[b].quaternion.copy(Qb[b]);
    ch.rig.bones[b].position.copy(Pb[b]);
  }
  const rs = new RootState();
  for (const k of ['fwd', 'side', 'up', 'yaw', 'pitch', 'roll'] as const) {
    const v = sampleScalar(bin.root[ROOT_INDEX[k]], t);
    if (Number.isFinite(v)) rs[k] = v;
  }
  const sy = sampleScalar(bin.root[ROOT_INDEX.sy], t);
  if (Number.isFinite(sy)) rs.sy = sy;
  rs.apply(ch.mover, ch.inner, ch.height, 1 / 60);
  ch.object.updateMatrixWorld(true);
  ch.mesh.skeleton.update();
  // the object faces +x: the skull centre (0.19 H over the head bone) and the farthest skinned vertex
  const skull = new THREE.Vector3(0, 0.19, 0).applyMatrix4(ch.rig.bones[BONE_INDEX.head].matrixWorld).x;
  const v = new THREE.Vector3();
  let body = -9;
  const pos = ch.mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 2) {
    ch.mesh.getVertexPosition(i, v);
    body = Math.max(body, v.applyMatrix4(ch.mesh.matrixWorld).x);
  }
  ch.dispose();
  return { skull, body };
}

describe("Cacklejaw's maul stays out of the hunted hero's body", () => {
  const all = Array.from({ length: 56 }, (_, i) => reachAt(i * 0.02));
  it('the skull never leads more than 1.5 m (v3.7: 2.08 m on the slam)', () => {
    expect(Math.max(...all.map((r) => r.skull))).toBeLessThan(1.5);
    // the slam (0-0.06 s) leans no further than the corkscrew rake that follows it (0.1-0.3 s)
    const slam = Math.max(...all.slice(0, 4).map((r) => r.skull));
    const rake = Math.max(...all.slice(5, 16).map((r) => r.skull));
    expect(slam).toBeLessThanOrEqual(rake + 0.1);
  });
  it('the claws reach the victim at sim reach, not 3 m through it (v3.7: 3.0 m)', () => {
    expect(Math.max(...all.map((r) => r.body))).toBeLessThan(2.3);
  });
});
