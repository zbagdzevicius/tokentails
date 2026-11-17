/** Mochi, Support (sim v29, original cat; docs/plans/moba/ROSTER-V29.md §2.1): a round ragdoll enchanter with a pillow. */
import type { HeroData } from './types';

export const MOCHI: HeroData = Object.freeze<HeroData>({
  id: 'mochi',
  name: 'Mochi',
  side: 'cat',
  role: 'support',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v29 (ROSTER-V29.md §4): the first fit. */
  // sim v33 (V33-KILLS.md, bigger kill rewards moved the 3v3 rows): 8750 / 8850
  pvp: { dmgBp: 8820, takenBp: 8775 },
  element: 'FAIRY',
  base: { hp: 500, hpPerLevel: 52, attack: 50, attackPerLevel: 5, attackEvery: 29, range: 5000, speed: 5000, armour: 18, armourPerLevel: 2 },
  /** Warm Lap: her shields on allied heroes below half HP are 25% stronger. */
  passive: { lowBp: 5000, bonusBp: 2500 },
  abilities: {
    /** Pillow Toss: 8 m pillow that stops at the first unit, 60 (+5/lvl, +15 a rank), slow 20% for 1 s; on an enemy hero the weakest allied hero within 7 m (her too) gets a 35 (+7/lvl) shield for 2.5 s. */
    q: { cooldown: 210, range: 8000, width: 1000, speed: 14000, dmg: 60, dmgPerLevel: 5, slowBp: 2000, slow: 30, shield: 35, shieldPerLevel: 7, shieldRange: 7000, duration: 75 },
    /** Cuddle Bubble: the allied hero nearest the aim within 7 m (else herself): a 75 (+15/lvl, +20 a rank) shield for 3 s and +30% attack speed for 3 s. */
    w: { cooldown: 360, range: 7000, pickRadius: 2500, shield: 75, shieldPerLevel: 15, duration: 90, asBp: 3000, as: 90 },
    /** Purr Wave: she and allied heroes within 4 m get +30% speed for 2 s; she shrugs off slows. */
    e: { cooldown: 420, radius: 4000, hasteBp: 3000, haste: 60 },
    /** LULLABY: 0.5 s wind-up; allied heroes within 6.5 m heal 90 (+9/lvl, +40 a rank); enemy heroes within 4.5 m are drowsy (slowed 45% for 1.2 s), then those still within 5.5 m of her fall asleep (stunned 0.75 s). */
    r: { cooldown: 2100, windup: 15, allyRadius: 6500, heal: 90, healPerLevel: 9, radius: 4500, slowBp: 4500, drowsy: 36, sleepRadius: 5500, sleep: 23 },
  },
  ranks: { q: { dmg: 15 }, w: { shield: 20 }, e: { cooldown: -15 }, r: { heal: 40, cooldown: -100 } },
  talents: [
    [
      { id: 'feather-pillow', name: 'Feather Pillow', mods: { q: { range: 9500 } } },
      { id: 'big-hug', name: 'Big Hug', mods: { w: { shield: 100 } } },
    ],
    [
      { id: 'purr-motor', name: 'Purr Motor', mods: { e: { hasteBp: 4500 } } },
      { id: 'comfy-lap', name: 'Comfy Lap', mods: { passive: { bonusBp: 5000 } } },
    ],
    [
      { id: 'deep-sleep', name: 'Deep Sleep', mods: { r: { sleep: 33 } } },
      { id: 'group-nap', name: 'Group Nap', mods: { r: { allyRadius: 8500 } } },
    ],
  ],
});
