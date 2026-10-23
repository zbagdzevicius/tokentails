/**
 * How each ability is aimed and drawn (POC.md §6, §9). Numbers come from src/data (mm, 1/4096 turn); this file only
 * adds the aiming shape. Used by the input layer (quick-cast, hold-aim, walk-in cast, touch drag-aim) and by the
 * telegraph renderer (indicators and enemy wind-ups).
 *
 * Aim kinds:
 * - self: no aim; the cast goes at the hero's own position.
 * - dir: a direction; the command carries the cursor point (or hero + direction × range).
 * - point: a ground point within `range`; further away the hero walks in, then casts.
 * - unit: an enemy hero within `range`; further away the hero walks in, then casts.
 */
import { BRANCH_TALENT, HERO_IDS, HEROES } from '../data/heroes';
import { kitNumbers } from '../sim/heroes/talents';
import { TRICKS } from '../data/tricks';
import type { CastSlot, HeroId, TrickId } from '../sim/api';

export type AimKind = 'self' | 'dir' | 'point' | 'unit';
export type AimShape = 'cone' | 'line' | 'dash' | 'circle' | 'ring' | 'none';

export interface AimSpec {
  kind: AimKind;
  shape: AimShape;
  /** Max cast distance (mm): cone/line length, dash length, point/unit range, ring radius. */
  range: number;
  /** Cone full angle (rad). */
  arc?: number;
  /** Line/dash width (mm). */
  width?: number;
  /** Circle radius at the aim point, or around the hero for `ring` (mm). */
  radius?: number;
  /** Sage's Hop Back: the dash goes away from the aim point. */
  away?: boolean;
  /** Smart-cast targets (touch tap / bots-like auto aim); 'ally' (sim v9, Gabė's Wing Wrap): the most hurt allied hero. */
  smart: 'hero' | 'any' | 'ally' | 'none';
}

const STEP_TO_RAD = (Math.PI * 2) / 4096;
const n = (v: number | undefined, d: number): number => (typeof v === 'number' ? v : d);

function heroAims(hero: HeroId): readonly [AimSpec, AimSpec, AimSpec, AimSpec] {
  const a = HEROES[hero].abilities;
  switch (hero) {
    case 'clem':
      return [
        { kind: 'dir', shape: 'cone', range: n(a.q.range, 2400), arc: n(a.q.arc, 1024) * STEP_TO_RAD, smart: 'any' },
        { kind: 'self', shape: 'cone', range: 1600, arc: Math.PI * 0.75, smart: 'none' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 4000), width: 900, smart: 'none' },
        { kind: 'self', shape: 'ring', range: n(a.r.waveRange, 5000), radius: n(a.r.waveRange, 5000), smart: 'none' },
      ];
    case 'sage':
      return [
        { kind: 'dir', shape: 'cone', range: n(a.q.range, 7000), arc: n(a.q.arc, 569) * STEP_TO_RAD, smart: 'any' },
        { kind: 'point', shape: 'circle', range: n(a.w.range, 6000), radius: n(a.w.radius, 1000), smart: 'hero' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3000), width: 900, away: true, smart: 'none' },
        { kind: 'dir', shape: 'line', range: n(a.r.range, 40000), width: n(a.r.width, 1200), smart: 'hero' },
      ];
    case 'brutus':
      return [
        { kind: 'self', shape: 'ring', range: n(a.q.radius, 3000), radius: n(a.q.radius, 3000), smart: 'none' },
        { kind: 'dir', shape: 'cone', range: 1800, arc: n(a.w.arc, 1365) * STEP_TO_RAD, smart: 'hero' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 5000), width: 1200, smart: 'hero' },
        { kind: 'unit', shape: 'ring', range: n(a.r.range, 5000), radius: n(a.r.ringRadius, 6000), smart: 'hero' },
      ];
    case 'cacklejaw':
      return [
        { kind: 'dir', shape: 'dash', range: n(a.q.dash, 4000), width: n(a.q.width, 1000), smart: 'any' },
        { kind: 'dir', shape: 'cone', range: n(a.w.range, 3000), arc: n(a.w.arc, 796) * STEP_TO_RAD, smart: 'hero' },
        { kind: 'self', shape: 'none', range: 0, smart: 'none' },
        { kind: 'self', shape: 'ring', range: n(a.r.range, 12000), radius: n(a.r.range, 12000), smart: 'none' },
      ];
    case 'lambo':
      return [
        { kind: 'dir', shape: 'line', range: n(a.q.range, 6000), width: n(a.q.width, 900), smart: 'any' },
        { kind: 'self', shape: 'ring', range: n(a.w.range, 4000), radius: n(a.w.range, 4000), smart: 'none' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 5000), width: n(a.e.radius, 2200), smart: 'hero' },
        { kind: 'self', shape: 'ring', range: n(a.r.radius, 4500), radius: n(a.r.radius, 4500), smart: 'none' },
      ];
    case 'aviete':
      return [
        { kind: 'dir', shape: 'cone', range: n(a.q.range, 2200), arc: n(a.q.arc, 1138) * STEP_TO_RAD, smart: 'any' },
        { kind: 'self', shape: 'none', range: 0, smart: 'none' },
        { kind: 'point', shape: 'circle', range: n(a.e.blink, 4500), radius: 600, smart: 'none' },
        { kind: 'unit', shape: 'ring', range: n(a.r.range, 6000), radius: n(a.r.dazzleRadius, 3000), smart: 'hero' },
      ];
    case 'bengas':
      return [
        { kind: 'dir', shape: 'line', range: n(a.q.range, 7000), width: n(a.q.width, 800), smart: 'hero' },
        { kind: 'dir', shape: 'cone', range: n(a.w.range, 4000), arc: n(a.w.arc, 796) * STEP_TO_RAD, smart: 'hero' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3500), width: 900, smart: 'none' },
        { kind: 'point', shape: 'circle', range: n(a.r.range, 9000), radius: n(a.r.radius, 3500), smart: 'hero' },
      ];
    case 'gabe':
      return [
        { kind: 'point', shape: 'circle', range: n(a.q.range, 7000), radius: n(a.q.radius, 2200), smart: 'hero' },
        { kind: 'point', shape: 'circle', range: n(a.w.range, 6000), radius: n(a.w.pickRadius, 2500), smart: 'ally' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 4000), width: n(a.e.touch, 1500) * 2, smart: 'none' },
        { kind: 'dir', shape: 'cone', range: n(a.r.range, 6000), arc: n(a.r.arc, 1024) * STEP_TO_RAD, smart: 'hero' },
      ];
  }
}

/**
 * Sim v10 (GAPS B6): the aim of a slot whose shape the level-6 branch changed (BRANCH_TALENT), or null. Numbers come
 * from the talent's own mods: Sage's Piercing Shot is a 9 m line, Sir Brutus's Guard Post a 3 m dome around him.
 */
function branchAim(hero: HeroId, slot: CastSlot): AimSpec | null {
  const id = BRANCH_TALENT[hero];
  const mods = id ? HEROES[hero].talents[1].find((t) => t.id === id)?.mods : undefined;
  if (!mods) return null;
  if (hero === 'sage' && slot === 0 && mods.q) return { kind: 'dir', shape: 'line', range: n(mods.q.range, 9000), width: n(mods.q.width, 600), smart: 'hero' };
  if (hero === 'brutus' && slot === 1 && mods.w) return { kind: 'self', shape: 'ring', range: n(mods.w.postRadius, 3000), radius: n(mods.w.postRadius, 3000), smart: 'none' };
  return null;
}

const CACHE = new Map<HeroId, readonly [AimSpec, AimSpec, AimSpec, AimSpec]>();
const BRANCH_CACHE = new Map<string, AimSpec | null>();

/** `branch` (sim v10, GAPS B6): the hero took its level-6 shape branch (`EntitySnap.branch`). */
export function aimFor(hero: HeroId, slot: CastSlot, branch = false): AimSpec {
  if (branch) {
    const key = `${hero}:${slot}`;
    let b = BRANCH_CACHE.get(key);
    if (b === undefined) {
      b = branchAim(hero, slot);
      BRANCH_CACHE.set(key, b);
    }
    if (b) return b;
  }
  let v = CACHE.get(hero);
  if (!v) {
    v = heroAims(hero);
    CACHE.set(hero, v);
  }
  return v[slot];
}

export function trickAim(trick: TrickId): AimSpec {
  switch (trick) {
    case 'pounce':
      return { kind: 'point', shape: 'circle', range: TRICKS.pounce.blink, radius: 600, smart: 'none' };
    case 'hiss':
      return { kind: 'self', shape: 'ring', range: TRICKS.hiss.radius, radius: TRICKS.hiss.radius, smart: 'none' };
    // Snack Break and Purr-ify: self casts, no aim
    default:
      return { kind: 'self', shape: 'none', range: 0, smart: 'none' };
  }
}

/**
 * Talent choices per tier (−1 none) for a hero who took only its level-6 shape branch, or none: what the HUD assumes
 * when it does not know the picks.
 */
export function branchChoices(hero: HeroId, branch: boolean): number[] {
  const id = branch ? BRANCH_TALENT[hero] : null;
  const c = id ? HEROES[hero].talents[1].findIndex((t) => t.id === id) : -1;
  return [-1, c, -1];
}

/**
 * Max cooldown (ticks) for the HUD sweep: the sim's own numbers at `level` (Wave C ranks) with the talent `choices`
 * (snapshot `talents`; without them, only the level-6 shape branch when `branch`, which may set its own cooldown).
 */
export function maxCooldown(hero: HeroId, slot: CastSlot | 4, trick: TrickId, branch = false, level = 1, choices?: readonly number[]): number {
  if (slot === 4) return TRICKS[trick].cooldown;
  const key = (['q', 'w', 'e', 'r'] as const)[slot];
  return kitNumbers(HERO_IDS.indexOf(hero), level, choices ?? branchChoices(hero, branch))[key].cooldown;
}

/** Level at which the ultimate unlocks (§6.1). */
export const ULT_LEVEL = 4;
