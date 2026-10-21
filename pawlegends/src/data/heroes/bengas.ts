/** Bengas, Mage (shelter champion, sim v9): inspired by Bengas's Token Tails card (data/heroes/shelter.ts). */
import type { HeroData } from './types';

export const BENGAS: HeroData = Object.freeze<HeroData>({
  id: 'bengas',
  name: 'Bengas',
  side: 'cat',
  role: 'mage',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v10: 11200 (11000 before; 46.3% to 47.9% with seeded bot talents). */
  pvp: { dmgBp: 11200, takenBp: 9100 },
  element: 'FIRE',
  base: { hp: 470, hpPerLevel: 48, attack: 56, attackPerLevel: 5, attackEvery: 30, range: 5500, speed: 4900, armour: 14, armourPerLevel: 2 },
  /** Hot Toast: +15% damage to enemy heroes that are stunned, rooted, charmed, feared or slowed. */
  passive: { bonusBp: 11500 },
  abilities: {
    /** Burnt Toast: skillshot 7 m that stops at the first unit, 70 (+7/lvl, +18 a rank). */
    q: { cooldown: 180, range: 7000, width: 800, speed: 18000, dmg: 70, dmgPerLevel: 7 },
    /**
     * Striking Pose: 0.3 s wind-up, cone 4 m, 70°; enemy heroes in it facing Bengas (±90°) are stunned 0.75 s;
     * the others in it are slowed 25% for 1 s.
     */
    w: { cooldown: 420, windup: 9, range: 4000, arc: 796, facingArc: 2048, stun: 23, slowBp: 2500, slow: 30 },
    /** Camellia Hop: dash 3.5 m, then +20% speed for 1 s. */
    e: { cooldown: 390, dash: 3500, hasteBp: 2000, haste: 30 },
    /** Curtains Up!: a 3.5 m fire disc within 9 m; 0.6 s arm, then 8 pulses every 0.5 s of 25 (+3/lvl, +9 a rank) and a 25% slow. */
    r: { cooldown: 1950, range: 9000, windup: 18, radius: 3500, duration: 120, every: 15, dmg: 25, dmgPerLevel: 3, slowBp: 2500, slow: 16 },
  },
  /** Wave C (C2): each rank above 1 adds these (Q/W/E rank up at levels 2, 5, 8; R at 7, 10). Half the old per-level damage moved into the ranks, so level-10 damage is unchanged. */
  ranks: { q: { dmg: 18 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { dmg: 9, cooldown: -100 } },
  talents: [
    [
      { id: 'extra-crispy', name: 'Extra Crispy', mods: { q: { width: 1100 } } },
      { id: 'burnt-edges', name: 'Burnt Edges', mods: { q: { slowBp: 2000, slow: 30 } } },
    ],
    [
      { id: 'showstopper', name: 'Showstopper', mods: { w: { stun: 30 } } },
      { id: 'long-hop', name: 'Long Hop', mods: { e: { dash: 4500 } } },
    ],
    [
      { id: 'encore-performance', name: 'Encore Performance', mods: { r: { duration: 180 } } },
      { id: 'wide-stage', name: 'Wide Stage', mods: { r: { radius: 4500 } } },
    ],
  ],
});
