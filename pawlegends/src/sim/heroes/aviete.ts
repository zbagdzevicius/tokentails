/**
 * Avietė, Assassin (shelter champion, sim v9). Bespoke hooks: Shy, Then Shiny (a charge built in brush that makes
 * her next damage of any kind to an enemy hero deal bonus damage and stun, with a lockout after), Shiny Coat (charge on demand),
 * Live Wire's blink with a recast back, and Short Circuit's blink to a hero that opens the same way back.
 *
 * Kit arrays: `kWAge` ticks in brush (0 outside); `kRT` charge ticks left (held while in brush); `kHuntT` lockout
 * ticks left; `kStage` the open return (0 none, 1 from Live Wire, 2 from Short Circuit); `kWindow` return ticks
 * left; `kChain`/`kEmpower` the return point x/y; `kCount` the tick Live Wire was cast (its cooldown counts from it).
 */
import { dist2, iatan2, idiv, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, ENTITY_CAP, G, Kind, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { blink, collect, haste, inCone, inRing, slow, stun } from '../effects';
import { attackRange, radiusOf } from '../units/kinds';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

/** HERO_IDS index of Avietė. */
export const AVIETE_INDEX = 5;
const E = 2;
const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: a.q.range, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Unit, reach: a.r.range, windup: 0, mobility: true };
  }
}

/** Is Avietė's charge up (her next hit on an enemy hero stuns)? */
export const charged = (w: World, id: number): boolean => w.kRT[id] > 0;

/** Charge her now unless she is locked out. */
function charge(w: World, id: number): void {
  if (w.kHuntT[id] === 0) w.kRT[id] = abil(w, id).passive.hold;
}

/** A Live Wire return window that closes unused starts its cooldown, counted from the cast. */
function closeWireWindow(w: World, id: number): void {
  if (w.kStage[id] === 1) {
    const since = w.globals[G.Tick] - w.kCount[id];
    w.cooldowns[id * COOLDOWN_SLOTS + E] = Math.max(0, abil(w, id).e.cooldown - since);
  }
  w.kStage[id] = 0;
  w.kWindow[id] = 0;
}

/** Live Wire: blink out (open the return), or the recast back to the stored point. */
function liveWire(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const a = abil(w, id);
  if (w.kStage[id] > 0 && w.kWindow[id] > 0) {
    const from = w.kStage[id];
    blink(m, id, w.kChain[id], w.kEmpower[id], a.e.blink + a.r.range);
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    // From Live Wire the cooldown starts now; from Short Circuit the E cooldown already running is kept.
    return from === 1 ? a.e.cooldown : 0;
  }
  w.kChain[id] = w.x[id];
  w.kEmpower[id] = w.y[id];
  blink(m, id, x, y, a.e.blink);
  w.kStage[id] = 1;
  w.kWindow[id] = a.e.recastWindow;
  w.kCount[id] = w.globals[G.Tick];
  return 0;
}

/** Short Circuit: blink beside enemy hero `target`, hit it, slow enemy heroes around the landing. */
function shortCircuit(m: MatchHandle, id: number, target: number): number {
  const w = m.world;
  const a = abil(w, id);
  const r = a.r;
  if (target < 0 || w.kind[target] !== Kind.Hero) return -1;
  const reach = r.range + radiusOf(w, target);
  const sx = w.x[id];
  const sy = w.y[id];
  const d2 = dist2(sx, sy, w.x[target], w.y[target]);
  if (d2 > reach * reach) return -1;
  // An unused Live Wire return gives way to this one: its cooldown starts as if its window closed.
  if (w.kStage[id] === 1 && w.kWindow[id] > 0) closeWireWindow(w, id);
  const gap = radiusOf(w, id) + radiusOf(w, target);
  const d = isqrt(d2);
  if (d > gap) {
    const tx = w.x[target] + idiv((sx - w.x[target]) * gap, d);
    const ty = w.y[target] + idiv((sy - w.y[target]) * gap, d);
    blink(m, id, tx, ty, d);
  }
  w.facing[id] = iatan2(w.y[target] - w.y[id], w.x[target] - w.x[id]);
  const hit = attackRange(w, id) + gap;
  if (dist2(w.x[id], w.y[id], w.x[target], w.y[target]) <= hit * hit) dealDamage(m, id, w.team[id], Kind.Hero, target, lvl(w, id, r.dmg, r.dmgPerLevel), 'ability');
  const lx = w.x[id];
  const ly = w.y[id];
  const n = collect(w, w.team[id], hits, (e, er) => inRing(lx, ly, r.dazzleRadius, w.x[e], w.y[e], er), true);
  for (let i = 0; i < n; i++) slow(w, hits[i], r.slowBp, r.slow);
  w.kChain[id] = sx;
  w.kEmpower[id] = sy;
  w.kStage[id] = 2;
  w.kWindow[id] = a.e.recastWindow;
  return r.cooldown;
}

export const AVIETE_KIT: HeroKit = {
  aim,
  recastReady: (w, id, slot) => slot === E && w.kStage[id] > 0 && w.kWindow[id] > 0,
  cast(m, id, slot, x, y, target) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const hx = w.x[id];
        const hy = w.y[id];
        const dir = aimAngle(w, id, x, y);
        const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, q.range, q.arc, w.x[e], w.y[e], r));
        const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
        for (let i = 0; i < n; i++) dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
        return q.cooldown;
      }
      case 1:
        charge(w, id);
        haste(w, id, a.w.speedBp, a.w.haste);
        return a.w.cooldown;
      case 2:
        return liveWire(m, id, x, y);
      default:
        return shortCircuit(m, id, target);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    const p = abil(w, id).passive;
    const inBrush = w.bush[id] >= 0;
    w.kWAge[id] = inBrush ? w.kWAge[id] + 1 : 0;
    if (w.kHuntT[id] === 0 && w.kWAge[id] >= p.brushTime) w.kRT[id] = p.hold;
    else if (w.kRT[id] > 0 && !inBrush) w.kRT[id]--;
    if (w.kHuntT[id] > 0) w.kHuntT[id]--;
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0) closeWireWindow(w, id);
  },
  outgoing(m, id, dst, raw) {
    const w = m.world;
    if (w.kRT[id] === 0 || w.kind[dst] !== Kind.Hero) return raw;
    const p = abil(w, id).passive;
    stun(w, dst, p.stun);
    w.kRT[id] = 0;
    w.kHuntT[id] = p.lockout;
    return raw + lvl(w, id, p.bonus, p.bonusPerLevel);
  },
  reset(w, id) {
    w.kWAge[id] = 0;
    w.kRT[id] = 0;
    w.kHuntT[id] = 0;
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    w.kChain[id] = 0;
    w.kEmpower[id] = 0;
    w.kCount[id] = 0;
  },
};

