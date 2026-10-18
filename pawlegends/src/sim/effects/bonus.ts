/**
 * Sim v4 hero bonuses: Zoomies, Frenzy Catnip, the rat camp's Pack buff and Nine Lives (data/xp.ts ZOOMIES and
 * NINE_LIVES, data/pickups.ts, data/camps.ts). Timers are per hero, in ticks.
 */
import { FOUNTAIN, mirrorX } from '../../data/map';
import { NINE_LIVES, PANIC, ZOOMIES } from '../../data/xp';
import { PICKUPS } from '../../data/pickups';
import { RAT_CAMP_STATS } from '../../data/camps';
import { BP_ONE, applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { rulesOf } from '../rules';
import { G, Kind, RANGE, type World } from '../world';

const WIN = NINE_LIVES.window;

/** Step 0: the damage ring forgets the slot this tick reuses. */
export function beginTick(w: World): void {
  const slot = w.globals[G.Tick] % WIN;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) w.dmgRing[id * WIN + slot] = 0;
}

/** Step 4 (after movement): bonus timers tick; Zoomies refresh while a hero stands in its own fountain. */
export function stepBonuses(w: World): void {
  const r2 = FOUNTAIN.radius * FOUNTAIN.radius;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (w.kind[id] !== Kind.Hero || w.alive[id] === 0) continue;
    const fx = w.team[id] === 0 ? FOUNTAIN.x : mirrorX(FOUNTAIN.x);
    if (dist2(w.x[id], w.y[id], fx, FOUNTAIN.y) <= r2) w.zoomT[id] = ZOOMIES.ticks;
    else if (w.zoomT[id] > 0) w.zoomT[id]--;
    if (w.frenzyT[id] > 0) w.frenzyT[id]--;
    if (w.nineT[id] > 0) w.nineT[id]--;
    if (w.packT[id] > 0) w.packT[id]--;
  }
}

/** Move-speed bonus (bp) from Zoomies, Frenzy Catnip and (the human, Rookie) Scaredy cat. */
export function bonusSpeedBp(w: World, id: number): number {
  if (id >= RANGE.minions || w.kind[id] !== Kind.Hero) return 0;
  const panic = id === 0 && w.globals[G.HumanPanic] > 0 && w.hp[id] * BP_ONE < w.maxHp[id] * PANIC.hpBp ? w.globals[G.HumanPanic] : 0;
  return (w.zoomT[id] > 0 ? ZOOMIES.speedBp : 0) + (w.frenzyT[id] > 0 ? PICKUPS.frenzy.speedBp : 0) + panic;
}

/** Outgoing damage of hero `id` with Frenzy Catnip and the Pack buff. */
export function bonusDamage(w: World, id: number, raw: number): number {
  const bp = (w.frenzyT[id] > 0 ? PICKUPS.frenzy.dmgBp : 0) + (w.packT[id] > 0 ? RAT_CAMP_STATS.packDmgBp : 0);
  return bp > 0 ? applyBp(raw, BP_ONE + bp) : raw;
}

/**
 * Hero `id` is about to lose `dmg` HP: Nine Lives halves it while active, and starts when the last second's loss
 * (this hit included) reaches NINE_LIVES.lossBp of max HP. Returns the HP loss to apply.
 */
export function nineLives(m: MatchHandle, id: number, dmg: number): number {
  const w = m.world;
  if (dmg <= 0) return dmg;
  const tick = w.globals[G.Tick];
  const base = id * WIN;
  let sum = 0;
  for (let k = 0; k < WIN; k++) sum += w.dmgRing[base + k];
  const limit = applyBp(w.maxHp[id], rulesOf(m).nineLivesLossBp);
  if (sum + dmg > limit) {
    // Past the line, every hit this second is reduced (the one that crosses it only by its part beyond).
    const over = sum + dmg - Math.max(limit, sum);
    dmg -= over - applyBp(over, BP_ONE - NINE_LIVES.reduceBp);
    if (w.nineT[id] === 0 && tick >= w.nineReady[id]) {
      w.nineReady[id] = tick + NINE_LIVES.cooldown;
      m.events.push({ type: 'buff', tick, id, kind: 'nineLives', ticks: NINE_LIVES.ticks });
    }
    w.nineT[id] = NINE_LIVES.ticks;
  }
  w.dmgRing[base + (tick % WIN)] += dmg;
  return dmg;
}
