/** Gabė, Support (shelter champion, sim v9): inspired by Gabė's Token Tails card (data/heroes/shelter.ts). */
import type { HeroData } from './types';

export const GABE: HeroData = Object.freeze<HeroData>({
  id: 'gabe',
  name: 'Gabė',
  side: 'cat',
  role: 'support',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 9800, takenBp: 10000 },
  element: 'WIND',
  base: { hp: 500, hpPerLevel: 52, attack: 52, attackPerLevel: 5, attackEvery: 28, range: 5000, speed: 5000, armour: 18, armourPerLevel: 2 },
  /** Heart Breeze: her basic hits on heroes heal the allied hero with the lowest HP share within 6 m (her too) 10 (+2/lvl). */
  passive: { heal: 10, healPerLevel: 2, range: 6000 },
  abilities: {
    /** Heart Balloon: lob to a point within 7 m; after 0.5 s a 2.2 m pop, enemies 55 (+10/lvl), allied heroes healed 25 (+5/lvl). */
    q: { cooldown: 210, range: 7000, radius: 2200, arm: 15, dmg: 55, dmgPerLevel: 10, heal: 25, healPerLevel: 5 },
    /** Wing Wrap: shield 70 (+14/lvl) for 3 s and +20% speed for 1.5 s on the allied hero nearest the aim, else herself. */
    w: { cooldown: 360, range: 6000, pickRadius: 2500, shield: 70, shieldPerLevel: 14, duration: 90, hasteBp: 2000, haste: 45 },
    /** Chase the Wind: dash 4 m; allied heroes within 1.5 m of her path get +25% speed for 2 s. */
    e: { cooldown: 420, dash: 4000, touch: 1500, hasteBp: 2500, haste: 60 },
    /** Under Her Spell: 0.5 s wind-up, cone 6 m, 90°; enemy heroes in it are charmed 1 s (walk to her at half speed). */
    r: { cooldown: 2100, windup: 15, range: 6000, arc: 1024, charm: 30, slowBp: 5000 },
  },
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
