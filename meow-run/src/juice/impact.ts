// Landing impacts (STYLE lane, iteration 2): a hard landing (impact > 22 u/s) or a PAW-DIVE slams a shockwave ring
// flat on the track (0.3 -> 3.2 u, fading over 0.35 s), kicks a dust ring, shakes the camera (0.12..0.3) and kicks the
// FOV 3 degrees. The rings are a small pool of meshes sharing one geometry (no allocation per landing). LOW quality:
// dust only. Reduced motion: no shake or kick (core camera already ignores them), a fainter ring.
import * as THREE from 'three';
import { fovKick, shake } from '../core/camera';
import { getQuality, scene } from '../core/engine';
import { spawnParticle } from '../core/fx';
import { addFrameHook } from '../core/loop';
import { P } from '../core/player';
import { game, prefs } from '../core/state';

export const HARD_LANDING = 22;
const LIFE = 0.35;
const R0 = 0.3;
const R1 = 3.2;
const POOL = 3;
const DUST = 0xe3c79b;

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  peak: number;
}
const rings: Ring[] = [];
let next = 0;
let lastAt = -1;
const ZA = new THREE.Vector3(0, 0, 1);

function ensure(): void {
  if (rings.length) return;
  const geo = new THREE.RingGeometry(0.78, 1, 48, 1);
  geo.userData.shared = true;
  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff1cf, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    scene.add(mesh);
    rings.push({ mesh, mat, t: LIFE, peak: 0.8 });
  }
  addFrameHook((dt) => {
    const live = game.mode === 'play' || game.mode === 'finish';
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      if (!r.mesh.visible) continue;
      if (!live) {
        r.mesh.visible = false;
        continue;
      }
      r.t += dt;
      const u = Math.min(1, r.t / LIFE);
      if (u >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      const rad = R0 + (R1 - R0) * e;
      r.mesh.scale.set(rad, rad, rad);
      r.mat.opacity = r.peak * (1 - u) * (1 - u * 0.4);
    }
  });
}

function dustRing(n: number, speed: number): void {
  const W = P.world;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a) * speed;
    const sa = Math.sin(a) * speed;
    spawnParticle(
      W.pos.x + W.up.x * 0.08,
      W.pos.y + W.up.y * 0.08,
      W.pos.z + W.up.z * 0.08,
      W.right.x * ca + W.fwd.x * (sa + P.speed * 0.5) + W.up.x * 0.6,
      W.right.y * ca + W.fwd.y * (sa + P.speed * 0.5) + 0.6 + Math.random() * 0.6,
      W.right.z * ca + W.fwd.z * (sa + P.speed * 0.5) + W.up.z * 0.6,
      0.45 + Math.random() * 0.2,
      0.3 + Math.random() * 0.18,
      DUST,
      1.5,
      0.6,
    );
  }
}

/**
 * Slam the ground under Mochi. strength 0..1 (0 = a hard landing, 1 = a full paw-dive). One per landing: a second
 * call within 80 ms (the PAW-DIVE payout on the same touchdown) is ignored.
 */
export function landingImpact(strength: number): void {
  const now = performance.now();
  if (now - lastAt < 80) return;
  lastAt = now;
  const k = Math.max(0, Math.min(1, strength));
  dustRing(10 + Math.round(k * 8), 3.5 + k * 3);
  shake(0.12 + 0.18 * k);
  fovKick(3);
  if (getQuality() === 'low') return;
  ensure();
  const r = rings[next];
  next = (next + 1) % rings.length;
  const W = P.world;
  r.mesh.position.copy(W.pos).addScaledVector(W.up, 0.06);
  r.mesh.quaternion.setFromUnitVectors(ZA, W.up);
  r.mesh.scale.setScalar(R0);
  r.t = 0;
  r.peak = (prefs.reducedMotion ? 0.45 : 0.85) * (0.75 + 0.25 * k);
  r.mat.color.setHex(k > 0.6 ? 0xffe07a : 0xfff1cf);
  r.mat.opacity = r.peak;
  r.mesh.visible = true;
}

/** core land event -> a shockwave when it was a hard one */
export function onLand(impact: number): void {
  if (impact > HARD_LANDING && P.surface !== 'river' && P.ability !== 'cloud') landingImpact(Math.min(1, (impact - HARD_LANDING) / 10));
}

/** the shockwave ring meshes (built on first call): the style lane pre-warms their shader at stage start */
export function impactMeshes(): THREE.Mesh[] {
  ensure();
  return rings.map((r) => r.mesh);
}
