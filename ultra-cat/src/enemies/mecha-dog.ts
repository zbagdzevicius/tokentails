// MECHA-DOG, the Purrburbia mini-boss: a 45 m chrome robo-dog with a ball cannon and a wagging antenna tail.
// Owned by the ENEMIES lane. HP 80, two phases (a hit never skips a phase: it stops at the cut, 1.5 s invulnerable):
//   1 GOOD BOY?  (100-50%): chases, barks a cone shockwave every 4 s (startle 0.8 + soak 8).
//   2 BAD DOG!   (< 50%):   straight-line charges that plough through buildings, then bouncing fetch balls (startle 0.6).
// Damage: swat 2 (x swatPower), pounce landing 4, laser 0.15 per 60 fps frame, blast 4 x power, a swatted-back ball 3.
// Death: big explosion, $120M, "GOOD BOY. NOT.". The level goes on (level.boss.endsLevel false).
//
// spec.params (only when the campaign also lists mechaDog in level.enemies; all optional):
//   hp (80)   speed chase speed (22)   charge charge speed (120)   bark seconds between barks (4)
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { reportKill } from '../core/enemies';
import { scene } from '../core/engine';
import { dust, fire, fxMat, shake } from '../core/fx';
import { flash, showBanner } from '../core/hud';
import { soak, startle } from '../core/player';
import { score } from '../core/score';
import { C, G, game, P } from '../core/state';
import type { Blast, EnemySpec, EnemyType, SwatHit } from '../core/types';
import { city } from '../core/world';
import { BossCore, emissiveOf, knockCat } from './boss';
import { bossDamage, DOG_DAMAGE } from './bossmath';
import { blastHits, circleHits, explode, frame, furPoof, groundSpawn, laserHits, ploughAt, pushCatOut, swatHits, turnToward } from './common';
import { rollBall, swatProjectiles, updateProjectiles, type ProjKind } from './projectiles';
import * as S from './sfx';
import { param } from './spawn';

type State = 'off' | 'drop' | 'chase' | 'bark' | 'aim' | 'charge' | 'skid' | 'fetch' | 'dying' | 'wreck';

const core = new BossCore('mechaDog', 'MECHA-DOG', [0.5], ['GOOD BOY?', 'BAD DOG!']);
let spec: EnemySpec | null = null;
let built = false;

const R = 20; // body radius for hits and collisions
const CY = 26; // body centre height

const chrome = emissiveOf(new THREE.MeshStandardMaterial({ color: 0xe4e9ef, roughness: 0.3, metalness: 0.12 }));
const joint = emissiveOf(new THREE.MeshStandardMaterial({ color: 0x5a616c, roughness: 0.45, metalness: 0.15 }));
const eyeMat = emissiveOf(new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff1010, emissiveIntensity: 1.6 }));
const collarMat = new THREE.MeshStandardMaterial({ color: 0xd8262b, roughness: 0.5 });
const tagMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.3, metalness: 0.7 });
const noseMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.2 });
const tipMat = new THREE.MeshStandardMaterial({ color: 0x55ff77, emissive: 0x22ff55, emissiveIntensity: 1.2 });
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const sph = new THREE.SphereGeometry(1, 14, 10);
const cone = new THREE.ConeGeometry(1, 1, 4);
const barkMat = fxMat(0xfff1a8);
const barkGeo = new THREE.RingGeometry(0.8, 1, 24, 1, Math.PI / 2 - 0.65, 1.3);

const dog = {
  g: new THREE.Group(),
  body: new THREE.Group(),
  head: new THREE.Group(),
  jaw: new THREE.Object3D(),
  tail: new THREE.Group(),
  cannon: new THREE.Object3D(),
  legs: [] as THREE.Object3D[],
  rings: [] as THREE.Mesh[],
  ringT: [0, 0, 0],
  pos: new THREE.Vector3(),
  yaw: 0,
  vy: 0,
  state: 'off' as State,
  t: 0,
  barkT: 4,
  step: 0,
  cdx: 0,
  cdz: 1,
  chargeHit: false,
  balls: 0,
  headVel: new THREE.Vector3(),
  headSpin: 0,
  boomT: 0,
  plough: 0,
};

const hitV = new THREE.Vector3();
const tmp = new THREE.Vector3();

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function build(): void {
  if (built) return;
  built = true;
  const { g, body, head, tail } = dog;
  g.add(body);
  // torso
  part(body, box, chrome, 16, 13, 32, 0, 26, 0);
  part(body, box, joint, 16.4, 3, 30, 0, 21, 0); // belly seam
  part(body, box, joint, 10, 2, 20, 0, 33, -2); // back panel
  // ball cannon on the back
  const cannon = new THREE.Group();
  cannon.position.set(0, 36, -6);
  part(cannon, cyl, joint, 3.2, 10, 3.2, 0, 4, 0).rotation.x = 0;
  const bar = part(cannon, cyl, chrome, 2.6, 12, 2.6, 0, 6, 4);
  bar.rotation.x = Math.PI / 2 - 0.5;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 10, 9);
  cannon.add(muzzle);
  dog.cannon = muzzle;
  body.add(cannon);
  // collar and tag
  const collar = part(body, cyl, collarMat, 9.5, 3, 9.5, 0, 31, 15);
  collar.rotation.x = Math.PI / 2 - 0.4;
  part(body, cyl, tagMat, 2.4, 0.6, 2.4, 0, 26, 19.5).rotation.x = Math.PI / 2;
  // head
  head.position.set(0, 36, 19);
  part(head, box, chrome, 13, 11, 12, 0, 2, 0);
  part(head, box, chrome, 8, 6, 10, 0, -0.5, 9); // snout
  part(head, sph, noseMat, 2, 1.6, 1.6, 0, 1.5, 14);
  const jaw = new THREE.Group();
  jaw.position.set(0, -3.5, 4);
  part(jaw, box, joint, 7, 2, 10, 0, 0, 5);
  head.add(jaw);
  dog.jaw = jaw;
  for (const sx of [-1, 1]) {
    part(head, box, eyeMat, 2.6, 1.6, 0.6, sx * 3.4, 4, 6.1);
    const ear = part(head, cone, joint, 3.4, 8, 2, sx * 4.6, 10.5, -2);
    ear.rotation.z = -sx * 0.35;
  }
  body.add(head);
  // legs: thigh + paw
  for (const [x, z] of [
    [-6.5, 11],
    [6.5, 11],
    [-6.5, -11],
    [6.5, -11],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 21, z);
    part(leg, cyl, joint, 3, 16, 3, 0, -8, 0);
    part(leg, box, chrome, 6, 4, 8, 0, -17, 1.5);
    body.add(leg);
    dog.legs.push(leg);
  }
  // antenna tail
  tail.position.set(0, 30, -16);
  part(tail, cyl, joint, 0.6, 16, 0.6, 0, 8, 0);
  part(tail, sph, tipMat, 2, 2, 2, 0, 16.5, 0);
  tail.rotation.x = -0.5;
  body.add(tail);
  g.traverse((o) => (o.castShadow = true));
  g.visible = false;
  scene.add(g);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(barkGeo, barkMat.clone());
    r.rotation.x = -Math.PI / 2;
    r.renderOrder = 9;
    r.visible = false;
    scene.add(r);
    dog.rings.push(r);
  }
  core.flashOn(chrome, joint);
}

function setState(s: State): void {
  dog.state = s;
  dog.t = 0;
}

function spawnDog(): void {
  build();
  groundSpawn(dog.pos, 230, 60);
  dog.pos.y = 320;
  dog.vy = -40;
  dog.yaw = Math.atan2(C.pos.x - dog.pos.x, C.pos.z - dog.pos.z);
  dog.barkT = 3;
  dog.g.visible = true;
  dog.g.position.copy(dog.pos);
  dog.body.rotation.set(0, 0, 0);
  dog.head.position.set(0, 36, 19);
  dog.head.rotation.set(0, 0, 0);
  if (dog.head.parent !== dog.body) dog.body.add(dog.head);
  core.spawn(param(spec, 'hp', 80), 3);
  setState('drop');
  S.alarm();
  showBanner('MECHA-DOG!', '#ff3e3e', 2);
}

function knockFrom(x: number, z: number, speed: number): void {
  const dx = C.pos.x - x;
  const dz = C.pos.z - z;
  const d = Math.hypot(dx, dz) || 1;
  knockCat((dx / d) * speed, (dz / d) * speed);
}

/** Damage the dog. */
function hurt(dmg: number, at: THREE.Vector3, loud = true): void {
  const r = core.hit(dmg, at, 'CLANK!', loud);
  if (r === 'phase') {
    showBanner('BAD DOG!', '#ff3e3e', 2);
    S.bark();
    S.alarm();
    flash(0.4);
    shake(0.5);
    setState('aim');
  } else if (r === 'dead') die();
}

function die(): void {
  setState('dying');
  dog.boomT = 0;
  for (const r of dog.rings) r.visible = false;
  hitV.set(dog.pos.x, CY, dog.pos.z);
  score(120, hitV, 'MECHA-DOG ');
  showBanner('GOOD BOY. NOT.', '#ffd24a', 2);
  S.powerDown();
  A.meow('ultra', game.cat.voice);
  reportKill('mechaDog', hitV, true);
  G.hitStop = 0.25;
  flash(0.7);
  shake(1);
}

function fireBall(): void {
  dog.cannon.getWorldPosition(tmp);
  if (rollBall(tmp.x, tmp.y, tmp.z, C.pos.x + C.vel.x * 0.8, C.pos.z + C.vel.z * 0.8, 70, 0, ballBack)) {
    S.thwip();
    A.thud(0.4);
  }
}
function ballBack(): void {
  if (core.up && !core.dead) {
    hitV.set(dog.pos.x, CY + 6, dog.pos.z);
    hurt(bossDamage(DOG_DAMAGE, 'ball'), hitV);
  }
}
function ownerPos(_i: number, k: ProjKind, out: THREE.Vector3): boolean {
  if (k !== 'ball' || !core.up || core.dead) return false;
  out.set(dog.pos.x, CY + 6, dog.pos.z);
  return true;
}

function bark(): void {
  S.bark();
  shake(0.25);
  for (let i = 0; i < 3; i++) dog.ringT[i] = -i * 0.12;
  const dx = C.pos.x - dog.pos.x;
  const dz = C.pos.z - dog.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const fx = Math.sin(dog.yaw);
  const fz = Math.cos(dog.yaw);
  if (game.mode === 'play' && d < 130 && (dx * fx + dz * fz) / d > 0.75) {
    startle(0.8, 'bark');
    soak(8, 'bark');
    furPoof();
    knockFrom(dog.pos.x, dog.pos.z, 70);
  }
}

function update(dt: number, t: number): void {
  if (!core.spawned && game.mode === 'play' && G.elapsed >= core.spawnAt) spawnDog();
  updateProjectiles(dt, t);
  if (dog.state === 'off') return;
  core.tick(dt);
  dog.t += dt;
  const play = game.mode === 'play';
  const dx = C.pos.x - dog.pos.x;
  const dz = C.pos.z - dog.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const toCat = Math.atan2(dx, dz);
  const speed = param(spec, 'speed', 22);
  const chargeV = param(spec, 'charge', 120);
  let move = 0;
  let gait = 0;
  switch (dog.state) {
    case 'drop':
      dog.vy -= 160 * dt;
      dog.pos.y += dog.vy * dt;
      dog.yaw = toCat;
      if (dog.pos.y <= 0) {
        dog.pos.y = 0;
        A.thud(2);
        explode(dog.pos.x, 4, dog.pos.z, 1.2, DUST);
        ploughAt(dog.pos.x, dog.pos.z, 30, 40, 0, 0, 40);
        shake(0.9);
        for (let i = 0; i < 30; i++) {
          const a = (i / 30) * Math.PI * 2;
          dust.spawn(dog.pos.x + Math.cos(a) * 20, 2, dog.pos.z + Math.sin(a) * 20, Math.cos(a) * 80, 4, Math.sin(a) * 80, 1.2, 5, 0xc9c2b6, 0, 1.5);
        }
        S.bark();
        setState('chase');
      }
      break;
    case 'chase': {
      dog.yaw = turnToward(dog.yaw, toCat, 2.2, dt);
      move = d > 60 ? speed * (d > 200 ? 1.6 : 1) : 0;
      gait = move > 0 ? 1 : 0.2;
      dog.barkT -= dt;
      if (play && dog.barkT <= 0 && d < 150) {
        setState('bark');
        S.growl(0.6);
      }
      if (core.phase >= 2 && dog.t > 2.5 && play) setState('aim'); // phase 2: charge, skid, fetch, chase, repeat
      break;
    }
    case 'bark':
      dog.yaw = turnToward(dog.yaw, toCat, 3, dt);
      dog.head.rotation.x = -Math.min(0.5, dog.t * 1.2); // rears back
      dog.jaw.rotation.x = Math.min(0.6, dog.t);
      eyeMat.emissiveIntensity = 1.6 + Math.sin(t * 40) * 1.2;
      if (dog.t > 0.6) {
        bark();
        dog.head.rotation.x = 0.25;
        dog.barkT = param(spec, 'bark', 4) * (core.phase >= 2 ? 0.8 : 1);
        setState('chase');
      }
      break;
    case 'aim':
      // crouch, scrape a paw, glare
      dog.yaw = turnToward(dog.yaw, toCat, 4, dt);
      dog.body.position.y = -2.5 * Math.min(1, dog.t * 3);
      eyeMat.emissiveIntensity = 2.5 + Math.sin(t * 30) * 1.5;
      if (Math.random() < 0.5) dust.spawn(dog.pos.x + Math.sin(dog.yaw) * 10, 1, dog.pos.z + Math.cos(dog.yaw) * 10, -Math.sin(dog.yaw) * 40, 10, -Math.cos(dog.yaw) * 40, 0.6, 3, 0xc9c2b6, 0, 1.5);
      if (dog.t > 0.15 && dog.t - dt <= 0.15) S.growl(0.8);
      if (dog.t > 0.9) {
        dog.cdx = Math.sin(dog.yaw);
        dog.cdz = Math.cos(dog.yaw);
        dog.chargeHit = false;
        dog.body.position.y = 0;
        A.whoosh();
        setState('charge');
      }
      break;
    case 'charge': {
      move = chargeV;
      gait = 2.2;
      // plough through whatever is in front (the cat takes the credit, obviously)
      const m = ploughAt(dog.pos.x + dog.cdx * 16, dog.pos.z + dog.cdz * 16, 20, 60, dog.cdx, dog.cdz, 70);
      if (m > 0) {
        score(m, hitV.set(dog.pos.x, 30, dog.pos.z), 'DOG DID IT ', false);
        shake(0.15);
      }
      if (!dog.chargeHit && play && d < R + P.radius + 6 && !C.air) {
        dog.chargeHit = true;
        startle(0.6, 'charge');
        soak(6, 'charge');
        furPoof();
        knockCat(dog.cdx * 140 + (dx / d) * 60, dog.cdz * 140 + (dz / d) * 60, 0.5);
        A.thud(1.4);
        shake(0.6);
      }
      // stops after 2.2 s or before running off the city edge
      if (dog.t > 2.2 || Math.abs(dog.pos.x + dog.cdx * 30) > city.half - 20 || Math.abs(dog.pos.z + dog.cdz * 30) > city.half - 20) setState('skid');
      break;
    }
    case 'skid':
      move = chargeV * Math.max(0, 1 - dog.t / 0.6);
      gait = 0.3;
      if (Math.random() < 0.8) dust.spawn(dog.pos.x, 2, dog.pos.z, (Math.random() - 0.5) * 30, 8, (Math.random() - 0.5) * 30, 0.8, 5, 0xc9c2b6, 0, 1.5);
      if (dog.t > 0.6) {
        dog.balls = 0;
        setState('fetch');
      }
      break;
    case 'fetch':
      dog.yaw = turnToward(dog.yaw, toCat, 3, dt);
      if (play && dog.balls < 3 && dog.t > 0.3 + dog.balls * 0.35) {
        fireBall();
        dog.balls++;
      }
      if (dog.t > 1.6) setState('chase');
      break;
    case 'dying': {
      dog.body.rotation.z = Math.min(Math.PI / 2, dog.t * 1.2) * 0.9; // keels over
      dog.body.position.y = -Math.min(6, dog.t * 4);
      dog.boomT -= dt;
      if (dog.boomT <= 0 && dog.t < 1.6) {
        dog.boomT = 0.22;
        explode(dog.pos.x + (Math.random() - 0.5) * 30, 15 + Math.random() * 20, dog.pos.z + (Math.random() - 0.5) * 30, 1);
      }
      if (dog.t > 0.15 && dog.head.parent === dog.body) {
        // the head pops off and bounces away: boing
        dog.head.getWorldPosition(tmp);
        dog.body.remove(dog.head);
        dog.head.position.copy(tmp);
        dog.head.rotation.set(0, dog.yaw, 0);
        scene.add(dog.head);
        dog.headVel.set((Math.random() - 0.5) * 50, 80, (Math.random() - 0.5) * 50);
        dog.headSpin = 8;
        S.boing(0.6);
      }
      if (dog.head.parent === scene) {
        dog.headVel.y -= 120 * dt;
        dog.head.position.addScaledVector(dog.headVel, dt);
        dog.head.rotation.x += dog.headSpin * dt;
        if (dog.head.position.y < 6 && dog.headVel.y < 0) {
          dog.head.position.y = 6;
          dog.headVel.y = Math.abs(dog.headVel.y) * 0.5;
          dog.headVel.x *= 0.6;
          dog.headVel.z *= 0.6;
          dog.headSpin *= 0.5;
          if (dog.headVel.y > 12) S.boing(0.5);
        }
      }
      if (dog.t > 1.6 && dog.t - dt <= 1.6) {
        explode(dog.pos.x, 20, dog.pos.z, 3);
        flash(0.6);
      }
      if (dog.t > 1.6 && Math.random() < 0.7) fire.spawn(dog.pos.x + (Math.random() - 0.5) * 20, 10, dog.pos.z + (Math.random() - 0.5) * 20, 0, 18, 0, 1.2, 3 + Math.random() * 3, Math.random() < 0.3 ? 0xff8a2a : 0x4a4a4a, 4, 2);
      if (dog.t > 6) setState('wreck');
      break;
    }
    case 'wreck':
      dog.body.position.y -= dt * 5;
      if (dog.head.parent === scene) dog.head.position.y -= dt * 5;
      if (dog.t > 3) {
        dog.g.visible = false;
        if (dog.head.parent === scene) scene.remove(dog.head);
        dog.body.add(dog.head);
        dog.state = 'off';
        core.up = false;
      }
      break;
  }
  if (dog.state !== 'aim' && dog.state !== 'bark' && dog.state !== 'dying' && dog.state !== 'wreck') {
    eyeMat.emissiveIntensity = 1.6;
    dog.head.rotation.x *= Math.max(0, 1 - dt * 6);
    dog.jaw.rotation.x *= Math.max(0, 1 - dt * 6);
  }
  if (move > 0) {
    const fx = dog.state === 'charge' || dog.state === 'skid' ? dog.cdx : Math.sin(dog.yaw);
    const fz = dog.state === 'charge' || dog.state === 'skid' ? dog.cdz : Math.cos(dog.yaw);
    const lim = city.half - 25;
    dog.pos.x = Math.max(-lim, Math.min(lim, dog.pos.x + fx * move * dt));
    dog.pos.z = Math.max(-lim, Math.min(lim, dog.pos.z + fz * move * dt));
    if (dog.state === 'chase') {
      // tramples small houses as it walks
      dog.plough -= dt;
      if (dog.plough <= 0) {
        dog.plough = 0.15;
        const m = ploughAt(dog.pos.x + fx * 12, dog.pos.z + fz * 12, 14, 22, fx, fz, 30);
        if (m > 0) score(m, hitV.set(dog.pos.x, 20, dog.pos.z), 'DOG DID IT ', false);
      }
    }
  }
  // walk cycle, tail wag, antenna blink
  dog.step += dt * (gait > 0 ? 4 + gait * 4 : 0);
  for (let i = 0; i < 4; i++) dog.legs[i].rotation.x = gait > 0 ? Math.sin(dog.step + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45 * Math.min(1, gait) : 0;
  dog.tail.rotation.z = Math.sin(t * (core.phase >= 2 ? 14 : 8)) * 0.5;
  tipMat.emissiveIntensity = Math.sin(t * 6) > 0 ? 1.6 : 0.2;
  if (dog.state !== 'dying' && dog.state !== 'wreck') dog.body.position.y = dog.state === 'aim' ? dog.body.position.y : Math.abs(Math.sin(dog.step)) * 1.2 * Math.min(1, gait);
  if (dog.state !== 'drop' && (d < 200 || dog.state === 'dying')) core.focus(dog.pos.x, dog.pos.z, dog.state === 'dying' ? 1 : Math.min(1, (200 - d) / 80));
  dog.g.position.copy(dog.pos);
  dog.g.rotation.y = dog.state === 'charge' || dog.state === 'skid' ? Math.atan2(dog.cdx, dog.cdz) : dog.yaw;
  if (dog.state !== 'drop' && dog.state !== 'dying' && dog.state !== 'wreck') pushCatOut(dog.pos.x, dog.pos.z, R - 2, dt);
  // bark shock rings
  for (let i = 0; i < 3; i++) {
    const r = dog.rings[i];
    if (dog.ringT[i] === 0 && !r.visible) continue;
    dog.ringT[i] += dt;
    const k = dog.ringT[i];
    if (k < 0) continue;
    if (k > 0.5) {
      r.visible = false;
      dog.ringT[i] = 0;
      continue;
    }
    r.visible = true;
    r.position.set(dog.pos.x + Math.sin(dog.yaw) * 20, 18 - k * 24, dog.pos.z + Math.cos(dog.yaw) * 20);
    r.rotation.set(-Math.PI / 2, 0, dog.yaw + Math.PI); // the arc opens along the dog's heading
    r.scale.setScalar(20 + k * 220);
    (r.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k / 0.5);
  }
}
const DUST = [0xd6d0c6, 0xbab2a6, 0xffd24a] as const;

const alive = () => core.up && !core.dead && dog.state !== 'off' && dog.state !== 'drop';

export const mechaDogType: EnemyType = {
  id: 'mechaDog',
  boss: true,
  init() {
    build();
  },
  begin(s, level) {
    spec = s;
    core.begin(s, level, 40);
  },
  update,
  clear() {
    core.reset();
    spec = null;
    dog.state = 'off';
    dog.g.visible = false;
    if (dog.head.parent === scene) {
      scene.remove(dog.head);
      dog.body.add(dog.head);
    }
    for (const r of dog.rings) r.visible = false;
    dog.ringT.fill(0);
  },
  alive() {
    return alive() ? 1 : 0;
  },
  onSwat(hit: SwatHit) {
    swatProjectiles(hit, ownerPos);
    if (alive() && swatHits(hit, dog.pos.x, CY, dog.pos.z, R, 40)) hurt(bossDamage(DOG_DAMAGE, 'swat', { power: hit.power }), hitV.set(hit.strike.x, hit.strike.y, hit.strike.z));
  },
  onPounceLand(x, z, r) {
    if (alive() && circleHits(x, z, r, dog.pos.x, dog.pos.z, R)) {
      hurt(bossDamage(DOG_DAMAGE, 'pounce'), hitV.set(dog.pos.x, CY + 10, dog.pos.z));
      dog.body.position.y = -3; // squashed
    }
  },
  onLaser(p) {
    if (!alive() || !laserHits(p, dog.pos.x, CY, dog.pos.z, R + 4) || !core.laserOnce()) return;
    hurt(bossDamage(DOG_DAMAGE, 'laser', { frames: frame.dt * 60 }), hitV.copy(p), false);
    if (Math.random() < 0.5) fire.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 20, 20, (Math.random() - 0.5) * 20, 0.5, 2.5, 0xff8a2a, -10, 1);
  },
  onBlast(b: Blast) {
    if (alive() && blastHits(b, dog.pos.x, dog.pos.z, R)) hurt(bossDamage(DOG_DAMAGE, 'blast', { power: b.power }), hitV.set(dog.pos.x, CY + 8, dog.pos.z));
  },
  // bosses ignore the final frenzy
};

/** Debug: set the dog's HP to a fraction of max (shots/enemies-*.mjs). */
export function debugDog(f: number): void {
  core.setHpFrac(f);
  if (core.phase >= 2 && dog.state === 'chase') setState('aim');
}
export const dogState = () => ({ state: dog.state, hp: core.hp, maxHp: core.maxHp, phase: core.phase, x: dog.pos.x, z: dog.pos.z });

/** The dog's position while it is a live target (for the off-screen arrow). No allocation. */
export function dogTarget(out: THREE.Vector3): boolean {
  if (!alive()) return false;
  out.set(dog.pos.x, 30, dog.pos.z);
  return true;
}
