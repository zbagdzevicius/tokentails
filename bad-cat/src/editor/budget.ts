/** Room Maker limits and the chaos budget (GDD 6.4). Pure. */
import { propKind, type RoomDef } from '../types';

export const MAKER_MAX_PROPS = 40;
export const MAKER_MAX_BUDGET = 3000;
export const MAKER_TARGETS = 3;
/** Clear-check rule: the maker's own run must wreck at least this many targets (no impossible rooms). */
export const CLEAR_MIN_TARGETS = 1;
/**
 * A remix of an authored (daily) room keeps that room's chaos: the cap is its budget, up to this ceiling (the
 * daily rooms run 3,120–7,410). Round 2: every "Remix today" was over the plain 3,000 and could never publish.
 */
export const MAKER_REMIX_MAX_BUDGET = 10000;

/** The chaos cap of a draft that started from `source` (a remix), else the plain maker cap. */
export function budgetCapFor(source?: Pick<RoomDef, 'props'> | null): number {
  if (!source) return MAKER_MAX_BUDGET;
  return Math.min(MAKER_REMIX_MAX_BUDGET, Math.max(MAKER_MAX_BUDGET, roomBudget(source)));
}
/** Admin (content authoring): the daily limits instead. */
export const ADMIN_MAX_PROPS = 45;

/** Base points of one prop. A stack counts full (every item x its points). */
export function propCost(kind: number): number {
  const k = propKind(kind);
  if (!k) return 0;
  return k.stack ? k.stack.items * k.stack.itemBase : k.base;
}

/** Summed base points of every prop in the room. */
export function roomBudget(room: Pick<RoomDef, 'props'>): number {
  let b = 0;
  for (const p of room.props) b += propCost(p.kind);
  return b;
}

export type BudgetMood = 'calm' | 'spicy' | 'wild' | 'over';

/** Meter state: fill 0..1 (clamped), a mood and the cheeky line under it. */
export function budgetMeter(budget: number, max = MAKER_MAX_BUDGET): { fill: number; mood: BudgetMood; line: string } {
  // No cap (admin authoring): the mood follows the plain maker scale, never "over".
  const scale = Number.isFinite(max) && max > 0 ? max : MAKER_MAX_BUDGET;
  const f = budget / scale;
  if (Number.isFinite(max) && budget > max) return { fill: 1, mood: 'over', line: `Too much chaos, even for a cat: ${(budget - max).toLocaleString('en-US')} over` };
  if (f >= 0.8) return { fill: Math.min(1, f), mood: 'wild', line: 'Deliciously unhinged' };
  if (f >= 0.4) return { fill: f, mood: 'spicy', line: 'Getting spicy' };
  if (budget === 0) return { fill: 0, mood: 'calm', line: 'Suspiciously tidy' };
  const more = Math.ceil(scale * 0.4) - budget;
  return { fill: f, mood: 'calm', line: `Needs more breakables: ${more.toLocaleString('en-US')} more points` };
}

/** Would adding `kind` break the budget? */
export function fitsBudget(room: Pick<RoomDef, 'props'>, kind: number, max = MAKER_MAX_BUDGET): boolean {
  return roomBudget(room) + propCost(kind) <= max;
}
