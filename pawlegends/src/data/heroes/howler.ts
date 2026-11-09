/** Howler, Fighter (sim v14, original dog): a loud husky whose screams slow, fear and finally blow cats away. */
import type { HeroData } from './types';

export const HOWLER: HeroData = Object.freeze<HeroData>({
  id: 'howler',
  name: 'Howler',
  side: 'dog',
  role: 'fighter',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 9100 / takes 9650 (51.3% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8350 / takes 9575 (51.9% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 9750. Sim v18 (chase fix, docs/plans/moba/V18-CHASE.md §3): 8275 / takes 9750. */
  pvp: { dmgBp: 8275, takenBp: 9750 },
  element: 'WIND',
  base: { hp: 640, hpPerLevel: 66, attack: 58, attackPerLevel: 6, attackEvery: 30, range: 1700, speed: 5000, armour: 30, armourPerLevel: 3 },
  /** Zoomie Brain: after any ability, his next basic within 3 s deals +35% and slows 25% for 1 s. */
  passive: { window: 90, bonusBp: 13500, slowBp: 2500, slow: 30 },
  abilities: {
    /** AWOO: cone 4 m, 75°, 70 (+6/lvl, +18 a rank), slow 25% for 1 s. */
    q: { cooldown: 210, range: 4000, arc: 853, dmg: 70, dmgPerLevel: 6, slowBp: 2500, slow: 30 },
    /** Derp Dash: dash 4.5 m through enemies, 50 (+5/lvl, +12 a rank) each; then +20% speed for 1 s. */
    w: { cooldown: 330, dash: 4500, width: 1100, dmg: 50, dmgPerLevel: 5, hasteBp: 2000, haste: 30, slowBp: 0, slow: 0 },
    /** Talk Back: 1 s of arguing: 40% less damage; each enemy hero within 4.5 m that hits him in it is feared 0.6 s (once each). Sim v17 (V17.md §3.10): the 4.5 m limit (`fearRange`) is new. */
    e: { cooldown: 420, duration: 30, reduceBp: 4000, fear: 18, fearRange: 4500 },
    /** THE SCREAM: 0.7 s inhale, then a cone 6 m, 75°: 150 (+15/lvl, +65 a rank), knocked back 2 m and feared 0.75 s. */
    r: { cooldown: 2100, windup: 21, range: 6000, arc: 853, dmg: 150, dmgPerLevel: 15, push: 2000, fear: 23 },
  },
  ranks: { q: { dmg: 18 }, w: { dmg: 12 }, e: { cooldown: -15 }, r: { dmg: 65, cooldown: -100 } },
  talents: [
    [
      { id: 'louder', name: 'Louder', mods: { q: { range: 5000 } } },
      { id: 'no-thoughts', name: 'No Thoughts', mods: { passive: { bonusBp: 15500 } } },
    ],
    [
      { id: 'sled-dog', name: 'Sled Dog', mods: { w: { dash: 6000 } } },
      { id: 'last-word', name: 'Last Word', mods: { e: { fear: 30 } } },
    ],
    [
      { id: 'echo', name: 'Echo', mods: { q: { cooldown: 180 } } },
      { id: 'snow-spray', name: 'Snow Spray', mods: { w: { slowBp: 2500, slow: 30 } } },
    ],
  ],
});
