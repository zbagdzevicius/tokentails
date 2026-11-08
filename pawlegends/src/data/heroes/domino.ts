/** Domino, Mage (sim v15, original dog): a dalmatian who sticks his spots on cats and then connects the dots. */
import type { HeroData } from './types';

export const DOMINO: HeroData = Object.freeze<HeroData>({
  id: 'domino',
  name: 'Domino',
  side: 'dog',
  role: 'mage',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8825 / takes 9775 (51.2% of the 2,000-seed gate). Sim v16: 9050 (the Brutus nerf alone dropped him to about 45%). */
  pvp: { dmgBp: 9050, takenBp: 9775 },
  element: 'STELLAR',
  base: { hp: 470, hpPerLevel: 49, attack: 50, attackPerLevel: 5, attackEvery: 30, range: 5300, speed: 4850, armour: 15, armourPerLevel: 2 },
  /** Spot On: each of his ability hits on an enemy hero sticks a Spot (max 3, 6 s, refreshed). He deals +6% to a hero per Spot on it. */
  passive: { max: 3, ttl: 180, perDotBp: 600 },
  abilities: {
    /** Spot Shot: 8 m shot, stops at the first unit, 65 (+6/lvl, +16 a rank). Sim v17 (V17.md §3.8): slower shot, 17000 → 13000 mm/s, so it can be dodged on reaction. */
    q: { cooldown: 180, range: 8000, width: 900, speed: 13000, dmg: 65, dmgPerLevel: 6 },
    /** Splatter: within 7.5 m, after 0.4 s a 2.4 m splash: 60 (+6/lvl, +15 a rank), slow 25% for 1 s. */
    w: { cooldown: 330, range: 7500, windup: 12, radius: 2400, dmg: 60, dmgPerLevel: 6, slowBp: 2500, slow: 30 },
    /** Big Shake: a full-body shake: enemies within 2.6 m take 40 (+4/lvl) and are knocked back 2.5 m (sim v17, V17.md §3.12: was 2 m, so a melee at 1.5 m ends 4 m away); he shakes off slows. */
    e: { cooldown: 420, radius: 2600, push: 2500, dmg: 40, dmgPerLevel: 4 },
    /** CONNECT THE DOTS!: 0.6 s; links every Spotted enemy hero within 9.5 m (sim v17, V17.md §3.4: was 0.5 s and 11 m), nearest first, with starry lines. Each Spotted hero takes 100 (+10/lvl, +45 a rank) + 35 a Spot and is rooted 0.5 s + 0.17 s a Spot (rootPerDot 8 in the spec, cut to 5 on the balance gate; Tight Knot 12 → 8); other enemy heroes on a line take 50% and are slowed 30% 1.5 s. Spots are used up. */
    r: { cooldown: 2000, windup: 18, range: 9500, width: 1000, dmg: 100, dmgPerLevel: 10, perDot: 35, lineBp: 5000, slowBp: 3000, slow: 45, root: 15, rootPerDot: 5 },
  },
  ranks: { q: { dmg: 16 }, w: { dmg: 15 }, e: { cooldown: -15 }, r: { dmg: 45, cooldown: -100 } },
  talents: [
    [
      { id: 'big-spots', name: 'Big Spots', mods: { q: { width: 1200 } } },
      { id: 'polka-dots', name: 'Polka Dots', mods: { passive: { max: 4 } } },
    ],
    [
      { id: 'splash-zone', name: 'Splash Zone', mods: { w: { radius: 3000 } } },
      { id: 'good-shake', name: 'Good Shake', mods: { e: { push: 2800 } } },
    ],
    [
      { id: 'dot-to-dot-pro', name: 'Dot-to-Dot Pro', mods: { r: { range: 13000 } } },
      { id: 'tight-knot', name: 'Tight Knot', mods: { r: { rootPerDot: 8 } } },
    ],
  ],
});
