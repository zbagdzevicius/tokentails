/**
 * Item registry and roulette (items-ai lane, GDD 4, 4.1). Each item is an `ItemDef` registered by id. The roll uses
 * the position table from tuning.ts (by effective position), restricted to registered items that are not blocked
 * right now (Laser Dot: lap 1, one active, 10 s cooldown), so a blocked roll is redrawn from the remaining items.
 * Daily modifiers reshape the table. The ItemSystem itself (use + step) lives in system.ts.
 */
import { ITEM_IDS, Modifier, type ItemId } from '../../types';
import { ITEM_WEIGHTS } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { draw } from '../../core/sim/rng';

export interface ItemDef {
  id: ItemId;
  /** uses per pickup (Catnip ×3) */
  charges: number;
  /** cannot be rolled on lap 1 (Laser Dot) */
  notOnLap1?: boolean;
  /** cannot be rolled right now (race-wide limits); the roll is redrawn from the rest */
  blocked?(ctx: SimContext): boolean;
  use(ctx: SimContext, kart: number, back: boolean): void;
}

const REGISTRY = new Map<ItemId, ItemDef>();

export function registerItem(def: ItemDef): void {
  REGISTRY.set(def.id, def);
}

export function itemDef(id: ItemId): ItemDef | undefined {
  return REGISTRY.get(id);
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

/** The weights a kart at effective position `pos` (1..8) rolls with right now, in ITEM_IDS order. */
export function rollWeights(ctx: SimContext, kart: number, pos: number): number[] {
  const k = ctx.st.karts[kart];
  const row = ITEM_WEIGHTS[Math.max(0, Math.min(ITEM_WEIGHTS.length - 1, pos - 1))];
  const mods = ctx.cfg.modifiers;
  const lap1 = k.lap <= 1;
  return ITEM_IDS.map((id, i) => {
    const def = REGISTRY.get(id);
    if (!def || (def.notOnLap1 && lap1) || def.blocked?.(ctx)) return 0;
    if (mods & Modifier.CucumbersOnly) return id === 'cucumber' ? 1 : 0;
    let v = row[i];
    if (mods & Modifier.CatnipRain && id === 'catnip') v = v * 2 + 10;
    if (mods & Modifier.ZoomiesPlus && id === 'zoomies') v = v * 2 + 5;
    if (mods & Modifier.BoxParty && id === 'box') v = v * 3 + 10;
    return v;
  });
}

/** Draw an item for kart `kart` from its `rngItems` stream (one draw per roll). */
export function rollItem(ctx: SimContext, kart: number): ItemId {
  const k = ctx.st.karts[kart];
  const w = rollWeights(ctx, kart, effectivePosition(ctx, kart));
  let total = 0;
  for (const v of w) total += v;
  const r = draw(k, 'rngItems');
  if (total <= 0) return 'catnip';
  let x = r * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x < 0 && w[i] > 0) return ITEM_IDS[i];
  }
  return ITEM_IDS[w.findIndex((v) => v > 0)];
}
