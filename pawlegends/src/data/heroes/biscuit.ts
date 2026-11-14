/** Biscuit, Support (sim v29, original dog; docs/plans/moba/ROSTER-V29.md §2.3): a golden retriever who fetches cats on a leash. */
import type { HeroData } from './types';

export const BISCUIT: HeroData = Object.freeze<HeroData>({
  id: 'biscuit',
  name: 'Biscuit',
  side: 'dog',
  role: 'support',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v29 (ROSTER-V29.md §4): the first fit. */
  pvp: { dmgBp: 9450, takenBp: 8100 },
  element: 'SAND',
  base: { hp: 660, hpPerLevel: 68, attack: 54, attackPerLevel: 5, attackEvery: 30, range: 1700, speed: 5000, armour: 30, armourPerLevel: 3 },
  /** Good Boy: every 9 s his next basic on an enemy hero stuns it 0.4 s and gives him and the nearest allied hero within 6 m a 35 (+7/lvl) shield for 2 s. */
  passive: { every: 270, stun: 12, shield: 35, shieldPerLevel: 7, range: 6000, duration: 60 },
  abilities: {
    /** Fetch!: 0.4 s wind-up (the v17 reaction rule: a 9 m reach needs 12 ticks); a ball on a leash flies 9 m and stops at the first unit: 65 (+6/lvl, +16 a rank). An enemy hero it hits is stunned 0.4 s and pulled to 1.6 m in front of him. */
    q: { cooldown: 480, windup: 12, range: 9000, width: 900, speed: 15000, dmg: 65, dmgPerLevel: 6, stun: 12, gap: 1600, pullSpeed: 25000 },
    /** Tail Wag: enemies within 2.6 m take 55 (+5/lvl, +14 a rank) and are knocked back 1.5 m. */
    w: { cooldown: 300, radius: 2600, dmg: 55, dmgPerLevel: 5, push: 1500 },
    /** Stubborn: he shakes off every crowd control, is immune to it for 1 s and takes 25% less damage for 1 s. */
    e: { cooldown: 600, duration: 30, reduceBp: 2500 },
    /** WALKIES!: 0.4 s wind-up; enemy heroes within 5 m are pulled up to 2.5 m toward him (never closer than 1.5 m), take 110 (+11/lvl, +50 a rank) and are slowed 35% for 1.5 s; he gains a 100 (+15/lvl) shield for 3 s. */
    r: { cooldown: 2100, windup: 12, radius: 5000, pull: 2500, gap: 1500, dmg: 110, dmgPerLevel: 11, slowBp: 3500, slow: 45, shield: 100, shieldPerLevel: 15, duration: 90 },
  },
  ranks: { q: { dmg: 16 }, w: { dmg: 14 }, e: { cooldown: -30 }, r: { dmg: 50, cooldown: -100 } },
  talents: [
    [
      { id: 'long-leash', name: 'Long Leash', mods: { q: { range: 10500 } } },
      { id: 'big-wag', name: 'Big Wag', mods: { w: { push: 2500 } } },
    ],
    [
      { id: 'tough-pup', name: 'Tough Pup', mods: { e: { duration: 45 } } },
      { id: 'best-boy', name: 'Best Boy', mods: { passive: { shield: 55 } } },
    ],
    [
      { id: 'extendable-leash', name: 'Extendable Leash', mods: { r: { radius: 6000 } } },
      { id: 'long-walk', name: 'Long Walk', mods: { r: { slow: 75 } } },
    ],
  ],
});
