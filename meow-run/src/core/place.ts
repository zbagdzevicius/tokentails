// Helpers to put objects on the track. FROZEN. Allocation-free.
import * as THREE from 'three';
import type { Track } from './track';
import { newFrame } from './track';

const fr = newFrame();
const m4 = new THREE.Matrix4();
const xa = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const flatR = new THREE.Vector3();
const flatF = new THREE.Vector3();

/**
 * Place obj at track point (s, x, y), oriented to the track frame (local +z = forward, +y = surface normal,
 * +x = runner's left). upright = true keeps it vertical (trees, posts) and only yaws it along the path.
 */
export function placeOnTrack(obj: THREE.Object3D, track: Track, s: number, x = 0, y = 0, upright = false): THREE.Object3D {
  track.sample(s, fr);
  obj.position.copy(fr.pos).addScaledVector(fr.right, x).addScaledVector(fr.up, y);
  if (upright) {
    flatF.set(fr.fwd.x, 0, fr.fwd.z);
    if (flatF.lengthSq() < 1e-6) flatF.set(0, 0, 1);
    flatF.normalize();
    flatR.crossVectors(flatF, UP);
    xa.copy(flatR).negate();
    m4.makeBasis(xa, UP, flatF);
  } else {
    xa.copy(fr.right).negate();
    m4.makeBasis(xa, fr.up, fr.fwd);
  }
  obj.quaternion.setFromRotationMatrix(m4);
  return obj;
}

/** Write the world position of (s, x, y) into out. */
export function trackPoint(track: Track, s: number, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  return track.toWorld(s, x, y, out);
}
