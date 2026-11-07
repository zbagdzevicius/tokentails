/** Rocket, Marksman (sim v15, original dog): a greyhound who hits harder from far away and sprints, then naps. */
import type { HeroData } from './types';

export const ROCKET: HeroData = Object.freeze<HeroData>({
  id: 'rocket',
  name: 'Rocket',
  side: 'dog',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8925 / takes 9775 (49.9% of the 2,000-seed gate). */
  pvp: { dmgBp: 8925, takenBp: 9775 },
  element: 'GRASS',
  base: { hp: 450, hpPerLevel: 47, attack: 50, attackPerLevel: 5, attackEvery: 28, range: 6200, speed: 5100, armour: 14, armourPerLevel: 2 },
  /** Sighthound: his basics on an enemy hero 4.5 m or more away deal +20%. */
  passive: { range: 4500, bonusBp: 12000 },
  abilities: {
    /** Lure Shot: 9 m dart that passes minions (60% to them) and stops at the first hero: 70 (+7/lvl, +18 a rank), reveals it 2 s; on a hero hit he gets +25% speed for 1.5 s. */
    q: { cooldown: 210, range: 9000, width: 800, speed: 21000, dmg: 70, dmgPerLevel: 7, minionBp: 6000, reveal: 60, hasteBp: 2500, haste: 45 },
    /** Photo Finish: dash 3.5 m; his next basic within 3 s deals +40% and slows 25% for 1 s. */
    w: { cooldown: 300, dash: 3500, speed: 16000, window: 90, bonusBp: 14000, slowBp: 2500, slow: 30 },
    /** SQUIRREL!: throw a squeaky squirrel up to 7 m; after 0.5 s enemy heroes within 2.4 m take 40 (+4/lvl) and run at it for 0.7 s. */
    e: { cooldown: 480, range: 7000, windup: 15, radius: 2400, lure: 21, dmg: 40, dmgPerLevel: 4 },
    /** ZOOM… ZZZ: 0.3 s crouch, then sprint up to 11 m, untargetable; enemy heroes he passes take 130 (+13/lvl, +60 a rank) and take +10% from his basics for 4 s (Clocked; 11500 in the spec, cut on the balance gate). Then he naps 0.6 s on his back (cannot act, takes 50% less). */
    r: { cooldown: 2100, windup: 9, dash: 11000, speed: 24000, width: 1200, dmg: 130, dmgPerLevel: 13, clockedBp: 11000, clocked: 120, nap: 18, napReduceBp: 5000, napHealBp: 0 },
  },
  ranks: { q: { dmg: 18 }, w: { cooldown: -15 }, e: { cooldown: -30 }, r: { dmg: 60, cooldown: -100 } },
  talents: [
    [
      { id: 'long-legs', name: 'Long Legs', mods: { q: { range: 10500 } } },
      { id: 'eagle-eye', name: 'Eagle Eye', mods: { passive: { range: 3500 } } },
    ],
    [
      { id: 'false-start', name: 'False Start', mods: { w: { dash: 4500 } } },
      { id: 'squeakier', name: 'Squeakier Toy', mods: { e: { radius: 3000 } } },
    ],
    [
      { id: 'power-nap', name: 'Power Nap', mods: { r: { napHealBp: 1200 } } },
      { id: 'clocked', name: 'Clocked', mods: { r: { clocked: 180 } } },
    ],
  ],
});
