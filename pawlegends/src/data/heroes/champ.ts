/** Champ, Fighter (sim v29, original dog; docs/plans/moba/ROSTER-V29.md §2.4): a boxer in boxing gloves who throws cats into walls. */
import type { HeroData } from './types';

export const CHAMP: HeroData = Object.freeze<HeroData>({
  id: 'champ',
  name: 'Champ',
  side: 'dog',
  role: 'fighter',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v29 (ROSTER-V29.md §4): the first fit. */
  // sim v33 (V33-KILLS.md, bigger kill rewards moved the 3v3 rows): 8750 / 8850
  // sim v36 (V36-BALANCE.md, the v35 hero pass on 8,000 pool-rotation matches): 8725 / 8875
  pvp: { dmgBp: 8785, takenBp: 8815 },
  element: 'FIRE',
  base: { hp: 640, hpPerLevel: 66, attack: 60, attackPerLevel: 6, attackEvery: 30, range: 1600, speed: 5000, armour: 28, armourPerLevel: 3 },
  /** One-Two: every 3rd basic on the same enemy hero within 3 s is a Cross: +35 (+6/lvl) and a 25% slow for 1 s. */
  passive: { window: 90, every: 3, dmg: 35, dmgPerLevel: 6, slowBp: 2500, slow: 30 },
  abilities: {
    /** Haymaker: 0.2 s wind-up, cone 3 m, 75°: 75 (+7/lvl, +18 a rank). */
    q: { cooldown: 210, windup: 6, range: 3000, arc: 853, dmg: 75, dmgPerLevel: 7 },
    /** Rope-a-Dope: 1.5 s guard, 35% less damage; when it ends he heals 40% of the damage he took in it. */
    w: { cooldown: 480, duration: 45, reduceBp: 3500, healBp: 4000 },
    /** Bob and Weave: dash 3.5 m; his next basic within 3 s is a Cross. */
    e: { cooldown: 330, dash: 3500, window: 90 },
    /** KNOCKOUT!: on an enemy hero within 2.5 m, 0.5 s wind-up: 150 (+15/lvl, +65 a rank) + 10% of its missing HP, knocked back 4 m; a wall that stops it short stuns it 1.25 s. */
    r: { cooldown: 1950, windup: 15, reach: 2500, dmg: 150, dmgPerLevel: 15, missingBp: 1000, push: 4000, wallBp: 7500, wallStun: 38 },
  },
  ranks: { q: { dmg: 18 }, w: { cooldown: -30 }, e: { cooldown: -15 }, r: { dmg: 65, cooldown: -100 } },
  talents: [
    [
      { id: 'southpaw', name: 'Southpaw', mods: { passive: { dmg: 50 } } },
      { id: 'footwork', name: 'Footwork', mods: { e: { dash: 4500 } } },
    ],
    [
      { id: 'iron-chin', name: 'Iron Chin', mods: { w: { reduceBp: 4500 } } },
      { id: 'corner-man', name: 'Corner Man', mods: { w: { healBp: 6000 } } },
    ],
    [
      { id: 'title-belt', name: 'Title Belt', mods: { r: { push: 5500 } } },
      { id: 'ten-count', name: 'Ten Count', mods: { r: { wallStun: 53 } } },
    ],
  ],
});
