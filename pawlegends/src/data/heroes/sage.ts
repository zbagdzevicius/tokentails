/** Sage, Marksman (POC.md §6.4). */
import type { HeroData } from './types';

export const SAGE: HeroData = Object.freeze<HeroData>({
  id: 'sage',
  name: 'Sage',
  side: 'cat',
  role: 'marksman',
  /** Hero-vs-hero tuning on Normal and Hard (sim v8; SIDE_EDGE before): deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 10000, takenBp: 10000 },
  element: 'WIND',
  base: { hp: 480, hpPerLevel: 50, attack: 52, attackPerLevel: 5, attackEvery: 27, range: 6000, speed: 4900, armour: 15, armourPerLevel: 2 },
  /** Steady Paw: every 4th basic pierces in a 7 m line, full damage to each target. */
  passive: { everyNth: 4, pierceRange: 7000, pierceSpeed: 20000, pierceWidth: 600 },
  abilities: {
    /** Volley: 5 arrows in a 50° cone, 7 m, 55 (+10/lvl) each; one target takes at most 3. */
    q: { cooldown: 210, arrows: 5, arc: 569, range: 7000, dmg: 55, dmgPerLevel: 10, maxPerTarget: 3, speed: 20000, width: 300 },
    /** Sun Snare: trap at up to 6 m; arms after 0.5 s; roots 1.0 s; lasts 30 s; max 2. */
    w: { cooldown: 420, range: 6000, arm: 15, root: 30, duration: 900, maxTraps: 2, radius: 1000 },
    /** Hop Back: dash 3 m away from the cursor or joystick direction. */
    e: { cooldown: 360, dash: 3000 },
    /** Moonshot: 1.0 s wind-up, 40 m line 1.2 m wide; 220 (+40/lvl) to the first hero, 50% to minions passed. */
    r: { cooldown: 2100, windup: 30, range: 40000, width: 1200, dmg: 220, dmgPerLevel: 40, minionBp: 5000, speed: 60000 },
  },
  talents: [
    [
      { id: 'wide-volley', name: 'Wide Volley', mods: { q: { arrows: 7 } } },
      { id: 'sticky-arrows', name: 'Sticky Arrows', mods: { q: { slowBp: 2000, slow: 30 } } },
    ],
    [
      { id: 'twin-snares', name: 'Twin Snares', mods: { w: { maxTraps: 3, root: 38 } } },
      { id: 'quick-hop', name: 'Quick Hop', mods: { e: { cooldown: 240 } } },
    ],
    [
      { id: 'full-moon', name: 'Full Moon', mods: { r: { cooldown: 1500 } } },
      { id: 'moon-mark', name: 'Moon Mark', mods: { r: { reveal: 120 } } },
    ],
  ],
});
