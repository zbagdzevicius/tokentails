// Pooled projectiles shared by the cucumber tower (lobbed cucumbers), the cucumber jet (bombs) and the Mecha-Dog
// (bouncing fetch balls). Owned by the ENEMIES lane. Updated at most once per frame whoever calls update first.
import * as THREE from 'three';
import { scene } from '../core/engine';
import { dust, fire } from '../core/fx';
import { pop } from '../core/hud';
import { soak, startle } from '../core/player';
import { score } from '../core/score';
import { C, game, P } from '../core/state';
import type { SwatHit } from '../core/types';
import { ballistic, bounce } from './bossmath';
import { frame, furPoof, splash } from './common';
import * as S from './sfx';

export type ProjKind = 'cuke' | 'bomb' | 'ball';

interface Proj {
  g: THREE.Group;
  parts: Record<ProjKind, THREE.Object3D>;
  marker: THREE.Mesh;
  kind: ProjKind;
  active: boolean;
  back: boolean; // swatted back: harmless to the cat, hits its owner
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  grav: number;
  t: number;
  spin: number;
  owner: number;
  onBack: ((owner: number, at: THREE.Vector3) => void) | null;
  tx: number; // swat-back target
  ty: number;
  tz: number;
  bounces: number;
}

const CAP = 36;
const pool: Proj[] = [];
let built = false;
let lastStep = -1;

const cukeMat = new THREE.MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.6 });
const cukeDark = new THREE.MeshStandardMaterial({ color: 0x2a6b28, roughness: 0.7 });
const bombMat = new THREE.MeshStandardMaterial({ color: 0x5fbf4a, roughness: 0.4, emissive: 0x113311 });
const finMat = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.3 });
const ballMat = new THREE.MeshStandardMaterial({ color: 0xd8f04a, roughness: 0.9 });
const seamMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const markMat = new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
const capsule = new THREE.CapsuleGeometry(1.8, 8, 4, 10);
const bump = new THREE.SphereGeometry(0.5, 6, 4);
const finGeo = new THREE.BoxGeometry(0.3, 2.6, 2.4);
const ballGeo = new THREE.SphereGeometry(4, 14, 10);
const seamGeo = new THREE.TorusGeometry(4.02, 0.25, 4, 24);
const markGeo = new THREE.RingGeometry(9, 12, 28);

const tmpV = { x: 0, y: 0, z: 0 };
const atV = new THREE.Vector3();

function build(): void {
  if (built) return;
  built = true;
  for (let i = 0; i < CAP; i++) {
    const g = new THREE.Group();
    // cucumber: a bumpy green capsule
    const cuke = new THREE.Group();
    const body = new THREE.Mesh(capsule, cukeMat);
    body.rotation.x = Math.PI / 2;
    cuke.add(body);
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Mesh(bump, cukeDark);
      const a = k * 2.1;
      b.position.set(Math.cos(a) * 1.7, Math.sin(a) * 1.7, -4 + k * 1.6);
      cuke.add(b);
    }
    // bomb: a fat glossy cucumber with tail fins
    const bomb = new THREE.Group();
    const bb = new THREE.Mesh(capsule, bombMat);
    bb.rotation.x = Math.PI / 2;
    bb.scale.set(1.3, 0.8, 1.3);
    bomb.add(bb);
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(finGeo, finMat);
      f.position.z = -5;
      f.rotation.z = (k * Math.PI) / 2;
      f.position.x = Math.cos((k * Math.PI) / 2) * 1.6;
      f.position.y = Math.sin((k * Math.PI) / 2) * 1.6;
      bomb.add(f);
    }
    // tennis ball
    const ball = new THREE.Group();
    ball.add(new THREE.Mesh(ballGeo, ballMat));
    const seam = new THREE.Mesh(seamGeo, seamMat);
    seam.rotation.x = 1.1;
    ball.add(seam);
    g.add(cuke, bomb, ball);
    g.traverse((o) => (o.castShadow = true));
    g.visible = false;
    scene.add(g);
    const marker = new THREE.Mesh(markGeo, markMat);
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    scene.add(marker);
    pool.push({ g, parts: { cuke, bomb, ball }, marker, kind: 'cuke', active: false, back: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), grav: -90, t: 0, spin: 0, owner: -1, onBack: null, tx: 0, ty: 0, tz: 0, bounces: 0 });
  }
}

function take(): Proj | null {
  build();
  for (const p of pool) if (!p.active) return p;
  return null;
}

function kill(p: Proj): void {
  p.active = false;
  p.g.visible = false;
  p.marker.visible = false;
}

/**
 * Launch a projectile from (x, y, z) that lands at (tx, ty, tz) after T seconds.
 * onBack(owner) runs when a swatted-back projectile reaches its owner (passed through `backTo`).
 */
export function launch(kind: ProjKind, x: number, y: number, z: number, tx: number, ty: number, tz: number, T: number, owner = -1, onBack: Proj['onBack'] = null, grav = -90): boolean {
  const p = take();
  if (!p) return false;
  p.active = true;
  p.back = false;
  p.kind = kind;
  p.owner = owner;
  p.onBack = onBack;
  p.grav = grav;
  p.t = 0;
  p.bounces = 0;
  p.spin = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4);
  p.pos.set(x, y, z);
  ballistic(tx - x, ty - y, tz - z, T, grav, tmpV);
  p.vel.set(tmpV.x, tmpV.y, tmpV.z);
  for (const k of ['cuke', 'bomb', 'ball'] as const) p.parts[k].visible = k === kind;
  p.g.visible = true;
  p.g.position.copy(p.pos);
  p.marker.visible = kind !== 'ball';
  markMat.color.setHex(kind === 'bomb' ? 0xff6a4a : 0x7dff6a);
  p.marker.position.set(tx, 1.3, tz);
  p.marker.scale.setScalar(kind === 'bomb' ? 1.8 : 1.2);
  return true;
}

/** Fire a bouncing ball along the ground toward (tx, tz) at `speed`. */
export function rollBall(x: number, y: number, z: number, tx: number, tz: number, speed: number, owner: number, onBack: Proj['onBack']): boolean {
  const p = take();
  if (!p) return false;
  p.active = true;
  p.back = false;
  p.kind = 'ball';
  p.owner = owner;
  p.onBack = onBack;
  p.grav = -150;
  p.t = 0;
  p.bounces = 0;
  p.spin = 8;
  const dx = tx - x;
  const dz = tz - z;
  const d = Math.hypot(dx, dz) || 1;
  p.pos.set(x, y, z);
  p.vel.set((dx / d) * speed, 40, (dz / d) * speed);
  p.parts.cuke.visible = p.parts.bomb.visible = false;
  p.parts.ball.visible = true;
  p.g.visible = true;
  p.marker.visible = false;
  return true;
}

/** The swat hook: anything incoming near the paw flies back toward (backX, backY, backZ) of its owner. */
export function swatProjectiles(hit: SwatHit, ownerPos: (owner: number, kind: ProjKind, out: THREE.Vector3) => boolean): number {
  let n = 0;
  for (const p of pool) {
    if (!p.active || p.back) continue;
    const dx = p.pos.x - hit.strike.x;
    const dz = p.pos.z - hit.strike.z;
    const near = Math.hypot(dx, dz) < hit.radius + 18 && p.pos.y < hit.strike.y + 45;
    const nearCat = Math.hypot(p.pos.x - C.pos.x, p.pos.z - C.pos.z) < P.radius + 20 && p.pos.y < P.headY + C.y + 20 && (p.pos.x - C.pos.x) * hit.fwd.x + (p.pos.z - C.pos.z) * hit.fwd.z > -4;
    if (!near && !nearCat) continue;
    p.back = true;
    p.marker.visible = false;
    p.t = 0;
    if (p.owner >= 0 && ownerPos(p.owner, p.kind, atV)) {
      const d = atV.distanceTo(p.pos);
      const T = Math.max(0.5, Math.min(1.6, d / 160));
      p.grav = -90;
      ballistic(atV.x - p.pos.x, atV.y - p.pos.y, atV.z - p.pos.z, T, p.grav, tmpV);
      p.vel.set(tmpV.x, tmpV.y, tmpV.z);
      p.tx = atV.x;
      p.ty = atV.y;
      p.tz = atV.z;
    } else {
      p.owner = -1;
      p.vel.set(hit.fwd.x * 120, 70, hit.fwd.z * 120);
      p.grav = -90;
    }
    p.spin = 20;
    S.boing(p.kind === 'ball' ? 0.8 : 1.2);
    score(0.5, p.pos, p.kind === 'ball' ? 'FETCH! ' : 'NOPE! ');
    pop(p.kind === 'ball' ? 'FETCH!' : 'NOPE!', p.pos, '#7dff6a', 30);
    n++;
  }
  return n;
}

/** Laser / blast hooks: burn incoming projectiles out of the sky. */
export function zapProjectilesNear(x: number, y: number, z: number, r: number): void {
  for (const p of pool) {
    if (!p.active || p.back) continue;
    const dx = p.pos.x - x;
    const dy = p.pos.y - y;
    const dz = p.pos.z - z;
    if (dx * dx + dy * dy + dz * dz > r * r) continue;
    for (let k = 0; k < 6; k++) fire.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 30, Math.random() * 20, (Math.random() - 0.5) * 30, 0.4, 1.5, 0x7dff6a, -20, 1);
    kill(p);
  }
}

function hitCat(p: Proj): void {
  if (p.kind === 'cuke') {
    startle(1.2, 'cucumber');
    S.splat(1);
    furPoof();
    pop('!', atV.set(C.pos.x, P.headY + C.y + 18, C.pos.z), '#7dff6a', 64);
  } else if (p.kind === 'bomb') {
    startle(1.5, 'cucumber');
    soak(6, 'bomb');
    furPoof();
    pop('!!', atV.set(C.pos.x, P.headY + C.y + 18, C.pos.z), '#7dff6a', 64);
  } else {
    startle(0.6, 'ball');
    S.boing(0.7);
    pop('!', atV.set(C.pos.x, P.headY + C.y + 18, C.pos.z), '#d8f04a', 48);
  }
}

/** Step every projectile once per frame. */
export function updateProjectiles(dt: number, t: number): void {
  if (lastStep === frame.n) return;
  lastStep = frame.n;
  if (!built) return;
  const play = game.mode === 'play';
  for (const p of pool) {
    if (!p.active) continue;
    p.t += dt;
    p.vel.y += p.grav * dt;
    p.pos.addScaledVector(p.vel, dt);
    const g = p.g;
    g.position.copy(p.pos);
    if (p.kind === 'ball') {
      g.rotation.x += p.spin * dt;
      g.rotation.z += p.spin * 0.6 * dt;
    } else {
      // nose along the velocity, with a wobbly tumble
      g.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
      g.rotateZ(t * p.spin);
    }
    if (p.marker.visible) {
      const s = (p.kind === 'bomb' ? 1.8 : 1.2) * (1 + Math.sin(t * 14) * 0.12);
      p.marker.scale.setScalar(s);
    }
    if (p.kind !== 'ball' && Math.random() < 0.4) dust.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.35, 1.2, 0xdaf5d0, 0, 1.2);
    if (p.back) {
      // reached its owner?
      if (p.owner >= 0 && p.onBack) {
        const dx = p.pos.x - p.tx;
        const dy = p.pos.y - p.ty;
        const dz = p.pos.z - p.tz;
        if (dx * dx + dy * dy + dz * dz < 16 * 16 || p.t > 1.8) {
          const cb = p.onBack;
          kill(p);
          if (p.t <= 1.8 || dx * dx + dz * dz < 30 * 30) cb(p.owner, p.pos);
          continue;
        }
      }
      if (p.pos.y < 0 || p.t > 4) {
        if (p.pos.y < 0) splash(p.pos.x, 1, p.pos.z, 8, 25, 0x7dff6a);
        kill(p);
      }
      continue;
    }
    // hits the cat?
    const dx = p.pos.x - C.pos.x;
    const dz = p.pos.z - C.pos.z;
    const hr = p.kind === 'bomb' ? 22 : p.kind === 'ball' ? P.radius + 4 : 14;
    if (play && Math.hypot(dx, dz) < hr && p.pos.y < P.headY + C.y + 6 && p.pos.y > C.y - 6 && (p.kind !== 'bomb' || p.pos.y < 8)) {
      hitCat(p);
      if (p.kind === 'bomb') splash(p.pos.x, 2, p.pos.z, 24, 60);
      else if (p.kind === 'cuke') splash(p.pos.x, p.pos.y, p.pos.z, 10, 30, 0x7dff6a);
      kill(p);
      continue;
    }
    if (p.pos.y <= (p.kind === 'ball' ? 4 : 0)) {
      if (p.kind === 'ball') {
        p.pos.y = 4;
        p.vel.y = bounce(p.vel.y, 0.62, 10) || 0;
        if (p.vel.y > 0) {
          p.bounces++;
          if (p.bounces < 6) S.boing(1.4 - p.bounces * 0.1);
        }
        p.vel.x *= 0.985;
        p.vel.z *= 0.985;
        if (p.t > 5) {
          dust.spawn(p.pos.x, 3, p.pos.z, 0, 4, 0, 0.6, 6, 0xd8f04a, 0, 1.5);
          kill(p);
        }
        continue;
      }
      if (p.kind === 'bomb') {
        S.splat(1.6);
        splash(p.pos.x, 1, p.pos.z, 26, 65);
        if (play && Math.hypot(dx, dz) < 26) hitCat(p);
      } else {
        S.splat(0.6);
        splash(p.pos.x, 1, p.pos.z, 8, 25, 0x7dff6a);
        if (play && Math.hypot(dx, dz) < 14) hitCat(p);
      }
      kill(p);
    } else if (p.t > 8) kill(p);
  }
}

export function clearProjectiles(): void {
  for (const p of pool) kill(p);
}

/** Incoming (not swatted) projectiles of a kind. */
export function countProjectiles(kind: ProjKind): number {
  let n = 0;
  for (const p of pool) if (p.active && !p.back && p.kind === kind) n++;
  return n;
}
