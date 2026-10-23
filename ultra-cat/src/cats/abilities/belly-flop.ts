// Big Biscuit ULTRA: BELLY FLOP. Owned by the CATS lane.
// Three auto-leaps (vy 140) toward the move direction; each landing is a radius 90, power 3 blast with a huge shock ring.
// The cat is water-proof while airborne. Core runs the jump physics and its normal pounce land(); we add the flop on top.
import * as THREE from 'three';
import { events } from '../../core/events';
import { chunks, dust, shake } from '../../core/fx';
import { flash, popMoney, showBanner } from '../../core/hud';
import { addFrameHook } from '../../core/loop';
import { blast } from '../../core/player';
import { C, G, game, P } from '../../core/state';
import type { UltraAbility } from '../../core/types';
import { mainThreat } from '../../enemies/threats';
import { boing, splat } from '../sfx';
import { FxPool } from './rings';

const LEAPS = 3;
const R = 90;
// GDD says power 3; core blast() multiplies $ by power, which made the flop ~2.5x the free tabby's laser
// (shots/cats-balance.mjs). 1.45 keeps the r 90 crater and lands it at ~1.35x the laser.
const POWER = 1.45;
/** Enemies and bosses take the GDD's power 3 (the $ nerf above is about city damage only). */
const ENEMY_POWER = 3;
/** Leaps 2 and 3 home onto the nearest boss or ground threat within this range. */
const HOME_R = 160;
const LEAP_VY = 140;
const LEAP_FWD = 105;
const GAP = 0.08; // pause on the ground between leaps

let rings: FxPool | null = null;
let inner: FxPool | null = null;
let left = 0;
let wait = 0;
let mine = false; // a flop leap is in the air
let flops = 0;
let savedWet = 1;
let active = false;
const at = new THREE.Vector3();
const tgt = new THREE.Vector3();
const tmp = new THREE.Vector3();

function pools(): void {
  if (rings) return;
  rings = new FxPool(new THREE.RingGeometry(0.86, 1, 64), 0xfff1dd, 4, true);
  inner = new FxPool(new THREE.RingGeometry(0.5, 1, 48), 0xffa64a, 4, true);
  // the landing check lives in a frame hook so the last flop still lands after the ULTRA timer runs out
  addFrameHook(() => {
    if (!mine || C.air) return;
    mine = false;
    if (game.mode === 'play') land();
  });
  events.on('levelLoad', () => {
    mine = false;
    rings!.clear();
    inner!.clear();
  });
}

function leap(): void {
  left--;
  mine = true;
  C.air = true;
  C.y = Math.max(C.y, 0.01);
  C.vy = LEAP_VY;
  C.vel.copy(C.fwd).multiplyScalar(LEAP_FWD);
  if (left < LEAPS - 1 && mainThreat(C.pos.x, C.pos.z, HOME_R, tgt, tmp)) {
    // homing flop: land on the threat (flight time ~ 2 vy / g), never further than a normal leap
    const dx = tgt.x - C.pos.x;
    const dz = tgt.z - C.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < HOME_R + 60) {
      const sp = Math.min(LEAP_FWD * 1.4, d / 1.4);
      C.vel.set((dx / (d || 1)) * sp, 0, (dz / (d || 1)) * sp);
      C.heading = Math.atan2(dx, dz);
    }
  }
  C.stun = 0;
  game.rig.squash = 0.6;
  boing();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    dust.spawn(C.pos.x + Math.cos(a) * 10, 1.5, C.pos.z + Math.sin(a) * 10, Math.cos(a) * 30, 4, Math.sin(a) * 30, 0.7, 3, 0xd9ccb4, 0, 1.2);
  }
}

function land(): void {
  const x = C.pos.x;
  const z = C.pos.z;
  flops++;
  const before = G.damage;
  blast(x, z, R, POWER, flops >= LEAPS ? 'MEGA FLOP! ' : 'FLOP! ', 'ultra', ENEMY_POWER);
  if (G.ultraT > 0) G.zap += G.damage - before; // the running tally (blast pops each landing itself)
  rings!.fire(x, 1.4, z, 10, R * 1.7, 0.75, 1);
  rings!.fire(x, 1.6, z, 6, R * 1.1, 0.5, 0.8);
  inner!.fire(x, 1.2, z, 4, R * 0.8, 0.35, 0.9);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    const sp = 90 + Math.random() * 40;
    dust.spawn(x + Math.cos(a) * 18, 2, z + Math.sin(a) * 18, Math.cos(a) * sp, 6 + Math.random() * 8, Math.sin(a) * sp, 1.4, 5 + Math.random() * 3, 0xd8cfc0, 0, 1.8);
  }
  for (let i = 0; i < 24; i++) chunks.spawn(x + (Math.random() - 0.5) * 40, 3, z + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 120, 50 + Math.random() * 70, (Math.random() - 0.5) * 120, 1.6, 1 + Math.random() * 2, Math.random() < 0.5 ? 0x9a948a : 0x5d6670, -90);
  game.rig.squash = 1;
  shake(1);
  flash(0.3); // capped: three landings in a row washed the screen out
  G.hitStop = 0.1;
  splat(flops >= LEAPS ? 1.4 : 1);
  events.emit('bigHit', { strength: 1 });
}

export const bellyFlop: UltraAbility = {
  id: 'bellyFlop',
  name: 'BELLY FLOP!',
  color: '#ffb35a',
  tallyLabel: 'FLOP',
  moveMul: 1,
  camWide: true,
  start() {
    pools();
    active = true;
    savedWet = P.wetResist;
    left = LEAPS;
    flops = 0;
    wait = C.air ? 0 : 0.12; // a beat for the banner, then up
  },
  update(dt) {
    if (!C.air && !mine && left > 0) {
      wait -= dt;
      if (wait <= 0) {
        leap();
        wait = GAP;
      }
    }
    P.wetResist = C.air ? 0 : savedWet; // water-proof while airborne
  },
  stop() {
    if (!active) return;
    active = false;
    P.wetResist = savedWet;
    left = 0;
    if (game.mode !== 'play') mine = false;
    if (G.zap > 0 && game.mode === 'play') {
      popMoney('FLOP TOTAL ', G.zap, at.set(C.pos.x, 80, C.pos.z));
      if (flops >= LEAPS) showBanner('MAXIMUM CHONK', '#ffb35a');
    }
  },
};
