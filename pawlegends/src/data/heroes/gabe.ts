/** Gabė, Support (shelter champion, sim v9): inspired by Gabė's Token Tails card (data/heroes/shelter.ts). */
import type { HeroData } from './types';

export const GABE: HeroData = Object.freeze<HeroData>({
  id: 'gabe',
  name: 'Gabė',
  side: 'cat',
  role: 'support',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. Sim v11: 9500 / takes 9700 (51.9%). Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 9050 / takes 9600 (49.7% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8075 / takes 9725 (48.4% of the 2,000-seed gate). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 10000. Sim v18 (chase fix, docs/plans/moba/V18-CHASE.md §3): 7700 / takes 10650. */
  pvp: { dmgBp: 7700, takenBp: 10650 },
  element: 'WIND',
  base: { hp: 500, hpPerLevel: 52, attack: 52, attackPerLevel: 5, attackEvery: 28, range: 5000, speed: 5000, armour: 18, armourPerLevel: 2 },
  /** Heart Breeze: her basic hits on heroes heal the allied hero with the lowest HP share within 6 m (her too) 8 (+1/lvl; sim v18, V18-CHASE.md §3: was 10 (+2/lvl), since chasing basics land more often). */
  passive: { heal: 8, healPerLevel: 1, range: 6000 },
  abilities: {
    /** Heart Balloon: lob to a point within 7 m; after 0.5 s a 2.2 m pop, enemies 55 (+5/lvl, +15 a rank), allied heroes healed 25 (+3/lvl, +6 a rank). */
    q: { cooldown: 210, range: 7000, radius: 2200, arm: 15, dmg: 55, dmgPerLevel: 5, heal: 25, healPerLevel: 3 },
    /** Wing Wrap: shield 70 (+14/lvl) for 3 s and +20% speed for 1.5 s on the allied hero nearest the aim, else herself. */
    w: { cooldown: 360, range: 6000, pickRadius: 2500, shield: 70, shieldPerLevel: 14, duration: 90, hasteBp: 2000, haste: 45 },
    /** Chase the Wind: dash 4 m; allied heroes within 1.5 m of her path get +25% speed for 2 s. */
    e: { cooldown: 420, dash: 4000, touch: 1500, hasteBp: 2500, haste: 60 },
    /** Under Her Spell: 0.67 s wind-up (sim v17, V17.md §3.4: was 0.5 s), cone 6 m, 90°; enemy heroes in it are charmed 1 s (walk to her at half speed). */
    r: { cooldown: 2100, windup: 20, range: 6000, arc: 1024, charm: 30, slowBp: 5000 },
  },
  /** Wave C (C2): each rank above 1 adds these (Q/W/E rank up at levels 2, 5, 8; R at 7, 10). Half the old per-level damage moved into the ranks, so level-10 damage is unchanged. */
  ranks: { q: { dmg: 15, heal: 6 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { cooldown: -100 } },
  talents: [
    [
      { id: 'big-balloon', name: 'Big Balloon', mods: { q: { radius: 2800 } } },
      { id: 'kind-breeze', name: 'Kind Breeze', mods: { passive: { heal: 15 } } },
    ],
    [
      { id: 'feather-fort', name: 'Feather Fort', mods: { w: { shield: 95 } } },
      { id: 'tailwind', name: 'Tailwind', mods: { e: { haste: 90 } } },
    ],
    [
      { id: 'long-glance', name: 'Long Glance', mods: { r: { range: 7500 } } },
      { id: 'smitten', name: 'Smitten', mods: { r: { charm: 38 } } },
    ],
  ],
});
