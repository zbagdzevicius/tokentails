/** Sir Brutus, Tank (POC.md §6.5). */
import type { HeroData } from './types';

export const BRUTUS: HeroData = Object.freeze<HeroData>({
  id: 'brutus',
  name: 'Sir Brutus',
  side: 'dog',
  role: 'tank',
  /** Hero-vs-hero tuning on Normal and Hard (sim v8; SIDE_EDGE before): deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 11100, takenBp: 9250 },
  element: 'SAND',
  base: { hp: 760, hpPerLevel: 80, attack: 46, attackPerLevel: 4, attackEvery: 36, range: 1600, speed: 4800, armour: 40, armourPerLevel: 3 },
  /** Honour: damage from heroes builds a shield up to 12% max HP over 4 s; decays after 3 s out of combat. */
  passive: { shieldCapBp: 1200, buildWindow: 120, decayAfter: 90 },
  abilities: {
    /** Shield Slam: ring 3 m, 60 (+10/lvl), slow 30% for 1.5 s. */
    q: { cooldown: 210, radius: 3000, dmg: 60, dmgPerLevel: 10, slowBp: 3000, slow: 45 },
    /** Front Guard: 2.5 s frontal shield (120°) blocking projectiles for Brutus and allies behind him; `radius`: shield reach (tuning). */
    w: { cooldown: 420, duration: 75, arc: 1365, radius: 1800 },
    /** Pug Charge: dash 5 m; first hero hit knocked back 2 m and stunned 0.5 s. */
    e: { cooldown: 360, dash: 5000, knockback: 2000, stun: 15 },
    /** Champion's Challenge: tether a hero within 5 m; 6 m ring for 3 s; Brutus takes 30% less from that hero. */
    r: { cooldown: 2250, range: 5000, ringRadius: 6000, duration: 90, reduceBp: 3000 },
  },
  talents: [
    [
      { id: 'heavy-slam', name: 'Heavy Slam', mods: { q: { slowBp: 4500 } } },
      { id: 'wide-slam', name: 'Wide Slam', mods: { q: { radius: 3800 } } },
    ],
    [
      { id: 'bulwark', name: 'Bulwark', mods: { w: { duration: 105 } } },
      { id: 'long-charge', name: 'Long Charge', mods: { e: { dash: 6500 } } },
    ],
    [
      { id: 'arena-of-honour', name: 'Arena of Honour', mods: { r: { duration: 120 } } },
      { id: 'rally-howl', name: 'Rally Howl', mods: { r: { allySpeedBp: 2000 } } },
    ],
  ],
});
