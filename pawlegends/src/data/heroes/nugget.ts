/** Nugget, Support (sim v14, original dog): a corgi who herds foes, rushes to friends and heals by splooting. */
import type { HeroData } from './types';

export const NUGGET: HeroData = Object.freeze<HeroData>({
  id: 'nugget',
  name: 'Nugget',
  side: 'dog',
  role: 'support',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 9650 / takes 9425 (51.3% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8825 / takes 9325 (49.8% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 9550. Sim v18 (chase fix, docs/plans/moba/V18-CHASE.md §3): 8400 / takes 10125. */
  pvp: { dmgBp: 8385, takenBp: 10140 },
  element: 'FAIRY',
  base: { hp: 540, hpPerLevel: 56, attack: 50, attackPerLevel: 5, attackEvery: 29, range: 4800, speed: 4900, armour: 20, armourPerLevel: 2 },
  /** Treat Pouch: every 8 s his next basic on an enemy hero tosses a treat to the lowest-HP-share allied hero within 6 m (him too): heals 30 (+5/lvl). */
  passive: { every: 240, heal: 30, healPerLevel: 5, range: 6000 },
  abilities: {
    /** Frisbee: 8 m disc that pierces enemies, 55 (+5/lvl, +15 a rank), slow 20% for 1 s. */
    q: { cooldown: 210, range: 8000, width: 900, speed: 15000, dmg: 55, dmgPerLevel: 5, slowBp: 2000, slow: 30 },
    /** Best Friend: dash to the allied hero nearest the aim (6 m); shield them 70 (+14/lvl) for 3 s and both get +20% speed for 1.5 s. No ally: dash 3.5 m, half the shield on himself. */
    w: { cooldown: 390, range: 6000, pickRadius: 2500, gap: 300, soloDash: 3500, shield: 70, shieldPerLevel: 14, duration: 90, hasteBp: 2000, haste: 45 },
    /** Sploot: 1.5 s flat on his belly: rooted, 40% less damage; allied heroes within 3.5 m (him too) heal 60 (+8/lvl, +15 a rank) over the sploot. */
    e: { cooldown: 450, duration: 45, reduceBp: 4000, radius: 3500, heal: 60, healPerLevel: 8 },
    /** Herding Time: 0.5 s wind-up; enemy heroes within 4.5 m are herded up to 2 m toward the aim point (never into his own tower's range + 1 m), take 80 (+8/lvl, +35 a rank) and are slowed 30% for 1.5 s; allied heroes in the ring get +25% speed for 3 s. */
    r: { cooldown: 2100, windup: 15, radius: 4500, push: 2000, towerMargin: 1000, dmg: 80, dmgPerLevel: 8, slowBp: 3000, slow: 45, allyHasteBp: 2500, allyHaste: 90 },
  },
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { heal: 15 }, r: { dmg: 35, cooldown: -100 } },
  talents: [
    [
      { id: 'long-throw', name: 'Long Throw', mods: { q: { range: 9500 } } },
      { id: 'big-pouch', name: 'Big Pouch', mods: { passive: { heal: 45 } } },
    ],
    [
      { id: 'very-good-boy', name: 'Very Good Boy', mods: { w: { shield: 100 } } },
      { id: 'long-sploot', name: 'Long Sploot', mods: { e: { duration: 60, heal: 80 } } },
    ],
    [
      { id: 'border-collie-energy', name: 'Herding Pro', mods: { r: { push: 2500 } } },
      { id: 'zoomie-squad', name: 'Zoomie Squad', mods: { r: { allyHasteBp: 4000 } } },
    ],
  ],
});
