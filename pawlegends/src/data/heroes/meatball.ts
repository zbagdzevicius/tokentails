/** Meatball, Tank (sim v11, original cat): a displacement tank who bowls enemies off his allies. */
import type { HeroData } from './types';

export const MEATBALL: HeroData = Object.freeze<HeroData>({
  id: 'meatball',
  name: 'Meatball',
  side: 'cat',
  role: 'tank',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v11 balance pass: 9100 / 9600 (10000 / 9400 before: 55.4% of the 2,000-seed gate; now 52.3%). Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 7900 / takes 9925 (48.9% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 7200 / takes 10000 (48.0% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 9575. */
  pvp: { dmgBp: 7200, takenBp: 9575 },
  element: 'GRASS',
  base: { hp: 780, hpPerLevel: 80, attack: 50, attackPerLevel: 4, attackEvery: 34, range: 1600, speed: 4700, armour: 36, armourPerLevel: 3 },
  /** Food Coma: a hit that drops him below 30% HP puts him to sleep: a shield of 15% max HP for 3 s. 60 s lockout. */
  passive: { thresholdBp: 3000, shieldBp: 1500, duration: 90, cooldown: 1800 },
  abilities: {
    /** Bowling Roll: roll 6 m; enemies within 1.2 m of his path are knocked 1.5 m sideways, 55 (+5/lvl, +15 a rank); heroes slowed 25% for 1 s. */
    q: { cooldown: 270, dash: 6000, touch: 1200, push: 1500, dmg: 55, dmgPerLevel: 5, slowBp: 2500, slow: 30 },
    /** Loaf Mode: rooted loaf for 2 s, 40% less damage; enemy heroes within 3 m are charmed to him for 0.75 s. */
    w: { cooldown: 420, windup: 9, duration: 60, reduceBp: 4000, radius: 3000, charm: 23, slowBp: 5000 },
    /**
     * Big Brother: dash to the allied hero nearest the aim (6 m), stopping `gap` short of touching them; shield them 8% of
     * his max HP for 2.5 s and knock enemy heroes within 2.2 m of them 2 m away. No ally: dash 4 m, half the shield on himself.
     */
    e: { cooldown: 450, range: 6000, pickRadius: 2500, shieldBp: 800, duration: 75, radius: 2200, push: 2000, soloDash: 4000, gap: 300 },
    /** Unstoppable Chonk: 4 s cleanse and CC immunity, +35% speed; enemy heroes he bumps take 90 (+9/lvl, +40 a rank) and fly 2.5 m along his heading, once a second each. */
    r: { cooldown: 2100, duration: 120, hasteBp: 3500, touch: 1300, push: 2500, rehit: 30, dmg: 90, dmgPerLevel: 9 },
  },
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 40, cooldown: -100 } },
  talents: [
    [
      { id: 'hungry-roll', name: 'Hungry Roll', mods: { q: { dash: 7500 } } },
      { id: 'heavy-roll', name: 'Heavy Roll', mods: { q: { slowBp: 4000 } } },
    ],
    [
      { id: 'long-loaf', name: 'Long Loaf', mods: { w: { duration: 75 } } },
      { id: 'protective', name: 'Protective', mods: { e: { shieldBp: 1100 } } },
    ],
    [
      { id: 'extra-chonk', name: 'Extra Chonk', mods: { r: { duration: 150 } } },
      { id: 'bowling-pin', name: 'Bowling Pin', mods: { r: { push: 3500 } } },
    ],
  ],
});
