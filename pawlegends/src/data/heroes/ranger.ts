/** Ranger, Marksman (sim v31, original dog; docs/plans/moba/ROSTER-V31.md §2.4): a beagle park ranger who snipes with tennis balls from hiding. */
import type { HeroData } from './types';

export const RANGER: HeroData = Object.freeze<HeroData>({
  id: 'ranger',
  name: 'Ranger',
  side: 'dog',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v31 (ROSTER-V31.md §4): the first fit. */
  // sim v33 (V33-KILLS.md, bigger kill rewards moved the 3v3 rows): 9300 / 8700
  // sim v36 (V36-BALANCE.md, the v35 hero pass on 8,000 pool-rotation matches): 9195 / 8795
  pvp: { dmgBp: 8915, takenBp: 9075 },
  element: 'WIND',
  base: { hp: 440, hpPerLevel: 46, attack: 52, attackPerLevel: 5, attackEvery: 28, range: 6400, speed: 4900, armour: 14, armourPerLevel: 2 },
  /** Camouflage: 3 s without dealing or taking damage hides him (until he hits); his first basic from hiding deals +45%. */
  passive: { still: 90, bonusBp: 14500 },
  abilities: {
    /** Tracer Ball: 10 m ball that passes minions (60% to them) and stops at the first hero: 65 (+6/lvl, +16 a rank), reveals it 3 s. */
    q: { cooldown: 240, range: 10000, width: 800, speed: 16000, dmg: 65, dmgPerLevel: 6, minionBp: 6000, reveal: 90 },
    /** Warning Bark: cone 3 m, 90°: 30 (+3/lvl), knocked back 2 m and slowed 30% for 1 s. */
    w: { cooldown: 420, range: 3000, arc: 1024, dmg: 30, dmgPerLevel: 3, push: 2000, slowBp: 3000, slow: 30 },
    /** Bush Dive: dash 3.5 m and hide 1.5 s; his next basic is a Camouflage shot. */
    e: { cooldown: 420, dash: 3500, hide: 45 },
    /** LONG SHOT: on an enemy hero within 13 m, 0.5 s wind-up; he settles and fires 3 balls 0.4 s apart that home in: 85 (+8/lvl, +35 a rank) + 8% of its missing HP each; it is revealed until the last. */
    r: { cooldown: 2100, windup: 15, reach: 13000, shots: 3, gap: 12, dmg: 85, dmgPerLevel: 8, missingHpBp: 800, speed: 30000, leash: 15000 },
  },
  ranks: { q: { dmg: 16 }, w: { cooldown: -30 }, e: { cooldown: -15 }, r: { dmg: 35, cooldown: -100 } },
  talents: [
    [
      { id: 'good-nose', name: 'Good Nose', mods: { q: { reveal: 150 } } },
      { id: 'patience', name: 'Patience', mods: { passive: { still: 60 } } },
    ],
    [
      { id: 'big-bark', name: 'Big Bark', mods: { w: { push: 3000 } } },
      { id: 'deep-bush', name: 'Deep Bush', mods: { e: { hide: 75 } } },
    ],
    [
      { id: 'fourth-ball', name: 'Fourth Ball', mods: { r: { shots: 4 } } },
      { id: 'scope', name: 'Scope', mods: { r: { reach: 16000 } } },
    ],
  ],
});
