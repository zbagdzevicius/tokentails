/**
 * `zone` (POC.md §4.4, trap): a disc on the ground with a lifetime. A trap arms after `arm` ticks and roots the
 * first enemy hero (ascending id) whose footprint touches it, then disappears. Arenas are zones too (tether.ts).
 * Sim v9: a burst (ZONE_KIND.burst) pulses once armed: damage and a slow on enemies, a heal on allied heroes.
 */
import { ZONE_KIND } from '../../data/effects';
import { dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, G, Kind, RANGE, allocZone, type World } from '../world';
import { radiusOf } from '../units/kinds';
import { dealDamage } from '../combat/damage';
import { creditHealShield, heal } from './heal';
import { inRing } from './ring';
import { root } from './root';
import { slow } from './slow';
import { collect } from './targets';
import { endArena } from './tether';

export function spawnZone(
  w: World,
  kind: number,
  team: number,
  owner: number,
  x: number,
  y: number,
  radius: number,
  ttl: number,
  arm: number,
  val: number,
): number {
  const z = allocZone(w);
  if (z < 0) return -1;
  w.zAlive[z] = 1;
  w.zKind[z] = kind;
  w.zTeam[z] = team;
  w.zOwner[z] = owner;
  w.zX[z] = x;
  w.zY[z] = y;
  w.zRadius[z] = radius;
  w.zTtl[z] = ttl;
  w.zArm[z] = arm;
  w.zVal[z] = val;
  w.zDmg[z] = 0;
  w.zHeal[z] = 0;
  w.zSlowBp[z] = 0;
  w.zEvery[z] = 0;
  w.zNext[z] = 0;
  return z;
}

/**
 * A burst disc (sim v9) of `owner`'s `team`: armed after `arm` ticks, it lives `ttl` ticks and pulses every `every`
 * ticks (0: one pulse, then gone). Each pulse: enemies in it take `dmg` (an ability hit from `owner`) and a `slowBp`
 * slow for `slowTicks`; allied heroes in it heal `healAmt`. Returns the zone index or −1.
 */
export function spawnBurst(
  w: World,
  team: number,
  owner: number,
  x: number,
  y: number,
  radius: number,
  arm: number,
  ttl: number,
  dmg: number,
  healAmt: number,
  every: number,
  slowBp: number,
  slowTicks: number,
): number {
  const z = spawnZone(w, ZONE_KIND.burst, team, owner, x, y, radius, ttl, arm, slowTicks);
  if (z < 0) return -1;
  w.zDmg[z] = dmg;
  w.zHeal[z] = healAmt;
  w.zSlowBp[z] = slowBp;
  w.zEvery[z] = every;
  w.zNext[z] = 0;
  return z;
}

const burstHits = new Int32Array(ENTITY_CAP);

/** One pulse of burst zone `z`. */
function pulse(m: MatchHandle, z: number): void {
  const w = m.world;
  const team = w.zTeam[z];
  const zx = w.zX[z];
  const zy = w.zY[z];
  const r = w.zRadius[z];
  const owner = w.zOwner[z];
  if (w.zDmg[z] > 0 || w.zSlowBp[z] > 0) {
    const n = collect(w, team, burstHits, (e, er) => inRing(zx, zy, r, w.x[e], w.y[e], er));
    for (let i = 0; i < n; i++) {
      const e = burstHits[i];
      // The owner may have died since it cast: dealDamage checks w.kind[src] before any hero-source hook.
      if (w.zDmg[z] > 0) dealDamage(m, owner, team, Kind.Hero, e, w.zDmg[z], 'ability');
      slow(w, e, w.zSlowBp[z], w.zVal[z]);
    }
  }
  if (w.zHeal[z] > 0) {
    for (let a = RANGE.heroes; a < RANGE.minions; a++) {
      if (w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== team) continue;
      if (inRing(zx, zy, r, w.x[a], w.y[a], radiusOf(w, a))) creditHealShield(m, owner, heal(w, a, w.zHeal[z]));
    }
  }
}

/** Zones of `kind` owned by `owner`, and the oldest one (least ttl left; ties: lowest index). */
export function oldestZone(w: World, owner: number, kind: number): { count: number; oldest: number } {
  let count = 0;
  let oldest = -1;
  for (let z = 0; z < w.zAlive.length; z++) {
    if (w.zAlive[z] === 0 || w.zOwner[z] !== owner || w.zKind[z] !== kind) continue;
    count++;
    if (oldest < 0 || w.zTtl[z] < w.zTtl[oldest]) oldest = z;
  }
  return { count, oldest };
}

/**
 * Step 4 (with the other timers): zones age and arm. A zone made with N ticks lasts N movement steps; an arena also
 * ends with its owner.
 */
export function ageZones(w: World): void {
  for (let z = 0; z < w.zAlive.length; z++) {
    if (w.zAlive[z] === 0) continue;
    if (w.zArm[z] > 0) w.zArm[z]--;
    // An arena and a Guard Post dome (sim v10) end with their owner.
    const ownerGone = (w.zKind[z] === ZONE_KIND.arena || w.zKind[z] === ZONE_KIND.dome) && w.alive[w.zOwner[z]] === 0;
    if (--w.zTtl[z] > 0 && !ownerGone) continue;
    if (w.zKind[z] === ZONE_KIND.arena) endArena(w, z);
    else w.zAlive[z] = 0;
  }
}

/**
 * Step 6: armed traps root the first enemy hero (ascending id) whose footprint touches them, then vanish. Armed
 * bursts pulse when their countdown is at 0 (sim v9).
 */
export function stepZones(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  for (let z = 0; z < w.zAlive.length; z++) {
    if (w.zAlive[z] === 0 || w.zArm[z] > 0) continue;
    if (w.zKind[z] === ZONE_KIND.burst) {
      if (w.zNext[z] > 0) {
        w.zNext[z]--;
        continue;
      }
      pulse(m, z);
      if (w.zEvery[z] === 0) w.zAlive[z] = 0;
      else w.zNext[z] = w.zEvery[z] - 1;
      continue;
    }
    if (w.zKind[z] !== ZONE_KIND.trap) continue;
    for (let e = RANGE.heroes; e < RANGE.minions; e++) {
      if (w.alive[e] === 0 || w.team[e] === w.zTeam[z] || w.untargT[e] > 0) continue;
      const reach = w.zRadius[z] + radiusOf(w, e);
      if (dist2(w.zX[z], w.zY[z], w.x[e], w.y[e]) > reach * reach) continue;
      // A hidden (bush, stealth) hero still springs it: the trap is on the ground, not aimed.
      root(w, e, w.zVal[z]);
      m.events.push({ type: 'hit', tick, src: w.zOwner[z], dst: e, amount: 0, shielded: 0, kind: 'zone' });
      w.zAlive[z] = 0;
      break;
    }
  }
}
