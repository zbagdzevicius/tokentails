/** Sir Brutus, Tank (POC.md §6.5). */
import type { HeroData } from './types';

export const BRUTUS: HeroData = Object.freeze<HeroData>({
  id: 'brutus',
  name: 'Sir Brutus',
  side: 'dog',
  role: 'tank',
  /** Hero-vs-hero tuning on Normal and Hard (sim v8; SIDE_EDGE before): deals dmgBp, takes takenBp. Sim v11: takes 9350 (9250 before; 49.7%). Sim v14 (seven dogs, docs/plans/moba/DOGS-V13.md): 9750 / takes 9575 (48.9% of the 2,000-seed gate). Sim v15 (ten dogs, docs/plans/moba/DOGS-V15.md): 8625 / takes 9725 (49.6% of the 2,000-seed gate). Sim v16 (MAP-GAPS B3 keeps a Move order after a dash, so chargers gained): takes 9875 (56.1% before; about 3 pp per +75 takenBp). Sim v17 (counter-play batch, docs/plans/moba/V17.md §5.3, per-window refit §6.5): takes 9575. Sim v18 (chase fix, docs/plans/moba/V18-CHASE.md §3): 8375 / takes 9925. Sim v20 refit on four seed windows (V20-CHASE.md §9): 8335 / 9965 → 8230 / 9765. */
  // sim v21 (stronger towers, cannon): takenBp −75 on the v20 row (9765 → 9690)
  pvp: { dmgBp: 8045, takenBp: 9650 },
  element: 'SAND',
  base: { hp: 760, hpPerLevel: 80, attack: 46, attackPerLevel: 4, attackEvery: 36, range: 1600, speed: 4800, armour: 40, armourPerLevel: 3 },
  /** Honour: damage from heroes builds a shield up to 12% max HP over 4 s; decays after 3 s out of combat. */
  passive: { shieldCapBp: 1200, buildWindow: 120, decayAfter: 90 },
  abilities: {
    /** Shield Slam: ring 3 m, 60 (+5/lvl, +15 a rank), slow 30% for 1.5 s. */
    q: { cooldown: 210, radius: 3000, dmg: 60, dmgPerLevel: 5, slowBp: 3000, slow: 45 },
    /** Front Guard: 2.5 s frontal shield (120°) blocking projectiles for Brutus and allies behind him; `radius`: shield reach (tuning). */
    w: { cooldown: 420, duration: 75, arc: 1365, radius: 1800 },
    /** Pug Charge: dash 5 m; first hero hit knocked back 2 m and stunned 0.5 s. Sim v17 (V17.md §3.2): a 0.3 s wind-up and 14 m/s (was instant at 20 m/s). */
    e: { cooldown: 360, windup: 9, dash: 5000, speed: 14000, knockback: 2000, stun: 15 },
    /** Champion's Challenge: tether a hero within 5 m; 6 m ring for 2.5 s (sim v17, V17.md §3.5: was 3 s; the foe's Pounce or any cleanse breaks it); Brutus takes 30% less from that hero. */
    r: { cooldown: 2250, range: 5000, ringRadius: 6000, duration: 75, reduceBp: 3000 },
  },
  /** Wave C (C2): each rank above 1 adds these (Q/W/E rank up at levels 2, 5, 8; R at 7, 10). Half the old per-level damage moved into the ranks, so level-10 damage is unchanged. */
  ranks: { q: { dmg: 15 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { cooldown: -100 } },
  talents: [
    [
      { id: 'heavy-slam', name: 'Heavy Slam', mods: { q: { slowBp: 4500 } } },
      { id: 'wide-slam', name: 'Wide Slam', mods: { q: { radius: 3800 } } },
    ],
    [
      { id: 'bulwark', name: 'Bulwark', mods: { w: { duration: 105 } } },
      /**
       * Sim v10 (GAPS B6), the level-6 shape branch (it replaced Long Charge, `e.dash` 6500): Front Guard becomes a
       * planted 3 m dome for 60 ticks that blocks enemy projectiles for everyone inside; Sir Brutus cannot walk or dash
       * while it stands (`post` switches the shape).
       */
      // Sim v17 (V17.md §5.3): postReduceBp 2500 → 3000 (the branch sat at 44–46% after the v17 batch); cooldown 300 → 210
      // (§6.5: still 42–47% in each 2,000-seed window; a 35% cut or a 1.5 s plant did not lift it, more plants did).
      { id: 'guard-post', name: 'Guard Post', mods: { w: { post: 1, postRadius: 3000, postDuration: 60, postReduceBp: 3000, cooldown: 210 } } },
    ],
    [
      { id: 'arena-of-honour', name: 'Arena of Honour', mods: { r: { duration: 105 } } },
      { id: 'rally-howl', name: 'Rally Howl', mods: { r: { allySpeedBp: 2000 } } },
    ],
  ],
});
