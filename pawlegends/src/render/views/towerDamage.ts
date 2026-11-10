/**
 * V21-FUN §4: tower and core damage states (render only, no sim change). A structure's health shows on the model:
 * cracks below 66% HP, smoke and flames below 33%, a blaze and a wobble below 15%, and its rubble smoulders after the
 * fall. Pure numbers and functions here; towerView.ts tracks the state per structure and render/fx/towerFire.ts emits
 * the fire into the pooled particles.
 *
 * The state only ever goes up during a match (towers do not heal), so nothing flickers at a boundary.
 */
import type { QualityTier } from '../quality';

/** HP fractions below which each state starts. */
export const TOWER_DAMAGE = Object.freeze({ cracked: 0.66, burning: 0.33, blazing: 0.15 });

/** 0 clean, 1 cracked, 2 burning, 3 blazing. */
export type DamageStage = 0 | 1 | 2 | 3;
export const STAGE = Object.freeze({ clean: 0, cracked: 1, burning: 2, blazing: 3 } as const);

/** The damage state for an HP fraction (pure). A dead structure (0 HP) is blazing until its fall takes over. */
export function damageState(hpFrac: number): DamageStage {
  if (!(hpFrac < TOWER_DAMAGE.cracked)) return 0;
  if (hpFrac >= TOWER_DAMAGE.burning) return 1;
  if (hpFrac >= TOWER_DAMAGE.blazing) return 2;
  return 3;
}

/** The state after `prev` given the HP now: never lower than `prev` (−1 = not seen yet). */
export function nextStage(prev: number, hpFrac: number): DamageStage {
  const s = damageState(hpFrac);
  return (prev > s ? prev : s) as DamageStage;
}

/** Crack strength per state (the rig shader's `uDmg`): 0 = none. */
export const CRACK_K: readonly number[] = Object.freeze([0, 0.55, 0.8, 1]);
/** Ember glow inside the cracks per state (`uEmber`): the cracks glow once the tower burns. */
export const EMBER_K: readonly number[] = Object.freeze([0, 0, 0.6, 1]);

/**
 * The lean toward the fall side (rad) per state and the blaze wobble (±rad at hz). The lean is the tower's tilt before
 * it falls (it falls the same way). Off under reduce motion.
 */
export const DAMAGE_POSE = Object.freeze({ lean: Object.freeze([0, 0.021, 0.035, 0.035]) as readonly number[], wobble: (1.5 * Math.PI) / 180, wobbleHz: 0.8 });

/** The flash (uFlashK) and chunk count when a structure crosses into a new state. */
export const STAGE_HIT = Object.freeze({ flash: 0.15, chips: 3 });

/**
 * Fire emitted per burning structure at Medium (per second) and the smoke's life (s). Blazing doubles the rates. Low
 * halves them, drops the embers and shortens the smoke. Budget (V21-FUN §4.3): ≈ 17 live per burning tower at Medium
 * (each flame lick is two sprites: its body and a glowing core), four blazing towers on screen under 10% of the 1,600.
 */
export const FIRE = Object.freeze({
  smoke: 3,
  flame: 6,
  ember: 2.5,
  smokeLife: 2.5,
  smokeLifeLow: 1.8,
  flameLife: 0.6,
  emberLife: 0.8,
  /** A fallen tower's rubble smoulders for its hold (towerView RUBBLE.hold): puffs a second. */
  smoulder: 3,
  /** The core's column is this much bigger. */
  core: 1.6,
  /** At most this many of one kind a frame (a long frame does not dump a burst). */
  perFrame: 3,
});

export interface FireRates {
  smoke: number;
  flame: number;
  ember: number;
  smokeLife: number;
}

/** The fire rates (per s) for a state on a VFX tier, into `out` (no allocation). Below burning: all 0. */
export function fireRates(stage: number, tier: QualityTier, out: FireRates): FireRates {
  const k = stage >= 3 ? 2 : stage >= 2 ? 1 : 0;
  const low = tier === 'low';
  const t = low ? 0.5 : 1;
  out.smoke = FIRE.smoke * k * t;
  out.flame = FIRE.flame * k * t;
  out.ember = low ? 0 : FIRE.ember * k;
  out.smokeLife = low ? FIRE.smokeLifeLow : FIRE.smokeLife;
  return out;
}

/** Lane keys (EntitySnap.lane) to the names the HUD uses. */
const LANE_NAME: Readonly<Record<string, string>> = Object.freeze({ sunny: 'Sunny Lane', puddle: 'Puddle Lane', fence: 'Fenceline', yarn: 'Yarn Road', gutter: 'Gutterway' });

/** The callout when one of our structures starts burning: "Our Sunny Lane tower is burning!" (pure). */
export function burningLine(kind: 'tower' | 'core', lane: string | null | undefined): string {
  if (kind === 'core') return 'Our core is burning!';
  const name = lane ? LANE_NAME[lane] : undefined;
  return name ? `Our ${name} tower is burning!` : 'Our base tower is burning!';
}
