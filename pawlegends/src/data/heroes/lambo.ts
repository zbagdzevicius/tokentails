/** Lambo, Tank (shelter champion, sim v9): inspired by Lambo's Token Tails card (data/heroes/shelter.ts). */
import type { HeroData } from './types';

export const LAMBO: HeroData = Object.freeze<HeroData>({
  id: 'lambo',
  name: 'Lambo',
  side: 'cat',
  role: 'tank',
  /** Hero-vs-hero tuning on Normal and Hard: deals dmgBp, takes takenBp. */
  pvp: { dmgBp: 10500, takenBp: 9100 },
  element: 'STELLAR',
  base: { hp: 740, hpPerLevel: 78, attack: 56, attackPerLevel: 5, attackEvery: 30, range: 1600, speed: 4700, armour: 38, armourPerLevel: 3 },
  /** Brave With Friends: takes 10% less damage while an allied hero is within 4 m. */
  passive: { reduceBp: 1000, allyRange: 4000 },
  abilities: {
    /** Tuna Toss: skillshot 6 m that stops at the first unit, 60 (+10/lvl), slow 25% for 1.5 s. */
    q: { cooldown: 240, range: 6000, width: 900, speed: 16000, dmg: 60, dmgPerLevel: 10, slowBp: 2500, slow: 45 },
    /** Big Hug: shield 7% of his max HP on himself and 4.5% on the nearest allied hero within 4 m, for 2.5 s. */
    w: { cooldown: 420, range: 4000, selfBp: 700, allyBp: 450, duration: 75 },
    /** Belly Flop: hop up to 5 m; on landing a 2.2 m ring, 50 (+8/lvl), stun 0.5 s. */
    e: { cooldown: 420, dash: 5000, radius: 2200, dmg: 50, dmgPerLevel: 8, stun: 15 },
    /** Tangled Lights: 0.5 s wind-up; enemy heroes within 4.5 m pulled up to 2 m toward him, 100 (+20/lvl), root 1 s. */
    r: { cooldown: 2100, windup: 15, radius: 4500, pull: 2000, root: 30, dmg: 100, dmgPerLevel: 20 },
  },
  talents: [
    [
      { id: 'long-toss', name: 'Long Toss', mods: { q: { range: 7500 } } },
      { id: 'extra-crispy-tuna', name: 'Extra Crispy', mods: { q: { slowBp: 4000 } } },
    ],
    [
      { id: 'bigger-hug', name: 'Bigger Hug', mods: { w: { allyBp: 700 } } },
      { id: 'flop-further', name: 'Flop Further', mods: { e: { dash: 6500 } } },
    ],
    [
      { id: 'fairy-light-finale', name: 'Fairy-Light Finale', mods: { r: { root: 45 } } },
      { id: 'wide-tangle', name: 'Wide Tangle', mods: { r: { radius: 5500 } } },
    ],
  ],
});
