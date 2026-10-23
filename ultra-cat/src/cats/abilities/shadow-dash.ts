// Midnight ULTRA: SHADOW DASH. Owned by the CATS lane.
// Every 0.6 s the cat blinks 120 units forward through everything (smash along the line, r 18), leaving afterimage
// ghosts. Immune to water and stuns while active. The dash takes a few frames so the camera can follow it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scene } from '../../core/engine';
import { blastEnemies } from '../../core/enemies';
import { events } from '../../core/events';
import { dust, shake } from '../../core/fx';
import { flash, popMoney } from '../../core/hud';
import { addFrameHook } from '../../core/loop';
import { comboHit, score } from '../../core/score';
import { C, G, game, P } from '../../core/state';
import type { Blast, CatRig, UltraAbility } from '../../core/types';
import { city, smash, type Push } from '../../core/world';
import { startlePeople } from '../../world/people';
import { launchCarsNear } from '../../world/traffic';
import { shadowRise, shadowWhoosh } from '../sfx';

const EVERY = 0.6;
const DIST = 120;
const DASH_T = 0.11; // seconds the blink takes
const R = 18;
const STEP = 9;
const POWER = 2.5; // $ multiplier on what the line smashes (the r 18 line alone was ~0.7x the tabby laser)
const GHOSTS = 12;
const PER_DASH = 4;
const SLICES = [0.17, 0.5, 0.83];

interface Ghost {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  peak: number;
}

const ghosts: Ghost[] = [];
let nextGhost = 0;
const ghostGeo = new Map<CatRig, THREE.BufferGeometry>();
let inited = false;

let active = false;
let timer = 0;
let dashing = false;
let dashAge = 0;
let dashLen = 0;
let doneS = 0; // distance already swept this dash
const from = new THREE.Vector3();
const dir = new THREE.Vector3();
const at = new THREE.Vector3();
const saved = { wet: 1, stun: 1 };
const hit: Blast = { x: 0, z: 0, r: 22, power: 2, dirX: 0, dirZ: 0, source: 'ultra' };
const push: Push = (sx, _sy, sz, o) => {
  // floors are flung forward and out to both sides of the dash line
  const side = (sx - from.x) * -dir.z + (sz - from.z) * dir.x >= 0 ? 1 : -1;
  o.set(dir.x * 70 - dir.z * side * 45 + (Math.random() - 0.5) * 20, 25 + Math.random() * 25, dir.z * 70 + dir.x * side * 45 + (Math.random() - 0.5) * 20);
};
const carVel = (_dx: number, _dz: number, _d: number, o: THREE.Vector3) => o.set(dir.x * 90 + (Math.random() - 0.5) * 40, 50 + Math.random() * 20, dir.z * 90 + (Math.random() - 0.5) * 40);

/** One merged silhouette of the current rig pose (built once per rig: a single draw call per ghost). */
function silhouette(rig: CatRig): THREE.BufferGeometry {
  const cached = ghostGeo.get(rig);
  if (cached) return cached;
  rig.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(rig.root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const parts: THREE.BufferGeometry[] = [];
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material;
    if (mat.transparent) return; // skip eye glows
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', mesh.geometry.getAttribute('position').clone());
    g.setAttribute('normal', mesh.geometry.getAttribute('normal').clone());
    const idx = mesh.geometry.getIndex();
    if (idx) g.setIndex(idx.clone());
    g.applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
    parts.push(idx ? g : g.toNonIndexed());
  });
  const indexed = parts.filter((p) => p.getIndex());
  const merged = mergeGeometries(indexed, false) ?? new THREE.SphereGeometry(20);
  for (const p of parts) p.dispose();
  ghostGeo.set(rig, merged);
  return merged;
}

function init(): void {
  if (inited) return;
  inited = true;
  for (let i = 0; i < GHOSTS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x6b3cff, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    scene.add(mesh);
    ghosts.push({ mesh, mat, age: 0, life: 1, peak: 0 });
  }
  addFrameHook((dt) => {
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      if (!g.mesh.visible) continue;
      g.age += dt;
      const k = g.age / g.life;
      if (k >= 1) {
        g.mesh.visible = false;
        continue;
      }
      g.mat.opacity = g.peak * (1 - k);
      g.mesh.position.y += dt * 6; // ghosts drift up a touch as they fade
    }
  });
  events.on('levelLoad', () => {
    for (const g of ghosts) g.mesh.visible = false;
    dashing = false;
  });
}

function ghost(x: number, z: number, heading: number, peak: number, life: number): void {
  const g = ghosts[nextGhost];
  nextGhost = (nextGhost + 1) % GHOSTS;
  g.mesh.geometry = silhouette(game.rig);
  g.mesh.position.set(x, C.y, z);
  g.mesh.rotation.set(0, heading, 0);
  g.mesh.scale.setScalar(P.scale);
  g.mesh.visible = true;
  g.age = 0;
  g.life = life;
  g.peak = peak;
  g.mat.opacity = peak;
}

function startDash(): void {
  // aim down the cat's heading; bounce back off the city edge like a pinball
  const lim = city.half - 14;
  for (let tries = 0; tries < 2; tries++) {
    dir.set(Math.sin(C.heading), 0, Math.cos(C.heading));
    let len = DIST;
    if (dir.x > 1e-4) len = Math.min(len, (lim - C.pos.x) / dir.x);
    if (dir.x < -1e-4) len = Math.min(len, (-lim - C.pos.x) / dir.x);
    if (dir.z > 1e-4) len = Math.min(len, (lim - C.pos.z) / dir.z);
    if (dir.z < -1e-4) len = Math.min(len, (-lim - C.pos.z) / dir.z);
    dashLen = Math.max(0, len);
    if (dashLen > 30) break;
    C.heading += Math.PI;
    game.camYaw = C.heading;
  }
  from.copy(C.pos);
  dashing = true;
  dashAge = 0;
  doneS = 0;
  ghost(C.pos.x, C.pos.z, C.heading, 0.42, 0.55);
  shadowWhoosh();
}

function sweep(toS: number): void {
  let money = 0;
  for (let s = doneS; s < toS; s += STEP) {
    const px = from.x + dir.x * s;
    const pz = from.z + dir.z * s;
    money += smash(px, pz, R, 0, 90, push);
    launchCarsNear(px, pz, R + 4, carVel);
    for (let i = 0; i < 3; i++) dust.spawn(px + (Math.random() - 0.5) * 16, 6 + Math.random() * 30, pz + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, 4, (Math.random() - 0.5) * 10, 0.7, 3 + Math.random() * 2, 0x2a1a4a, 0, 1.4);
  }
  doneS = Math.max(doneS, toS);
  if (money > 0) {
    score(money * POWER, at.set(C.pos.x, 30, C.pos.z), G.ultraT > 0 ? 'ZAP ' : 'DASH ', false);
    shake(0.2);
  }
}

function endDash(): void {
  dashing = false;
  sweep(dashLen + 0.01);
  // enemies along the line: three slices so each is hit at most once or twice
  hit.dirX = dir.x;
  hit.dirZ = dir.z;
  for (const f of SLICES) {
    hit.x = from.x + dir.x * dashLen * f;
    hit.z = from.z + dir.z * dashLen * f;
    hit.r = Math.max(22, dashLen / 6 + 4);
    blastEnemies(hit);
  }
  startlePeople(from.x + dir.x * dashLen * 0.5, from.z + dir.z * dashLen * 0.5, dashLen * 0.6, 26, 10);
  for (let i = 1; i < PER_DASH; i++) {
    const f = i / PER_DASH;
    ghost(from.x + dir.x * dashLen * f, from.z + dir.z * dashLen * f, C.heading, 0.14 + f * 0.22, 0.4 + f * 0.2);
  }
  comboHit(); // each blink feeds the chain once
  game.rig.squash = 0.5;
  flash(0.15);
}

export const shadowDash: UltraAbility = {
  id: 'shadowDash',
  name: 'SHADOW DASH!',
  color: '#a98bff',
  tallyLabel: 'DASH',
  moveMul: 1.15,
  camWide: false,
  start() {
    init();
    active = true;
    saved.wet = P.wetResist;
    saved.stun = P.stunResist;
    P.wetResist = 0;
    P.stunResist = 0;
    C.stun = 0;
    timer = 0.15;
    silhouette(game.rig);
    shadowRise();
  },
  update(dt) {
    C.stun = 0;
    if (dashing) {
      dashAge += dt;
      const k = Math.min(1, dashAge / DASH_T);
      const s = dashLen * k;
      C.pos.set(from.x + dir.x * s, C.pos.y, from.z + dir.z * s);
      game.rig.root.position.set(C.pos.x, C.y, C.pos.z);
      sweep(s);
      if (k >= 1) endDash();
      return;
    }
    timer -= dt;
    if (timer <= 0 && !C.air) {
      timer = EVERY;
      startDash();
    }
  },
  stop() {
    if (!active) return;
    active = false;
    if (dashing && game.mode === 'play') {
      // finish the blink in progress rather than freezing mid-line
      C.pos.set(from.x + dir.x * dashLen, C.pos.y, from.z + dir.z * dashLen);
      endDash();
    }
    dashing = false;
    P.wetResist = saved.wet;
    P.stunResist = saved.stun;
    if (G.zap > 0 && game.mode === 'play') popMoney('DASH TOTAL ', G.zap, at.set(C.pos.x, 70, C.pos.z));
  },
};
