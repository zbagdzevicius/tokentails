/** Chili, Marksman (sim v14, original dog): a chihuahua whose Rage turns into attack speed, then into a big dog. */
import type { HeroData } from './types';

export const CHILI: HeroData = Object.freeze<HeroData>({
  id: 'chili',
  name: 'Chili',
  side: 'dog',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 9500 / takes 9425 (52.0% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8850 / takes 9250 (51.2% of the 2,000-seed gate). */
  pvp: { dmgBp: 8850, takenBp: 9250 },
  element: 'ELECTRIC',
  base: { hp: 450, hpPerLevel: 47, attack: 50, attackPerLevel: 5, attackEvery: 27, range: 5500, speed: 5000, armour: 15, armourPerLevel: 2 },
  /** Small Dog Syndrome: each tick he takes damage from an enemy hero, and each Yap that hits a hero, adds 1 Rage (max 5; all lost 4 s after the last gain). Each Rage: +8% attack speed. */
  passive: { max: 5, window: 120, attackSpeedBpPer: 800 },
  abilities: {
    /** Yap Yap Yap: three yaps 0.17 s apart, each 7 m, stops at the first unit, 32 (+3/lvl, +8 a rank). */
    q: { cooldown: 210, count: 3, gap: 5, range: 7000, width: 700, speed: 20000, dmg: 32, dmgPerLevel: 3 },
    /** Tiny Zoomies: dash 3 m; +30% speed for 1.5 s and +1 Rage. */
    w: { cooldown: 330, dash: 3000, hasteBp: 3000, haste: 45, rage: 1 },
    /** Purse Mode: hide in a handbag for 1 s: untargetable, cannot move, attack or cast, heal 8% max HP; on the way out, enemy heroes within 2.2 m are slowed 30% for 1 s. */
    e: { cooldown: 600, duration: 30, healBp: 800, radius: 2200, slowBp: 3000, slow: 30 },
    /** BIG DOG ENERGY: 6 s, he grows: Rage locked full, basics splash 1.6 m for 60% onto up to 2 heroes or minions, 0.7 s CC immune at cast (sim v17, V17.md §3.3: was 0.5 s), +10% damage. */
    r: { cooldown: 1950, duration: 180, splash: 1600, splashBp: 6000, splashMax: 2, immune: 21, bonusBp: 11000 },
  },
  ranks: { q: { dmg: 8 }, w: { cooldown: -15 }, e: { cooldown: -30 }, r: { cooldown: -100 } },
  talents: [
    [
      { id: 'extra-yap', name: 'Extra Yap', mods: { q: { count: 4 } } },
      { id: 'short-fuse', name: 'Short Fuse', mods: { passive: { attackSpeedBpPer: 1000 } } },
    ],
    [
      { id: 'designer-bag', name: 'Designer Bag', mods: { e: { healBp: 1200 } } },
      { id: 'caffeinated', name: 'Caffeinated', mods: { w: { rage: 2 } } },
    ],
    [
      { id: 'even-bigger', name: 'Even Bigger', mods: { r: { splash: 2200 } } },
      { id: 'grudge', name: 'Grudge', mods: { r: { duration: 240 } } },
    ],
  ],
});
