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
import { HEROES } from '../data/heroes';
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
  /** Smart-cast targets (touch tap / bots-like auto aim). */
  smart: 'hero' | 'any' | 'none';
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
  }
}

const CACHE = new Map<HeroId, readonly [AimSpec, AimSpec, AimSpec, AimSpec]>();

export function aimFor(hero: HeroId, slot: CastSlot): AimSpec {
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
    default:
      return { kind: 'self', shape: 'none', range: 0, smart: 'none' };
  }
}

/** Max cooldown (ticks) for the HUD sweep: data cooldowns (talent mods may shorten them). */
export function maxCooldown(hero: HeroId, slot: CastSlot | 4, trick: TrickId): number {
  if (slot === 4) return TRICKS[trick].cooldown;
  const key = (['q', 'w', 'e', 'r'] as const)[slot];
  return HEROES[hero].abilities[key].cooldown;
}

/** Level at which the ultimate unlocks (§6.1). */
export const ULT_LEVEL = 4;
