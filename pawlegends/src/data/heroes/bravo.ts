/** Bravo, Tank (sim v14, original dog): a dramatic pug who slows, holds the stage, charms on R and fakes his own death. */
import type { HeroData } from './types';

export const BRAVO: HeroData = Object.freeze<HeroData>({
  id: 'bravo',
  name: 'Bravo',
  side: 'dog',
  role: 'tank',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 11350 / takes 8250 (49.1% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 10400 / takes 8225 (47.2% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3): takes 8375. */
  pvp: { dmgBp: 10400, takenBp: 8375 },
  element: 'STELLAR',
  base: { hp: 780, hpPerLevel: 80, attack: 46, attackPerLevel: 4, attackEvery: 35, range: 1600, speed: 4700, armour: 42, armourPerLevel: 3 },
  /** Dramatic Flop: a hit that would drop him below 25% HP (any hit, true damage too) makes him play dead: the hit stops at 1 HP, 1 s untargetable and still, healing 15% max HP. 90 s lockout, shared with Nine Lives. */
  passive: { thresholdBp: 2500, duration: 30, healBp: 1500, cooldown: 2700 },
  abilities: {
    /** Crocodile Tears: 6.5 m tear that stops at the first unit, 60 (+5/lvl, +15 a rank); a hero hit is slowed 50%, fading to 25%, for 1.5 s, and W's cooldown drops 1 s. Sim v17 (V17.md §3.8): slower shot, 15000 → 12000 mm/s, so it can be dodged on reaction. */
    q: { cooldown: 270, range: 6500, width: 900, speed: 12000, dmg: 60, dmgPerLevel: 5, slowBp: 5000, slow: 15, slowTailBp: 2500, slowTail: 30, refundW: 30 },
    /** Center Stage: a 3 m spotlight at his feet for 3 s; while he stands in it he takes 35% less; enemies in it are slowed 25%. */
    w: { cooldown: 420, radius: 3000, duration: 90, reduceBp: 3500, every: 10, slowBp: 2500, slow: 12 },
    /** Stage Dive: hop up to 5 m; landing ring 2.2 m, 50 (+4/lvl), slows 25% for 1 s. */
    e: { cooldown: 390, dash: 5000, radius: 2200, dmg: 50, dmgPerLevel: 4, slowBp: 2500, slow: 30 },
    /** ENCORE!: 0.7 s bow (sim v17, V17.md §3.4: was 0.6 s); enemy heroes within 4.5 m are charmed to him for 1 s and take 60 (+6/lvl, +30 a rank); he gains a shield of 12% max HP for 3 s. */
    r: { cooldown: 2250, windup: 21, radius: 4500, charm: 30, slowBp: 5000, dmg: 60, dmgPerLevel: 6, shieldBp: 1200, duration: 90 },
  },
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 30, cooldown: -100 } },
  talents: [
    [
      { id: 'ugly-crying', name: 'Ugly Crying', mods: { q: { slowTail: 45 } } },
      { id: 'method-actor', name: 'Method Actor', mods: { passive: { healBp: 1200 } } },
    ],
    [
      { id: 'big-spotlight', name: 'Big Spotlight', mods: { w: { radius: 4000 } } },
      { id: 'crowd-surf', name: 'Crowd Surf', mods: { e: { radius: 2800 } } },
    ],
    [
      { id: 'standing-ovation', name: 'Standing Ovation', mods: { r: { charm: 38 } } },
      { id: 'second-encore', name: 'Second Encore', mods: { r: { radius: 5500 } } },
    ],
  ],
});
