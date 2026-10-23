// Catnip economy (pure: no three, no DOM). Owned by the CATS lane. Numbers per GDD.md "Economy".
// CONTRACT (used by meta-ui): catnipForRun, catCost, upgradeCost, canBuyCat, buyCat, canBuyUpgrade, buyUpgrade.
// All save-changing functions return a NEW SaveData and never mutate their input.
import { UPGRADE_MAX, type CatId, type LevelDef, type RunResult, type SaveData, type UpgradeId } from '../core/types';

export const CAT_COSTS: Record<CatId, number> = { tabby: 0, chonk: 300, shadow: 600, siamese: 900 };
export const UPGRADE_BASE = [40, 80, 140, 220, 320];
export const CAT_UPGRADE_MUL: Record<CatId, number> = { tabby: 1, chonk: 1.2, shadow: 1.4, siamese: 1.6 };

/** Catnip earned by one run. newStars = stars gained beyond the previous best on this level. */
export function catnipForRun(result: RunResult, level: LevelDef, newStars: number): number {
  if (result.why === 'quit') return 0;
  const finished = result.why !== 'wet';
  const dmg = Number.isFinite(result.damage) ? Math.max(0, result.damage) : 0;
  const fromDamage = Math.min(150, Math.round(dmg / 20));
  const base = finished ? level.catnipBase : Math.floor(level.catnipBase / 3);
  const stars = Number.isFinite(newStars) ? Math.max(0, Math.floor(newStars)) : 0;
  return fromDamage + base + 30 * stars;
}

export const catCost = (id: CatId): number => CAT_COSTS[id];

/** Cost of the next level of `up` for `cat` when it is at `current`; null when maxed. */
export function upgradeCost(cat: CatId, up: UpgradeId, current: number): number | null {
  void up; // every track costs the same; kept in the signature so tracks can diverge later
  const c = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  if (c >= UPGRADE_MAX) return null;
  return Math.round(UPGRADE_BASE[c] * CAT_UPGRADE_MUL[cat]);
}

export function canBuyCat(save: SaveData, id: CatId): boolean {
  const c = save.cats[id];
  return !!c && !c.owned && save.catnip >= CAT_COSTS[id];
}

export function buyCat(save: SaveData, id: CatId): SaveData {
  if (!canBuyCat(save, id)) return save;
  return { ...save, catnip: save.catnip - CAT_COSTS[id], cats: { ...save.cats, [id]: { ...save.cats[id], owned: true } } };
}

export function canBuyUpgrade(save: SaveData, cat: CatId, up: UpgradeId): boolean {
  const c = save.cats[cat];
  if (!c || !c.owned) return false;
  const cost = upgradeCost(cat, up, c.upgrades[up]);
  return cost !== null && save.catnip >= cost;
}

export function buyUpgrade(save: SaveData, cat: CatId, up: UpgradeId): SaveData {
  if (!canBuyUpgrade(save, cat, up)) return save;
  const c = save.cats[cat];
  const cost = upgradeCost(cat, up, c.upgrades[up])!;
  return { ...save, catnip: save.catnip - cost, cats: { ...save.cats, [cat]: { ...c, upgrades: { ...c.upgrades, [up]: c.upgrades[up] + 1 } } } };
}
