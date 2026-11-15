/** Nova, Mage (sim v31, original cat; docs/plans/moba/ROSTER-V31.md §2.1): a stargazer who drops stars on dogs from far away. */
import type { HeroData } from './types';

export const NOVA: HeroData = Object.freeze<HeroData>({
  id: 'nova',
  name: 'Nova',
  side: 'cat',
  role: 'mage',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v31 (ROSTER-V31.md §4): the first fit. */
  pvp: { dmgBp: 9200, takenBp: 8900 },
  element: 'STELLAR',
  base: { hp: 460, hpPerLevel: 48, attack: 50, attackPerLevel: 5, attackEvery: 30, range: 5500, speed: 4800, armour: 14, armourPerLevel: 2 },
  /** Starlight: her hits on an enemy hero 7 m or more from her deal +15%. */
  passive: { range: 7000, bonusBp: 11500 },
  abilities: {
    /** Starfall: a star on a point within 9.5 m; after 0.7 s a 1.7 m disc: 75 (+7/lvl, +18 a rank), slow 25% 1 s. */
    q: { cooldown: 210, range: 9500, arm: 21, radius: 1700, dmg: 75, dmgPerLevel: 7, slowBp: 2500, slow: 30 },
    /** Shooting Star: 11 m line shot, 0.9 m wide, flies through everything: 50 (+5/lvl, +12 a rank), minions 60%, reveals heroes 2 s. */
    w: { cooldown: 300, range: 11000, width: 900, speed: 16000, dmg: 50, dmgPerLevel: 5, minionBp: 6000, reveal: 60 },
    /** Moon Hop: hop 3.5 m; the moonbeam she leaves behind slows dogs within 1.8 m 40% for 1 s after 0.4 s. */
    e: { cooldown: 390, dash: 3500, radius: 1800, arm: 12, slowBp: 4000, slow: 30 },
    /** METEOR SHOWER: 0.4 s wind-up, a point within 14 m; 0.8 s later a 3.8 m disc takes 4 meteors 0.4 s apart: 45 (+5/lvl, +20 a rank) and a 30% slow each. */
    r: { cooldown: 2100, windup: 12, range: 14000, arm: 24, radius: 3800, every: 12, pulses: 4, dmg: 45, dmgPerLevel: 5, slowBp: 3000, slow: 15 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 12 }, e: { cooldown: -15 }, r: { dmg: 20, cooldown: -100 } },
  talents: [
    [
      { id: 'big-dipper', name: 'Big Dipper', mods: { q: { radius: 2100 } } },
      { id: 'far-sight', name: 'Far Sight', mods: { passive: { range: 6000 } } },
    ],
    [
      { id: 'tail-light', name: 'Tail Light', mods: { w: { reveal: 120 } } },
      { id: 'moon-boots', name: 'Moon Boots', mods: { e: { dash: 4500 } } },
    ],
    [
      { id: 'meteorite', name: 'Meteorite', mods: { r: { pulses: 5 } } },
      { id: 'starstruck', name: 'Starstruck', mods: { r: { slowBp: 4500 } } },
    ],
  ],
});
