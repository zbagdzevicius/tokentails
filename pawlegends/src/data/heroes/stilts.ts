/** Stilts, Assassin (sim v11, original cat): a lanky Savannah who builds Stride by running and pounces. */
import type { HeroData } from './types';

export const STILTS: HeroData = Object.freeze<HeroData>({
  id: 'stilts',
  name: 'Stilts',
  side: 'cat',
  role: 'assassin',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v11 balance pass: 10300 / 9000 (11800 / 9000 before: 57.1% of the 2,000-seed gate; now 49.9%). Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 10900 / takes 8500 (50.2% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 9975 / takes 8375 (49.5% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 8450. Sim v20 refit on four seed windows (V20-CHASE.md §9): 8965 / 9460 → 8755 / 9385. */
  pvp: { dmgBp: 8560, takenBp: 9385 },
  element: 'SAND',
  base: { hp: 500, hpPerLevel: 52, attack: 56, attackPerLevel: 6, attackEvery: 28, range: 1600, speed: 5300, armour: 18, armourPerLevel: 2 },
  /**
   * Long Stride: +10 Stride per metre walked (max 100); standing still 0.5 s drains 20. At 100 she pounces on her attack
   * target from up to 3 m: the basic deals +60% and slows 30% for 1 s, then Stride resets.
   */
  passive: { perMetre: 10, max: 100, drain: 20, drainEvery: 15, leap: 3000, bonusBp: 16000, slowBp: 3000, slow: 30 },
  abilities: {
    /** High Leap: leap up to 6 m (untargetable in the air); landing within 1.3 m of an enemy hero deals 80 (+7/lvl, +20 a rank) and fills Stride. */
    q: { cooldown: 300, dash: 6000, speed: 15000, touch: 1300, dmg: 80, dmgPerLevel: 7 },
    /** Ear Swivel: reveal enemy heroes within 8 m for 2 s; +30% attack speed for 3 s. */
    w: { cooldown: 420, radius: 8000, reveal: 60, attackSpeedBp: 3000, duration: 90 },
    /** Swat-Swat: two swats in a 2.8 m line 0.25 s apart, 45 (+4/lvl, +12 a rank) each; the second slows 30% 1 s and adds 30 Stride on a hero. */
    e: { cooldown: 210, range: 2800, width: 1100, gap: 8, dmg: 45, dmgPerLevel: 4, slowBp: 3000, slow: 30, stride: 30 },
    /** Zoomies: 5 s, +50% speed, Stride locked full, pounce reach 5 m; each pounce takes 1 s off High Leap. */
    r: { cooldown: 1800, duration: 150, hasteBp: 5000, leap: 5000, refund: 30 },
  },
  ranks: { q: { dmg: 20 }, w: { cooldown: -15 }, e: { dmg: 12 }, r: { cooldown: -100 } },
  talents: [
    [
      { id: 'pounce-power', name: 'Pounce Power', mods: { passive: { bonusBp: 18000 } } },
      { id: 'quick-stride', name: 'Quick Stride', mods: { passive: { perMetre: 14 } } },
    ],
    [
      { id: 'big-ears', name: 'Big Ears', mods: { w: { radius: 11000 } } },
      { id: 'twitchy', name: 'Twitchy', mods: { w: { attackSpeedBp: 4500 } } },
    ],
    [
      { id: 'extra-zoomies', name: 'Extra Zoomies', mods: { r: { duration: 195 } } },
      { id: 'sky-high', name: 'Sky High', mods: { r: { leap: 6500 } } },
    ],
  ],
});

/**
 * Engine numbers of Stilts's kit that are not player-facing tuning (src/sim/heroes/stilts.ts): Stride counts per
 * `metre` mm walked; a step longer than `stepBp` of her move speed for one tick is a teleport (Nap, a blink, a dash
 * landing), not walking; an auto-pounce lands `overshoot` mm inside her attack reach.
 */
export const STILTS_RULES = Object.freeze({ metre: 1000, stepBp: 15000, overshoot: 200 });
