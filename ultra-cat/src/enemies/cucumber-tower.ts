// Cucumber towers: green launchers that pop up on rooftops 150 to 300 away and lob cucumbers at the cat (every cat's
// mortal enemy). Owned by the ENEMIES lane. A hit startles the cat (no input), a swatted cucumber flies back and can
// take its tower out. The tower dies when its roof floor is knocked off, or to a swat, laser, pounce or blast.
//
// spec.params (all optional):
//   fire   seconds between lobs (3)    range  max firing distance (360)
//   lead   how much it leads the cat, 0..1 (0.85)    value  $M on kill (5)
import * as THREE from 'three';
import { St } from '../core/bodies';
import { reportKill } from '../core/enemies';
import { scene } from '../core/engine';
import { pop, showBanner } from '../core/hud';
import { score } from '../core/score';
import { C, G, game } from '../core/state';
import type { Blast, EnemySpec, EnemyType, SwatHit } from '../core/types';
import { city, FLOOR } from '../core/world';
import { blastHits, circleHits, explode, laserHits, pickRoof, spawnBlockedByBoss, splash, sweepHits, swatHits } from './common';
import { clearProjectiles, launch, swatProjectiles, updateProjectiles, zapProjectilesNear, type ProjKind } from './projectiles';
import * as S from './sfx';
import { param, Spawner } from './spawn';

type State = 'rise' | 'idle' | 'fall' | 'sink' | 'off';

interface Tower {
  g: THREE.Group;
  pivot: THREE.Object3D;
  barrel: THREE.Object3D;
  bi: number; // building
  seg: number; // the floor it stands on
  pos: THREE.Vector3;
  vy: number;
  state: State;
  t: number;
  fireT: number;
  far: number;
  glow: THREE.MeshStandardMaterial;
  dead: boolean;
}

const MAX = 6;
const TS = 1.6; // model scale
const pool: Tower[] = [];
const spawner = new Spawner();
let spec: EnemySpec | null = null;
let announced = false;

const green = new THREE.MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.55 });
const dark = new THREE.MeshStandardMaterial({ color: 0x245c22, roughness: 0.7 });
const steel = new THREE.MeshStandardMaterial({ color: 0x7c848f, roughness: 0.5, metalness: 0.4 });
const crate = new THREE.MeshStandardMaterial({ color: 0xa8743a, roughness: 0.9 });
const glow = new THREE.MeshStandardMaterial({ color: 0x9dff7a, emissive: 0x44ff22, emissiveIntensity: 0 });
const box = new THREE.BoxGeometry(1, 1, 1);
const barrelGeo = new THREE.CapsuleGeometry(2.6, 11, 4, 12).rotateX(Math.PI / 2).translate(0, 0, 4);
const muzzleGeo = new THREE.TorusGeometry(2.7, 0.6, 6, 16).translate(0, 0, 0);
const cukeGeo = new THREE.CapsuleGeometry(1.2, 5, 3, 8).rotateZ(Math.PI / 2);
const legGeo = new THREE.CylinderGeometry(0.6, 0.6, 6, 6);

const popV = new THREE.Vector3();
const muzzle = new THREE.Vector3();

function makeTower(): Tower {
  const g = new THREE.Group();
  const base = new THREE.Mesh(box, steel);
  base.scale.set(11, 1.6, 11);
  base.position.y = 0.8;
  g.add(base);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, steel);
    leg.position.set(sx * 3, 4, 0);
    g.add(leg);
  }
  // ammo crate full of cucumbers
  const c = new THREE.Mesh(box, crate);
  c.scale.set(6, 3, 4);
  c.position.set(-5, 2.6, -4);
  g.add(c);
  for (let k = 0; k < 3; k++) {
    const ck = new THREE.Mesh(cukeGeo, green);
    ck.position.set(-5 + (k - 1) * 1.6, 4.6, -4 + (k - 1) * 0.6);
    ck.rotation.y = 0.3 * k;
    g.add(ck);
  }
  const pivot = new THREE.Group();
  pivot.position.y = 7.5;
  const barrel = new THREE.Group();
  const tube = new THREE.Mesh(barrelGeo, green);
  barrel.add(tube);
  for (let k = 0; k < 5; k++) {
    const stripe = new THREE.Mesh(box, dark);
    stripe.scale.set(0.6, 0.6, 9);
    const a = k * 1.25;
    stripe.position.set(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 4);
    barrel.add(stripe);
  }
  const gm = glow.clone();
  const m = new THREE.Mesh(muzzleGeo, gm);
  m.position.z = 11.5;
  barrel.add(m);
  pivot.add(barrel);
  g.add(pivot);
  g.traverse((o) => (o.castShadow = true));
  g.visible = false;
  scene.add(g);
  return { g, pivot, barrel, bi: -1, seg: -1, pos: new THREE.Vector3(), vy: 0, state: 'off', t: 0, fireT: 0, far: 0, glow: gm, dead: false };
}

const taken = (bi: number) => {
  for (const t of pool) if (t.state !== 'off' && t.bi === bi) return true;
  return false;
};

function spawn(): boolean {
  const tw = pool.find((p) => p.state === 'off');
  if (!tw) return false;
  let bi = pickRoof(150, 300, 14, taken);
  if (bi < 0) bi = pickRoof(110, 380, 7, taken);
  if (bi < 0) return false;
  const b = city.buildings[bi];
  const h = city.standing(b);
  tw.bi = bi;
  tw.seg = b.first + Math.round(h / FLOOR) - 1;
  tw.pos.set(b.x, h, b.z);
  tw.state = 'rise';
  tw.t = 0;
  tw.fireT = 1.5 + Math.random();
  tw.far = 0;
  tw.vy = 0;
  tw.dead = false;
  tw.g.position.copy(tw.pos);
  tw.g.rotation.set(0, 0, 0);
  tw.g.scale.setScalar(0.01);
  tw.g.visible = true;
  if (!announced) {
    announced = true;
    showBanner(innerWidth < 600 ? 'CUCUMBERS!' : 'CUCUMBER TOWERS ON THE ROOFS!', '#7dff6a');
  }
  return true;
}

const isAlive = (t: Tower) => t.state === 'rise' || t.state === 'idle';

/** Kill a tower (counts and scores). `fall` = its roof is gone: it tumbles down first. */
function destroy(tw: Tower, fall: boolean, label = 'CUKE TOWER! '): void {
  if (!isAlive(tw)) return;
  tw.dead = true;
  popV.set(tw.pos.x, tw.pos.y + 8, tw.pos.z);
  reportKill('cucumberTower', popV);
  score(param(spec, 'value', 5), popV, label);
  pop('PICKLED!', popV.setY(tw.pos.y + 24), '#7dff6a', 28);
  if (fall) {
    tw.state = 'fall';
    tw.t = 0;
    tw.vy = 10;
  } else {
    boomTower(tw);
  }
}

function boomTower(tw: Tower): void {
  explode(tw.pos.x, tw.pos.y + 5 * TS, tw.pos.z, 0.9, GREENS);
  splash(tw.pos.x, tw.pos.y + 4, tw.pos.z, 16, 45, 0x7dff6a);
  S.splat(1.5);
  tw.state = 'off';
  tw.g.visible = false;
}
const GREENS = [0x7dff6a, 0x3f9a3a, 0xffd24a] as const;

/** Swatted-back cucumber reached tower `i`. */
function backHit(i: number): void {
  const tw = pool[i];
  if (!tw || !isAlive(tw)) return;
  destroy(tw, false, 'RETURN TO SENDER! ');
}
function ownerPos(i: number, _k: ProjKind, out: THREE.Vector3): boolean {
  const tw = pool[i];
  if (!tw || !isAlive(tw)) return false;
  out.set(tw.pos.x, tw.pos.y + 7 * TS, tw.pos.z);
  return true;
}

function update(dt: number, t: number): void {
  if (spawner.tick(G.elapsed, cucumberTowerType.alive(), spawnBlockedByBoss())) {
    if (!spawn()) spawner.next = G.elapsed + 2; // no roof in range right now: try again soon
  }
  const play = game.mode === 'play';
  const every = param(spec, 'fire', 3);
  const range = param(spec, 'range', 360);
  const lead = param(spec, 'lead', 0.85);
  for (let i = 0; i < pool.length; i++) {
    const tw = pool[i];
    if (tw.state === 'off') continue;
    tw.t += dt;
    const g = tw.g;
    // its roof floor got knocked off: down it goes
    if (isAlive(tw) && city.segs.state[tw.seg] !== St.Static) destroy(tw, true, 'TOPPLED! ');
    const dx = C.pos.x - tw.pos.x;
    const dz = C.pos.z - tw.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    switch (tw.state) {
      case 'rise':
        g.scale.setScalar(TS * Math.min(1, tw.t / 0.5) * (1 + Math.sin(Math.min(1, tw.t / 0.5) * Math.PI) * 0.25));
        if (tw.t > 0.5) {
          tw.state = 'idle';
          g.scale.setScalar(TS);
          S.boing(1.6);
        }
        break;
      case 'idle': {
        // aim: yaw at the cat, pitch up for the lob
        tw.pivot.rotation.y = Math.atan2(dx, dz);
        const pitch = -0.5 - Math.min(0.5, d / 700);
        tw.fireT -= dt;
        const tele = tw.fireT < 0.6 && tw.fireT > 0;
        tw.glow.emissiveIntensity = tele ? 1.2 + Math.sin(t * 40) * 0.6 : tw.glow.emissiveIntensity * Math.max(0, 1 - dt * 6);
        tw.barrel.rotation.x = pitch + (tele ? Math.sin(t * 50) * 0.04 : 0);
        tw.barrel.position.z += (0 - tw.barrel.position.z) * Math.min(1, dt * 8);
        if (tw.fireT <= 0) {
          tw.fireT = every * (0.9 + Math.random() * 0.2);
          if (play && d < range) {
            const T = 1.5 + d / 300;
            tw.barrel.updateWorldMatrix(true, false);
            muzzle.set(0, 0, 13).applyMatrix4(tw.barrel.matrixWorld);
            const tx = C.pos.x + C.vel.x * T * lead;
            const tz = C.pos.z + C.vel.z * T * lead;
            if (launch('cuke', muzzle.x, muzzle.y, muzzle.z, tx, 18, tz, T, i, backHit)) {
              S.thwip();
              S.whistle(T);
              tw.barrel.position.z = -3; // recoil
            }
          }
        }
        tw.far = d > range + 60 ? tw.far + dt : 0;
        if (tw.far > 6) {
          tw.state = 'sink'; // the cat wandered off: pack up and pop up somewhere else later
          tw.t = 0;
        }
        break;
      }
      case 'fall':
        tw.vy -= 80 * dt;
        tw.pos.y += tw.vy * dt;
        g.rotation.x += dt * 3;
        g.rotation.z += dt * 2;
        if (tw.pos.y <= 2) boomTower(tw);
        break;
      case 'sink':
        g.scale.setScalar(TS * Math.max(0.01, 1 - tw.t / 0.6));
        if (tw.t > 0.6) {
          tw.state = 'off';
          g.visible = false;
        }
        break;
    }
    if (tw.state !== 'off') g.position.copy(tw.pos);
  }
  updateProjectiles(dt, t);
}

export const cucumberTowerType: EnemyType = {
  id: 'cucumberTower',
  init() {
    for (let i = 0; i < MAX; i++) pool.push(makeTower());
  },
  begin(s) {
    spec = s;
    spawner.reset(s);
    announced = false;
  },
  update,
  clear() {
    for (const tw of pool) {
      tw.state = 'off';
      tw.g.visible = false;
    }
    clearProjectiles();
    spec = null;
    spawner.reset(null);
  },
  alive() {
    let n = 0;
    for (const tw of pool) if (isAlive(tw)) n++;
    return n;
  },
  onSwat(hit: SwatHit) {
    swatProjectiles(hit, ownerPos);
    for (const tw of pool) if (isAlive(tw) && swatHits(hit, tw.pos.x, tw.pos.y + 6 * TS, tw.pos.z, 9 * TS, 30)) destroy(tw, false, 'SWAT! ');
  },
  onPounceLand(x, z, r) {
    for (const tw of pool) if (isAlive(tw) && tw.pos.y < 60 && circleHits(x, z, r, tw.pos.x, tw.pos.z, 6)) destroy(tw, false, 'POUNCE! ');
  },
  onLaser(p) {
    zapProjectilesNear(p.x, p.y, p.z, 8);
    for (const tw of pool) if (isAlive(tw) && laserHits(p, tw.pos.x, tw.pos.y + 6 * TS, tw.pos.z, 9 * TS)) destroy(tw, false, 'ZAPPED! ');
  },
  onLaserSweep(x, z, ang) {
    for (const tw of pool) if (isAlive(tw) && sweepHits(x, z, ang, tw.pos.x, tw.pos.z, 200, 0.93)) destroy(tw, false, 'ZAPPED! ');
  },
  onBlast(b: Blast) {
    for (const tw of pool) if (isAlive(tw) && blastHits(b, tw.pos.x, tw.pos.z, 8)) destroy(tw, false);
  },
  onFrenzy() {
    for (const tw of pool) {
      if (!isAlive(tw)) continue;
      tw.state = 'sink';
      tw.t = 0;
    }
  },
};

/** Debug (shots): live towers. Allocates; never call per frame. */
export const debugTowers = () => pool.filter((p) => p.state !== 'off').map((p) => ({ x: p.pos.x, y: p.pos.y, z: p.pos.z, state: p.state, bi: p.bi }));
