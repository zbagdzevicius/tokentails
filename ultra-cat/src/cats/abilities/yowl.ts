// Duchess ULTRA: SONIC YOWL. Owned by the CATS lane.
// Every 0.5 s a 60-degree cone shockwave rolls out to 220. Where the wavefront passes, the top floors of each building
// fly up and away (each wave strips a few more), cars tumble, people hop, flyers drop and ground enemies are stunned
// (enemy types handle that in onBlast with the cone). Visible expanding arc walls show the wave.
import * as THREE from 'three';
import * as A from '../../audio/sfx';
import { St } from '../../core/bodies';
import { blastEnemies } from '../../core/enemies';
import { events } from '../../core/events';
import { burst, dust, shake } from '../../core/fx';
import { popMoney } from '../../core/hud';
import { addFrameHook } from '../../core/loop';
import { comboHit, score } from '../../core/score';
import { C, G, game, P } from '../../core/state';
import type { Blast, UltraAbility } from '../../core/types';
import { city, FLOOR, markTouched, valMul } from '../../core/world';
import { startlePeople } from '../../world/people';
import { cars, launchCar } from '../../world/traffic';
import { yowl } from '../sfx';
import { FxPool } from './rings';

const EVERY = 0.5;
const RANGE = 220;
const LIFE = 0.5; // seconds for the front to reach RANGE
const HALF = Math.PI / 6; // 30 degrees each side
const COS = Math.cos(HALF);
const R0 = 14;
const FLOORS = 6; // floors stripped per building per wave, close in
const POWER = 1.6; // $ multiplier: Duchess is the priciest cat, her ULTRA should out-earn the free laser

interface Wave {
  on: boolean;
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  age: number;
  r: number; // gameplay front radius
  hit: boolean; // fed the combo already
}

const waves: Wave[] = [0, 1, 2].map(() => ({ on: false, ox: 0, oz: 0, dx: 0, dz: 1, age: 0, r: 0, hit: false }));
let nextWave = 0;
let walls: FxPool | null = null;
let bands: FxPool | null = null;
let floorArcs: FxPool | null = null;
let active = false;
let timer = 0;
let count = 0;
const at = new THREE.Vector3();
const enemyHit: Blast = { x: 0, z: 0, r: RANGE, power: 1.5, dirX: 0, dirZ: 1, cone: COS, source: 'ultra' };

/** Front radius at age `a`: the same ease-out FxPool uses, so the damage rides the visible wave. */
const front = (a: number) => {
  const t = Math.min(1, a / LIFE);
  return R0 + (RANGE - R0) * (1 - (1 - t) * (1 - t));
};

function init(): void {
  if (walls) return;
  const arc = (h: number) => new THREE.CylinderGeometry(1, 1, h, 28, 1, true, -HALF, HALF * 2).translate(0, h / 2, 0);
  walls = new FxPool(arc(1), 0x7fe3ff, 4);
  bands = new FxPool(arc(1), 0xe8fbff, 8);
  floorArcs = new FxPool(new THREE.RingGeometry(0.9, 1, 28, 1, Math.PI / 2 - HALF, HALF * 2), 0x7fe3ff, 4, true);
  addFrameHook((dt) => {
    if (dt <= 0) return;
    for (let i = 0; i < waves.length; i++) if (waves[i].on) stepWave(waves[i], dt);
  });
  events.on('levelLoad', () => {
    for (const w of waves) w.on = false;
    walls!.clear();
    bands!.clear();
    floorArcs!.clear();
  });
}

function launch(): void {
  const w = waves[nextWave];
  nextWave = (nextWave + 1) % waves.length;
  const s = P.scale;
  w.dx = Math.sin(C.heading);
  w.dz = Math.cos(C.heading);
  w.ox = C.pos.x + w.dx * 26 * s;
  w.oz = C.pos.z + w.dz * 26 * s;
  w.age = 0;
  w.r = R0;
  w.hit = false;
  w.on = true;
  const y = P.headY * 0.9 + C.y;
  walls!.fire(w.ox, 0, w.oz, R0, RANGE, LIFE, 0.42, C.heading, y + 30);
  bands!.fire(w.ox, y - 4, w.oz, R0, RANGE, LIFE, 1, C.heading, 8);
  bands!.fire(w.ox, y * 0.45, w.oz, R0 * 0.8, RANGE * 0.94, LIFE, 0.8, C.heading, 5);
  // the flat arc is centred on -z once laid down, so twist it half a turn past the heading
  floorArcs!.fire(w.ox, 1.2, w.oz, R0, RANGE * 1.02, LIFE * 1.1, 0.9, C.heading - Math.PI);
  enemyHit.x = w.ox;
  enemyHit.z = w.oz;
  enemyHit.dirX = w.dx;
  enemyHit.dirZ = w.dz;
  blastEnemies(enemyHit);
  yowl(game.cat.voice, count++);
  shake(0.3);
  game.rig.look = 0;
}

function stepWave(w: Wave, dt: number): void {
  w.age += dt;
  const r0 = w.r;
  const r1 = front(w.age);
  w.r = r1;
  if (w.age >= LIFE) w.on = false;
  if (game.mode !== 'play') return;
  const segs = city.segs;
  let money = 0;
  for (let bi = 0; bi < city.buildings.length; bi++) {
    const b = city.buildings[bi];
    const ex = b.x - w.ox;
    const ez = b.z - w.oz;
    const d = Math.hypot(ex, ez);
    if (d < r0 || d >= r1) continue;
    const reach = Math.max(b.hx, b.hz);
    // centre inside the cone, widened by the footprint so a tower straddling the edge still gets clipped
    if (d > 1 && (ex * w.dx + ez * w.dz) / d < Math.cos(HALF + Math.atan(reach / d))) continue;
    const ux = d > 1 ? ex / d : w.dx;
    const uz = d > 1 ? ez / d : w.dz;
    const f = 1 - (d / RANGE) * 0.6;
    let n = Math.max(1, Math.round(FLOORS * f));
    let launched = 0;
    let topY = 0;
    for (let k = b.count - 1; k >= 0 && n > 0; k--) {
      const i = b.first + k;
      if (segs.state[i] !== St.Static) continue;
      if (topY === 0) topY = FLOOR * (k + 0.5);
      const sp = 60 + 50 * f;
      segs.launch(i, ux * sp + (Math.random() - 0.5) * 25, 45 + Math.random() * 35 + (n * 6), uz * sp + (Math.random() - 0.5) * 25, 6);
      n--;
      launched++;
    }
    if (!launched) continue;
    money += launched * b.value * valMul(bi);
    markTouched(bi);
    burst(b.x - ux * b.hx, topY, b.z - uz * b.hz, 2, 0xd6f4ff);
  }
  // cars in the band tumble away
  for (let i = 0; i < cars.n; i++) {
    const p = i * 3;
    if (cars.pos[p + 1] > 3) continue;
    const ex = cars.pos[p] - w.ox;
    const ez = cars.pos[p + 2] - w.oz;
    const d = Math.hypot(ex, ez);
    if (d < r0 || d >= r1 || d < 1) continue;
    if ((ex * w.dx + ez * w.dz) / d < COS) continue;
    launchCar(i, (ex / d) * 70, 55 + Math.random() * 20, (ez / d) * 70);
  }
  const mid = (r0 + r1) * 0.5;
  startlePeople(w.ox + w.dx * mid, w.oz + w.dz * mid, Math.max(30, (r1 - r0) * 0.5 + mid * 0.5), 30, 12);
  if (Math.random() < 0.5) dust.spawn(w.ox + w.dx * mid, 2, w.oz + w.dz * mid, w.dx * 60, 6, w.dz * 60, 0.6, 4, 0xd6f4ff, 0, 1.5);
  if (money > 0) {
    score(money * POWER, at.set(w.ox + w.dx * mid, 40, w.oz + w.dz * mid), G.ultraT > 0 ? 'ZAP ' : 'YOWL ', false);
    A.crash(Math.min(2.5, money));
    if (!w.hit) {
      w.hit = true;
      comboHit();
    }
  }
}

export const sonicYowl: UltraAbility = {
  id: 'sonicYowl',
  name: 'SONIC YOWL!',
  color: '#7fe3ff',
  tallyLabel: 'YOWL',
  moveMul: 0.75,
  camWide: true,
  start() {
    init();
    active = true;
    timer = 0.08;
    count = 0;
  },
  update(dt) {
    timer -= dt;
    if (timer <= 0) {
      timer = EVERY;
      launch();
    }
  },
  stop() {
    if (!active) return;
    active = false;
    if (G.zap > 0 && game.mode === 'play') popMoney('YOWL TOTAL ', G.zap, at.set(C.pos.x, 70, C.pos.z));
  },
};
