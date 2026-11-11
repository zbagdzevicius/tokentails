/** Avietė, Assassin (shelter champion, sim v9): inspired by Avietė's Token Tails card (data/heroes/shelter.ts). */
import type { HeroData } from './types';

export const AVIETE: HeroData = Object.freeze<HeroData>({
  id: 'aviete',
  name: 'Avietė',
  side: 'cat',
  role: 'assassin',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Wave C: dmgBp 13000 to 12700 (54.1% with level growth and ranks). Sim v11 (four new cats): 12100 / takes 8400 (balance gate 50.6%). Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 12750 / takes 7800 (50.4% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 11650 / takes 7725 (49.7% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 7600. Sim v18 (chase fix, docs/plans/moba/V18-CHASE.md §3): 11475 / takes 7950. Sim v20 refit on four seed windows (V20-CHASE.md §9): 11415 / 8010 → 11355 / 7830. */
  pvp: { dmgBp: 11355, takenBp: 7830 },
  element: 'ELECTRIC',
  base: { hp: 500, hpPerLevel: 54, attack: 58, attackPerLevel: 6, attackEvery: 28, range: 1600, speed: 5200, armour: 18, armourPerLevel: 2 },
  /**
   * Shy, Then Shiny: after 1 s in brush she is Charged (it holds 4 s after she leaves brush); her next damage of
   * any kind to an enemy hero deals +40 (+4/lvl) and stuns 0.5 s, then she cannot charge again for 8 s. Sim v17
   * (V17.md §3.11 burst cap): bonus 60 (+10/lvl) → 40 (+4/lvl); her R then a charged basic took 78% of a level-10 Chili
   * in 1.5 s (Nine Lives already caps the first second, so the hit after it is what the 70% rule trims).
   */
  passive: { brushTime: 30, hold: 120, bonus: 40, bonusPerLevel: 4, stun: 15, lockout: 240 },
  abilities: {
    /** Spark Swipe: cone 2.2 m, 100°, 75 (+6/lvl, +18 a rank). */
    q: { cooldown: 180, range: 2200, arc: 1138, dmg: 75, dmgPerLevel: 6 },
    /** Shiny Coat: Charged after a 0.5 s fill (sim v17, V17.md §3.7: was at once) and +20% speed for 2 s; during the lockout only the speed. */
    w: { cooldown: 420, speedBp: 2000, haste: 60, chargeDelay: 15 },
    /** Live Wire: blink up to 4.5 m; a recast within 2 s blinks her back to where she started. */
    e: { cooldown: 420, blink: 4500, recastWindow: 60 },
    /** Short Circuit: blink beside an enemy hero within 6 m, 150 (+15/lvl, +68 a rank), slow enemy heroes within 3 m 40% for 1.5 s. Sim v17 (V17.md §3.7): its hit neither uses nor sets off her charge. */
    r: { cooldown: 1950, range: 6000, dmg: 150, dmgPerLevel: 15, dazzleRadius: 3000, slowBp: 4000, slow: 45 },
  },
  /** Wave C (C2): each rank above 1 adds these (Q/W/E rank up at levels 2, 5, 8; R at 7, 10). Half the old per-level damage moved into the ranks, so level-10 damage is unchanged. */
  ranks: { q: { dmg: 18 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 68, cooldown: -100 } },
  talents: [
    [
      { id: 'wide-swipe', name: 'Wide Swipe', mods: { q: { arc: 1365 } } },
      { id: 'live-spark', name: 'Live Spark', mods: { passive: { stun: 21 } } },
    ],
    [
      { id: 'long-wire', name: 'Long Wire', mods: { e: { blink: 5500 } } },
      { id: 'quick-shine', name: 'Quick Shine', mods: { w: { cooldown: 300 } } },
    ],
    [
      { id: 'encore', name: 'Encore', mods: { r: { cooldown: 1500 } } },
      { id: 'blinding-shine', name: 'Blinding Shine', mods: { r: { slowBp: 5500 } } },
    ],
  ],
});
