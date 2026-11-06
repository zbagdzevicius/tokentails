/** Duchess, Mage (sim v11, original cat): a floating Persian whose hits stack Disdain into a Snub stun. */
import type { HeroData } from './types';

export const DUCHESS: HeroData = Object.freeze<HeroData>({
  id: 'duchess',
  name: 'Duchess',
  side: 'cat',
  role: 'mage',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v11 balance pass: 11400 / 8700 (10400 / 9600 before: 41.5% of the 2,000-seed gate; now 52.7%). Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 11100 / takes 8550 (49.6% of the 2,000-seed gate). */
  pvp: { dmgBp: 11100, takenBp: 8550 },
  element: 'DARK',
  base: { hp: 480, hpPerLevel: 50, attack: 50, attackPerLevel: 5, attackEvery: 30, range: 5000, speed: 4800, armour: 16, armourPerLevel: 2 },
  /** Utter Disdain: her ability hits on a hero add 1 Disdain (4 s); at 3 the hero is Snubbed: stunned 0.75 s, 40 (+4/lvl); then 6 s immune. */
  passive: { stacks: 3, window: 120, stun: 23, dmg: 40, dmgPerLevel: 4, lockout: 180 },
  abilities: {
    /** Fluff Puff: slow fat 7.5 m shot, 1.4 m wide, pierces; 60 (+6/lvl, +15 a rank), slow 20% 1 s. */
    q: { cooldown: 210, range: 7500, width: 1400, speed: 9000, dmg: 60, dmgPerLevel: 6, slowBp: 2000, slow: 30 },
    /** Not Amused: 0.35 s wind-up, cone 5 m, 80°; 50 (+5/lvl, +12 a rank), slow 35% 1.5 s. */
    w: { cooldown: 300, windup: 11, range: 5000, arc: 910, dmg: 50, dmgPerLevel: 5, slowBp: 3500, slow: 45 },
    /** Cushion Glide: glide 4 m at 12 m/s, leaving a 2.2 m fluff cloud for 2.5 s that slows enemies 30%. */
    e: { cooldown: 390, dash: 4000, speed: 12000, radius: 2200, ttl: 75, every: 15, slowBp: 3000, slow: 18 },
    /** Royal Decree: 0.6 s wind-up; enemy heroes within 6 m take 110 (+11/lvl, +45 a rank), are slowed 40% 1.5 s and gain 2 Disdain; she gains a 120 (+12/lvl) shield for 3 s. */
    r: { cooldown: 1950, windup: 18, radius: 6000, dmg: 110, dmgPerLevel: 11, slowBp: 4000, slow: 45, stacks: 2, shield: 120, shieldPerLevel: 12, duration: 90 },
  },
  ranks: { q: { dmg: 15 }, w: { dmg: 12 }, e: { cooldown: -15 }, r: { dmg: 45, cooldown: -100 } },
  talents: [
    [
      { id: 'double-fluff', name: 'Double Fluff', mods: { q: { width: 1900 } } },
      { id: 'grand-glare', name: 'Grand Glare', mods: { w: { arc: 1200 } } },
    ],
    [
      { id: 'cloud-nine', name: 'Cloud Nine', mods: { e: { ttl: 120 } } },
      { id: 'shedding-season', name: 'Shedding Season', mods: { e: { radius: 3000 } } },
    ],
    [
      { id: 'imperial-decree', name: 'Imperial Decree', mods: { r: { radius: 7500 } } },
      { id: 'utterly-unamused', name: 'Utterly Unamused', mods: { passive: { stun: 33 } } },
    ],
  ],
});
