/** Frankie, Assassin (sim v15, original dog): a dachshund in a hot-dog costume who digs, rolls and stretches 9 m long. */
import type { HeroData } from './types';

export const FRANKIE: HeroData = Object.freeze<HeroData>({
  id: 'frankie',
  name: 'Frankie',
  side: 'dog',
  role: 'assassin',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 9950 / takes 8825 (50.0% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3): takes 8900. Sim v18 (chase fix, docs/plans/moba/V18-CHASE.md §3): 9725 / takes 9175. Sim v20 refit on four seed windows (V20-CHASE.md §9): 9860 / 9040 → 9900 / 8735. */
  pvp: { dmgBp: 9900, takenBp: 8735 },
  element: 'FIRE',
  base: { hp: 510, hpPerLevel: 54, attack: 57, attackPerLevel: 6, attackEvery: 28, range: 1600, speed: 5150, armour: 18, armourPerLevel: 2 },
  /** Ketchup and Mustard: an ability hit and a basic on the same enemy hero within 3 s (either order) add a Combo: +45 (+9/lvl). Then 4 s before the next Combo. */
  passive: { window: 90, dmg: 45, dmgPerLevel: 9, lockout: 120 },
  abilities: {
    /** Weenie Roll: roll 4.5 m; minions passed take 50%; the first enemy hero stops him: 70 (+6/lvl, +18 a rank), knocked back 1.5 m. */
    q: { cooldown: 210, dash: 4500, speed: 15000, width: 1000, dmg: 70, dmgPerLevel: 6, minionBp: 5000, push: 1500 },
    /** Dig: burrow to a point within 6.5 m, untargetable; pop up: 60 (+6/lvl, +15 a rank) within 1.8 m, enemy heroes stunned 0.5 s. */
    w: { cooldown: 420, range: 6500, speed: 9000, radius: 1600, dmg: 60, dmgPerLevel: 6, stun: 15, minPop: 9 },
    /** Bun Hop: hop 3.5 m, shrug off slows, +20% speed for 1 s. */
    e: { cooldown: 390, dash: 3500, hasteBp: 2000, haste: 30 },
    /** FOOTLONG!: 0.4 s wind-up (sim v17, V17.md §3.8: 9 m reach needs ≥ 12 ticks; was 8); he stretches up to 9 m at 20 m/s, 1 m wide (spec: 30 m/s, 1.2 m; slowed so a cat can dodge it) (minions passed take 50%); the first enemy hero takes 150 (+15/lvl, +68 a rank), is stunned 0.75 s and he snaps to it. A miss refunds 40% of the cooldown. */
    r: { cooldown: 1950, windup: 12, range: 9000, width: 1000, speed: 20000, dmg: 150, dmgPerLevel: 15, minionBp: 5000, stun: 23, snapSpeed: 30000, missRefundBp: 4000 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 15 }, e: { cooldown: -15 }, r: { dmg: 68, cooldown: -100 } },
  talents: [
    [
      { id: 'extra-relish', name: 'Extra Relish', mods: { passive: { dmg: 65 } } },
      { id: 'buttered-bun', name: 'Buttered Bun', mods: { e: { hasteBp: 3500 } } },
    ],
    [
      { id: 'deep-dig', name: 'Deep Dig', mods: { w: { range: 8000 } } },
      { id: 'big-pop', name: 'Big Pop', mods: { w: { radius: 2400 } } },
    ],
    [
      { id: 'six-foot-sub', name: 'Six-Foot Sub', mods: { r: { range: 11000 } } },
      { id: 'mustard-everywhere', name: 'Extra Mustard', mods: { r: { stun: 30 } } },
    ],
  ],
});
