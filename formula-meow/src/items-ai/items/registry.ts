/**
 * Item registry (items-ai lane, GDD 4). Each item is an `ItemDef` registered by id; the roll uses the position
 * table from tuning.ts restricted to registered items, so items can land one at a time. v1 core registers only
 * Catnip (defs.ts); the items-ai lane adds the other seven here without touching the core.
 */
import { BoostSource, ITEM_IDS, type ItemId, type RaceState } from '../../types';
import { ITEM_WEIGHTS } from '../../tuning';
import type { ItemSystem, SimContext } from '../../core/sim/plugins';
import { applyBoost } from '../../core/sim/kart';
import { draw } from '../../core/sim/rng';
import { BOOST } from '../../tuning';

export interface ItemDef {
  id: ItemId;
  /** uses per pickup (Catnip ×3) */
  charges: number;
  /** cannot be rolled on lap 1 (Laser Dot) */
  notOnLap1?: boolean;
  use(ctx: SimContext, kart: number, back: boolean): void;
}

const REGISTRY = new Map<ItemId, ItemDef>();

export function registerItem(def: ItemDef): void {
  REGISTRY.set(def.id, def);
}

export function registeredItems(): ItemDef[] {
  return ITEM_IDS.map((id) => REGISTRY.get(id)).filter((d): d is ItemDef => !!d);
}

/** GDD 4.1: race place, one worse when > 6 s behind the leader, two worse when > 12 s (capped at 8th). */
export function effectivePosition(ctx: SimContext, kart: number): number {
  const st = ctx.st;
  const k = st.karts[kart];
  const leader = st.karts[st.order[0]];
  const gapS = (leader.dist - k.dist) / ctx.tun.topSpeed;
  const extra = gapS > 12 ? 2 : gapS > 6 ? 1 : 0;
  return Math.min(st.karts.length, k.place + extra);
}

export const catnip: ItemDef = {
  id: 'catnip',
  charges: 3,
  use(ctx, kart) {
    applyBoost(ctx, kart, BOOST.catnip.level, BOOST.catnip.time, BoostSource.Catnip);
  },
};

export function createItemSystem(): ItemSystem {
  return {
    roll(ctx, kart) {
      const k = ctx.st.karts[kart];
      const row = ITEM_WEIGHTS[Math.max(0, Math.min(7, effectivePosition(ctx, kart) - 1))];
      const lap1 = k.lap <= 1;
      let total = 0;
      const w = ITEM_IDS.map((id, i) => {
        const def = REGISTRY.get(id);
        const v = def && !(def.notOnLap1 && lap1) ? row[i] : 0;
        total += v;
        return v;
      });
      const r = draw(k, 'rngItems');
      if (total <= 0) return registeredItems()[0]?.id ?? 'catnip';
      let x = r * total;
      for (let i = 0; i < w.length; i++) {
        x -= w[i];
        if (x < 0 && w[i] > 0) return ITEM_IDS[i];
      }
      return ITEM_IDS[w.findIndex((v) => v > 0)];
    },
    charges(item) {
      return REGISTRY.get(item)?.charges ?? 1;
    },
    use(ctx, kart, back) {
      const k = ctx.st.karts[kart];
      const def = k.item ? REGISTRY.get(k.item) : undefined;
      def?.use(ctx, kart, back);
      k.itemCount--;
      if (k.itemCount <= 0) {
        k.item = null;
        k.itemCount = 0;
      }
    },
    hash(_st: RaceState, h: number) {
      return h;
    },
  };
}
