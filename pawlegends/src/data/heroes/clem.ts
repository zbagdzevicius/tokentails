/** Clem, Fighter (POC.md §6.3). */
import type { HeroData } from './types';

export const CLEM: HeroData = Object.freeze<HeroData>({
  id: 'clem',
  name: 'Clem',
  side: 'cat',
  role: 'fighter',
  /** Hero-vs-hero tuning on Normal and Hard (sim v8; SIDE_EDGE before): deals dmgBp, takes takenBp. Sim v10 (GAPS B5): dmgBp 9300 to 9200; (GAPS B6) 9100, Clem was 54.4% of the 2,000-seed gate once the branches shipped; 8800 once the Guard Post dome stopped disarming enemies inside it (54.2%). */
  pvp: { dmgBp: 8800, takenBp: 10200 },
  element: 'FAIRY',
  base: { hp: 620, hpPerLevel: 60, attack: 58, attackPerLevel: 5, attackEvery: 30, range: 1600, speed: 5000, armour: 25, armourPerLevel: 2 },
  /** Valor: +10 per hit on a hero (minions +4), max 100; at 100 the next ability deals +50%. */
  passive: { valorPerHeroHit: 10, valorPerMinionHit: 4, valorMax: 100, valorBonusBp: 15000 },
  abilities: {
    /** Paw Combo: cone 2.4 m, 90°, 70 (+6/lvl, +18 a rank); recast twice within 3 s; 3rd hit knocks back 1.5 m. 6 s after the last cast. */
    q: { cooldown: 180, range: 2400, arc: 1024, dmg: 70, dmgPerLevel: 6, recasts: 2, recastWindow: 90, knockback: 1500 },
    /** The Stand: 0.75 s block, 80% less frontal damage (`arc`: the front half); a projectile in the first 0.3 s is reflected. */
    w: { cooldown: 360, duration: 23, reduceBp: 8000, parryWindow: 9, arc: 2048 },
    /** Tumble: dash 4 m, untargetable 0.2 s. */
    e: { cooldown: 330, dash: 4000, untargetable: 6 },
    /** Golden Hour: 6 s, +40% attack speed; every 3rd basic sends a 5 m line wave, 80 (+8/lvl, +32 a rank). Wave speed/width: tuning. */
    r: { cooldown: 1800, duration: 180, attackSpeedBp: 4000, everyNth: 3, waveRange: 5000, waveDmg: 80, waveDmgPerLevel: 8, waveSpeed: 25000, waveWidth: 1200 },
  },
  /** Wave C (C2): each rank above 1 adds these (Q/W/E rank up at levels 2, 5, 8; R at 7, 10). Half the old per-level damage moved into the ranks, so level-10 damage is unchanged. */
  ranks: { q: { dmg: 18 }, w: { cooldown: -15 }, e: { cooldown: -15 }, r: { waveDmg: 32, cooldown: -100 } },
  talents: [
    [
      { id: 'pounce-finish', name: 'Pounce Finish', mods: { q: { stun: 15 } } },
      { id: 'long-swipe', name: 'Long Swipe', mods: { q: { range: 3000 } } },
    ],
    [
      { id: 'second-wind', name: 'Second Wind' },
      { id: 'steady-stand', name: 'Steady Stand', mods: { w: { duration: 38 } } },
    ],
    [
      { id: 'golden-afternoon', name: 'Golden Afternoon', mods: { r: { duration: 240 } } },
      { id: 'sunlit-mend', name: 'Sunlit Mend', mods: { r: { lifestealBp: 1500 } } },
    ],
  ],
});
