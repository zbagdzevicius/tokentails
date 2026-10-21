// @vitest-environment happy-dom
/**
 * Wave C (sim v10): C1 level growth (attack speed and move speed per level, per role, integer, floored) and C2
 * automatic ability ranks (per-ability rank deltas merged before the talents, the same for bots), plus the client
 * reads: rank pips, the upgrade toast, tooltips and talent cards with the current numbers.
 */
import { describe, expect, it } from 'vitest';
import { GROWTH_FLOOR, HERO_IDS, HEROES, RANK_KEYS, RANK_LEVELS, ROLE_GROWTH, type AbilitySlot } from '../../src/data/heroes';
import { XP } from '../../src/data/xp';
import { maxCooldown } from '../../src/input/abilities';
import type { EntitySnap, MatchClock } from '../../src/sim/api';
import { abil, abilityRank, chooseTalent, kitNumbers, maxRank } from '../../src/sim/heroes/talents';
import { attackEvery, moveSpeed } from '../../src/sim/units/kinds';
import { abilityNumbers, rankPips, rankUpLines, talentNumbers } from '../../src/ui/heroText';
import { Hud } from '../../src/ui/hud';
import { TalentPicker } from '../../src/ui/talents';
import { heroMatch, setLevel } from './heroes/kit-helpers';

const SLOTS: readonly AbilitySlot[] = ['q', 'w', 'e', 'r'];
const snap = (e: Partial<EntitySnap> & Pick<EntitySnap, 'id' | 'kind' | 'team'>): EntitySnap => ({ slot: 0, x: 0, y: 0, hp: 100, maxHp: 100, shield: 0, state: 'idle', facing: 0, buffs: 0, ...e });
const CLOCK: MatchClock = { tick: 0, seconds: 0, phase: 'play', nextPhaseIn: 0 };

describe('C2: rank levels', () => {
  it('Q W E rank up at 2, 5, 8; R unlocks at 4 and ranks up at 7, 10; never on a talent level', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => abilityRank(l, 0))).toEqual([1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => abilityRank(l, 3))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3]);
    expect([maxRank(0), maxRank(1), maxRank(2), maxRank(3)]).toEqual([4, 4, 4, 3]);
    expect(RANK_LEVELS.ultimate[0]).toBe(XP.ultimateLevel);
    for (const l of [...RANK_LEVELS.basic.slice(1), ...RANK_LEVELS.ultimate.slice(1)]) expect(XP.talentLevels).not.toContain(l);
  });

  it('every rank delta names a RANK_KEYS number the ability has', () => {
    for (const h of HERO_IDS) {
      for (const s of SLOTS) {
        const d = HEROES[h].ranks[s];
        if (!d) continue;
        for (const k of Object.keys(d)) {
          expect(RANK_KEYS, `${h}.${s}.${k}`).toContain(k);
          expect(HEROES[h].abilities[s][k], `${h}.${s}.${k}`).toBeTypeOf('number');
        }
      }
    }
  });

  it('half the per-level damage moved into ranks: level 1 and level 10 damage are unchanged', () => {
    const sage = HERO_IDS.indexOf('sage');
    const q = (l: number): number => kitNumbers(sage, l).q.dmg + kitNumbers(sage, l).q.dmgPerLevel * (l - 1);
    expect([q(1), q(2), q(5), q(8), q(10)]).toEqual([55, 75, 105, 135, 145]);
    expect(q(10)).toBe(55 + 10 * 9); // pre-Wave C: 55 (+10/lvl)
    const r = (l: number): number => kitNumbers(sage, l).r.dmg + kitNumbers(sage, l).r.dmgPerLevel * (l - 1);
    expect([r(4), r(7), r(10)]).toEqual([280, 430, 580]);
    expect(r(10)).toBe(220 + 40 * 9);
    expect([kitNumbers(sage, 1).r.cooldown, kitNumbers(sage, 7).r.cooldown, kitNumbers(sage, 10).r.cooldown]).toEqual([2100, 2000, 1900]);
    expect([kitNumbers(sage, 1).w.cooldown, kitNumbers(sage, 2).w.cooldown, kitNumbers(sage, 8).w.cooldown]).toEqual([420, 405, 375]);
  });

  it('talents merge after ranks: a talent number replaces the ranked one', () => {
    const sage = HERO_IDS.indexOf('sage');
    expect(kitNumbers(sage, 10, [-1, -1, 0]).r.cooldown).toBe(1500); // Full Moon over rank 3's 1900
    // Piercing Shot keeps its own damage and growth, not Volley's ranks
    expect(kitNumbers(sage, 8, [-1, 1, -1]).q).toMatchObject({ lance: 1, dmg: 95, dmgPerLevel: 14 });
    const cj = HERO_IDS.indexOf('cacklejaw');
    expect(kitNumbers(cj, 8, [-1, 0, -1]).w.cooldown).toBe(270); // Smug
  });

  it('bots and the human read the same table at the same level and talents', () => {
    const m = heroMatch(['sage', 'clem', 'brutus', 'sage', 'cacklejaw', 'lambo']);
    for (const id of [0, 3]) setLevel(m, id, 6);
    // the bot (slot 3) chose its own at its level-ups; give both the same picks
    for (const id of [0, 3]) [1, 0, -1].forEach((c, t) => (m.world.talents[id * 3 + t] = c));
    expect(chooseTalent(m, 0, 2, 0)).toBe(false); // level 9 tier still locked
    expect(abil(m.world, 0)).toBe(abil(m.world, 3));
    expect(abil(m.world, 0)).toBe(kitNumbers(HERO_IDS.indexOf('sage'), 6, [1, 0, -1]));
    expect(abil(m.world, 0).q.dmg).toBe(55 + 2 * 15);
  });
});

describe('C1: level growth', () => {
  it('attack speed per level by role, integer and floored, adding to buffs', () => {
    const m = heroMatch(['sage', 'clem', 'brutus', 'cacklejaw', 'lambo', 'gabe']);
    const w = m.world;
    expect(attackEvery(w, 0)).toBe(HEROES.sage.base.attackEvery);
    setLevel(m, 0, 10);
    // marksman +3% a level: 27 × 10000 / 12700
    expect(ROLE_GROWTH.marksman.attackSpeedPerLevelBp).toBe(300);
    expect(attackEvery(w, 0)).toBe(Math.trunc((27 * 10000) / 12700));
    w.asT[0] = 30;
    w.asBp[0] = 40000;
    expect(attackEvery(w, 0)).toBe(GROWTH_FLOOR.attackEveryMin);
    setLevel(m, 2, 10);
    expect(attackEvery(w, 2)).toBe(Math.trunc((HEROES.brutus.base.attackEvery * 10000) / (10000 + 9 * ROLE_GROWTH.tank.attackSpeedPerLevelBp)));
  });

  it('move speed per level by role; slows scale the sum', () => {
    const m = heroMatch(['sage', 'clem', 'brutus', 'cacklejaw', 'lambo', 'gabe']);
    const w = m.world;
    w.zoomT[3] = 0;
    expect(moveSpeed(w, 3)).toBe(HEROES.cacklejaw.base.speed);
    setLevel(m, 3, 10);
    w.zoomT[3] = 0;
    const lv10 = HEROES.cacklejaw.base.speed + 9 * ROLE_GROWTH.assassin.speedPerLevel;
    expect(moveSpeed(w, 3)).toBe(lv10);
    w.slowT[3] = 30;
    w.slowBp[3] = 2000;
    expect(moveSpeed(w, 3)).toBe(Math.trunc((lv10 * 8000) / 10000));
  });

  it('every role has growth, all integers', () => {
    for (const h of HERO_IDS) {
      const g = ROLE_GROWTH[HEROES[h].role];
      expect(Number.isInteger(g.attackSpeedPerLevelBp) && Number.isInteger(g.speedPerLevel)).toBe(true);
    }
  });
});

describe('C2: client reads', () => {
  it('tooltip numbers at the level, rank and talents; the pick screen shows the growth', () => {
    expect(abilityNumbers('sage', 0)).toBe('7 s cooldown · 55 (+5/lvl, +15 a rank) dmg · 7 m');
    expect(abilityNumbers('sage', 0, 5)).toBe('7 s cooldown · 105 dmg · 7 m · rank 3/4');
    expect(abilityNumbers('sage', 3, 2)).toMatch(/unlocks at level 4$/);
    expect(abilityNumbers('sage', 3, 10, [-1, -1, 0])).toBe('50 s cooldown · 580 dmg · 40 m · rank 3/3');
  });

  it('max cooldowns follow the ranks and the picked talents', () => {
    expect(maxCooldown('sage', 1, 'pounce')).toBe(420);
    expect(maxCooldown('sage', 1, 'pounce', false, 8)).toBe(375);
    expect(maxCooldown('cacklejaw', 1, 'pounce', false, 6, [-1, 0, -1])).toBe(270);
    expect(maxCooldown('brutus', 1, 'pounce', true, 6)).toBe(300);
  });

  it('rank-up lines only where a rank goes up (not at talent levels or the ultimate unlock)', () => {
    expect(rankUpLines('sage', 2)).toEqual(['Volley rank 2: +15 dmg', 'Sun Snare rank 2: −0.5 s cooldown', 'Hop Back rank 2: −0.5 s cooldown']);
    expect(rankUpLines('sage', 3)).toEqual([]);
    expect(rankUpLines('sage', 4)).toEqual([]);
    expect(rankUpLines('sage', 7)).toEqual(['Moonshot rank 2: +90 dmg, −3.3 s cooldown']);
    expect(rankUpLines('clem', 10)).toEqual(['Golden Hour rank 3: +32 wave dmg, −3.3 s cooldown']);
  });

  it('rank-up lines leave out what a picked talent overrides (the sim numbers, not the raw rank deltas)', () => {
    // Piercing Shot sets Volley's dmg outright: rank 4 adds nothing to it
    expect(rankUpLines('sage', 8, [-1, 1, -1])).toEqual(['Sun Snare rank 4: −0.5 s cooldown', 'Hop Back rank 4: −0.5 s cooldown']);
    // Full Moon sets Moonshot's cooldown: only the dmg ranks up
    expect(rankUpLines('sage', 10, [-1, -1, 0])).toEqual(['Moonshot rank 3: +90 dmg']);
    expect(rankUpLines('aviete', 8, [-1, 1, -1])).toEqual(['Spark Swipe rank 4: +18 dmg', 'Live Wire rank 4: −0.5 s cooldown']);
    expect(rankUpLines('aviete', 10, [-1, -1, 0])).toEqual(['Short Circuit rank 3: +68 dmg']);
    expect(rankUpLines('cacklejaw', 8, [-1, 0, -1])).toEqual(['Jeer Slash rank 4: +18 dmg', 'Bush Slink rank 4: −0.7 s cooldown']);
    expect(rankUpLines('brutus', 8, [-1, 1, -1])).toEqual(['Shield Slam rank 4: +15 dmg', 'Pug Charge rank 4: −0.5 s cooldown']);
  });

  it('talent card numbers at the current level', () => {
    expect(talentNumbers('sage', 0, 0, 3)).toBe('Volley arrows 5 → 7');
    expect(talentNumbers('cacklejaw', 1, 0, 6)).toBe('Gloat cooldown 12 s → 9 s');
    expect(talentNumbers('sage', 1, 1, 6)).toBe('Volley range 7 m → 9 m · Volley width 0.3 m → 0.6 m · Volley dmg 110 → 165 · Volley speed 20 m/s → 24 m/s');
    const p = new TalentPicker(document.body, 'sage', () => {}, () => ({ level: 3, talents: [-1, -1, -1] }));
    p.offer(0);
    expect(p.root.querySelector('button[data-c="0"] .n')?.textContent).toBe('Volley arrows 5 → 7');
    p.dispose();
  });

  it('HUD: rank pips on Q W E R follow the level; the toast lists the ranked abilities', () => {
    expect(rankPips(2, 4)).toBe('<b class="on"></b><b class="on"></b><b></b><b></b>');
    document.body.innerHTML = '';
    const hud = new Hud(document.body, 'sage', 'pounce', { onSlot: () => {} });
    const pips = (i: number): number => document.querySelectorAll(`.pl-slot[data-i="${i}"] .rk b.on`).length;
    expect([pips(0), pips(1), pips(2), pips(3)]).toEqual([1, 1, 1, 0]);
    expect(document.querySelector('.pl-slot[data-i="4"] .rk')).toBeNull();
    hud.update(snap({ id: 0, kind: 'hero', team: 0, hero: 'sage', level: 7, talents: [0, 1, -1] }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    expect([pips(0), pips(1), pips(2), pips(3)]).toEqual([3, 3, 3, 2]);
    expect(hud.rankUp(7)).toEqual(['Moonshot rank 2: +90 dmg, −3.3 s cooldown']);
    const toast = document.querySelector('.pl-rankup');
    expect(toast?.classList.contains('on')).toBe(true);
    expect(toast?.textContent).toBe('Rank up!Moonshot rank 2: +90 dmg, −3.3 s cooldown');
    expect(document.querySelector('.pl-slot[data-i="3"]')?.classList.contains('rankup')).toBe(true);
    expect(hud.rankUp(6)).toEqual([]);
    // with Full Moon picked, the toast and the flash skip what the talent overrides
    hud.update(snap({ id: 0, kind: 'hero', team: 0, hero: 'sage', level: 10, talents: [0, 1, 0] }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    expect(hud.rankUp(10)).toEqual(['Moonshot rank 3: +90 dmg']);
    expect(hud.rankUp(8)).toEqual(['Sun Snare rank 4: −0.5 s cooldown', 'Hop Back rank 4: −0.5 s cooldown']);
    hud.dispose();
  });
});
