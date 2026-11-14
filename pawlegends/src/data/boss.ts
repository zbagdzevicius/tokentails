/**
 * Sim v28 (docs/plans/moba/V28.md §4): Boss Weekend's boss. The enemy team's first slot plays `hero` (whatever the
 * seed drew there), its two other slots sit out (data/mutators.ts BOSS `playing`), and the boss bot holds its arena on
 * the Sunny Lane strip's river crossing. On top of its own kit (driven by the bot brain like any bot) it has two
 * telegraphed boss attacks and three phases. Integer mm, ticks (30 a second) and bp.
 *
 * - Phase 1 (from full HP): Ground Pound, a ring round the boss, every `poundEvery[0]`.
 * - Phase 2 (below `phaseBp[0]` of max HP): it roars, calls `pups` minions round it, pounds every `poundEvery[1]` and
 *   starts Meteor Paw, a circle on the hero it hunts (where that hero stands when the telegraph starts).
 * - Phase 3 (below `phaseBp[1]`): it roars again, calls more pups, cooldowns × `rageCdBp`, moves `rageSpeedBp` faster,
 *   pounds every `poundEvery[2]`.
 * - Enrage at `enrageAt`: every hit of the boss × `enrageDmgBp`. The match's time up (6:30) is the boss's win.
 *
 * Every attack names its telegraph in a `windup` event (slot `poundSlot` / `meteorSlot`, the point and its ticks), so
 * the client draws the ring before it lands.
 */
import type { HeroId } from '../sim/api';

export const BOSS = Object.freeze({
  hero: 'brutus' as HeroId,
  /** Shown on the boss bar and in the mode's text. */
  name: 'Mega Brutus',
  /** Max HP (the level-ups it earns add on top) and armour. */
  hp: 11000,
  armour: 60,
  /** Its damage (abilities and basics) × this; the damage it takes × takenBp. */
  dmgBp: 12500,
  takenBp: 10000,
  /** The arena: centre (team 0's coordinates: the Sunny Lane river crossing) and the leash it never leaves. */
  homeX: 50000,
  homeY: 52500,
  leash: 13000,
  /** It hunts heroes within this of its centre. */
  aggro: 16000,
  /** Phase 2 and 3 start below these shares of max HP. */
  phaseBp: Object.freeze([6600, 3300] as const),
  /** Ground Pound: every poundEvery[phase], a `telegraph` wind-up, then a ring of `radius` for `damage` and a stun. */
  poundEvery: Object.freeze([330, 270, 180] as const),
  poundTelegraph: 39,
  poundRadius: 5200,
  poundDamage: 190,
  poundStun: 24,
  /** Meteor Paw (phase 2 on): every meteorEvery, a circle of `meteorRadius` where its hunted hero stands. */
  meteorEvery: 210,
  meteorTelegraph: 33,
  meteorRadius: 3200,
  meteorDamage: 230,
  /** Pups called at each phase change, round the boss. */
  pups: Object.freeze([3, 4] as const),
  pupRing: 3000,
  /** Phase 3: cooldowns × this, move speed + this. */
  rageCdBp: 6000,
  rageSpeedBp: 1500,
  /** Enrage: from this tick (5:30) every hit of the boss × enrageDmgBp. */
  enrageAt: 9900,
  enrageDmgBp: 17500,
  /** With no hero to hit, an attack looks again after this long. */
  retryTicks: 30,
  /** Where a benched hero waits (off the map's playfield, team 0's corner; team 1's is the mirror). */
  benchX: 1000,
  benchY: 1000,
  /** windup event slots of the two boss attacks (hero slots are 0 to 5). */
  poundSlot: 6,
  meteorSlot: 7,
});
