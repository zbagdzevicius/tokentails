// Cucumber jets: grey delta jets that make strafing passes over the cat, dipping from altitude 120 to 70 and dropping
// three water-filled cucumber bombs in a line. Owned by the ENEMIES lane. A bomb startles and soaks.
// Kill it by pouncing through it while it is low, with the laser, or by swatting it on the dive. Roomba Prime calls
// extra jets in its last phase through spawnJet().
//
// spec.params (all optional):
//   speed  flight speed (130)    alt  cruise altitude (120)    low  dive altitude (70)
//   passes passes before it leaves (3)    value  $M on kill (8)
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { reportKill } from '../core/enemies';
import { scene } from '../core/engine';
import { fire, shake } from '../core/fx';
import { flash, pop, showBanner } from '../core/hud';
import { score } from '../core/score';
import { C, G, game } from '../core/state';
import type { Blast, EnemySpec, EnemyType, SwatHit } from '../core/types';
import { radial, smash } from '../core/world';
import { blastHits, bodyHits, explode, laserHits, spawnBlocked, sweepHits, swatHits } from './common';
import { clearProjectiles, launch, swatProjectiles, updateProjectiles, zapProjectilesNear } from './projectiles';
import * as S from './sfx';
import { param, Spawner } from './spawn';

type State = 'fly' | 'fall' | 'off';

interface Jet {
  g: THREE.Group;
  bombs: THREE.Object3D[];
  flame: THREE.Mesh;
  state: State;
  // the current pass: a straight line through (ax, az) along (dx, dz); s = distance along it past the aim point
  ax: number;
  az: number;
  dx: number;
  dz: number;
  s: number;
  pass: number;
  dropped: number;
  roared: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
  bank: number;
}

const MAX = 4;
const pool: Jet[] = [];
const spawner = new Spawner();
let spec: EnemySpec | null = null;
let announced = false;
const START = 560;
const DIP = 160;

const wingMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
const darkGrey = new THREE.MeshStandardMaterial({ color: 0x5b636d, roughness: 0.5, metalness: 0.3 });
const canopy = new THREE.MeshStandardMaterial({ color: 0x7ed6ff, roughness: 0.05, metalness: 0.2 });
const cukeMat = new THREE.MeshStandardMaterial({ color: 0x5fbf4a, roughness: 0.4 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.85 });
const stripe = new THREE.MeshStandardMaterial({ color: 0x5fbf4a, roughness: 0.5 });
const wingGeo = (() => {
  // flat delta wing, nose toward +z
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0, 12, -14, 0, -10, 14, 0, -10, 0, 0, 12, 14, 0, -10, -14, 0, -10]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();
const bodyGeo = new THREE.CylinderGeometry(1.4, 2.4, 24, 10).rotateX(Math.PI / 2);
const noseGeo = new THREE.ConeGeometry(1.4, 6, 10).rotateX(Math.PI / 2).translate(0, 0, 15);
const canopyGeo = new THREE.SphereGeometry(1.6, 10, 8);
const finGeo = new THREE.BoxGeometry(0.5, 6, 6);
const bombGeo = new THREE.CapsuleGeometry(1.2, 4, 3, 8).rotateX(Math.PI / 2);
const flameGeo = new THREE.ConeGeometry(1.8, 7, 8).rotateX(-Math.PI / 2).translate(0, 0, -15.5);

const popV = new THREE.Vector3();
const dropV = new THREE.Vector3();

function makeJet(): Jet {
  const g = new THREE.Group();
  const wing = new THREE.Mesh(wingGeo, wingMat);
  const body = new THREE.Mesh(bodyGeo, darkGrey);
  const nose = new THREE.Mesh(noseGeo, stripe);
  const cp = new THREE.Mesh(canopyGeo, canopy);
  cp.scale.set(1, 0.8, 2.2);
  cp.position.set(0, 1.4, 5);
  const fin = new THREE.Mesh(finGeo, darkGrey);
  fin.position.set(0, 3.2, -8);
  fin.rotation.x = -0.4;
  const flame = new THREE.Mesh(flameGeo, flameMat);
  g.add(wing, body, nose, cp, fin, flame);
  const bombs: THREE.Object3D[] = [];
  for (const x of [-6, 0, 6]) {
    const b = new THREE.Mesh(bombGeo, cukeMat);
    b.position.set(x, -1.8, -2);
    g.add(b);
    bombs.push(b);
  }
  g.traverse((o) => (o.castShadow = true));
  g.visible = false;
  scene.add(g);
  return { g, bombs, flame, state: 'off', ax: 0, az: 0, dx: 1, dz: 0, s: 0, pass: 0, dropped: 0, roared: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, bank: 0 };
}

/** Start a pass through the cat's position along a random (or given) heading. */
function newPass(j: Jet, ang: number): void {
  j.dx = Math.sin(ang);
  j.dz = Math.cos(ang);
  const lead = 1.2;
  j.ax = C.pos.x + C.vel.x * lead;
  j.az = C.pos.z + C.vel.z * lead;
  j.s = -START;
  j.dropped = 0;
  j.roared = false;
  for (const b of j.bombs) b.visible = true;
}

/** Launch a jet now (spawner or Roomba Prime). */
export function spawnJet(): boolean {
  if (!pool.length) cucumberJetType.init();
  const j = pool.find((p) => p.state === 'off');
  if (!j) return false;
  j.state = 'fly';
  j.pass = 0;
  j.bank = 0;
  newPass(j, Math.random() * Math.PI * 2);
  j.g.visible = true;
  if (!announced) {
    announced = true;
    showBanner(innerWidth < 600 ? 'CUCUMBER JETS!' : 'CUCUMBER JETS! POUNCE THEM LOW', '#7dff6a');
  }
  return true;
}

function down(j: Jet, kill: boolean, label = 'JET! '): void {
  if (j.state !== 'fly') return;
  j.state = 'fall';
  j.vel.set(j.dx * 70 + (Math.random() - 0.5) * 30, 15, j.dz * 70 + (Math.random() - 0.5) * 30);
  j.spin = 10;
  if (!kill) return;
  popV.copy(j.pos);
  reportKill('cucumberJet', popV);
  score(param(spec, 'value', 8), popV, label);
  pop('SPLASHED DOWN!', popV, '#7dff6a', 28);
  A.meow('short', game.cat.voice);
  shake(0.4);
  G.hitStop = 0.08;
}

function update(dt: number, t: number): void {
  if (spawner.tick(G.elapsed, cucumberJetType.alive(), spawnBlocked())) spawnJet();
  const play = game.mode === 'play';
  const speed = param(spec, 'speed', 130);
  const alt = param(spec, 'alt', 120);
  const low = param(spec, 'low', 70);
  const passes = param(spec, 'passes', 3);
  for (const j of pool) {
    if (j.state === 'off') continue;
    const g = j.g;
    if (j.state === 'fly') {
      j.s += speed * dt;
      const k = Math.max(0, 1 - Math.abs(j.s) / DIP);
      const dip = k * k * (3 - 2 * k);
      j.pos.set(j.ax + j.dx * j.s, alt - (alt - low) * dip, j.az + j.dz * j.s);
      if (!j.roared && j.s > -DIP * 1.8) {
        j.roared = true;
        S.jetRoar();
      }
      // three bombs in a line across the aim point, released early so they arc down onto it
      if (play && j.dropped < 3) {
        const off = (j.dropped - 1) * 30;
        const T = 1.15;
        if (j.s >= off - speed * 0.35 * T) {
          dropV.set(j.ax + j.dx * off, 0, j.az + j.dz * off);
          if (launch('bomb', j.pos.x, j.pos.y - 3, j.pos.z, dropV.x, 0, dropV.z, T, -1, null, -90)) {
            S.whistle(T);
            j.bombs[j.dropped].visible = false;
          }
          j.dropped++;
        }
      }
      if (j.s > START) {
        j.pass++;
        if (j.pass >= passes || !play) {
          j.state = 'off'; // gone home
          g.visible = false;
          continue;
        }
        newPass(j, Math.atan2(j.dx, j.dz) + Math.PI + (Math.random() - 0.5) * 1.2);
        j.pos.set(j.ax + j.dx * j.s, alt, j.az + j.dz * j.s);
          }
      j.bank += ((j.s < -DIP ? 0.25 : j.s > DIP ? -0.3 : 0) - j.bank) * Math.min(1, dt * 2);
      g.position.copy(j.pos);
      g.rotation.set(0, Math.atan2(j.dx, j.dz), 0);
      g.rotateX(j.s < 0 && dip > 0 ? 0.25 * dip : -0.2 * dip);
      g.rotateZ(j.bank);
      j.flame.scale.set(1, 1, 0.8 + Math.random() * 0.5);
      if (Math.random() < 0.5) fire.spawn(j.pos.x - j.dx * 18, j.pos.y, j.pos.z - j.dz * 18, 0, 0, 0, 0.3, 1.4, 0xdddddd, 0, 1.8);
    } else {
      j.vel.y -= 70 * dt;
      j.pos.addScaledVector(j.vel, dt);
      g.position.copy(j.pos);
      g.rotation.y += j.spin * dt;
      g.rotation.z += 3 * dt;
      fire.spawn(j.pos.x, j.pos.y, j.pos.z, 0, 4, 0, 0.6, 1.8, Math.random() < 0.5 ? 0xff8a2a : 0x555555, 6, 1.5);
      if (j.pos.y < 3) {
        j.state = 'off';
        g.visible = false;
        explode(j.pos.x, 4, j.pos.z, 1.4);
        flash(0.3);
        const m = smash(j.pos.x, j.pos.z, 22, 0, 60, radial(j.pos.x, j.pos.z, 45, 40));
        if (m > 0) score(m, j.pos, 'CRASH ');
      }
    }
  }
  updateProjectiles(dt, t);
}

const flying = (j: Jet) => j.state === 'fly';
const noOwner = () => false;

export const cucumberJetType: EnemyType = {
  id: 'cucumberJet',
  init() {
    if (pool.length) return;
    for (let i = 0; i < MAX; i++) pool.push(makeJet());
  },
  begin(s) {
    spec = s;
    spawner.reset(s);
    announced = false;
  },
  update,
  clear() {
    for (const j of pool) {
      j.state = 'off';
      j.g.visible = false;
    }
    clearProjectiles();
    spec = null;
    spawner.reset(null);
  },
  alive() {
    let n = 0;
    for (const j of pool) if (flying(j)) n++;
    return n;
  },
  onSwat(hit: SwatHit) {
    swatProjectiles(hit, noOwner);
    for (const j of pool) if (flying(j) && j.pos.y < 95 && swatHits(hit, j.pos.x, j.pos.y, j.pos.z, 16, 40)) down(j, true, 'SWAT! ');
  },
  onPounceAir(p, r) {
    for (const j of pool) if (flying(j) && j.pos.y < 100 && bodyHits(p, r, j.pos.x, j.pos.y, j.pos.z, 12)) down(j, true, 'POUNCE! ');
  },
  onLaser(p) {
    zapProjectilesNear(p.x, p.y, p.z, 8);
    for (const j of pool) if (flying(j) && laserHits(p, j.pos.x, j.pos.y, j.pos.z, 16)) down(j, true, 'ZAPPED! ');
  },
  onLaserSweep(x, z, ang) {
    for (const j of pool) if (flying(j) && sweepHits(x, z, ang, j.pos.x, j.pos.z, 230, 0.86)) down(j, true, 'ZAPPED! ');
  },
  onBlast(b: Blast) {
    for (const j of pool) if (flying(j) && j.pos.y < 110 && blastHits(b, j.pos.x, j.pos.z, 30)) down(j, true);
  },
  onFrenzy() {
    for (const j of pool) down(j, false);
  },
};

/** Debug (shots): live jets. Allocates; never call per frame. */
export const debugJets = () => pool.filter((p) => p.state !== 'off').map((p) => ({ x: p.pos.x, y: p.pos.y, z: p.pos.z, s: p.s, state: p.state }));
