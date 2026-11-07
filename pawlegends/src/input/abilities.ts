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
import { RADIUS } from '../data/map';
import { HERO_RULES } from '../data/xp';
import { MINIONS } from '../data/minions';
import { TOY_SUM } from '../data/toys';
import type { CastSlot, HeroId, TrickId } from '../sim/api';
import { aims as meatballAims } from './aims/meatball';
import { aims as pixelAims } from './aims/pixel';
import { aims as duchessAims } from './aims/duchess';
import { aims as stiltsAims } from './aims/stilts';
import { aims as nuggetAims } from './aims/nugget';
import { aims as marshmallowAims } from './aims/marshmallow';
import { aims as bravoAims } from './aims/bravo';
import { aims as chiliAims } from './aims/chili';
import { aims as howlerAims } from './aims/howler';
import { aims as rocketAims } from './aims/rocket';
import { aims as frankieAims } from './aims/frankie';
import { aims as dominoAims } from './aims/domino';

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
  /** Audit CF-03: a blink (Pounce, Avietė's Live Wire): a touch tap goes the full range along the stick or the facing. */
  blink?: boolean;
  /** Smart-cast targets (touch tap / bots-like auto aim); 'ally' (sim v9, Gabė's Wing Wrap): the most hurt allied hero. */
  smart: 'hero' | 'any' | 'ally' | 'none';
  /**
   * A mobility blink or escape dash (heading.ts): a touch press fires at once, the full distance where the player is
   * heading (the held joystick, else the movement, else the way the hero last walked, else the facing); never a
   * smart target, no aim step. The sim takes a point past the range for these (blink() clamps it, a dash reads only
   * the angle), and a point blink never walks in.
   */
  heading?: boolean;
  /** The Paw Trick flash (Pounce): desktop casts it on the key press, the full distance toward the cursor. */
  flash?: boolean;
  /** Avietė's Live Wire: for this many ticks after it (or a cast of a `opensReturn` slot) E blinks back instead. */
  returnTicks?: number;
  /** Avietė's Short Circuit: its cast opens the Live Wire return window too. */
  opensReturn?: boolean;
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
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 4000), width: 900, smart: 'none', heading: true },
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
        { kind: 'point', shape: 'circle', range: n(a.e.blink, 4500), radius: 600, blink: true, smart: 'none', heading: true, returnTicks: n(a.e.recastWindow, 60) },
        { kind: 'unit', shape: 'ring', range: n(a.r.range, 6000), radius: n(a.r.dazzleRadius, 3000), smart: 'hero', opensReturn: true },
      ];
    case 'bengas':
      return [
        { kind: 'dir', shape: 'line', range: n(a.q.range, 7000), width: n(a.q.width, 800), smart: 'hero' },
        { kind: 'dir', shape: 'cone', range: n(a.w.range, 4000), arc: n(a.w.arc, 796) * STEP_TO_RAD, smart: 'hero' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 3500), width: 900, smart: 'none', heading: true },
        { kind: 'point', shape: 'circle', range: n(a.r.range, 9000), radius: n(a.r.radius, 3500), smart: 'hero' },
      ];
    case 'gabe':
      return [
        { kind: 'point', shape: 'circle', range: n(a.q.range, 7000), radius: n(a.q.radius, 2200), smart: 'hero' },
        { kind: 'point', shape: 'circle', range: n(a.w.range, 6000), radius: n(a.w.pickRadius, 2500), smart: 'ally' },
        { kind: 'dir', shape: 'dash', range: n(a.e.dash, 4000), width: n(a.e.touch, 1500) * 2, smart: 'none', heading: true },
        { kind: 'dir', shape: 'cone', range: n(a.r.range, 6000), arc: n(a.r.arc, 1024) * STEP_TO_RAD, smart: 'hero' },
      ];
    // sim v11 original cats: each hero's aims live in ./aims/<hero>.ts
    case 'meatball':
      return meatballAims(a);
    case 'pixel':
      return pixelAims(a);
    case 'duchess':
      return duchessAims(a);
    case 'stilts':
      return stiltsAims(a);
    case 'nugget':
      return nuggetAims(a);
    case 'marshmallow':
      return marshmallowAims(a);
    case 'bravo':
      return bravoAims(a);
    case 'chili':
      return chiliAims(a);
    case 'howler':
      return howlerAims(a);
    case 'rocket':
      return rocketAims(a);
    case 'frankie':
      return frankieAims(a);
    case 'domino':
      return dominoAims(a);
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
      return { kind: 'point', shape: 'circle', range: TRICKS.pounce.blink, radius: 600, blink: true, smart: 'none', heading: true, flash: true };
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

/**
 * Basic attack range (mm), as the sim reads it (`attackRange`: the hero's `base.range`), and whether the hero fires a
 * bolt (ranged: above HERO_RULES.meleeMaxRange) instead of swinging in melee. The touch Attack button and the attack
 * range ring read these, so a new hero needs no client copy of its range.
 */
export const basicRange = (hero: HeroId): number => HEROES[hero].base.range;
export const isRangedHero = (hero: HeroId): boolean => basicRange(hero) > HERO_RULES.meleeMaxRange;

/**
 * Radius (mm) of the attack range ring around the own hero: the sim's reach is range + own radius + target radius,
 * so a ring at range + own radius is where an enemy's edge comes into reach.
 */
export const attackRingMm = (hero: HeroId): number => basicRange(hero) + RADIUS.hero;

/**
 * C5 (client estimate, never a replay input): what the hero's next basic deals to minion or camp `u` after armour,
 * with its level and Toys, a little under (×0.95) so a "kills it" guess rarely misses. The minion's kind is read from
 * its max HP (siege carts are big, ranged pups small); camps have no armour.
 */
export function minionHitEstimate(hero: HeroId, level: number, toy: number, u: { kind: string; maxHp: number }): number {
  const b = HEROES[hero].base;
  const raw = b.attack + b.attackPerLevel * Math.max(0, level - 1);
  const sum = TOY_SUM[HEROES[hero].role][Math.max(0, Math.min(4, toy))];
  const armour = u.kind !== 'minion' ? 0 : u.maxHp >= MINIONS.siege.hp * 0.85 ? MINIONS.siege.armour : u.maxHp < (MINIONS.ranged.hp + MINIONS.melee.hp) / 2 ? MINIONS.ranged.armour : MINIONS.melee.armour;
  const dmg = (raw * (10000 + sum.dmgBp)) / 10000;
  return Math.floor(((dmg * HERO_RULES.armourBase) / (HERO_RULES.armourBase + armour)) * 0.95);
}

/** Level at which the ultimate unlocks (§6.1). */
export const ULT_LEVEL = 4;
