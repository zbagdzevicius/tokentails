// Water-cannon fire trucks. Owned by the ENEMIES lane.
// They drive the street grid toward the cat, stop within range and arc water at its head (soak + push away), with a
// cooldown between bursts. They flee from zoomies. Swat, pounce landing, laser, zoomies contact or any blast flips one.
//
// spec.params (all optional):
//   speed   drive speed (30)          range   stop-and-spray distance (90)
//   spray   patience per second (6)   push    push-away speed (15)
//   burst   seconds of spraying (2.5) cool    seconds between bursts (3.5)
// Every burst starts with a 1 s wind-up (turret rises, hose dribbles, hiss). The stream aims at a point that chases the
// cat at AIM_SPEED, and only soaks when the water has actually arrived there: walking out of the arc dodges it.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { reportKill } from '../core/enemies';
import { scene } from '../core/engine';
import { fire, water } from '../core/fx';
import { pop, showBanner } from '../core/hud';
import { soak, tug } from '../core/player';
import { score } from '../core/score';
import { C, G, game, P } from '../core/state';
import type { Blast, EnemySpec, EnemyType, SwatHit } from '../core/types';
import { city } from '../core/world';
import { ballistic } from './bossmath';
import { blastHits, bossFight, circleHits, explode, groundSpawn, hd, laserHits, loops, spawnBlockedByBoss, swatHits, turnToward, zoomHits } from './common';
import { drive, moverYaw, snapToLane, type Grid, type Mover } from './nav';
import * as S from './sfx';
import { param, Spawner } from './spawn';

type State = 'drive' | 'spray' | 'flee' | 'flip' | 'burn' | 'retreat' | 'dead';

interface Truck {
  g: THREE.Group;
  turret: THREE.Object3D;
  barrel: THREE.Object3D;
  nozzle: THREE.Object3D;
  m: Mover;
  state: State;
  t: number;
  cool: number;
  yaw: number;
  vel: THREE.Vector3;
  spin: number;
  y: number;
  ax: number; // where the stream is aimed (chases the cat's head at AIM_SPEED)
  az: number;
  live: boolean; // in use (pool slot taken)
}

const MAX = 8;
const SCALE = 1.5;
const WINDUP = 1;
const AIM_SPEED = 55;
const TURRET_Y = 7.6;
const pool: Truck[] = [];
const spawner = new Spawner();
let spec: EnemySpec | null = null;
let announced = false;

// shared look
const red = new THREE.MeshStandardMaterial({ color: 0xd8262b, roughness: 0.45 });
const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.25, metalness: 0.6 });
const brass = new THREE.MeshStandardMaterial({ color: 0xd9a33a, roughness: 0.3, metalness: 0.5 });
const glass = new THREE.MeshStandardMaterial({ color: 0x7fc6ff, roughness: 0.1 });
const tyre = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.9 });
const sirenR = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff0000, emissiveIntensity: 1 });
const sirenB = new THREE.MeshStandardMaterial({ color: 0x2a6bff, emissive: 0x0040ff, emissiveIntensity: 0 });
const box = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(1.9, 1.9, 1.4, 12).rotateZ(Math.PI / 2);
const barrelGeo = new THREE.CylinderGeometry(0.7, 1.1, 8, 10).rotateX(Math.PI / 2).translate(0, 0, 4);
const turretGeo = new THREE.CylinderGeometry(2.2, 2.6, 2, 12);

const grid: Grid = { n: 9, block: 100, half: 450 };
const head = new THREE.Vector3();
const noz = new THREE.Vector3();
const vtmp = { x: 0, y: 0, z: 0 };
const popV = new THREE.Vector3();

function part(parent: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, geo: THREE.BufferGeometry = box): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function makeTruck(): Truck {
  const g = new THREE.Group();
  const body = new THREE.Group(); // lifted so the flip rotates around the middle
  body.position.y = 0;
  g.add(body);
  part(body, red, 7, 4.2, 15, 0, 4.4, -2.5); // rear body
  part(body, white, 7.1, 0.8, 15.1, 0, 3.6, -2.5); // stripe
  part(body, red, 7, 6, 5.5, 0, 5.2, 7.2); // cab
  part(body, glass, 6.2, 2.4, 0.4, 0, 6.6, 10); // windscreen
  part(body, chrome, 7.4, 1.2, 0.8, 0, 2.6, 10.1); // bumper
  part(body, chrome, 0.4, 0.5, 13, -2.6, 7.3, -3); // ladder rails
  part(body, chrome, 0.4, 0.5, 13, 2.6, 7.3, -3);
  for (let k = 0; k < 5; k++) part(body, chrome, 5.2, 0.3, 0.4, 0, 7.3, -8.5 + k * 2.7);
  part(body, sirenR, 1.6, 0.9, 1.2, -1.8, 8.6, 7.2);
  part(body, sirenB, 1.6, 0.9, 1.2, 1.8, 8.6, 7.2);
  for (const z of [-7.5, -2.5, 7]) for (const x of [-3.6, 3.6]) part(body, tyre, 1, 1, 1, x, 1.9, z, wheelGeo);
  // the water cannon turret
  const turret = new THREE.Group();
  turret.position.set(0, 7.6, 2.5);
  part(turret, chrome, 1, 1, 1, 0, 0, 0, turretGeo);
  const barrel = new THREE.Group();
  barrel.position.y = 1;
  part(barrel, brass, 1, 1, 1, 0, 0, 0, barrelGeo);
  const nozzle = new THREE.Object3D();
  nozzle.position.set(0, 0, 8.5);
  barrel.add(nozzle);
  turret.add(barrel);
  body.add(turret);
  g.scale.setScalar(SCALE); // kaiju scale: big enough to read next to a 46 m cat
  g.visible = false;
  scene.add(g);
  return { g, turret, barrel, nozzle, m: { x: 0, z: 0, axis: 0, dir: 1, lane: 6 }, state: 'dead', t: 0, cool: 0, yaw: 0, vel: new THREE.Vector3(), spin: 0, y: 0, ax: 0, az: 0, live: false };
}

const tmpSpawn = new THREE.Vector3();
function spawn(): void {
  const tr = pool.find((p) => !p.live);
  if (!tr) return;
  tr.live = true;
  tr.state = 'drive';
  tr.t = 0;
  tr.cool = 1 + Math.random();
  tr.y = 0;
  groundSpawn(tmpSpawn, 240, 70);
  // start heading toward the cat along the longer leg
  const dx = C.pos.x - tmpSpawn.x;
  const dz = C.pos.z - tmpSpawn.z;
  tr.m.axis = Math.abs(dx) > Math.abs(dz) ? 1 : 0;
  tr.m.dir = (tr.m.axis === 1 ? dx : dz) >= 0 ? 1 : -1;
  tr.m.x = tmpSpawn.x;
  tr.m.z = tmpSpawn.z;
  snapToLane(grid, tr.m);
  tr.yaw = moverYaw(tr.m);
  tr.g.rotation.set(0, tr.yaw, 0);
  tr.g.position.set(tr.m.x, 0, tr.m.z);
  tr.turret.rotation.set(0, 0, 0);
  tr.turret.position.y = TURRET_Y;
  tr.barrel.rotation.set(0, 0, 0);
  tr.g.visible = true;
  if (!announced) {
    announced = true;
    showBanner(innerWidth < 600 ? 'FIRE TRUCKS!' : 'WATER-CANNON TRUCKS INCOMING', '#ff5a4a');
  }
}

const alive = (t: Truck) => t.live && (t.state === 'drive' || t.state === 'spray' || t.state === 'flee' || t.state === 'retreat');

function flip(t: Truck, dx: number, dz: number, label = 'FLIP! '): void {
  if (!alive(t)) return;
  t.state = 'flip';
  t.t = 0;
  t.vel.set(dx * 40, 55, dz * 40);
  t.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
  t.g.getWorldPosition(popV);
  popV.y = 14;
  reportKill('cannonTruck', popV);
  score(param(spec, 'value', 4), popV, label);
  pop('HOSED!', popV.setY(30), '#ff5a4a', 26);
  S.honk();
  A.thud(0.8);
  G.hitStop = 0.05;
}

function update(dt: number, t: number): void {
  grid.n = city.n;
  grid.block = city.block;
  grid.half = city.half;
  if (spawner.tick(G.elapsed, cannonTruckType.alive(), spawnBlockedByBoss())) spawn();
  const play = game.mode === 'play';
  const speed = param(spec, 'speed', 30);
  const range = param(spec, 'range', 90);
  const spray = param(spec, 'spray', 6);
  const push = param(spec, 'push', 15);
  const burstT = WINDUP + param(spec, 'burst', 2.5);
  const coolT = param(spec, 'cool', 3.5);
  const zoomies = C.speed > P.walk + 5 && !C.air;
  head.set(C.pos.x, P.headY + C.y, C.pos.z);
  // sirens blink
  const blink = Math.sin(t * 12) > 0;
  sirenR.emissiveIntensity = blink ? 1.4 : 0.05;
  sirenB.emissiveIntensity = blink ? 0.05 : 1.6;
  let nearest = 1e9;
  let hosing = 0;
  for (const tr of pool) {
    if (!tr.live) continue;
    const g = tr.g;
    const dx = C.pos.x - tr.m.x;
    const dz = C.pos.z - tr.m.z;
    const d = Math.hypot(dx, dz) || 1;
    tr.cool -= dt;
    tr.t += dt;
    switch (tr.state) {
      case 'drive':
      case 'flee':
      case 'retreat': {
        if (bossFight.up && tr.state !== 'retreat') {
          tr.state = 'retreat'; // the boss takes the stage: trucks drive off
          tr.t = 0;
        }
        const fleeing = tr.state !== 'drive';
        if (tr.state === 'drive' && zoomies && d < 220) tr.state = 'flee';
        else if (tr.state === 'flee' && !zoomies) tr.state = 'drive';
        const sp = (fleeing ? speed * 1.5 : speed) * (d < range * 1.3 && !fleeing ? 0.6 : 1);
        if (tr.state === 'drive' && d < range && tr.cool <= 0 && play && !bossFight.up) {
          tr.state = 'spray';
          tr.t = 0;
          tr.ax = tr.m.x + dx * 0.6; // the first shot lands short of the cat, then walks onto it
          tr.az = tr.m.z + dz * 0.6;
          A.hiss();
          break;
        }
        if (tr.state === 'drive' && d < range * 0.7) break; // close enough: idle while the hose recharges
        drive(grid, tr.m, sp * dt, C.pos.x, C.pos.z, fleeing);
        tr.yaw = turnToward(tr.yaw, moverYaw(tr.m), 6, dt);
        if (tr.state === 'retreat') {
          if (tr.t > 2.5) tr.y -= dt * 8; // drives off and sinks out of the picture
          if (tr.y < -12) {
            tr.live = false;
            g.visible = false;
          }
        }
        tr.turret.rotation.y = turnToward(tr.turret.rotation.y, 0, 2, dt);
        break;
      }
      case 'spray': {
        // the aim point chases the cat's head; walking away fast outruns the stream
        const adx = C.pos.x - tr.ax;
        const adz = C.pos.z - tr.az;
        const ad = Math.hypot(adx, adz);
        if (ad > 0.01) {
          const st = Math.min(ad, AIM_SPEED * dt);
          tr.ax += (adx / ad) * st;
          tr.az += (adz / ad) * st;
        }
        const tdx = tr.ax - tr.m.x;
        const tdz = tr.az - tr.m.z;
        const td = Math.hypot(tdx, tdz) || 1;
        const localYaw = Math.atan2(tdx, tdz) - tr.yaw;
        tr.turret.rotation.y = turnToward(tr.turret.rotation.y, Math.atan2(Math.sin(localYaw), Math.cos(localYaw)), 5, dt);
        tr.barrel.rotation.x = -0.35 - Math.min(0.4, td / 400);
        tr.nozzle.getWorldPosition(noz);
        if (tr.t < WINDUP) {
          // wind-up tell: the turret rises and shudders, the hose dribbles
          const k = tr.t / WINDUP;
          tr.turret.position.y = TURRET_Y + k * 2 + Math.sin(tr.t * 60) * 0.15;
          if (Math.random() < 0.5) water.spawn(noz.x, noz.y, noz.z, (Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.5, 1.2 + k, 0x58c4ff, -60, 0.2);
        } else if (play) {
          const T = Math.max(0.35, td / 130);
          for (let k = 0; k < 4; k++) {
            ballistic(tr.ax - noz.x, head.y - noz.y, tr.az - noz.z, T, -60, vtmp);
            water.spawn(noz.x, noz.y, noz.z, vtmp.x * 1.35 + (Math.random() - 0.5) * 8, vtmp.y + (Math.random() - 0.5) * 8, vtmp.z * 1.35 + (Math.random() - 0.5) * 8, T + 0.15, 1.8 + Math.random(), 0x58c4ff, -60, 0.6);
          }
          // soak only once the water has arrived, and only where it lands
          if (tr.t > WINDUP + T && ad < P.radius + 10 && d < range * 1.4) {
            soak(spray * dt, 'cannonTruck');
            tug((dx / d) * push, (dz / d) * push);
            hosing = Math.max(hosing, 1 - d / (range * 1.4));
          }
        }
        if (tr.t > burstT || d > range * 1.5 || (zoomies && d < 220) || !play || bossFight.up) {
          tr.state = bossFight.up ? 'retreat' : zoomies ? 'flee' : 'drive';
          tr.t = 0;
          tr.cool = coolT;
          tr.turret.position.y = TURRET_Y;
        }
        break;
      }
      case 'flip': {
        tr.vel.y -= 90 * dt;
        tr.m.x += tr.vel.x * dt;
        tr.m.z += tr.vel.z * dt;
        tr.y += tr.vel.y * dt;
        g.rotation.z += tr.spin * dt;
        if (tr.y <= 0 && tr.t > 0.2) {
          tr.y = 0;
          // land on the roof, wheels up
          g.rotation.z = Math.PI;
          tr.state = 'burn';
          tr.t = 0;
          explode(tr.m.x, 6, tr.m.z, 0.9);
        }
        break;
      }
      case 'burn': {
        if (Math.random() < 0.8) fire.spawn(tr.m.x + (Math.random() - 0.5) * 8, 6 + Math.random() * 3, tr.m.z + (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, 14 + Math.random() * 10, (Math.random() - 0.5) * 6, 0.8, 2 + Math.random() * 2, Math.random() < 0.6 ? 0xff8a2a : 0x444444, 8, 1.6);
        if (tr.t > 2.2) tr.y -= dt * 6;
        if (tr.y < -10) {
          tr.live = false;
          tr.state = 'dead';
          g.visible = false;
        }
        break;
      }
    }
    if (tr.state !== 'flip' && tr.state !== 'burn') g.rotation.set(0, tr.yaw, 0);
    // bulldozing zoomies flip it on contact
    if (alive(tr) && zoomHits(tr.m.x, tr.m.z, 13)) flip(tr, hd.nx, hd.nz, 'BULLDOZED! ');
    g.position.set(tr.m.x, tr.y + (tr.state === 'burn' ? 9 * SCALE : 0), tr.m.z);
    if (tr.state === 'drive' || tr.state === 'spray' || tr.state === 'flee') {
      g.position.y += Math.abs(Math.sin(t * 9 + tr.m.x)) * 0.25; // engine rumble
      nearest = Math.min(nearest, d);
    }
  }
  if (play) {
    loops.siren = Math.max(loops.siren, Math.max(0, 1 - nearest / 320));
    loops.hose = Math.max(loops.hose, hosing);
  }
}

export const cannonTruckType: EnemyType = {
  id: 'cannonTruck',
  init() {
    for (let i = 0; i < MAX; i++) pool.push(makeTruck());
  },
  begin(s) {
    spec = s;
    spawner.reset(s);
    announced = false;
  },
  update,
  clear() {
    for (const tr of pool) {
      tr.live = false;
      tr.state = 'dead';
      tr.g.visible = false;
    }
    spec = null;
    spawner.reset(null);
  },
  alive() {
    let n = 0;
    for (const tr of pool) if (alive(tr) && tr.state !== 'retreat') n++;
    return n;
  },
  onSwat(hit: SwatHit) {
    for (const tr of pool) if (alive(tr) && swatHits(hit, tr.m.x, 6, tr.m.z, 14)) flip(tr, hit.fwd.x, hit.fwd.z, 'SWAT! ');
  },
  onPounceLand(x, z, r) {
    for (const tr of pool) if (alive(tr) && circleHits(x, z, r, tr.m.x, tr.m.z, 12)) flip(tr, hd.nx, hd.nz, 'POUNCE! ');
  },
  onLaser(p) {
    for (const tr of pool) if (alive(tr) && laserHits(p, tr.m.x, 6, tr.m.z, 15)) flip(tr, hd.nx, hd.nz, 'ZAPPED! ');
  },
  onBlast(b: Blast) {
    for (const tr of pool) if (alive(tr) && blastHits(b, tr.m.x, tr.m.z, 12)) flip(tr, hd.nx, hd.nz);
  },
  onFrenzy() {
    for (const tr of pool) {
      if (!alive(tr)) continue;
      tr.state = 'retreat';
      tr.t = 0;
    }
  },
};

/** Debug (shots): live trucks. Allocates; never call per frame. */
export const debugTrucks = () => pool.filter((p) => p.live).map((p) => ({ x: p.m.x, z: p.m.z, state: p.state }));

/** Nearest live, driving or spraying truck to (x, z): writes its position to `out`, returns the squared distance or -1. No allocation. */
export function nearestTruck(x: number, z: number, out: THREE.Vector3): number {
  let best = -1;
  for (const t of pool) {
    if (!t.live || (t.state !== 'drive' && t.state !== 'spray')) continue;
    const d = (t.m.x - x) ** 2 + (t.m.z - z) ** 2;
    if (best < 0 || d < best) {
      best = d;
      out.set(t.m.x, 8, t.m.z);
    }
  }
  return best;
}
