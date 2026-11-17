/** Barkula, Mage (sim v31, original dog; docs/plans/moba/ROSTER-V31.md §2.3): a caped Doberman count who drinks the fight. */
import type { HeroData } from './types';

export const BARKULA: HeroData = Object.freeze<HeroData>({
  id: 'barkula',
  name: 'Barkula',
  side: 'dog',
  role: 'mage',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v31 (ROSTER-V31.md §4): the first fit. */
  // sim v33 (V33-KILLS.md, bigger kill rewards moved the 3v3 rows): 9350 / 8650
  pvp: { dmgBp: 9310, takenBp: 8690 },
  element: 'DARK',
  base: { hp: 520, hpPerLevel: 54, attack: 50, attackPerLevel: 5, attackEvery: 30, range: 5000, speed: 4900, armour: 17, armourPerLevel: 2 },
  /** Night Thirst: his ability damage heals him 18% of it on enemy heroes, 6% on anything else. */
  passive: { heroBp: 1800, otherBp: 600 },
  abilities: {
    /** Bat Bite: a 7.5 m bat that stops at the first unit: 70 (+7/lvl, +18 a rank). */
    q: { cooldown: 180, range: 7500, width: 900, speed: 13000, dmg: 70, dmgPerLevel: 7 },
    /** Bat Swarm: 2.5 s of bats round him: every 0.5 s enemies within 2.8 m take 22 (+2/lvl, +6 a rank); +15% speed. */
    w: { cooldown: 360, duration: 75, every: 15, radius: 2800, dmg: 22, dmgPerLevel: 2, hasteBp: 1500, haste: 75 },
    /** Mist Form: 0.6 s as mist: untargetable, +40% speed, slows shaken off. */
    e: { cooldown: 480, untargetable: 18, hasteBp: 4000, haste: 18 },
    /** RED MOON: 0.4 s wind-up; enemy heroes within 5 m are marked and slowed 30% for 1.5 s; then each marked hero still within 7 m takes 130 (+13/lvl, +50 a rank) and he heals another 20% of it. */
    r: { cooldown: 2000, windup: 12, radius: 5000, slow: 45, slowBp: 3000, popRadius: 7000, dmg: 130, dmgPerLevel: 13, drinkBp: 2000 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 6 }, e: { cooldown: -30 }, r: { dmg: 50, cooldown: -100 } },
  talents: [
    [
      { id: 'fangs', name: 'Fangs', mods: { passive: { heroBp: 2400 } } },
      { id: 'night-flight', name: 'Night Flight', mods: { q: { range: 9000 } } },
    ],
    [
      { id: 'big-swarm', name: 'Big Swarm', mods: { w: { radius: 3400 } } },
      { id: 'thick-fog', name: 'Thick Fog', mods: { e: { untargetable: 27, haste: 27 } } },
    ],
    [
      { id: 'full-moon', name: 'Full Moon', mods: { r: { radius: 6000 } } },
      { id: 'old-count', name: 'Old Count', mods: { r: { drinkBp: 3500 } } },
    ],
  ],
});
