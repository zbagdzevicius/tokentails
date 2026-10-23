// Robot vacuums: little angry discs that chase the cat over streets and lots and suck it in.
// Owned by the ENEMIES lane. Within range they tug the cat toward themselves, slow it and slowly drain patience.
// Swat, pounce landing, zoomies contact, laser or any blast unplugs one. Roomba Prime drops them through spawnVacuum().
//
// spec.params (all optional):
//   speed  chase speed (26)     range  suction range (40)    tug   pull speed toward it (18)
//   slow   speed multiplier while sucked (0.7)               soak  patience per second (3)
import * as THREE from 'three';
import { reportKill } from '../core/enemies';
import { scene } from '../core/engine';
import { dust } from '../core/fx';
import { pop, showBanner } from '../core/hud';
import { slow, soak, tug } from '../core/player';
import { score } from '../core/score';
import { C, G, game, P } from '../core/state';
import type { Blast, EnemySpec, EnemyType, SwatHit } from '../core/types';
import { blastHits, circleHits, explode, groundSpawn, hd, laserHits, slideMove, sparks, spawnBlocked, swatHits, turnToward, wantVacuum, zoomHits } from './common';
import * as S from './sfx';
import { param, Spawner } from './spawn';

type State = 'chase' | 'pop' | 'retreat' | 'off';

interface Vac {
  g: THREE.Group;
  brush: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  state: State;
  t: number;
  scale: number;
  minion: boolean; // dropped by Roomba Prime
  stuck: number; // seconds of little progress while chasing
  detour: number; // seconds left of steering around a building (sign = side)
}

const MAX = 14;
const VS = 1.6; // model scale: a 19 m disc reads next to the cat
const VR = 6 * VS; // body radius
const pool: Vac[] = [];
const spawner = new Spawner();
let spec: EnemySpec | null = null;
let announced = false;

const shell = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.35, metalness: 0.1 });
const top = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.3, metalness: 0.4 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff0010, emissiveIntensity: 1.5 });
const browMat = new THREE.MeshStandardMaterial({ color: 0x15171a });
const bristle = new THREE.MeshStandardMaterial({ color: 0x4cc3ff, roughness: 0.8 });
const discGeo = new THREE.CylinderGeometry(6, 6.2, 2.2, 24);
const topGeo = new THREE.CylinderGeometry(4.6, 5.4, 0.8, 24);
const bumperGeo = new THREE.TorusGeometry(6.1, 0.7, 6, 24, Math.PI * 1.1).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.05 - Math.PI / 2 + Math.PI * 0.5);
const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
const browGeo = new THREE.BoxGeometry(3.2, 0.5, 0.6);
const bristleGeo = new THREE.BoxGeometry(4.5, 0.25, 0.4).translate(2.2, 0, 0);
const antGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 4).translate(0, 1.5, 0);
const ballGeo = new THREE.SphereGeometry(0.5, 8, 6);

const tmpSpawn = new THREE.Vector3();
const popV = new THREE.Vector3();
const pull = { x: 0, z: 0, n: 0 };

function makeVac(): Vac {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(discGeo, shell);
  disc.position.y = 1.6;
  const lid = new THREE.Mesh(topGeo, top);
  lid.position.y = 3;
  const bumper = new THREE.Mesh(bumperGeo, rubber);
  bumper.position.y = 1.4;
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(0, 2.9, 4.4);
  const brow = new THREE.Mesh(browGeo, browMat);
  brow.position.set(0, 4, 4.1);
  brow.rotation.z = 0.25;
  const brush = new THREE.Group();
  brush.position.set(4.6, 0.5, 4.2);
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(bristleGeo, bristle);
    b.rotation.y = (k * Math.PI * 2) / 3;
    brush.add(b);
  }
  const ant = new THREE.Mesh(antGeo, rubber);
  ant.position.set(-2.5, 3.2, -2.5);
  ant.rotation.z = 0.3;
  const tip = new THREE.Mesh(ballGeo, eyeMat);
  tip.position.set(-3.3, 6, -2.5);
  g.add(disc, lid, bumper, eye, brow, brush, ant, tip);
  g.traverse((o) => (o.castShadow = true));
  g.visible = false;
  scene.add(g);
  g.scale.setScalar(VS);
  return { g, brush, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, state: 'off', t: 0, scale: 1, minion: false, stuck: 0, detour: 0 };
}

/** Put a vacuum on the ground at (x, z). Used by the spawner and by Roomba Prime. Returns false when the pool is full. */
export function spawnVacuum(x: number, z: number, minion = false, vx = 0, vz = 0): boolean {
  if (!pool.length) vacuumType.init();
  const v = pool.find((p) => p.state === 'off');
  if (!v) return false;
  v.state = 'chase';
  v.t = 0;
  v.stuck = 0;
  v.detour = 0;
  v.minion = minion;
  v.pos.set(x, minion ? 10 : 0, z);
  v.vel.set(vx, minion ? 30 : 0, vz);
  v.yaw = Math.atan2(C.pos.x - x, C.pos.z - z);
  v.scale = 1;
  v.g.scale.setScalar(VS);
  v.g.rotation.set(0, v.yaw, 0);
  v.g.position.copy(v.pos);
  v.g.visible = true;
  return true;
}

const isAlive = (v: Vac) => v.state === 'chase' || v.state === 'retreat';

function unplug(v: Vac, dx: number, dz: number, label = 'UNPLUGGED! '): void {
  if (!isAlive(v)) return;
  v.state = 'pop';
  v.t = 0;
  v.vel.set(dx * 30, 60, dz * 30);
  popV.set(v.pos.x, 8, v.pos.z);
  reportKill('vacuum', popV);
  score(param(spec, 'value', 3), popV, label);
  pop('UNPLUGGED!', popV.setY(26), '#4cc3ff', 26);
  S.unplug();
  sparks(v.pos.x, 4, v.pos.z, 14);
}

function update(dt: number, t: number): void {
  if (spawner.tick(G.elapsed, vacuumType.alive(), spawnBlocked())) {
    groundSpawn(tmpSpawn, 230, 70);
    spawnVacuum(tmpSpawn.x, tmpSpawn.z);
    if (!announced) {
      announced = true;
      showBanner(innerWidth < 600 ? 'VACUUMS!' : 'ROBOT VACUUMS! KEEP MOVING', '#4cc3ff');
    }
  }
  const play = game.mode === 'play';
  const speed = param(spec, 'speed', 26);
  const range = param(spec, 'range', 40);
  const tugV = param(spec, 'tug', 18);
  const slowV = param(spec, 'slow', 0.7);
  const soakV = param(spec, 'soak', 3);
  pull.x = pull.z = 0;
  pull.n = 0;
  let nearest = 1e9;
  const blink = Math.sin(t * 7) > -0.6;
  eyeMat.emissiveIntensity = blink ? 1.6 : 0.1;
  for (const v of pool) {
    if (v.state === 'off') continue;
    v.t += dt;
    const g = v.g;
    const dx = C.pos.x - v.pos.x;
    const dz = C.pos.z - v.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (v.state === 'chase' || v.state === 'retreat') {
      // minions are dropped from above: fall first
      if (v.pos.y > 0 || v.vel.y > 0) {
        v.vel.y -= 120 * dt;
        v.pos.addScaledVector(v.vel, dt);
        if (v.pos.y <= 0) {
          v.pos.y = 0;
          v.vel.set(0, 0, 0);
          dust.spawn(v.pos.x, 1, v.pos.z, 0, 3, 0, 0.5, 5, 0xd6d0c6, 0, 1.5);
        }
      } else {
        const away = v.state === 'retreat';
        let want = away ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
        if (v.detour !== 0) {
          // steer along the building edge (tangent), then try the direct line again
          want += Math.sign(v.detour) * Math.PI * 0.5;
          v.detour -= Math.sign(v.detour) * dt;
          if (Math.abs(v.detour) < dt) v.detour = 0;
        }
        v.yaw = turnToward(v.yaw, want, away ? 6 : 5, dt);
        const stop = !away && d < P.radius + VR;
        const sp = (away ? speed * 1.5 : speed) * (stop ? 0 : 1) * (play || away ? 1 : 0.3);
        const ox = v.pos.x;
        const oz = v.pos.z;
        slideMove(v.pos, Math.sin(v.yaw) * sp * dt, Math.cos(v.yaw) * sp * dt, VR + 1);
        if (!away && !stop && play && sp > 0 && dt > 0) {
          const moved = Math.hypot(v.pos.x - ox, v.pos.z - oz);
          v.stuck = moved < sp * dt * 0.35 ? v.stuck + dt : Math.max(0, v.stuck - dt * 2);
          if (v.stuck > 0.5 && v.detour === 0) v.detour = (Math.random() < 0.5 ? -1 : 1) * 1.2;
          if (v.stuck > 4) {
            // hopelessly parked behind a house: re-enter from a street near the cat
            groundSpawn(tmpSpawn, 180, 60);
            v.pos.set(tmpSpawn.x, 0, tmpSpawn.z);
            v.stuck = 0;
            v.detour = 0;
            dust.spawn(v.pos.x, 1, v.pos.z, 0, 3, 0, 0.5, 5, 0xd6d0c6, 0, 1.5);
          }
        }
        if (away && v.t > 2.5) {
          v.scale -= dt * 1.5;
          if (v.scale <= 0.05) {
            v.state = 'off';
            g.visible = false;
            continue;
          }
          g.scale.setScalar(v.scale * VS);
        }
        // suction
        if (!away && play && d < range && !C.air) {
          const k = 1 - d / (range * 1.2);
          pull.x -= (dx / d) * tugV * k;
          pull.z -= (dz / d) * tugV * k;
          pull.n++;
          soak(soakV * dt, 'vacuum');
          if (Math.random() < 0.5) {
            const r = P.radius * (0.5 + Math.random());
            const a = Math.random() * Math.PI * 2;
            const sx = C.pos.x + Math.cos(a) * r;
            const sz = C.pos.z + Math.sin(a) * r;
            dust.spawn(sx, 1 + Math.random() * 10, sz, (v.pos.x - sx) * 2.2, -2, (v.pos.z - sz) * 2.2, 0.45, 1.4, 0xe0d6c4, 0, -0.5);
          }
        }
        if (zoomHits(v.pos.x, v.pos.z, VR)) unplug(v, hd.nx, hd.nz, 'BULLDOZED! ');
      }
      g.position.set(v.pos.x, v.pos.y + Math.abs(Math.sin(t * 20 + v.pos.x)) * 0.3, v.pos.z);
      g.rotation.set(0, v.yaw, 0);
      v.brush.rotation.y += dt * 25;
      if (v.state === 'chase') nearest = Math.min(nearest, d);
    } else if (v.state === 'pop') {
      v.vel.y -= 120 * dt;
      v.pos.addScaledVector(v.vel, dt);
      g.position.copy(v.pos);
      g.rotation.x += dt * 12;
      g.rotation.z += dt * 7;
      if (Math.random() < 0.6) sparks(v.pos.x, v.pos.y + 2, v.pos.z, 1);
      if (v.pos.y <= 0 && v.t > 0.2) {
        explode(v.pos.x, 3, v.pos.z, 0.5);
        v.state = 'off';
        g.visible = false;
      }
    }
  }
  if (pull.n > 0) {
    // several vacuums pull harder, but never more than 1.6 vacuums' worth
    const m = Math.hypot(pull.x, pull.z);
    const cap = tugV * 1.6;
    const s = m > cap ? cap / m : 1;
    tug(pull.x * s, pull.z * s);
    slow(slowV);
  }
  if (play && nearest < 1e8) wantVacuum(Math.max(0, 1 - nearest / 200), 1);
}

export const vacuumType: EnemyType = {
  id: 'vacuum',
  init() {
    if (pool.length) return;
    for (let i = 0; i < MAX; i++) pool.push(makeVac());
  },
  begin(s) {
    spec = s;
    spawner.reset(s);
    announced = false;
  },
  update,
  clear() {
    for (const v of pool) {
      v.state = 'off';
      v.g.visible = false;
    }
    spec = null;
    spawner.reset(null);
  },
  alive() {
    let n = 0;
    for (const v of pool) if (v.state === 'chase' && !v.minion) n++;
    return n;
  },
  onSwat(hit: SwatHit) {
    for (const v of pool) if (isAlive(v) && swatHits(hit, v.pos.x, v.pos.y + 3, v.pos.z, VR + 1)) unplug(v, hit.fwd.x, hit.fwd.z, 'SWAT! ');
  },
  onPounceLand(x, z, r) {
    for (const v of pool) if (isAlive(v) && circleHits(x, z, r, v.pos.x, v.pos.z, VR)) unplug(v, hd.nx, hd.nz, 'SQUASH! ');
  },
  onLaser(p) {
    for (const v of pool) if (isAlive(v) && laserHits(p, v.pos.x, v.pos.y + 3, v.pos.z, VR + 3)) unplug(v, hd.nx, hd.nz, 'ZAPPED! ');
  },
  onBlast(b: Blast) {
    for (const v of pool) if (isAlive(v) && blastHits(b, v.pos.x, v.pos.z, VR)) unplug(v, hd.nx, hd.nz);
  },
  onFrenzy() {
    for (const v of pool) {
      if (v.state !== 'chase') continue;
      v.state = 'retreat';
      v.t = 0;
    }
  },
};

/** Vacuums on the field (including Roomba Prime's minions). */
export function vacuumsOnField(): number {
  let n = 0;
  for (const v of pool) if (v.state === 'chase') n++;
  return n;
}

/** Debug (shots): live vacuums. Allocates; never call per frame. */
export const debugVacuums = () => pool.filter((p) => p.state !== 'off').map((p) => ({ x: p.pos.x, z: p.pos.z, state: p.state, minion: p.minion }));

/** Nearest chasing vacuum to (x, z): writes its position to `out`, returns the squared distance or -1. No allocation. */
export function nearestVacuum(x: number, z: number, out: THREE.Vector3): number {
  let best = -1;
  for (const v of pool) {
    if (v.state !== 'chase') continue;
    const d = (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2;
    if (best < 0 || d < best) {
      best = d;
      out.set(v.pos.x, 6, v.pos.z);
    }
  }
  return best;
}
