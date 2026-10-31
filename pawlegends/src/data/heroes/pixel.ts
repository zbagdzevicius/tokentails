/** Pixel, Marksman (sim v11, original cat): a planted turret kitten in a cardboard robot box. */
import type { HeroData } from './types';

export const PIXEL: HeroData = Object.freeze<HeroData>({
  id: 'pixel',
  name: 'Pixel',
  side: 'cat',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v11 balance pass: 9400 / 9600 (10600 / 9600 before: 55.4% of the 2,000-seed gate; now 49.8%). */
  pvp: { dmgBp: 9400, takenBp: 9600 },
  element: 'ICE',
  base: { hp: 460, hpPerLevel: 48, attack: 50, attackPerLevel: 5, attackEvery: 27, range: 5800, speed: 4700, armour: 16, armourPerLevel: 2 },
  /** Cardboard Plating: an 8%-max-HP plate that refills after 4 s without hero damage; when it breaks she pops out, +25% speed for 1.5 s. */
  passive: { plateBp: 800, refill: 120, hasteBp: 2500, haste: 45 },
  abilities: {
    /** Cap Cannon: 8.5 m shot, stops at the first hero, 75 (+7/lvl, +18 a rank), minions 50%, reveals the hero 2 s. */
    q: { cooldown: 240, range: 8500, width: 900, speed: 18000, dmg: 75, dmgPerLevel: 7, minionBp: 5000, reveal: 60 },
    /** Laser Pointer: 1.5 s channelled 9 m beam that turns with her; every 8 ticks 18 (+2/lvl, +6 a rank) to all enemies on it, slow grows 10% a pulse to 40%; she is slowed 60%. */
    w: { cooldown: 360, range: 9000, width: 600, duration: 45, every: 8, dmg: 18, dmgPerLevel: 2, slowStepBp: 1000, slowMaxBp: 4000, selfSlowBp: 6000, turn: 16 },
    /** Duck and Cover: 1 s in the box, rooted, 75% less damage, plate refilled; melee attackers slowed 30% for 1 s. */
    e: { cooldown: 480, duration: 30, reduceBp: 7500, slowBp: 3000, slow: 30, meleeRange: 2000 },
    /** BOXBOT MK II: 7 s, shield 220 (+20/lvl, +60 a rank), +15% speed, CC-immune 0.5 s, basics splash 1.6 m for 70%, cooldowns 30% faster. */
    r: { cooldown: 1950, duration: 210, shield: 220, shieldPerLevel: 20, hasteBp: 1500, immune: 15, splash: 1600, splashBp: 7000, cdrBp: 3000 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 6 }, e: { cooldown: -15 }, r: { shield: 60, cooldown: -100 } },
  talents: [
    [
      { id: 'long-shot', name: 'Long Shot', mods: { q: { range: 10000 } } },
      { id: 'spotlight', name: 'Spotlight', mods: { q: { reveal: 120 } } },
    ],
    [
      { id: 'overclock', name: 'Overclock', mods: { w: { duration: 60 } } },
      { id: 'hot-dot', name: 'Hot Dot', mods: { w: { slowMaxBp: 5500 } } },
    ],
    [
      { id: 'double-tape', name: 'Double Tape', mods: { r: { shield: 320 } } },
      { id: 'big-boom', name: 'Big Boom', mods: { r: { splash: 2200 } } },
    ],
  ],
});
