// The player cat: movement, collisions, swat / pounce / zoomies / ULTRA, and the hurt API enemies use. FROZEN.
// Tuning comes from P (live CatStats); the model from game.rig; the ULTRA from game.ability.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { cars, launchCar, launchCarsNear } from '../world/traffic';
import { startlePeople } from '../world/people';
import { St } from './bodies';
import { scene } from './engine';
import { blastEnemies, pounceAirEnemies, pounceLandEnemies, swatEnemies } from './enemies';
import { EMPTY, events } from './events';
import { dust, fx, shake, shockRing } from './fx';
import { flash, popMoney, showBanner } from './hud';
import { moveInput, zoomHeld } from './input';
import { score } from './score';
import { C, G, game, P } from './state';
import type { CatDef, CatRig, SwatHit } from './types';
import { city, distB, radial, smash } from './world';

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const strikeV = new THREE.Vector3();
const mv = { x: 0, z: 0 };
const hit: SwatHit = { x: 0, z: 0, strike: strikeV, fwd: C.fwd, right: C.right, side: 1, radius: 17, power: 1 };
const rigs = new Map<string, CatRig>();
let movedAcc = 0;
let zoomWas = false;
let bulldozeHinted = false;

/** Put cat `def`'s model in the scene (built once, cached). */
export function setCat(def: CatDef): void {
  let rig = rigs.get(def.id);
  if (!rig) {
    rig = def.build();
    rigs.set(def.id, rig);
  }
  if (game.rig && game.rig !== rig) scene.remove(game.rig.root);
  if (!rig.root.parent) scene.add(rig.root);
  game.rig = rig;
  game.cat = def;
  game.ability = def.ultra;
  rig.root.scale.setScalar(P.scale);
}

/** Back to the city's spawn point, standing still. */
export function resetPlayer(): void {
  C.pos.set(city.spawn.x, 0, city.spawn.z);
  C.heading = city.spawn.heading;
  C.speed = 0;
  C.vel.set(0, 0, 0);
  C.air = false;
  C.y = 0;
  C.vy = 0;
  C.stun = 0;
  stunEnd = -1;
  soakBucket = 0;
  soakAt = 0;
  C.wet = 0;
  C.tugX = C.tugZ = 0;
  C.slow = 1;
  C.swipeCd = C.pounceCd = 0;
  game.camYaw = C.heading;
  if (game.rig) game.rig.ultra = false;
}

// ---------- hurt API (enemies call these every frame they hit) ----------
const patienceEv = { amount: 0, source: '' };
// Soak cap: everything that sprays at once (heli + truck + vacuum) shares a bucket that drains at SOAK_RATE/s.
// Soak past SOAK_CAP in the bucket only lands at 35%, so stacked enemies hurt more, but never melt the bar in 5 s.
const SOAK_RATE = 9;
const SOAK_CAP = 18;
let soakBucket = 0;
let soakAt = 0;
let stunEnd = -1;
const STUN_IMMUNE = 1.5;
/** Drain patience by `amount` (already multiplied by dt for sprays) and mark the cat wet this frame. */
export function soak(amount: number, source = 'water'): void {
  if (game.mode !== 'play') return;
  if (G.bossDefeated && game.level.boss?.endsLevel) return; // the final boss is down: victory lap, no more water
  if (G.elapsed < soakAt) soakAt = G.elapsed; // new run
  soakBucket = Math.max(0, soakBucket - (G.elapsed - soakAt) * SOAK_RATE);
  soakAt = G.elapsed;
  let a = amount * P.wetResist;
  const room = Math.max(0, SOAK_CAP - soakBucket);
  if (a > room) a = room + (a - room) * 0.35;
  soakBucket += a;
  G.patience -= a;
  C.wet = 1;
  patienceEv.amount = a;
  patienceEv.source = source;
  events.emit('patienceHit', patienceEv);
}
/** Startle (cucumber!): no input for `seconds` (scaled by stunResist). */
export function startle(seconds: number, source = 'cucumber'): void {
  if (game.mode !== 'play') return;
  const s = seconds * P.stunResist;
  if (s <= C.stun) return;
  // after a startle ends the cat is immune for STUN_IMMUNE s (no cucumber stun-lock); a longer stun during one still wins
  if (C.stun <= 0 && G.elapsed >= stunEnd - 0.01 && G.elapsed < stunEnd + STUN_IMMUNE && stunEnd >= 0) return;
  C.stun = s;
  stunEnd = G.elapsed + s;
  game.rig.scare = 1;
  A.hiss();
  events.emit('startled', { seconds: s, source });
}
/** Pull the cat toward/away this frame, world units per second (vacuums). */
export function tug(vx: number, vz: number): void {
  C.tugX += vx;
  C.tugZ += vz;
}
/** Multiply the cat's speed this frame (suction, goo). */
export function slow(mul: number): void {
  C.slow = Math.min(C.slow, mul);
}

// ---------- actions ----------
export function doSwipe(): void {
  if (C.swipeCd > 0 || game.mode !== 'play' || C.stun > 0) return;
  const rig = game.rig;
  const fwd = C.fwd;
  const right = C.right;
  C.swipeCd = G.frenzy ? P.swatCd * 0.5 : P.swatCd;
  fx.swat = 1;
  rig.swipeSide = -rig.swipeSide;
  rig.swipe = 1;
  A.whoosh();
  const side = rig.swipeSide;
  const cx = C.pos.x + fwd.x * P.swatReach + right.x * side * 9;
  const cz = C.pos.z + fwd.z * P.swatReach + right.z * side * 9;
  const strike = strikeV.set(cx, 30 + C.y, cz);
  const m =
    smash(cx, cz, P.swatRadius, 5 + C.y, 52 + C.y, (_x, _y, _z, out) =>
      out.set(fwd.x * 70 - right.x * side * 35 + (Math.random() - 0.5) * 20, 22 + Math.random() * 18, fwd.z * 70 - right.z * side * 35 + (Math.random() - 0.5) * 20),
    ) * P.swatPower;
  if (m > 0) {
    score(m, strike);
    shake(0.25);
    G.hitStop = 0.035;
    A.thud(0.5);
    flash(0.25);
  }
  launchCarsNear(cx, cz, 20, (_dx, _dz, _d, out) => out.set(fwd.x * 80 - right.x * side * 30, 40, fwd.z * 80 - right.z * side * 30));
  startlePeople(cx, cz, 18, 18); // a startled hop
  hit.x = cx;
  hit.z = cz;
  hit.side = side;
  hit.radius = P.swatRadius;
  hit.power = P.swatPower;
  swatEnemies(hit);
  game.cat.hooks?.onSwat?.(cx, cz);
  events.emit('swat', { x: cx, z: cz, hit: m > 0 });
}

export function doPounce(): void {
  if (C.pounceCd > 0 || C.air || game.mode !== 'play' || C.stun > 0) return;
  C.pounceCd = G.frenzy ? P.pounceCd * 0.35 : P.pounceCd;
  C.air = true;
  C.vy = P.pounceJump;
  C.vel.copy(C.fwd).multiplyScalar(P.pounceFwd);
  A.meow('short', game.cat.voice);
  events.emit('pounce', EMPTY);
}

function land(): void {
  C.air = false;
  C.y = 0;
  C.vy = 0;
  const rig = game.rig;
  rig.squash = 1;
  shake(0.7);
  G.hitStop = 0.07;
  A.thud(1.8);
  fx.shock = 1;
  fx.fov = 1;
  const x = C.pos.x;
  const z = C.pos.z;
  const k = P.pounceR / 32; // reach of the side effects scales with the pounce radius
  shockRing.position.set(x, 1.2, z);
  const m = smash(x, z, P.pounceR, 0, 80, radial(x, z, 55, 30, 25)) * P.swatPower;
  if (m > 0) score(m, v2.set(x, 40, z), 'POUNCE ');
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    dust.spawn(x + Math.cos(a) * 14, 1.5, z + Math.sin(a) * 14, Math.cos(a) * 70, 3, Math.sin(a) * 70, 1.2, 4, 0xc9c2b6, 0, 1.5);
  }
  launchCarsNear(x, z, 55 * k, (dx, dz, d, out) => out.set((dx / d) * 40, 45 + Math.random() * 20, (dz / d) * 40));
  startlePeople(x, z, 70 * k, 22, 10);
  const trees = city.trees;
  for (let i = 0; i < trees.n; i++) {
    const p = i * 3;
    const dx = trees.pos[p] - x;
    const dz = trees.pos[p + 2] - z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 45 * k && trees.state[i] === St.Static) trees.launch(i, (dx / d) * 40, 35, (dz / d) * 40, 6);
  }
  pounceLandEnemies(x, z, P.pounceR);
  game.cat.hooks?.onPounceLand?.(x, z);
  events.emit('pounceLand', { x, z, money: m });
  events.emit('bigHit', { strength: 0.7 });
}

export function doUltra(): void {
  if (G.ultra < 100 || G.ultraT > 0 || game.mode !== 'play' || !game.ability) return;
  const ab = game.ability;
  G.ultra = 0;
  G.ultraT = P.ultraTime;
  G.zap = 0;
  game.rig.ultra = true;
  A.meow('ultra', game.cat.voice);
  ab.start();
  showBanner(ab.name, ab.color);
  flash(0.8);
  shake(0.5);
  events.emit('ultraStart', { ability: ab.id });
}

/** End the ULTRA now (time out, level end). */
export function stopUltra(): void {
  const ab = game.ability;
  const was = G.ultraT > 0 || game.rig?.ultra;
  G.ultraT = 0;
  if (game.rig) game.rig.ultra = false;
  if (!ab || !was) return;
  ab.stop();
  const tally = G.zap;
  G.zap = 0;
  events.emit('ultraEnd', { ability: ab.id, tally });
}

export function updateUltra(dt: number, t: number): void {
  if (G.ultraT <= 0) return;
  G.ultraT -= dt;
  G.zapComboT -= dt;
  if (G.ultraT <= 0 || game.mode !== 'play') {
    stopUltra();
    return;
  }
  game.ability!.update(dt, t);
}

export { popMoney };

// ---------- movement ----------
export function updateCat(dt: number): void {
  const rig = game.rig;
  const fwd = C.fwd;
  const right = C.right;
  const play = game.mode === 'play';
  // input in camera space
  mv.x = 0;
  mv.z = 0;
  if (play && C.stun <= 0) moveInput(mv);
  const ix = mv.x;
  const iz = mv.z;
  C.stun = Math.max(0, C.stun - dt);
  const mag = Math.min(1, Math.hypot(ix, iz));
  const zoom = play && C.stun <= 0 && zoomHeld();
  if (zoom !== zoomWas && play) {
    zoomWas = zoom;
    events.emit('zoomies', { on: zoom });
  }
  const top = (zoom ? P.zoom : P.walk) * (G.ultraT > 0 && game.ability ? game.ability.moveMul : 1) * C.slow;
  if (!C.air) {
    if (mag > 0.1) {
      // camera forward is (sin camYaw, cos camYaw); right is (-cos, sin) for a right-handed y-up view
      const cy = game.camYaw;
      const dx = Math.sin(cy) * iz - Math.cos(cy) * ix;
      const dz = Math.cos(cy) * iz + Math.sin(cy) * ix;
      const want = Math.atan2(dx, dz);
      let diff = want - C.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      C.heading += Math.sign(diff) * Math.min(Math.abs(diff), P.turn * dt);
      C.speed += (top * mag - C.speed) * Math.min(1, dt * 5);
    } else C.speed += (0 - C.speed) * Math.min(1, dt * 6);
    if (game.mode === 'title') {
      C.speed = 9;
      C.heading = 0;
      if (C.pos.z > city.spawn.z + 480) C.pos.z = city.spawn.z;
    }
    fwd.set(Math.sin(C.heading), 0, Math.cos(C.heading));
    C.vel.copy(fwd).multiplyScalar(C.speed);
  } else {
    C.vy -= 190 * dt;
    C.y += C.vy * dt;
    // pounce through a helicopter to bat it down
    v2.set(C.pos.x, P.headY + C.y, C.pos.z);
    pounceAirEnemies(v2, 35);
    if (C.y <= 0) land();
  }
  fwd.set(Math.sin(C.heading), 0, Math.cos(C.heading));
  right.set(-fwd.z, 0, fwd.x);
  C.pos.addScaledVector(C.vel, dt);
  C.pos.x += C.tugX * dt;
  C.pos.z += C.tugZ * dt;
  C.tugX = C.tugZ = 0;
  C.slow = 1;
  if (play && !C.air && C.speed > 2) {
    movedAcc += C.speed * dt;
    if (movedAcc > P.walk) {
      movedAcc = 0;
      events.emit('moved', { distance: P.walk });
    }
  }

  // buildings block the cat unless zoomies (then it bulldozes); walking into one still bonks a floor or two off
  const R = P.radius;
  let blocked = false;
  G.bonkT -= dt;
  for (const b of city.buildings) {
    if (distB(b, C.pos.x, C.pos.z) > R) continue;
    const h = city.standing(b);
    if (h <= 14 || C.y > h) continue;
    if ((zoom && C.speed > P.walk + 5) || C.air) {
      const m = smash(C.pos.x, C.pos.z, R + 2, 0, 40 + C.y, (_x, _y, _z, out) => out.set(fwd.x * 60 + (Math.random() - 0.5) * 30, 25 + Math.random() * 20, fwd.z * 60 + (Math.random() - 0.5) * 30));
      if (m > 0) {
        score(m, v2.set(C.pos.x, 30, C.pos.z), 'ZOOM ');
        shake(0.2);
      }
      continue;
    }
    blocked = true;
    if (C.speed > 20 && G.bonkT <= 0 && play) {
      G.bonkT = 0.4;
      const m = smash(C.pos.x, C.pos.z, R + 2, 0, 14, (_x, _y, _z, out) => out.set(fwd.x * 45 + (Math.random() - 0.5) * 20, 18 + Math.random() * 10, fwd.z * 45 + (Math.random() - 0.5) * 20));
      if (m > 0) {
        score(m, v2.set(C.pos.x + fwd.x * 14, 24, C.pos.z + fwd.z * 14), 'BONK ');
        shake(0.15);
        rig.squash = 0.4;
      }
    }
    // push out of the footprint
    const px = Math.max(b.x - b.hx, Math.min(b.x + b.hx, C.pos.x));
    const pz = Math.max(b.z - b.hz, Math.min(b.z + b.hz, C.pos.z));
    let dx = C.pos.x - px;
    let dz = C.pos.z - pz;
    let d = Math.hypot(dx, dz);
    if (d < 0.001) {
      dx = C.pos.x - b.x;
      dz = C.pos.z - b.z;
      d = Math.hypot(dx, dz) || 1;
    }
    C.pos.x = px + (dx / d) * R;
    C.pos.z = pz + (dz / d) * R;
  }
  const HALF = city.half;
  if (play) {
    G.blockedT = blocked ? G.blockedT + dt : Math.max(0, G.blockedT - dt * 2);
    if (G.blockedT > 1 && !bulldozeHinted) {
      bulldozeHinted = true;
      showBanner(document.body.classList.contains('touch') ? 'HOLD ZOOM TO BULLDOZE' : 'HOLD SHIFT TO BULLDOZE', '#4cc3ff');
    }
    // soft push back from the city edge, where there is nothing to break
    const edge = Math.max(Math.abs(C.pos.x), Math.abs(C.pos.z));
    if (edge > HALF - 52) {
      const len = Math.hypot(C.pos.x, C.pos.z) || 1;
      C.pos.x -= (C.pos.x / len) * 20 * dt;
      C.pos.z -= (C.pos.z / len) * 20 * dt;
    }
  }
  const lim = HALF - 12;
  C.pos.x = Math.max(-lim, Math.min(lim, C.pos.x));
  C.pos.z = Math.max(-lim, Math.min(lim, C.pos.z));

  // punt cars by walking into them
  if (C.speed > 8 && !C.air) {
    launchCarsNearFront();
  }
  // trees get flattened
  const trees = city.trees;
  for (let i = 0; i < trees.n; i++) {
    if (trees.state[i] !== St.Static) continue;
    const p = i * 3;
    if (Math.hypot(trees.pos[p] - C.pos.x, trees.pos[p + 2] - C.pos.z) < R + 3) {
      trees.launch(i, fwd.x * 40, 25, fwd.z * 40, 6);
      score(0.01, null);
    }
  }

  rig.root.position.set(C.pos.x, C.y, C.pos.z);
  rig.root.rotation.y = C.heading;
  rig.shake = Math.max(rig.shake, C.wet);
  rig.animate(dt, performance.now() / 1000, C.air ? 0 : C.speed, C.air);
  C.swipeCd -= dt;
  C.pounceCd -= dt;
}

function launchCarsNearFront(): void {
  const fwd = C.fwd;
  for (let i = 0; i < cars.n; i++) {
    const p = i * 3;
    if (Math.hypot(cars.pos[p] - C.pos.x - fwd.x * 12, cars.pos[p + 2] - C.pos.z - fwd.z * 12) < 13 && cars.pos[p + 1] < 3) {
      if (launchCar(i, fwd.x * (40 + C.speed) + (Math.random() - 0.5) * 30, 28 + C.speed * 0.4, fwd.z * (40 + C.speed) + (Math.random() - 0.5) * 30)) A.thud(0.3);
    }
  }
}

/** Generic ability blast: smash buildings, punt cars, hop people and hit enemies in a circle (or cone). Returns raw $M. */
/** `enemyPower` (default `power`) is what enemies and bosses take, separate from the $ multiplier. */
export function blast(x: number, z: number, r: number, power: number, label: string, source: 'ultra' | 'zoom' = 'ultra', enemyPower = power): number {
  const m = smash(x, z, r, 0, 90, radial(x, z, 55 * power, 30, 25)) * power;
  if (m > 0) score(m, v1.set(x, 40, z), label);
  launchCarsNear(x, z, r * 1.6, (dx, dz, d, out) => out.set((dx / d) * 45 * power, 45 + Math.random() * 20, (dz / d) * 45 * power));
  startlePeople(x, z, r * 2, 22, 10);
  blastEnemies({ x, z, r, power: enemyPower, source });
  return m;
}
