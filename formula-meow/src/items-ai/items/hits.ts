/**
 * Hit rules shared by every item (GDD 3.6, 4): who can be hit, the held-yarn shield from behind, and the stats
 * the balance harness reads. Sim-safe math only.
 */
import { ITEM_IDS, type HitKind, type ItemId, type KartState } from '../../types';
import type { SimContext } from '../../core/sim/plugins';
import { applyHit } from '../../core/sim/kart';
import { itemsOf, lapGap } from './state';

/** A kart that items can touch this tick (not respawning, not finished). */
export function touchable(k: KartState): boolean {
  // SIM_VERSION 8: karts on a loop's rail, in a jump gap's flight or its net cannot be touched (items pass them)
  return k.respawnTicks === 0 && k.finished === 0 && k.out === 0 && k.rail === 0 && k.gapLaunch === 0 && k.netTicks === 0;
}

/**
 * A kart holding a ready Yarn trails it behind as a shield (GDD 4: "hold as a shield"): one hit coming from behind
 * (`fromDist` < the kart's distance) is eaten by the yarn instead. Returns true when it blocked.
 */
export function yarnShield(ctx: SimContext, victim: number, fromDist: number): boolean {
  const k = ctx.st.karts[victim];
  if (k.item !== 'yarn' || k.rouletteTicks > 0 || lapGap(ctx.track, fromDist - k.dist) >= 0) return false;
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
