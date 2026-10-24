// Cat stats and upgrade math (pure: no three, no DOM). Owned by the CATS lane.
// CONTRACT: effectiveStats(base, upgrades) -> CatStats is used by meta-ui to build the loadout passed to
// session.prepareLevel(levelId, catId, stats).
import { UPGRADE_MAX, type CatStats, type UpgradeId } from '../core/types';

/** The orange tabby: exactly the POC tuning. Other cats are expressed relative to it in defs.ts. */
export const TABBY_STATS: CatStats = {
  walk: 34,
  zoom: 62,
  turn: 7,
  radius: 13,
  headY: 46,
  scale: 1,
  swatCd: 0.32,
  swatReach: 26,
  swatRadius: 17,
  swatPower: 1,
  pounceCd: 2.0,
  pounceR: 32,
  pounceJump: 95,
  pounceFwd: 85,
  patienceMax: 100,
  wetResist: 1,
  stunResist: 1,
  ultraCharge: 1,
  ultraTime: 7,
};

/** Upgrade level clamped to 0..UPGRADE_MAX (garbage counts as 0). */
const lvl = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(UPGRADE_MAX, Math.floor(v))) : 0);

/** Per-level bonuses, per GDD.md "Economy" (Upgrades table). Exported for the cat-select stat bars. */
export const UPGRADE_STEP = {
  power: { swatPower: 0.08, swatRadius: 0.04, pounceR: 0.04 },
  speed: { walk: 0.05, zoom: 0.05, turn: 0.04 },
  fur: { patienceMax: 8, wetResist: -0.06, stunResist: -0.06 },
  ultra: { ultraCharge: 0.08, ultraTime: 0.4 },
} as const;

/** Base stats + upgrade levels (0..UPGRADE_MAX). Pure: returns a new object, never mutates `base`. */
export function effectiveStats(base: CatStats, upgrades: Partial<Record<UpgradeId, number>>): CatStats {
  const s = { ...base };
  const pw = lvl(upgrades?.power);
  const sp = lvl(upgrades?.speed);
  const fu = lvl(upgrades?.fur);
  const ul = lvl(upgrades?.ultra);
  const U = UPGRADE_STEP;
  s.swatPower *= 1 + U.power.swatPower * pw;
  s.swatRadius *= 1 + U.power.swatRadius * pw;
  s.pounceR *= 1 + U.power.pounceR * pw;
  s.walk *= 1 + U.speed.walk * sp;
  s.zoom *= 1 + U.speed.zoom * sp;
  s.turn *= 1 + U.speed.turn * sp;
  s.patienceMax += U.fur.patienceMax * fu;
  s.wetResist *= 1 + U.fur.wetResist * fu;
  s.stunResist *= 1 + U.fur.stunResist * fu;
  s.ultraCharge *= 1 + U.ultra.ultraCharge * ul;
  s.ultraTime += U.ultra.ultraTime * ul;
  return s;
}
