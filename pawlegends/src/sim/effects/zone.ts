/**
 * `zone` (POC.md §4.4, trap): a disc on the ground with a lifetime. A trap arms after `arm` ticks and roots the
 * first enemy hero (ascending id) whose footprint touches it, then disappears. Arenas are zones too (tether.ts).
 */
import { ZONE_KIND } from '../../data/effects';
import { dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, RANGE, allocZone, type World } from '../world';
import { radiusOf } from '../units/kinds';
import { root } from './root';
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
  return z;
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
    const ownerGone = w.zKind[z] === ZONE_KIND.arena && w.alive[w.zOwner[z]] === 0;
    if (--w.zTtl[z] > 0 && !ownerGone) continue;
    if (w.zKind[z] === ZONE_KIND.arena) endArena(w, z);
    else w.zAlive[z] = 0;
  }
}

/** Step 6: armed traps root the first enemy hero (ascending id) whose footprint touches them, then vanish. */
export function stepZones(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  for (let z = 0; z < w.zAlive.length; z++) {
    if (w.zAlive[z] === 0 || w.zKind[z] !== ZONE_KIND.trap || w.zArm[z] > 0) continue;
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
