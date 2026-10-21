/**
 * Hit rules shared by every item (GDD 3.6, 4): who can be hit, the held-yarn shield from behind, and the stats
 * the balance harness reads. Sim-safe math only.
 */
import { ITEM_IDS, type HitKind, type ItemId, type KartState } from '../../types';
import type { SimContext } from '../../core/sim/plugins';
import { applyHit } from '../../core/sim/kart';
import { itemsOf } from './state';
import { cosL, sinL } from '../../core/sim/fixed';

/** A kart that items can touch this tick (not respawning, not finished). */
export function touchable(k: KartState): boolean {
  // SIM_VERSION 8: karts on a loop's rail, in a jump gap's flight or its net cannot be touched (items pass them)
  return k.respawnTicks === 0 && k.finished === 0 && k.out === 0 && k.rail === 0 && k.gapLaunch === 0 && k.netTicks === 0;
}

/**
 * A kart still in the race (SIM_VERSION 8): homing items keep it as their target while it is untouchable on a set
 * piece (a loop's rail, a gap flight, the net) and wait for it to come out, instead of switching to another kart.
 */
export function racing(k: KartState): boolean {
  return k.respawnTicks === 0 && k.finished === 0 && k.out === 0;
}

/**
 * A kart holding a ready Yarn trails it behind as a shield (GDD 4: "hold as a shield"): one hit coming from behind
 * is eaten by the yarn instead. Returns true when it blocked. SIM_VERSION 10: "behind" is behind the kart's tail
 * (the item at world point fromX, fromZ is on the far side of the kart from where it faces), not lower on the lap: a
 * kart driving against the lap (an arena) trails its yarn behind it too.
 */
export function yarnShield(ctx: SimContext, victim: number, fromX: number, fromZ: number): boolean {
  const k = ctx.st.karts[victim];
  if (k.item !== 'yarn' || k.rouletteTicks > 0 || (fromX - k.x) * sinL(k.heading) + (fromZ - k.z) * cosL(k.heading) >= 0) return false;
  k.item = null;
  k.itemCount = 0;
  ctx.emit({ type: 'blocked', kart: victim, item: 'yarn' });
  return true;
}

/** Apply an item hit and count it for the harness. Returns true when it landed. */
export function itemHit(ctx: SimContext, victim: number, kind: HitKind, by: number, item: ItemId): boolean {
  const ok = applyHit(ctx, victim, kind, by);
  if (ok) itemsOf(ctx.st).hits[ITEM_IDS.indexOf(item)]++;
  return ok;
}
