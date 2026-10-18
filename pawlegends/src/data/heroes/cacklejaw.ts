/** Cacklejaw, Assassin (POC.md §6.6). */
import type { HeroData } from './types';

export const CACKLEJAW: HeroData = Object.freeze<HeroData>({
  id: 'cacklejaw',
  name: 'Cacklejaw',
  side: 'dog',
  role: 'assassin',
  /** Hero-vs-hero tuning on Normal and Hard (sim v8; SIDE_EDGE before): deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 11100, takenBp: 9250 },
  element: 'DARK',
  base: { hp: 520, hpPerLevel: 55, attack: 60, attackPerLevel: 6, attackEvery: 29, range: 1600, speed: 5200, armour: 20, armourPerLevel: 2 },
  /** Pack Flank: +20% damage from behind (angle over 120°) or when an allied hero is within 4 m of the target. */
  passive: { bonusBp: 12000, behindArc: 1365, allyRange: 4000 },
  abilities: {
    /** Jeer Slash: dash 4 m through a line, 75 (+12/lvl); on a hero hit, recast once within 3 s. */
    q: { cooldown: 240, dash: 4000, width: 1000, dmg: 75, dmgPerLevel: 12, recasts: 1, recastWindow: 90 },
    /** Gloat: cone 3 m, 70°, fear 0.8 s. */
    w: { cooldown: 390, range: 3000, arc: 796, fear: 24 },
    /** Bush Slink: stealth 3 s, +20% speed; in brush, while inside and 1.5 s after leaving; attacking breaks it. */
    e: { cooldown: 480, duration: 90, speedBp: 2000, brushLinger: 45 },
    /** Pack Hunt: mark the lowest-HP enemy hero within 12 m and dash to it: 150 (+30/lvl) + 10% missing HP. */
    r: { cooldown: 1800, range: 12000, dmg: 150, dmgPerLevel: 30, missingHpBp: 1000, resetWindow: 90, resets: 1, speed: 24000 },
  },
  talents: [
    [
      { id: 'long-jeer', name: 'Long Jeer', mods: { q: { dash: 5500 } } },
      { id: 'cruel-jeer', name: 'Cruel Jeer', mods: { q: { slowBp: 3000, slow: 30 } } },
    ],
    [
      { id: 'smug', name: 'Smug', mods: { w: { cooldown: 270 } } },
      { id: 'wide-gloat', name: 'Wide Gloat', mods: { w: { range: 4000, arc: 1024 } } },
    ],
    [
      { id: 'feeding-frenzy', name: 'Feeding Frenzy', mods: { r: { resets: 2 } } },
      { id: 'ambush', name: 'Ambush', mods: { e: { ambushBp: 14000 } } },
    ],
  ],
});
