// ROOMBA PRIME, the Fort Fluffington final boss: a 60 m robot vacuum with spinning brushes, a water-tank dome and an
// angry LED face. Owned by the ENEMIES lane. HP 135, three phases (cuts 70% / 42%; a hit never skips a phase):
//   1 SUCTION MODE (100-70%): roams after the cat, suction r 140 (tug 30, soak 4.5/s), drops 2 mini vacuums every 10 s.
//   2 SPIN CYCLE   (70-42%):  shield up; a 3 s spin attack, then dizzy for 3 s (shield down, double damage).
//   3 TANK MODE    (< 42%):   no shield, 1.3x speed, a water ring every 5 s (soak 15, jump over it), calls cucumber jets.
// Weak spot: pounce landing on it (8, or 12 when dizzy). Swat 2, laser 0.2 per 60 fps frame, blast 5 x power.
// Death ends the level (level.boss.endsLevel): core plays a 5 s outro after reportKill(..., true).
//
// spec.params (only when the campaign also lists roombaPrime in level.enemies; all optional):
//   hp (135)   speed (16)   suck tug speed (30)   range suction range (140)   soak suction soak/s (4.5)   ring ring soak (15)
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { activeEnemies, reportKill } from '../core/enemies';
import { scene } from '../core/engine';
import { dust, fire, fxMat, shake, water } from '../core/fx';
import { flash, pop, showBanner } from '../core/hud';
import { slow, soak, startle, tug } from '../core/player';
import { score } from '../core/score';
import { C, G, game, P } from '../core/state';
import type { Blast, EnemySpec, EnemyType, SwatHit } from '../core/types';
import { city } from '../core/world';
import { BossCore, emissiveOf, knockCat } from './boss';
import { bossDamage, ROOMBA_DAMAGE } from './bossmath';
import { blastHits, circleHits, explode, frame, furPoof, groundSpawn, laserHits, ploughAt, pushCatOut, splash, sparks, swatHits, turnToward, wantVacuum } from './common';
import { cucumberJetType, spawnJet } from './cucumber-jet';
import * as S from './sfx';
import { param } from './spawn';
import { spawnVacuum, vacuumType } from './vacuum';

type State = 'off' | 'enter' | 'roam' | 'spinUp' | 'spin' | 'dizzy' | 'ringUp' | 'dying' | 'wreck';

const core = new BossCore('roombaPrime', 'ROOMBA PRIME', [0.7, 0.42], ['SUCTION MODE', 'SPIN CYCLE', 'TANK MODE']);
let spec: EnemySpec | null = null;
let built = false;

// The model is built at R0/H0 and drawn VS times bigger (playtest: it was shorter than the cat). Gameplay uses R/H/CY.
const VS = 1.75;
const R0 = 30;
const H0 = 12;
const R = R0 * VS; // disc radius
const H = H0 * VS; // body height
const CY = 10 * VS;

const shellMat = emissiveOf(new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.3, metalness: 0.5 }));
const trimMat = emissiveOf(new THREE.MeshStandardMaterial({ color: 0xd9dee5, roughness: 0.25, metalness: 0.5 }));
const rubber = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
const tankMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a8cff, roughness: 0.2, transparent: true, opacity: 0.8 });
const panelMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.2 });
const ledMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 2 });
const bristleMat = new THREE.MeshStandardMaterial({ color: 0x4cc3ff, roughness: 0.8 });
const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x6cd0ff, emissive: 0x1a6cff, emissiveIntensity: 0.3, metalness: 0.4 });
const treadMat = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.9 });
const shieldMat = fxMat(0x7fe8ff);
shieldMat.opacity = 0.22;
const ringMat = fxMat(0x58c4ff);
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 40);
const domeGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
const bumperGeo = new THREE.TorusGeometry(R0 + 0.8, 1.8, 6, 40, Math.PI * 0.9).rotateX(Math.PI / 2).rotateY(Math.PI * 0.05 + Math.PI);
const bristleGeo = new THREE.BoxGeometry(14, 0.6, 1.2).translate(7, 0, 0);
const nozzleGeo = new THREE.CylinderGeometry(1, 1.6, 4, 8).rotateZ(Math.PI / 2);
const shieldGeo = new THREE.SphereGeometry(R0 + 9, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.94, 1, 64);

const rb = {
  g: new THREE.Group(),
  body: new THREE.Group(),
  brushes: [] as THREE.Object3D[],
  eyes: [] as THREE.Mesh[],
  mouth: null as unknown as THREE.Mesh,
  water: null as unknown as THREE.Mesh,
  dome: null as unknown as THREE.Mesh,
  shield: null as unknown as THREE.Mesh,
  nozzles: new THREE.Group(),
  treads: new THREE.Group(),
  ring: null as unknown as THREE.Mesh,
  pos: new THREE.Vector3(),
  yaw: 0,
  spinA: 0,
  state: 'off' as State,
  t: 0,
  dropT: 8,
  ringT: 3,
  jetT: 6,
  ringR: 0,
  ringOn: false,
  ringHit: false,
  spinHit: 0,
  boomT: 0,
  plough: 0,
  ringHinted: false,
  dizzyHinted: false,
};

const hitV = new THREE.Vector3();

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
  const { g, body } = rb;
  g.add(body);
  part(body, cyl, shellMat, R0, H0, R0, 0, H0 / 2 + 1.5, 0);
  part(body, cyl, trimMat, R0 - 3, 1.2, R0 - 3, 0, H0 + 1.6, 0); // lid ring
  part(body, cyl, shellMat, R0 - 6, 1.4, R0 - 6, 0, H0 + 2.4, 0);
  const bumper = new THREE.Mesh(bumperGeo, rubber);
  bumper.position.y = 5.5;
  body.add(bumper);
  // the LED face on the front rim
  part(body, box, panelMat, 22, 7, 2, 0, 8, R0 - 1.2);
  for (const sx of [-1, 1]) rb.eyes.push(part(body, box, ledMat, 5, 1.4, 0.6, sx * 5, 9.5, R0 - 0.1));
  rb.mouth = part(body, box, ledMat, 9, 1, 0.6, 0, 6, R0 - 0.1);
  // water tank dome
  rb.dome = part(body, domeGeo, tankMat, 16, 13, 16, 0, H0 + 3, -4);
  rb.water = part(body, cyl, waterMat, 15, 6, 15, 0, H0 + 6, -4);
  // side brushes, front left and right
  for (const sx of [-1, 1]) {
    const br = new THREE.Group();
    br.position.set(sx * (R0 - 6), 1.5, R0 - 8);
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(bristleGeo, bristleMat);
      b.rotation.y = (k * Math.PI * 2) / 5;
      br.add(b);
    }
    body.add(br);
    rb.brushes.push(br);
  }
  // tank mode extras: spray nozzles around the rim and treads (shown in phase 3)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const n = new THREE.Mesh(nozzleGeo, nozzleMat);
    n.position.set(Math.cos(a) * (R0 + 1), H0 - 1, Math.sin(a) * (R0 + 1));
    n.rotation.y = -a;
    rb.nozzles.add(n);
  }
  rb.nozzles.visible = false;
  body.add(rb.nozzles);
  for (const sx of [-1, 1]) part(rb.treads, box, treadMat, 8, 6, R0 * 1.6, sx * (R0 - 4), 2, 0);
  rb.treads.visible = false;
  g.add(rb.treads);
  body.scale.setScalar(VS);
  rb.treads.scale.setScalar(VS);
  rb.shield = new THREE.Mesh(shieldGeo, shieldMat);
  rb.shield.renderOrder = 8;
  rb.shield.visible = false;
  rb.shield.scale.setScalar(VS);
  g.add(rb.shield);
  g.traverse((o) => (o.castShadow = o !== rb.shield));
  g.visible = false;
  scene.add(g);
  rb.ring = new THREE.Mesh(ringGeo, ringMat);
  rb.ring.rotation.x = -Math.PI / 2;
  rb.ring.renderOrder = 9;
  rb.ring.visible = false;
  scene.add(rb.ring);
  core.flashOn(shellMat, trimMat);
}

function setState(s: State): void {
  rb.state = s;
  rb.t = 0;
}

function spawnBoss(): void {
  build();
  // roll in from far away, along a street
  groundSpawn(rb.pos, 330, 80);
  rb.yaw = Math.atan2(C.pos.x - rb.pos.x, C.pos.z - rb.pos.z);
  rb.dropT = 6;
  rb.ringT = 3;
  rb.jetT = 5;
  rb.ringOn = false;
  rb.ring.visible = false;
  rb.g.visible = true;
  rb.body.rotation.set(0, 0, 0);
  rb.body.position.set(0, 0, 0);
  rb.nozzles.visible = false;
  rb.treads.visible = false;
  rb.dome.visible = true;
  rb.water.visible = true;
  rb.ringHinted = rb.dizzyHinted = false;
  core.spawn(param(spec, 'hp', 135), 3);
  setState('enter');
  S.alarm();
  showBanner('ROOMBA PRIME!', '#ff3e3e', 2);
  flash(0.4);
}

const dizzy = () => rb.state === 'dizzy';
const shielded = () => core.phase === 2 && !dizzy();

function hurt(dmg: number, at: THREE.Vector3, loud = true): void {
  if (shielded()) {
    core.blocked(at);
    shieldMat.opacity = 0.6;
    return;
  }
  const r = core.hit(dmg, at, dizzy() ? 'CRIT!' : 'CLANK!', loud);
  if (r === 'phase') {
    const ph = core.phase;
    showBanner(ph === 2 ? 'SPIN CYCLE!' : 'TANK MODE!', '#ff3e3e', 2);
    S.alarm();
    flash(0.5);
    shake(0.6);
    if (ph === 2) setState('roam');
    else {
      rb.nozzles.visible = true;
      rb.treads.visible = true;
      rb.body.position.y = 4 * VS;
      rb.ringT = 1.5;
      setState('roam');
    }
  } else if (r === 'dead') die();
}

function die(): void {
  setState('dying');
  rb.boomT = 0;
  rb.ring.visible = false;
  rb.ringOn = false;
  rb.shield.visible = false;
  hitV.set(rb.pos.x, 30, rb.pos.z);
  score(500, hitV, 'ROOMBA PRIME ');
  showBanner('ROOMBA PRIME: UNPLUGGED!', '#ffd24a', 2);
  S.powerDown();
  A.meow('ultra', game.cat.voice);
  reportKill('roombaPrime', hitV, true);
  G.hitStop = 0.5; // slow motion on the killing blow
  flash(0.8);
  shake(1);
}

/** If a minion type is not part of this level's spawn list, the boss drives it so its minions still move and die. */
function driven(t: EnemyType): boolean {
  return !activeEnemies().includes(t);
}

function setFace(t: number): void {
  // angry \ / eyes; dizzy eyes spin; tank mode squints
  const [l, r] = rb.eyes;
  if (dizzy()) {
    l.rotation.z = t * 9;
    r.rotation.z = -t * 9;
    ledMat.emissive.setHex(0xffd24a);
    ledMat.color.setHex(0xffd24a);
  } else {
    l.rotation.z = -0.4;
    r.rotation.z = 0.4;
    const spin = rb.state === 'spin' || rb.state === 'spinUp';
    ledMat.emissive.setHex(spin ? 0xff8a00 : 0xff1010);
    ledMat.color.setHex(spin ? 0xff8a00 : 0xff2a2a);
  }
  rb.mouth.scale.x = core.phase >= 3 ? 12 : 9;
  ledMat.emissiveIntensity = rb.state === 'dying' || rb.state === 'wreck' ? Math.random() * 0.6 : 1.6 + Math.sin(t * 8) * 0.4;
}

function update(dt: number, t: number): void {
  if (!core.spawned && game.mode === 'play' && G.elapsed >= core.spawnAt) spawnBoss();
  if (driven(vacuumType)) vacuumType.update(dt, t);
  if (driven(cucumberJetType)) cucumberJetType.update(dt, t);
  if (rb.state === 'off') return;
  core.tick(dt);
  rb.t += dt;
  const play = game.mode === 'play';
  const dx = C.pos.x - rb.pos.x;
  const dz = C.pos.z - rb.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const toCat = Math.atan2(dx, dz);
  const base = param(spec, 'speed', 16) * (core.phase >= 3 ? 1.3 : 1);
  let move = 0;
  let suck = 0;
  let brush = 10;
  switch (rb.state) {
    case 'enter':
      rb.yaw = turnToward(rb.yaw, toCat, 1, dt);
      move = 45;
      suck = 0.5;
      if (rb.t > 2.5 || d < 160) setState('roam');
      break;
    case 'roam':
      rb.yaw = turnToward(rb.yaw, toCat, core.phase >= 3 ? 1.3 : 0.9, dt);
      move = d > R + P.radius + 4 ? base : 0;
      suck = core.phase === 2 ? 0.65 : 1;
      if (play && core.phase === 2 && rb.t > 4) {
        setState('spinUp');
        S.whirr(3.6);
      }
      if (play && core.phase >= 3) {
        rb.ringT -= dt;
        if (rb.ringT <= 0) setState('ringUp');
      }
      break;
    case 'spinUp':
      brush = 40;
      rb.spinA += dt * rb.t * 20;
      if (rb.t > 0.6) {
        rb.spinHit = 0;
        setState('spin');
      }
      break;
    case 'spin': {
      brush = 60;
      rb.spinA += dt * 22;
      rb.yaw = turnToward(rb.yaw, toCat, 1.4, dt);
      move = 62;
      // fling water from the rim
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        water.spawn(rb.pos.x + Math.cos(a) * R, 8, rb.pos.z + Math.sin(a) * R, Math.cos(a) * 70, 20 + Math.random() * 15, Math.sin(a) * 70, 0.6, 2, 0x58c4ff, -60, 0.5);
      }
      const m = ploughAt(rb.pos.x, rb.pos.z, R + 2, 30, Math.sin(rb.yaw), Math.cos(rb.yaw), 80);
      if (m > 0) score(m, hitV.set(rb.pos.x, 25, rb.pos.z), 'ROOMBA DID IT ', false);
      rb.spinHit -= dt;
      if (play && rb.spinHit <= 0 && d < R + P.radius + 4 && !C.air) {
        rb.spinHit = 1;
        startle(0.8, 'spin');
        soak(10, 'spin');
        furPoof();
        knockCat((dx / d) * 160, (dz / d) * 160, 0.5);
        A.thud(1.5);
        shake(0.6);
      }
      if (rb.t > 3) {
        setState('dizzy');
        S.boing(0.5);
        if (!rb.dizzyHinted) {
          rb.dizzyHinted = true;
          showBanner(innerWidth < 600 ? 'DIZZY! POUNCE IT!' : 'DIZZY! POUNCE ON IT NOW!', '#ffd24a', 2);
        }
      }
      break;
    }
    case 'dizzy':
      brush = 1;
      rb.body.rotation.z = Math.sin(rb.t * 6) * 0.06;
      rb.body.rotation.x = Math.cos(rb.t * 6) * 0.06;
      // cartoon stars circling the dome
      if (Math.random() < 0.6) {
        const a = t * 5 + Math.random() * 0.3;
        fire.spawn(rb.pos.x + Math.cos(a) * 30, H + 32 + Math.sin(t * 3) * 2, rb.pos.z + Math.sin(a) * 30, 0, 0, 0, 0.4, 2.2, 0xffe36a, 0, 0);
      }
      if (rb.t > 3) {
        rb.body.rotation.set(0, 0, 0);
        setState('roam');
      }
      break;
    case 'ringUp':
      // nozzles glow, hiss, then the ring goes out
      nozzleMat.emissiveIntensity = 1 + Math.sin(t * 40) * 0.8;
      if (rb.t > 0.05 && rb.t - dt <= 0.05) A.hiss();
      if (rb.t > 0.8) {
        nozzleMat.emissiveIntensity = 0.3;
        rb.ringOn = true;
        rb.ringR = R + 2;
        rb.ringHit = false;
        rb.ringT = 5;
        S.splat(2);
        if (!rb.ringHinted) {
          rb.ringHinted = true;
          showBanner(innerWidth < 600 ? 'JUMP THE RING!' : 'WATER RING! POUNCE OVER IT', '#58c4ff', 2);
        }
        setState('roam');
      }
      break;
    case 'dying': {
      brush = 0;
      rb.body.rotation.z = Math.sin(rb.t * 30) * 0.03 * (1 - rb.t / 2);
      rb.boomT -= dt;
      if (rb.boomT <= 0 && rb.t < 2) {
        rb.boomT = 0.2;
        explode(rb.pos.x + (Math.random() - 0.5) * 50, 8 + Math.random() * 14, rb.pos.z + (Math.random() - 0.5) * 50, 1.1);
      }
      if (rb.t > 0.6 && rb.dome.visible) {
        // the tank bursts: a wall of water (the cat is NOT amused, but it is already won)
        rb.dome.visible = false;
        rb.water.visible = false;
        splash(rb.pos.x, H + 8, rb.pos.z, 60, 90);
        S.splat(2.5);
      }
      if (rb.t > 2 && rb.t - dt <= 2) {
        explode(rb.pos.x, 15, rb.pos.z, 3.5);
        flash(0.7);
      }
      if (rb.t > 2 && Math.random() < 0.8) fire.spawn(rb.pos.x + (Math.random() - 0.5) * 40, 12, rb.pos.z + (Math.random() - 0.5) * 40, 0, 20, 0, 1.3, 3 + Math.random() * 4, Math.random() < 0.3 ? 0xff8a2a : 0x4a4a4a, 4, 2);
      if (rb.t > 6) setState('wreck');
      break;
    }
    case 'wreck':
      rb.body.position.y -= dt * 4;
      if (rb.t > 4) {
        rb.g.visible = false;
        rb.state = 'off';
        core.up = false;
      }
      break;
  }
  const live = rb.state !== 'dying' && rb.state !== 'wreck';
  // drive
  if (move > 0) {
    const lim = city.half - R - 4;
    rb.pos.x = Math.max(-lim, Math.min(lim, rb.pos.x + Math.sin(rb.yaw) * move * dt));
    rb.pos.z = Math.max(-lim, Math.min(lim, rb.pos.z + Math.cos(rb.yaw) * move * dt));
    if (rb.state !== 'spin') {
      rb.plough -= dt;
      if (rb.plough <= 0) {
        rb.plough = 0.12;
        const m = ploughAt(rb.pos.x + Math.sin(rb.yaw) * 10, rb.pos.z + Math.cos(rb.yaw) * 10, R - 4, 16, Math.sin(rb.yaw), Math.cos(rb.yaw), 40);
        if (m > 0) score(m, hitV.set(rb.pos.x, 18, rb.pos.z), 'ROOMBA DID IT ', false);
      }
    }
  }
  // suction: pulls the cat in, drains patience, streams dust into the intake
  const range = param(spec, 'range', 140);
  if (live && play && suck > 0 && d < range && !C.air && !dizzy()) {
    const k = Math.max(0.35, 1 - d / (range * 1.15)) * suck;
    const pull = param(spec, 'suck', 30) * k;
    tug((-dx / d) * pull, (-dz / d) * pull);
    slow(0.85);
    soak(param(spec, 'soak', 4.5) * suck * dt, 'roombaPrime');
    for (let q = 0; q < 2; q++) {
      const a = Math.random() * Math.PI * 2;
      const rr = d * (0.4 + Math.random() * 0.7);
      const sx = rb.pos.x + (dx / d) * rr + Math.cos(a) * 20;
      const sz = rb.pos.z + (dz / d) * rr + Math.sin(a) * 20;
      dust.spawn(sx, 2 + Math.random() * 12, sz, (rb.pos.x - sx) * 1.6, -2, (rb.pos.z - sz) * 1.6, 0.6, 1.6, 0xe0d6c4, 0, -0.4);
    }
  }
  if (live && play && rb.state !== 'enter') {
    // mini vacuums out of the back hatch
    rb.dropT -= dt;
    if (rb.dropT <= 0 && core.phase !== 2) {
      rb.dropT = core.phase >= 3 ? 14 : 10;
      const bx = rb.pos.x - Math.sin(rb.yaw) * (R + 4);
      const bz = rb.pos.z - Math.cos(rb.yaw) * (R + 4);
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        spawnVacuum(bx + Math.cos(rb.yaw) * side * 10, bz - Math.sin(rb.yaw) * side * 10, true, Math.cos(rb.yaw) * side * 25 - Math.sin(rb.yaw) * 20, -Math.sin(rb.yaw) * side * 25 - Math.cos(rb.yaw) * 20);
      }
      S.boing(1.2);
      pop('MINIONS!', hitV.set(bx, 30, bz), '#4cc3ff', 24);
    }
    if (core.phase >= 3) {
      rb.jetT -= dt;
      if (rb.jetT <= 0) {
        rb.jetT = 12;
        if (cucumberJetType.alive() < 2 && spawnJet()) showBanner('AIR SUPPORT!', '#7dff6a');
      }
    }
  }
  // water ring
  if (rb.ringOn) {
    rb.ringR += 110 * dt;
    const rr = rb.ringR;
    rb.ring.visible = true;
    rb.ring.position.set(rb.pos.x, 1.5, rb.pos.z);
    rb.ring.scale.setScalar(rr);
    (rb.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - rr / 230));
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      water.spawn(rb.pos.x + Math.cos(a) * rr, 2, rb.pos.z + Math.sin(a) * rr, Math.cos(a) * 30, 18 + Math.random() * 16, Math.sin(a) * 30, 0.4, 2.2, 0x58c4ff, -80, 0.4);
    }
    if (play && !rb.ringHit && Math.abs(d - rr) < 10 && C.y < 9) {
      rb.ringHit = true;
      soak(param(spec, 'ring', 15), 'ring');
      knockCat((dx / d) * 60, (dz / d) * 60, 0.35);
      A.hiss();
      splash(C.pos.x, 4, C.pos.z, 18, 50);
    }
    if (rr > 230) {
      rb.ringOn = false;
      rb.ring.visible = false;
    }
  }
  // looks
  rb.shield.visible = live && shielded() && rb.state !== 'enter';
  if (rb.shield.visible) {
    shieldMat.opacity += (0.22 + Math.sin(t * 4) * 0.05 - shieldMat.opacity) * Math.min(1, dt * 6);
    rb.shield.rotation.y += dt * 0.5;
  }
  for (const br of rb.brushes) br.rotation.y += dt * brush * (br.position.x > 0 ? -1 : 1);
  rb.water.position.y = H0 + 6 + Math.sin(t * 3) * 0.6;
  rb.water.rotation.z = Math.sin(t * 2) * 0.05;
  setFace(t);
  rb.g.position.set(rb.pos.x, 0, rb.pos.z);
  rb.g.rotation.y = rb.state === 'spin' || rb.state === 'spinUp' ? rb.spinA : rb.yaw;
  if (rb.state !== 'spin' && rb.state !== 'spinUp') rb.spinA = rb.yaw;
  if (live && rb.state !== 'enter') pushCatOut(rb.pos.x, rb.pos.z, R - 2, dt);
  if (rb.state === 'dying') core.focus(rb.pos.x, rb.pos.z, 1);
  else if (live && d < 260) core.focus(rb.pos.x, rb.pos.z, Math.min(1, (260 - d) / 90));
  if (live && play) wantVacuum(Math.max(0.25, 1 - d / 400), rb.state === 'spin' ? 0.7 : 0.42);
}

const alive = () => core.up && !core.dead && rb.state !== 'off';
const hittable = () => alive() && rb.state !== 'enter';

export const roombaPrimeType: EnemyType = {
  id: 'roombaPrime',
  boss: true,
  init() {
    build();
  },
  begin(s, level) {
    spec = s;
    core.begin(s, level, 20);
  },
  update,
  clear() {
    core.reset();
    spec = null;
    rb.state = 'off';
    rb.g.visible = false;
    rb.ring.visible = false;
    rb.ringOn = false;
  },
  alive() {
    return alive() ? 1 : 0;
  },
  onSwat(hit: SwatHit) {
    if (driven(vacuumType)) vacuumType.onSwat?.(hit);
    if (driven(cucumberJetType)) cucumberJetType.onSwat?.(hit);
    if (hittable() && swatHits(hit, rb.pos.x, CY, rb.pos.z, R, 40)) hurt(bossDamage(ROOMBA_DAMAGE, 'swat', { power: hit.power, dizzy: dizzy() }), hitV.set(hit.strike.x, Math.min(hit.strike.y, H + 4), hit.strike.z));
  },
  onPounceAir(p, r) {
    if (driven(cucumberJetType)) cucumberJetType.onPounceAir?.(p, r);
  },
  onPounceLand(x, z, r) {
    if (driven(vacuumType)) vacuumType.onPounceLand?.(x, z, r);
    if (!hittable()) return;
    // the weak spot: landing ON the disc
    if (circleHits(x, z, 6, rb.pos.x, rb.pos.z, R)) {
      const dmg = bossDamage(ROOMBA_DAMAGE, 'pounce', { dizzy: dizzy() });
      if (!shielded()) {
        pop(dizzy() ? 'WEAK SPOT x2!' : 'WEAK SPOT!', hitV.set(rb.pos.x, 40, rb.pos.z), '#ffd24a', 34);
        sparks(x, H + 4, z, 20);
      }
      hurt(dmg, hitV.set(x, H + 6, z));
      // the cat bounces off the lid
      knockCat(-Math.sin(rb.yaw) * 30 + (x - rb.pos.x) * 1.5, -Math.cos(rb.yaw) * 30 + (z - rb.pos.z) * 1.5, 0.4);
    } else if (circleHits(x, z, r, rb.pos.x, rb.pos.z, R)) hurt(bossDamage(ROOMBA_DAMAGE, 'swat', { dizzy: dizzy() }), hitV.set(x, H, z));
  },
  onLaser(p, dir) {
    if (driven(vacuumType)) vacuumType.onLaser?.(p, dir);
    if (driven(cucumberJetType)) cucumberJetType.onLaser?.(p, dir);
    if (!hittable() || !laserHits(p, rb.pos.x, CY, rb.pos.z, R + 2) || !core.laserOnce()) return;
    hurt(bossDamage(ROOMBA_DAMAGE, 'laser', { frames: frame.dt * 60, dizzy: dizzy() }), hitV.copy(p), false);
  },
  onLaserSweep(x, z, ang) {
    if (driven(cucumberJetType)) cucumberJetType.onLaserSweep?.(x, z, ang);
  },
  onBlast(b: Blast) {
    if (driven(vacuumType)) vacuumType.onBlast?.(b);
    if (driven(cucumberJetType)) cucumberJetType.onBlast?.(b);
    if (hittable() && blastHits(b, rb.pos.x, rb.pos.z, R)) hurt(bossDamage(ROOMBA_DAMAGE, 'blast', { power: b.power, dizzy: dizzy() }), hitV.set(rb.pos.x, CY + 8, rb.pos.z));
  },
  onFrenzy() {
    // bosses ignore the frenzy, but minions it drives still react
    if (driven(vacuumType)) vacuumType.onFrenzy?.();
    if (driven(cucumberJetType)) cucumberJetType.onFrenzy?.();
  },
};

/** Debug: set Roomba Prime's HP to a fraction of max (shots/enemies-*.mjs). */
export function debugRoomba(f: number): void {
  const before = core.phase;
  core.setHpFrac(f);
  if (core.phase !== before && core.phase >= 3) {
    rb.nozzles.visible = true;
    rb.treads.visible = true;
    rb.body.position.y = 4 * VS;
    rb.ringT = 1;
  }
  if (rb.state !== 'enter' && rb.state !== 'off' && rb.state !== 'dying') setState('roam');
}
/** Debug: force the next P2 spin (or dizzy) now. */
export function debugRoombaState(s: 'spin' | 'dizzy' | 'ringUp'): void {
  if (rb.state === 'off' || rb.state === 'dying') return;
  setState(s);
}
export const roombaState = () => ({ state: rb.state, hp: core.hp, maxHp: core.maxHp, phase: core.phase, x: rb.pos.x, z: rb.pos.z, shield: shielded() });

/** Roomba Prime's position while it is a live target (for the off-screen arrow). No allocation. */
export function roombaTarget(out: THREE.Vector3): boolean {
  if (!alive()) return false;
  out.set(rb.pos.x, 20, rb.pos.z);
  return true;
}
