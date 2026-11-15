/** Dusty, Marksman (sim v31, original cat; docs/plans/moba/ROSTER-V31.md §2.2): a tabby cowgirl with a four-cork popgun. */
import type { HeroData } from './types';

export const DUSTY: HeroData = Object.freeze<HeroData>({
  id: 'dusty',
  name: 'Dusty',
  side: 'cat',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v31 (ROSTER-V31.md §4): the first fit. */
  pvp: { dmgBp: 9300, takenBp: 8700 },
  element: 'FIRE',
  base: { hp: 450, hpPerLevel: 47, attack: 54, attackPerLevel: 5, attackEvery: 27, range: 5800, speed: 4900, armour: 14, armourPerLevel: 2 },
  /** Four Corks: every 4th basic is a Big Cork: +70% and a 25% slow for 1 s; then she reloads (0.6 s). */
  passive: { every: 4, bonusBp: 17000, slowBp: 2500, slow: 30, reload: 18 },
  abilities: {
    /** Trick Shot: a cork at an enemy within 6.5 m: 70 (+7/lvl, +18 a rank); it bounces to the nearest other enemy within 4 m (a hero first) for 70%. */
    q: { cooldown: 210, reach: 6500, dmg: 70, dmgPerLevel: 7, bounce: 4000, bounceBp: 7000 },
    /** Lasso: 0.3 s wind-up, a 6 m line, 1 m wide: the first enemy hero on it takes 40 (+4/lvl) and is rooted 1 s. */
    w: { cooldown: 420, windup: 9, range: 6000, width: 1000, dmg: 40, dmgPerLevel: 4, root: 30 },
    /** Quick Draw: dash 3 m and reload: her next basic within 3 s is a Big Cork, and it can fire at once. */
    e: { cooldown: 360, dash: 3000, window: 90 },
    /** HIGH NOON: 0.5 s wind-up; she plants her boots and fires 3 big corks 0.4 s apart along the aim, 12 m each, through minions, stopping at the first hero: 100 (+10/lvl, +40 a rank), the third +50%. */
    r: { cooldown: 2100, windup: 15, shots: 3, gap: 12, range: 12000, width: 900, speed: 24000, dmg: 100, dmgPerLevel: 10, minionBp: 5000, lastBp: 15000, spread: 34 },
  },
  ranks: { q: { dmg: 18 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 40, cooldown: -100 } },
  talents: [
    [
      { id: 'fast-hands', name: 'Fast Hands', mods: { passive: { reload: 9 } } },
      { id: 'lucky-bounce', name: 'Lucky Bounce', mods: { q: { bounceBp: 9000 } } },
    ],
    [
      { id: 'long-rope', name: 'Long Rope', mods: { w: { range: 7500 } } },
      { id: 'spurs', name: 'Spurs', mods: { e: { dash: 4000 } } },
    ],
    [
      { id: 'one-more', name: 'One More', mods: { r: { shots: 4 } } },
      { id: 'dead-eye', name: 'Dead Eye', mods: { r: { lastBp: 20000 } } },
    ],
  ],
});
