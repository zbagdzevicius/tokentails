/** Per-kind lookups shared by the unit modules: radius, attack numbers, invulnerability. */
import { HERO_IDS, HEROES } from '../../data/heroes';
import { RADIUS, TOWER_SPOTS } from '../../data/map';
import { MINIONS, MINION_KINDS } from '../../data/minions';
import { CORE_STATS, TOWERS } from '../../data/towers';
import { EFFECTS } from '../../data/effects';
import { RAT_CAMP_STATS } from '../../data/camps';
import { BP_ONE, applyBp, idiv } from '../fixed';
import { Buff, Kind, RANGE, type World } from '../world';

const RADIUS_BY_KIND: readonly number[] = [0, RADIUS.hero, RADIUS.minion, RADIUS.tower, RADIUS.core, RADIUS.fountain, RADIUS.camp, RADIUS.pudding];

export const radiusOf = (w: World, id: number): number => RADIUS_BY_KIND[w.kind[id]];

export const heroData = (w: World, id: number) => HEROES[HERO_IDS[w.sub[id]]];
export const minionData = (w: World, id: number) => MINIONS[MINION_KINDS[w.sub[id]]];

/** Attack range (centre to target edge is range + target radius). */
export function attackRange(w: World, id: number): number {
  switch (w.kind[id]) {
    case Kind.Hero:
      return heroData(w, id).base.range;
    case Kind.Minion:
      return minionData(w, id).range;
    case Kind.Tower:
      return TOWERS.outer.range;
    case Kind.Core:
      return CORE_STATS.range;
    case Kind.Camp:
      return RAT_CAMP_STATS.range;
    default:
      return 0;
  }
}

/** Ticks between basic attacks; an attack-speed buff of bp divides it by (1 + bp). */
export function attackEvery(w: World, id: number): number {
  switch (w.kind[id]) {
    case Kind.Hero: {
      const base = heroData(w, id).base.attackEvery;
      return w.asT[id] > 0 ? Math.max(1, idiv(base * BP_ONE, BP_ONE + w.asBp[id])) : base;
    }
    case Kind.Minion:
      return minionData(w, id).attackEvery;
    case Kind.Tower:
      return TOWERS[w.sub[id] === 0 ? 'outer' : 'inner'].attackEvery;
    case Kind.Core:
      return CORE_STATS.attackEvery;
    case Kind.Camp:
      return RAT_CAMP_STATS.attackEvery;
    default:
      return 0;
  }
}

/** Basic attack damage before armour and phase modifiers. */
export function attackDamage(w: World, id: number): number {
  if (w.kind[id] === Kind.Hero) {
    const b = heroData(w, id).base;
    return b.attack + b.attackPerLevel * (w.level[id] - 1);
  }
  if (w.kind[id] === Kind.Minion) return minionData(w, id).dmg;
  if (w.kind[id] === Kind.Camp) return RAT_CAMP_STATS.dmg;
  return 0;
}

function baseSpeed(w: World, id: number): number {
  if (w.kind[id] === Kind.Hero) return heroData(w, id).base.speed;
  if (w.kind[id] === Kind.Minion) return minionData(w, id).speed;
  if (w.kind[id] === Kind.Camp) return RAT_CAMP_STATS.speed;
  return 0;
}

/** Move speed with the active slow and haste (never below EFFECTS.minSpeedBp of the base). */
export function moveSpeed(w: World, id: number): number {
  const base = baseSpeed(w, id);
  const bp = BP_ONE - w.slowBp[id] + w.hasteBp[id];
  return applyBp(base, Math.max(bp, EFFECTS.minSpeedBp));
}

/**
 * Structure invulnerability (§5): an inner tower until that lane's outer falls; a core until one inner falls.
 */
export function isInvulnerable(w: World, id: number): boolean {
  const k = w.kind[id];
  if (k === Kind.Tower) {
    const local = id - RANGE.towers;
    const perTeam = TOWER_SPOTS.length;
    const base = RANGE.towers + (local >= perTeam ? perTeam : 0);
    const spot = TOWER_SPOTS[local % perTeam];
    if (spot.tier !== 'inner') return false;
    for (let k2 = 0; k2 < perTeam; k2++) {
      const s = TOWER_SPOTS[k2];
      if (s.lane === spot.lane && s.tier === 'outer' && w.alive[base + k2] === 1) return true;
    }
    return false;
  }
  if (k === Kind.Core) {
    const perTeam = TOWER_SPOTS.length;
    const base = RANGE.towers + w.team[id] * perTeam;
    for (let k2 = 0; k2 < perTeam; k2++) {
      if (TOWER_SPOTS[k2].tier === 'inner' && w.alive[base + k2] === 0) return false;
    }
    return true;
  }
  return (w.buffs[id] & Buff.Invulnerable) !== 0;
}

export const isStructure = (w: World, id: number): boolean => w.kind[id] === Kind.Tower || w.kind[id] === Kind.Core;

/** Can units of `team` attack `id` now? */
export function targetable(w: World, id: number, team: number): boolean {
  if (w.alive[id] === 0 || w.hp[id] <= 0) return false;
  const t = w.team[id];
  if (t === team) return false;
  const k = w.kind[id];
  if (k === Kind.Fountain || k === Kind.None) return false;
  if (w.untargT[id] > 0) return false;
  // Hidden in a bush or stealthed (map/brush.ts): what the team's snapshot leaves out cannot be targeted.
  if (team < 2 && ((w.seen[id] >> team) & 1) === 0) return false;
  if (isStructure(w, id) && isInvulnerable(w, id)) return false;
  return true;
}
