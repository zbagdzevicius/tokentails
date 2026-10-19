/**
 * The ItemSystem plugin (items-ai lane): roll at pickup, use on the press edge, step projectiles, traps and the
 * Zoomies knock-aside after physics, and fold everything into the state hash.
 */
import { ITEM_IDS } from '../../types';
import { ITEMS } from '../../tuning';
import type { ItemSystem, SimContext } from '../../core/sim/plugins';
import { itemDef, rollItem } from './registry';
import { hashItems, itemsOf, newItemsState } from './state';
import { stepProjectiles } from './projectiles';
import { stepTraps } from './traps';
import { itemHit, touchable } from './hits';
import { hullGap } from '../../core/sim/contact';

/**
 * Zoomies karts knock anyone they touch into a spin (GDD 4: "knocks karts aside"). Karts that cannot be hit
 * (shield, their own Zoomies, respawn immunity) are skipped, so no `blocked` spam (B18).
 */
function stepZoomies(ctx: SimContext): void {
  const ks = ctx.st.karts;
  for (let i = 0; i < ks.length; i++) {
    const a = ks[i];
    if (a.autoTicks <= 0 || !touchable(a)) continue;
    for (let j = 0; j < ks.length; j++) {
      const b = ks[j];
      if (j === i || !touchable(b) || b.spinTicks > 0 || b.shieldTicks > 0 || b.autoTicks > 0 || b.invTicks > 0) continue;
      if (Math.abs(b.y - a.y) < 1.6 && hullGap(a, b) <= ITEMS.zoomies.knock) itemHit(ctx, j, 'spin', i, 'zoomies');
    }
  }
}

export function createItemSystem(): ItemSystem {
  return {
    init(ctx) {
      (ctx.st.items as { s?: unknown }).s = newItemsState();
    },
    roll: (ctx, kart) => rollItem(ctx, kart),
    charges: (item) => itemDef(item)?.charges ?? 1,
    use(ctx, kart, back) {
      const k = ctx.st.karts[kart];
      if (!k.item) return;
      const id = k.item;
      itemDef(id)?.use(ctx, kart, back);
      itemsOf(ctx.st).uses[ITEM_IDS.indexOf(id)]++;
      // the item may have been eaten during use (never by its own kart today, but keep the count honest)
      if (k.item === id) k.itemCount--;
      if (k.itemCount <= 0 || k.item !== id) {
        k.item = null;
        k.itemCount = 0;
      }
    },
    step(ctx) {
      stepProjectiles(ctx);
      stepTraps(ctx);
      stepZoomies(ctx);
    },
    hash: (st, h) => hashItems(st, h),
  };
}
