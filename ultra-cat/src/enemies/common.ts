// Shared enemy helpers: hit tests for every attack hook, explosions, ground placement and steering.
// Owned by the ENEMIES lane. No per-frame allocations: everything writes into module scratch objects.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { St } from '../core/bodies';
import { burst, chunks, dust, fire, shake, water } from '../core/fx';
import { flash, showBanner } from '../core/hud';
import { addFrameHook } from '../core/loop';
import { C, G, game, P } from '../core/state';
import type { Blast, SwatHit } from '../core/types';
import { city, distB, FLOOR, smash, type Building, type Push } from '../core/world';
import { setHose, setSiren, setVacuum } from './sfx';

/** Frame counter (bumped once per rendered frame) so per-sample hooks (the laser) apply once per frame. */
export const frame = { n: 0, dt: 1 / 60 };

/** Loop loudness requests for this frame (types raise them with Math.max; applied and reset by the frame hook). */
export const loops = { siren: 0, hose: 0, vac: 0, vacPitch: 1, vacBest: 0 };
/** Ask for the vacuum whine at `v` (0..1) with `pitch`; the loudest request this frame sets the pitch. */
export function wantVacuum(v: number, pitch: number): void {
  if (v > loops.vacBest) {
    loops.vacBest = v;
    loops.vacPitch = pitch;
  }
  loops.vac = Math.max(loops.vac, v);
}
addFrameHook((dt) => {
  frame.n++;
  if (dt > 0) frame.dt = dt;
  const on = game.mode === 'play';
  setSiren(on ? loops.siren : 0);
  setHose(on ? loops.hose : 0);
  setVacuum(on ? loops.vac : 0, loops.vacPitch);
  loops.siren = loops.hose = loops.vac = loops.vacBest = 0;
});

/** Scratch result of the last hit test: unit direction from the hit centre to the enemy, and the distance. */
export const hd = { nx: 0, nz: 1, d: 0 };

function setHd(dx: number, dz: number): number {
  const d = Math.hypot(dx, dz);
  hd.d = d;
  if (d > 1e-4) {
    hd.nx = dx / d;
    hd.nz = dz / d;
  } else {
    hd.nx = C.fwd.x;
    hd.nz = C.fwd.z;
  }
  return d;
}

/** Swat: enemy at (x, y, z) with body radius `rad`. Ground units need y below the paw (strike y + 30). */
export function swatHits(h: SwatHit, x: number, y: number, z: number, rad: number, yTol = 34): boolean {
  const d = setHd(x - h.x, z - h.z);
  if (d > h.radius + rad) return false;
  return Math.abs(y - h.strike.y) < yTol + rad || y < h.strike.y;
}

/** A blast (circle or cone) reaching an enemy with radius `rad`. */
export function blastHits(b: Blast, x: number, z: number, rad: number): boolean {
  const d = setHd(x - b.x, z - b.z);
  if (d > b.r + rad) return false;
  if (b.cone !== undefined && b.dirX !== undefined && b.dirZ !== undefined && d > rad) {
    if (hd.nx * b.dirX + hd.nz * b.dirZ < b.cone) return false;
  }
  return true;
}

/** Ground circle (pounce landing) reaching an enemy. */
export function circleHits(cx: number, cz: number, r: number, x: number, z: number, rad: number): boolean {
  return setHd(x - cx, z - cz) <= r + rad;
}

/** One laser sample point inside an enemy sphere. */
export function laserHits(p: THREE.Vector3, x: number, y: number, z: number, rad: number): boolean {
  const dx = p.x - x;
  const dy = p.y - y;
  const dz = p.z - z;
  if (dx * dx + dy * dy + dz * dz > rad * rad) return false;
  setHd(x - C.pos.x, z - C.pos.z);
  return true;
}

/** Laser lock-on cone from (x, z) along world heading `ang`. */
export function sweepHits(x: number, z: number, ang: number, ex: number, ez: number, range: number, cos: number): boolean {
  const d = setHd(ex - x, ez - z);
  if (d > range || d < 1) return false;
  return Math.sin(ang) * hd.nx + Math.cos(ang) * hd.nz > cos;
}

/** Zoomies contact: the cat is bulldozing (fast, on the ground) and touches the enemy. */
export function zoomHits(x: number, z: number, rad: number): boolean {
  if (C.air || C.speed <= P.walk + 5 || game.mode !== 'play') return false;
  return setHd(x - C.pos.x, z - C.pos.z) < P.radius + rad;
}

/** Airborne cat body (pounce) touching an enemy. */
export function bodyHits(p: THREE.Vector3, r: number, x: number, y: number, z: number, rad: number): boolean {
  const dx = p.x - x;
  const dy = p.y - y;
  const dz = p.z - z;
  return dx * dx + dy * dy + dz * dz < (r + rad) * (r + rad);
}

/** Fireball + debris: the shared enemy death explosion. size 1 = a truck, 3 = a boss. */
export function explode(x: number, y: number, z: number, size = 1, colors: readonly number[] = FIRE): void {
  const n = Math.round(18 * size);
  for (let k = 0; k < n; k++) {
    fire.spawn(x, y, z, (Math.random() - 0.5) * 50 * size, Math.random() * 40 * size, (Math.random() - 0.5) * 50 * size, 0.7 + Math.random() * 0.4, (1.6 + Math.random() * 2) * Math.sqrt(size), colors[k % colors.length], -12, 1.6);
  }
  for (let k = 0; k < n / 2; k++) {
    chunks.spawn(x, y, z, (Math.random() - 0.5) * 60 * size, 20 + Math.random() * 40 * size, (Math.random() - 0.5) * 60 * size, 1.6, 0.8 + Math.random() * 1.5 * size, k % 2 ? 0x3a3d44 : 0x8a8f99, -70);
  }
  burst(x, Math.max(2, y * 0.3), z, Math.round(3 * size), 0xbab2a6);
  shake(Math.min(1, 0.25 * size));
  if (size >= 1) A.boom();
}
export const FIRE = [0xffd24a, 0xff8a2a, 0xff3e3e] as const;
export const SPARKS = [0xfff3a0, 0x9fe8ff, 0xffffff] as const;

/** Little spark shower (metal hits, unplugging). */
export function sparks(x: number, y: number, z: number, n = 10, colors: readonly number[] = SPARKS): void {
  for (let k = 0; k < n; k++) fire.spawn(x, y, z, (Math.random() - 0.5) * 60, 10 + Math.random() * 40, (Math.random() - 0.5) * 60, 0.35 + Math.random() * 0.25, 0.6 + Math.random() * 0.6, colors[k % colors.length], -80, 0.3);
}

/** Wet splash ring on the ground (water bombs, spray rings). */
export function splash(x: number, y: number, z: number, n = 16, speed = 40, color = 0x3fb4ff): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    water.spawn(x, y, z, Math.cos(a) * speed * (0.7 + Math.random() * 0.6), 20 + Math.random() * 30, Math.sin(a) * speed * (0.7 + Math.random() * 0.6), 0.6, 1.4 + Math.random(), color, -80, 0.6);
  }
  dust.spawn(x, y + 1, z, 0, 2, 0, 0.5, 6, 0xbfe6ff, 0, 2.5);
}

/** A cartoon "!" fur poof around the cat when startled. */
export function furPoof(): void {
  const col = game.cat?.color ? Number.parseInt(game.cat.color.replace('#', ''), 16) || 0xff9a3c : 0xff9a3c;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    dust.spawn(C.pos.x + Math.cos(a) * 10, P.headY * 0.6 + C.y, C.pos.z + Math.sin(a) * 10, Math.cos(a) * 30, 10 + Math.random() * 10, Math.sin(a) * 30, 0.6, 2.2, col, 0, 1.4);
  }
}

// ---------- ground placement and steering ----------

/** Is (x, z) inside a standing building footprint grown by `pad`, taller than `minH`? */
export function blockedAt(x: number, z: number, pad: number, minH = 4): boolean {
  const bs = city.buildings;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (Math.abs(x - b.x) > b.hx + pad || Math.abs(z - b.z) > b.hz + pad) continue;
    if (city.segs.state[b.first] !== St.Static) continue; // the base floor is gone: the lot is rubble now
    if (city.standing(b) > minH) return true;
  }
  return false;
}

/** Move a ground unit by (dx, dz), sliding along buildings. Writes into `pos`. */
export function slideMove(pos: THREE.Vector3, dx: number, dz: number, pad: number): void {
  const lim = city.half - 8;
  const nx = Math.max(-lim, Math.min(lim, pos.x + dx));
  const nz = Math.max(-lim, Math.min(lim, pos.z + dz));
  if (!blockedAt(nx, nz, pad)) {
    pos.x = nx;
    pos.z = nz;
    return;
  }
  if (!blockedAt(nx, pos.z, pad)) {
    pos.x = nx;
    return;
  }
  if (!blockedAt(pos.x, nz, pad)) {
    pos.z = nz;
    return;
  }
  // stuck inside (a building was spawned around us?): nudge toward the nearest street
  const sx = city.streetAt(Math.max(0, Math.min(city.n, Math.round((pos.x + city.half) / city.block))));
  pos.x += Math.sign(sx - pos.x) * Math.min(Math.abs(sx - pos.x), Math.hypot(dx, dz) + 0.5);
}

/** A street intersection about `dist` (+- spread) from the cat; prefers points the camera is not looking at. */
export function groundSpawn(out: THREE.Vector3, dist: number, spread: number): THREE.Vector3 {
  let best = -1e9;
  const n = city.n;
  for (let t = 0; t < 24; t++) {
    const x = city.streetAt(1 + Math.floor(Math.random() * (n - 1)));
    const z = city.streetAt(1 + Math.floor(Math.random() * (n - 1)));
    const d = Math.hypot(x - C.pos.x, z - C.pos.z);
    const s = -Math.abs(d - dist) + (Math.abs(d - dist) < spread ? 100 : 0) + Math.random() * 20;
    if (s > best) {
      best = s;
      out.set(x, 0, z);
    }
  }
  return out;
}

/** Push the cat out of a round body of radius `rad` at (x, z) (bosses are solid). Returns true if they overlapped. */
export function pushCatOut(x: number, z: number, rad: number, dt: number): boolean {
  if (C.air || dt <= 0) return false;
  const dx = C.pos.x - x;
  const dz = C.pos.z - z;
  const d = Math.hypot(dx, dz) || 1;
  const o = rad + P.radius - d;
  if (o <= 0) return false;
  C.tugX += ((dx / d) * o) / dt;
  C.tugZ += ((dz / d) * o) / dt;
  return true;
}

/** Height of the top of building b's standing stack (0 when flattened). */
export const roofOf = (b: Building) => city.standing(b);

// a non-allocating push for enemies that plough through buildings (charges, rolling bosses)
const plough = { x: 0, z: 0, fx: 0, fz: 0, out: 60 };
const ploughPush: Push = (sx, _sy, sz, o) => {
  const dx = sx - plough.x;
  const dz = sz - plough.z;
  const d = Math.hypot(dx, dz) || 1;
  o.set(plough.fx * plough.out + (dx / d) * plough.out * 0.5, 22 + Math.random() * 22, plough.fz * plough.out + (dz / d) * plough.out * 0.5);
};
/** Smash floors around (x, z) pushed along (fx, fz). Returns raw $M (the caller decides whether to score it). */
export function ploughAt(x: number, z: number, r: number, y1: number, fx: number, fz: number, out = 60): number {
  plough.x = x;
  plough.z = z;
  plough.fx = fx;
  plough.fz = fz;
  plough.out = out;
  return smash(x, z, r, 0, y1, ploughPush);
}

/** Pick a standing building with its roof >= minH between dMin and dMax from the cat (or -1). */
export function pickRoof(dMin: number, dMax: number, minH: number, taken: (bi: number) => boolean): number {
  const bs = city.buildings;
  let pick = -1;
  let seen = 0;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    const d = Math.hypot(b.x - C.pos.x, b.z - C.pos.z);
    if (d < dMin || d > dMax || taken(i)) continue;
    if (roofOf(b) < minH || b.hx < 6 || b.hz < 6) continue;
    seen++;
    if (Math.random() * seen < 1) pick = i; // reservoir sample
  }
  return pick;
}

export { distB, FLOOR, G, showBanner, flash };

/** Shortest signed angle a -> b. */
export function angDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Lerp a yaw toward a target at `rate` rad/s. */
export function turnToward(cur: number, target: number, rate: number, dt: number): number {
  const d = angDiff(cur, target);
  return cur + Math.sign(d) * Math.min(Math.abs(d), rate * dt);
}

/** True while spawning and attacking are allowed. */
export const canAct = () => game.mode === 'play';
/** True while new regular enemies may spawn (bosses ignore frenzy). */
export const spawnBlocked = () => game.mode !== 'play' || G.timeFrozen || G.frenzy || bossFight.final;
/** Fire trucks and cucumber towers also wait during a mini-boss (they turned the Mecha-Dog fight into stun-lock). */
export const spawnBlockedByBoss = () => spawnBlocked() || bossFight.up;
/**
 * A boss is on the field (set by BossCore, enemies/boss.ts). `up`: any boss, trucks drive off, towers wait and
 * helicopters cap at 1. `final`: a level-ending boss, every regular spawner waits (it brings its own adds).
 */
export const bossFight = { up: false, final: false };
