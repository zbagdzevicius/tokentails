/** Cacklejaw, Assassin (POC.md §6.6). */
import type { HeroData } from './types';

export const CACKLEJAW: HeroData = Object.freeze<HeroData>({
  id: 'cacklejaw',
  name: 'Cacklejaw',
  side: 'dog',
  role: 'assassin',
  /** Hero-vs-hero tuning on Normal and Hard (sim v8; SIDE_EDGE before): deals dmgBp, takes takenBp. Sim v11: takes 9350 (9250 before; 48.2%). Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 11250 / takes 8825 (48.1% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 10400 / takes 8825 (48.3% of the 2,000-seed gate). */
  pvp: { dmgBp: 10400, takenBp: 8825 },
  element: 'DARK',
  base: { hp: 520, hpPerLevel: 55, attack: 60, attackPerLevel: 6, attackEvery: 29, range: 1600, speed: 5200, armour: 20, armourPerLevel: 2 },
  /** Pack Flank: +20% damage from behind (angle over 120°) or when an allied hero is within 4 m of the target. */
  passive: { bonusBp: 12000, behindArc: 1365, allyRange: 4000 },
  abilities: {
    /** Jeer Slash: dash 4 m through a line, 75 (+6/lvl, +18 a rank); on a hero hit, recast once within 3 s. */
    q: { cooldown: 240, dash: 4000, width: 1000, dmg: 75, dmgPerLevel: 6, recasts: 1, recastWindow: 90 },
    /** Gloat: cone 3 m, 70°, fear 0.7 s. Sim v17 (V17.md §3.2): a 0.3 s wind-up (was instant), fear 24 → 21. */
    w: { cooldown: 390, windup: 9, range: 3000, arc: 796, fear: 21 },
    /** Bush Slink: stealth 3 s, +20% speed; in brush, while inside and 1.5 s after leaving; attacking breaks it. */
    e: { cooldown: 480, duration: 90, speedBp: 2000, brushLinger: 45 },
    /**
     * Pack Hunt: mark the lowest-HP enemy hero within 12 m and dash to it: 150 (+15/lvl, +68 a rank) + 10% missing HP.
     * Sim v17 (V17.md §3.6): a 0.3 s windup that marks the victim at its start (12 m now takes 0.9 s), 24 → 20 m/s; the
     * hunt fizzles (no cooldown) when the victim turns untargetable or is beyond range + `slip` at the windup's end.
     */
    r: { cooldown: 1800, windup: 9, range: 12000, slip: 2000, dmg: 150, dmgPerLevel: 15, missingHpBp: 1000, resetWindow: 90, resets: 1, speed: 20000 },
  },
  /** Wave C (C2): each rank above 1 adds these (Q/W/E rank up at levels 2, 5, 8; R at 7, 10). Half the old per-level damage moved into the ranks, so level-10 damage is unchanged. */
  ranks: { q: { dmg: 18 }, w: { cooldown: -15 }, e: { cooldown: -20 }, r: { dmg: 68, cooldown: -100 } },
  talents: [
    [
      { id: 'long-jeer', name: 'Long Jeer', mods: { q: { dash: 5500 } } },
      { id: 'cruel-jeer', name: 'Cruel Jeer', mods: { q: { slowBp: 3000, slow: 30 } } },
    ],
    [
      { id: 'smug', name: 'Smug', mods: { w: { cooldown: 270 } } },
      /**
       * Sim v10: 105° at the same 3 m (4 m and 90° before). Once bots took it by seed (GAPS B0), its 4 m fear opener
       * pushed foes out of reach and cut core kills before Sudden Death (balance gate 67.6%, 70% floor).
       */
      { id: 'wide-gloat', name: 'Wide Gloat', mods: { w: { arc: 1200 } } },
    ],
    [
      { id: 'feeding-frenzy', name: 'Feeding Frenzy', mods: { r: { resets: 2 } } },
      { id: 'ambush', name: 'Ambush', mods: { e: { ambushBp: 14000 } } },
    ],
  ],
});
