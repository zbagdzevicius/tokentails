/** Ziggy, Fighter (sim v29, original cat; docs/plans/moba/ROSTER-V29.md §2.2): a lightning-striped Bengal who zig-zags through fights. */
import type { HeroData } from './types';

export const ZIGGY: HeroData = Object.freeze<HeroData>({
  id: 'ziggy',
  name: 'Ziggy',
  side: 'cat',
  role: 'fighter',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v29 (ROSTER-V29.md §4): the first fit. */
  // sim v33 (V33-KILLS.md, bigger kill rewards moved the 3v3 rows): 7300 / 9900
  // sim v36 (V36-BALANCE.md, the v35 hero pass on 8,000 pool-rotation matches): 7385 / 9790
  pvp: { dmgBp: 7485, takenBp: 9690 },
  element: 'ELECTRIC',
  base: { hp: 600, hpPerLevel: 60, attack: 58, attackPerLevel: 6, attackEvery: 28, range: 1600, speed: 5100, armour: 24, armourPerLevel: 2 },
  /** Static Step: after a Zig or a Tail Flick his next basic within 2.5 s deals +30 (+5/lvl). */
  passive: { window: 75, dmg: 30, dmgPerLevel: 5 },
  abilities: {
    /** Zig: dash 3 m; enemies he passes take 55 (+5/lvl, +14 a rank). Recast twice within 3 s; 9 s after the last cast. */
    q: { cooldown: 270, dash: 3000, speed: 14000, width: 1200, dmg: 55, dmgPerLevel: 5, recasts: 2, recastWindow: 90 },
    /** Spark Swipe: 0.3 s wind-up (the v17 reaction rule for a stun), enemies within 2.4 m take 60 (+6/lvl, +15 a rank); enemy heroes are stunned 0.4 s. */
    w: { cooldown: 360, windup: 9, radius: 2400, dmg: 60, dmgPerLevel: 6, stun: 12 },
    /** Tail Flick: hop 2.5 m and a 55 (+11/lvl) shield for 1.5 s. */
    e: { cooldown: 390, dash: 2500, shield: 55, shieldPerLevel: 11, duration: 45 },
    /** ZIGZAG STORM: on an enemy hero within 6 m, 0.27 s wind-up; untargetable, he strikes 4 times, 0.2 s apart, each time beside the nearest enemy hero within 6 m he has not struck yet: 85 (+8/lvl, +38 a rank); a hero struck again takes half. */
    r: { cooldown: 1800, windup: 8, reach: 6000, range: 6000, strikes: 4, gap: 6, dmg: 85, dmgPerLevel: 8, repeatBp: 5000 },
  },
  ranks: { q: { dmg: 14 }, w: { dmg: 15 }, e: { cooldown: -15 }, r: { dmg: 38, cooldown: -100 } },
  talents: [
    [
      { id: 'long-zig', name: 'Long Zig', mods: { q: { dash: 3800 } } },
      { id: 'live-wire', name: 'Live Wire', mods: { passive: { dmg: 45 } } },
    ],
    [
      { id: 'thunder-paw', name: 'Thunder Paw', mods: { w: { stun: 18 } } },
      { id: 'rubber-tail', name: 'Rubber Tail', mods: { e: { shield: 85 } } },
    ],
    [
      { id: 'storm-front', name: 'Storm Front', mods: { r: { strikes: 5 } } },
      { id: 'eye-of-the-storm', name: 'Eye of the Storm', mods: { r: { range: 7500 } } },
    ],
  ],
});
