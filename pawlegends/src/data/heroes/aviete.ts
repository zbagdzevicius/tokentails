/** Avietė, Assassin (shelter champion, sim v9): inspired by Avietė's Token Tails card (data/heroes/shelter.ts). */
import type { HeroData } from './types';

export const AVIETE: HeroData = Object.freeze<HeroData>({
  id: 'aviete',
  name: 'Avietė',
  side: 'cat',
  role: 'assassin',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 13000, takenBp: 8600 },
  element: 'ELECTRIC',
  base: { hp: 500, hpPerLevel: 54, attack: 58, attackPerLevel: 6, attackEvery: 28, range: 1600, speed: 5200, armour: 18, armourPerLevel: 2 },
  /**
   * Shy, Then Shiny: after 1 s in brush she is Charged (it holds 4 s after she leaves brush); her next damage of
   * any kind to an enemy hero deals +60 (+10/lvl) and stuns 0.5 s, then she cannot charge again for 8 s.
   */
  passive: { brushTime: 30, hold: 120, bonus: 60, bonusPerLevel: 10, stun: 15, lockout: 240 },
  abilities: {
    /** Spark Swipe: cone 2.2 m, 100°, 75 (+12/lvl). */
    q: { cooldown: 180, range: 2200, arc: 1138, dmg: 75, dmgPerLevel: 12 },
    /** Shiny Coat: Charged at once and +20% speed for 2 s; during the lockout only the speed. */
    w: { cooldown: 420, speedBp: 2000, haste: 60 },
    /** Live Wire: blink up to 4.5 m; a recast within 2 s blinks her back to where she started. */
    e: { cooldown: 420, blink: 4500, recastWindow: 60 },
    /** Short Circuit: blink beside an enemy hero within 6 m, 150 (+30/lvl), slow enemy heroes within 3 m 40% for 1.5 s. */
    r: { cooldown: 1950, range: 6000, dmg: 150, dmgPerLevel: 30, dazzleRadius: 3000, slowBp: 4000, slow: 45 },
  },
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
