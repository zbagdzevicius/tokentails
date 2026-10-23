/**
 * SIM_TIMING (ANIM-SPEC §15): every sim timing a clip binds to, derived from the hero data, the effect primitives and
 * the hero rules, never typed in as literals. A balance retune changes these numbers, and the timing contract test
 * (tests/unit/anim/timing.contract.test.ts) fails instead of the animation desyncing. Render only: data imports.
 */
import { BRANCH_TALENT, HEROES, HERO_IDS } from '../../data/heroes';
import type { AbilitySlot, HeroId } from '../../data/heroes/types';
import { EFFECTS } from '../../data/effects';
import { HERO_RULES } from '../../data/xp';
import type { Slot } from './types';

export const TICK_HZ = 30;
export const TICK_S = 1 / TICK_HZ;
/** Basic attack windup (ticks from the swing to the hit / the bolt). */
export const BASIC_WINDUP = HERO_RULES.attackWindup;
/** Hero basic bolt speed (mm/s). */
export const BOLT_SPEED = HERO_RULES.projectile;
export const MELEE_MAX_RANGE = HERO_RULES.meleeMaxRange;
export const DASH_SPEED = EFFECTS.dashSpeed;
export const KNOCK_TICKS = EFFECTS.knockbackTicks;
/** Nap (recall) channel ticks. */
export const NAP_TICKS = HERO_RULES.napChannel;

/** Ticks a sim mover takes for `dMm` at `vMmS` (the sim steps v / 30 mm a tick). */
export const travelTicks = (dMm: number, vMmS: number): number => (vMmS > 0 ? Math.ceil((Math.max(0, dMm) * TICK_HZ) / vMmS) : 0);

/** Ability numbers after the chosen talents (ids) and the level-6 branch. Cached per (hero, slot, talents). */
const cache = new Map<string, Readonly<Record<string, number>>>();
export function abilNumbers(hero: HeroId, slot: Slot | 'passive', talentIds: readonly string[] | null = null, branch = false): Readonly<Record<string, number>> {
  const ids = talentIds ?? [];
  const br = branch ? BRANCH_TALENT[hero] : null;
  const key = `${hero}:${slot}:${ids.join(',')}:${br ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const d = HEROES[hero];
  const base = (slot === 'passive' ? d.passive : d.abilities[slot as AbilitySlot]) as Readonly<Record<string, number | undefined>>;
  const out: Record<string, number> = {};
  for (const k of Object.keys(base)) if (typeof base[k] === 'number') out[k] = base[k] as number;
  const apply = (id: string): void => {
    for (const tier of d.talents)
      for (const t of tier) {
        if (t.id !== id) continue;
        const m = t.mods?.[slot as AbilitySlot | 'passive'];
        if (m) for (const k of Object.keys(m)) out[k] = m[k];
      }
  };
  for (const id of ids) apply(id);
  if (br && !ids.includes(br)) apply(br);
  const frozen = Object.freeze(out);
  cache.set(key, frozen);
  return frozen;
}

/** The talent ids a snapshot's `talents` triple (−1 / 0 / 1 per tier) names. */
export function talentIdsOf(hero: HeroId, picks: readonly number[] | undefined): string[] {
  const out: string[] = [];
  if (!picks) return out;
  const tiers = HEROES[hero].talents;
  for (let i = 0; i < tiers.length && i < picks.length; i++) {
    const c = picks[i];
    if (c === 0 || c === 1) out.push(tiers[i][c].id);
  }
  return out;
}

export interface SlotTiming {
  /** Sim windup ticks before the cast (0 = instant). */
  windup: number;
  /** Dash distance (mm) and its ticks at dash speed (0 = no dash). */
  dashMm: number;
  dashTicks: number;
  /** Skillshot / wave speed (mm/s), range (mm) and flight ticks at full range. */
  projSpeed: number;
  projRange: number;
  projTicks: number;
  /** Zone arm ticks (Sage W, Gabė Q, Bengas R) and pulse period. */
  arm: number;
  every: number;
  /** State duration (blocks, Golden Hour, tethers, stealth, zone life). */
  duration: number;
  recasts: number;
  recastWindow: number;
  /** Blink distance (mm), instant. */
  blink: number;
  /**
   * The dash stops at the aim point when it is closer than `dashMm` (Lambo's Belly Flop). Every other dash flies its
   * full length toward the aim direction (sim `dash(m, id, angle, a.<slot>.dash)`); walls cut either short.
   */
  aimClamped: boolean;
}

/** Derive a slot's timings from its (talent-resolved) numbers. */
export function slotTimingFrom(hero: HeroId, slot: Slot, a: Readonly<Record<string, number>>): SlotTiming {
  const dashMm = a.dash ?? 0;
  // Golden Hour's wave, Cacklejaw R's homing dash and every skillshot carry their own speed
  const projSpeed = a.waveSpeed ?? a.speed ?? 0;
  const projRange = a.waveRange ?? (projSpeed > 0 ? (a.range ?? 0) : 0);
  const arm = a.arm ?? (hero === 'bengas' && slot === 'r' ? (a.windup ?? 0) : 0);
  return {
    windup: hero === 'bengas' && slot === 'r' ? 0 : (a.windup ?? 0),
    dashMm,
    dashTicks: travelTicks(dashMm, DASH_SPEED),
    projSpeed,
    projRange,
    projTicks: projSpeed > 0 ? (projRange * TICK_HZ) / projSpeed : 0,
    arm,
    every: a.every ?? 0,
    duration: a.postDuration ?? a.duration ?? a.haste ?? 0,
    recasts: a.recasts ?? a.resets ?? 0,
    recastWindow: a.recastWindow ?? a.resetWindow ?? 0,
    blink: a.blink ?? 0,
    aimClamped: hero === 'lambo' && slot === 'e',
  };
}

export interface HeroTiming {
  /** Ticks between basics at level 1 with no buffs. */
  period: number;
  /** Fires a bolt (release anchor) rather than hitting at the windup's end. */
  ranged: boolean;
  /** Basic windup ticks (swing start → contact / release). */
  windup: number;
  boltSpeed: number;
  slots: Readonly<Record<Slot, SlotTiming>>;
}

function heroTiming(h: HeroId): HeroTiming {
  const d = HEROES[h];
  const slot = (s: Slot): SlotTiming => slotTimingFrom(h, s, abilNumbers(h, s));
  return Object.freeze({
    period: d.base.attackEvery,
    ranged: d.base.range > MELEE_MAX_RANGE,
    windup: BASIC_WINDUP,
    boltSpeed: BOLT_SPEED,
    slots: Object.freeze({ q: slot('q'), w: slot('w'), e: slot('e'), r: slot('r') }),
  });
}

/** Base timings per hero (no talents, no branch). */
export const SIM_TIMING: Readonly<Record<HeroId, HeroTiming>> = Object.freeze(Object.fromEntries(HERO_IDS.map((h) => [h, heroTiming(h)])) as Record<HeroId, HeroTiming>);

/** Lambo's Belly Flop ring lands one tick after the hop ends (kit: `land` on the tick after the dash). */
export const FLOP_RING_DELAY = 1;
