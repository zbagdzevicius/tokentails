// Shared particles and juice. FROZEN. Lanes spawn into these pools (dust, chunks, water, fire) instead of making their own.
import * as THREE from 'three';
import { Particles } from './bodies';
import { scene } from './engine';
import { C, G, settings } from './state';

const sphereGeo = new THREE.IcosahedronGeometry(1, 1);
// dust: soft, unlit, see-through puffs that grow (flat basic material, so they read as a cloud, not rocks)
export const dust = new Particles(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }), 1400);
export const chunks = new Particles(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 700);
export const water = new Particles(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }), 700);
export const fire = new Particles(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 500);
scene.add(dust.mesh, chunks.mesh, water.mesh, fire.mesh);

/** Additive, always-on-top material for flashes and beams. */
export const fxMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

// swat crescent (flat arc in front of the cat) and the pounce shock ring
const swatFx = new THREE.Group();
const swatArc = new THREE.Mesh(new THREE.RingGeometry(18, 26, 24, 1, Math.PI * 1.5 - 1.1, 2.2), fxMat(0xffffff));
swatArc.rotation.x = -Math.PI / 2;
swatFx.add(swatArc);
swatFx.visible = false;
swatArc.renderOrder = 10;
scene.add(swatFx);
export const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), fxMat(0xfff1dd));
shockRing.rotation.x = -Math.PI / 2;
shockRing.visible = false;
scene.add(shockRing);

/** 1 -> 0 timers: swat crescent, shock ring, FOV punch. Set to 1 to trigger. */
export const fx = { swat: 0, shock: 0, fov: 0 };

/** Add camera trauma (0..1), scaled by the screen-shake setting. */
export function shake(t: number): void {
  G.trauma = Math.min(1, G.trauma + t * settings.shake);
}

/** Spawn a dust cloud and chunk spray. */
export function burst(x: number, y: number, z: number, n: number, colr = 0xd9ccb4): void {
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 2; d++) dust.spawn(x + (Math.random() - 0.5) * 10, y * 0.5 + Math.random() * 3, z + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 26, Math.random() * 8, (Math.random() - 0.5) * 26, 0.9, 1.1 + Math.random() * 0.8, colr, 1, 1.6);
    chunks.spawn(x, y, z, (Math.random() - 0.5) * 50, 10 + Math.random() * 40, (Math.random() - 0.5) * 50, 1.4, 0.6 + Math.random() * 1.2, Math.random() < 0.5 ? 0x9a948a : 0x5d6670, -70);
  }
}

/** Remove every live particle (level load: debris from the last run must not float into the next city). */
export function clearParticles(): void {
  dust.clear();
  chunks.clear();
  water.clear();
  fire.clear();
}

/** Step particle pools. */
export function stepParticles(dt: number): void {
  dust.step(dt);
  chunks.step(dt);
  water.step(dt);
  fire.step(dt);
}

/** Swat crescent and pounce ring animation. swipeSide from the cat rig. */
export function updateFx(dt: number, swipeSide: number): void {
  fx.swat = Math.max(0, fx.swat - dt / 0.15);
  swatFx.visible = fx.swat > 0;
  if (swatFx.visible) {
    swatFx.position.set(C.pos.x, 30 + C.y, C.pos.z);
    swatFx.rotation.y = C.heading + swipeSide * 0.25;
    swatFx.scale.setScalar(0.6 + (1 - fx.swat) * 0.7);
    (swatArc.material as THREE.MeshBasicMaterial).opacity = fx.swat;
  }
  fx.shock = Math.max(0, fx.shock - dt / 0.4);
  shockRing.visible = fx.shock > 0;
  if (shockRing.visible) {
    shockRing.scale.setScalar(5 + (1 - fx.shock) * 55);
    (shockRing.material as THREE.MeshBasicMaterial).opacity = 0.8 * fx.shock;
  }
}
