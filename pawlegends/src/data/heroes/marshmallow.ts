/** Marshmallow, Mage (sim v14, original dog): a Samoyed puppy who covers the ground in snow and freezes cats who stay. */
import type { HeroData } from './types';

export const MARSHMALLOW: HeroData = Object.freeze<HeroData>({
  id: 'marshmallow',
  name: 'Marshmallow',
  side: 'dog',
  role: 'mage',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 9000 / takes 9800 (50.3% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8475 / takes 9750 (48.9% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 9850. Sim v18 (chase fix, docs/plans/moba/V18-CHASE.md §3): 8475 / takes 9800. Sim v20 refit on four seed windows (V20-CHASE.md §9): 8560 / 9715 → 8630 / 9355. */
  pvp: { dmgBp: 8630, takenBp: 9355 },
  element: 'ICE',
  base: { hp: 470, hpPerLevel: 50, attack: 48, attackPerLevel: 5, attackEvery: 29, range: 5200, speed: 4800, armour: 16, armourPerLevel: 2 },
  /** Fresh Snow: while she stands in her own snow (W patch or R blizzard) she has +15% speed and her basics slow 15% for 1 s. */
  passive: { hasteBp: 1500, slowBp: 1500, slow: 30 },
  abilities: {
    /** Snowball: 8 m shot, stops at the first unit, 62 (+6/lvl, +16 a rank), slow 20% for 1 s. */
    q: { cooldown: 180, range: 8000, width: 1000, speed: 15000, dmg: 62, dmgPerLevel: 6, slowBp: 2000, slow: 30 },
    /** Snow Patch: within 7 m, after 0.3 s a 2.8 m patch of snow for 4 s; every 0.5 s 12 (+1/lvl, +4 a rank) and a 30% slow. */
    w: { cooldown: 330, range: 7000, windup: 9, radius: 2800, ttl: 120, every: 15, dmg: 12, dmgPerLevel: 1, slowBp: 3000, slow: 18 },
    /** Belly Slide: slide 4 m at 13 m/s, then +25% speed for 1.5 s and a 50 (+10/lvl) shield for 2 s. */
    e: { cooldown: 390, dash: 4000, speed: 13000, hasteBp: 2500, haste: 45, shield: 50, shieldPerLevel: 10, duration: 60 },
    /** SNOW DAY!: 0.6 s wind-up; a 4 m blizzard within 9 m for 4 s; every 0.67 s 20 (+2/lvl, +10 a rank) and a 25% slow. Enemy heroes still inside when it ends are Frozen: rooted 1 s. */
    r: { cooldown: 2000, windup: 18, range: 9000, radius: 4000, duration: 120, every: 20, dmg: 20, dmgPerLevel: 2, slowBp: 2500, slow: 21, freeze: 30 },
  },
  ranks: { q: { dmg: 16 }, w: { dmg: 4 }, e: { cooldown: -15 }, r: { dmg: 10, cooldown: -100 } },
  talents: [
    [
      { id: 'packed-snow', name: 'Packed Snow', mods: { q: { dmg: 85 } } },
      { id: 'fresh-powder', name: 'Fresh Powder', mods: { passive: { hasteBp: 2500 } } },
    ],
    [
      { id: 'big-patch', name: 'Big Patch', mods: { w: { radius: 3500 } } },
      { id: 'warm-belly', name: 'Warm Belly', mods: { e: { shield: 80 } } },
    ],
    [
      { id: 'snow-week', name: 'Snow Week', mods: { r: { duration: 165 } } },
      { id: 'deep-freeze', name: 'Deep Freeze', mods: { r: { freeze: 45 } } },
    ],
  ],
});
