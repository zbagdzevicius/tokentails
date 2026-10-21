import { describe, expect, it } from 'vitest';
import { CLEM } from '../../../src/data/heroes/clem';
import { PROJECTILE_KIND } from '../../../src/data/towers';
import { fireBolt } from '../../../src/sim/combat/attack';
import { dealDamage, resolveDeaths } from '../../../src/sim/combat/damage';
import { chooseTalent } from '../../../src/sim/heroes/talents';
import { attackEvery, targetable } from '../../../src/sim/units/kinds';
import { Kind } from '../../../src/sim/world';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Clem (slot 0) vs Sage (slot 3, armour 15) in the open.
const CLEM_ID = 0;
const FOE = 3;
const FOE_ARMOUR = 15;

function duel() {
  const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
  place(m, CLEM_ID, MID.x, MID.y, 0);
  place(m, FOE, MID.x + 1500, MID.y, 2048);
  hold(m, CLEM_ID, FOE);
  tanky(m, CLEM_ID, FOE);
  return m;
}

describe('Clem (§6.3)', () => {
  it('data matches POC.md §6.2 and §6.3', () => {
    expect(CLEM.base).toEqual({ hp: 620, hpPerLevel: 60, attack: 58, attackPerLevel: 5, attackEvery: 30, range: 1600, speed: 5000, armour: 25, armourPerLevel: 2 });
    const a = CLEM.abilities;
    expect([a.q.cooldown, a.w.cooldown, a.e.cooldown, a.r.cooldown]).toEqual([180, 360, 330, 1800]);
    expect([a.q.range, a.q.arc, a.q.dmg, a.q.dmgPerLevel, a.q.recasts, a.q.recastWindow, a.q.knockback]).toEqual([2400, 1024, 70, 6, 2, 90, 1500]);
    expect([a.w.duration, a.w.reduceBp, a.w.parryWindow]).toEqual([23, 8000, 9]);
    expect([a.e.dash, a.e.untargetable]).toEqual([4000, 6]);
    expect([a.r.duration, a.r.attackSpeedBp, a.r.everyNth, a.r.waveRange, a.r.waveDmg, a.r.waveDmgPerLevel]).toEqual([180, 4000, 3, 5000, 80, 8]);
    expect(CLEM.passive).toEqual({ valorPerHeroHit: 10, valorPerMinionHit: 4, valorMax: 100, valorBonusBp: 15000 });
  });

  it('Paw Combo: cone hit, two recasts in 3 s, the third knocks back 1.5 m, then 6 s cooldown', () => {
    const m = duel();
    const w = m.world;
    const hp = w.hp[FOE];
    const per = heroHit(70, FOE_ARMOUR);
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(hp - w.hp[FOE]).toBe(per);
    expect(cd(m, CLEM_ID, 0)).toBe(0); // recast window open
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(hp - w.hp[FOE]).toBe(2 * per);
    const x0 = w.x[FOE];
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(hp - w.hp[FOE]).toBe(3 * per);
    expect(cd(m, CLEM_ID, 0)).toBe(180);
    steps(m, 6);
    expect(w.x[FOE] - x0).toBe(1500);
  });

  it('Paw Combo misses what is behind or out of the cone', () => {
    const m = duel();
    place(m, FOE, MID.x - 1500, MID.y, 0);
    const hp = m.world.hp[FOE];
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(m.world.hp[FOE]).toBe(hp);
    place(m, FOE, MID.x + 3000, MID.y, 0); // 2.4 m + the 0.5 m footprint = 2.9 m
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(m.world.hp[FOE]).toBe(hp);
  });

  it('a lapsed combo starts the cooldown from the last cast', () => {
    const m = duel();
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    steps(m, 90);
    expect(cd(m, CLEM_ID, 0)).toBeGreaterThanOrEqual(88);
    expect(cd(m, CLEM_ID, 0)).toBeLessThanOrEqual(90);
  });

  it('Valor: +10 per hero hit, +4 per minion hit, max 100; a full bar makes the next ability +50%', () => {
    const m = duel();
    const w = m.world;
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(w.kValor[CLEM_ID]).toBe(10);
    w.kValor[CLEM_ID] = 100;
    const hp = w.hp[FOE];
    cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(hp - w.hp[FOE]).toBe(heroHit(105, FOE_ARMOUR));
    expect(w.kValor[CLEM_ID]).toBe(10); // reset, then this hit adds 10
  });

  it('The Stand: 80% less frontal damage for 0.75 s; nothing from behind', () => {
    const m = duel();
    const w = m.world;
    cast(m, CLEM_ID, 1, MID.x + 1500, MID.y);
    expect(w.kWT[CLEM_ID]).toBe(23);
    let hp = w.hp[CLEM_ID];
    dealDamage(m, FOE, 1, Kind.Hero, CLEM_ID, 100, 'basic');
    expect(hp - w.hp[CLEM_ID]).toBe(20); // 100 × 1.3 (hero vs hero) = 130 → 104 after armour 25 → 20
    place(m, FOE, MID.x - 1500, MID.y, 0);
    hp = w.hp[CLEM_ID];
    dealDamage(m, FOE, 1, Kind.Hero, CLEM_ID, 100, 'basic');
    expect(hp - w.hp[CLEM_ID]).toBe(104);
    steps(m, 23);
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    hp = w.hp[CLEM_ID];
    dealDamage(m, FOE, 1, Kind.Hero, CLEM_ID, 100, 'basic');
    expect(hp - w.hp[CLEM_ID]).toBe(104);
  });

  it('The Stand parries: a projectile in the first 0.3 s flies back at its shooter', () => {
    const m = duel();
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    cast(m, CLEM_ID, 1, MID.x + 3000, MID.y);
    const mine = w.hp[CLEM_ID];
    const theirs = w.hp[FOE];
    fireBolt(w, FOE, CLEM_ID, 60, 60000, PROJECTILE_KIND.hero);
    steps(m, 6);
    expect(w.hp[CLEM_ID]).toBe(mine);
    expect(w.hp[FOE]).toBeLessThan(theirs);
    // After the window the bolt lands (the frontal block still applies).
    steps(m, 6);
    fireBolt(w, FOE, CLEM_ID, 60, 60000, PROJECTILE_KIND.hero);
    steps(m, 4);
    expect(w.hp[CLEM_ID]).toBeLessThan(mine);
  });

  it('Tumble: dash 4 m, untargetable for 0.2 s', () => {
    const m = duel();
    const w = m.world;
    cast(m, CLEM_ID, 2, MID.x, MID.y + 10000);
    expect(targetable(w, CLEM_ID, 1)).toBe(false);
    expect(cd(m, CLEM_ID, 2)).toBe(330);
    steps(m, 5);
    expect(targetable(w, CLEM_ID, 1)).toBe(false);
    steps(m, 1);
    expect(targetable(w, CLEM_ID, 1)).toBe(true);
    steps(m, 2);
    expect(w.y[CLEM_ID] - MID.y).toBe(4000);
  });

  it('Golden Hour: level 4, 6 s of +40% attack speed, every 3rd basic sends a 5 m line wave', () => {
    const m = duel();
    const w = m.world;
    cast(m, CLEM_ID, 3, MID.x + 1500, MID.y);
    expect(w.kRT[CLEM_ID]).toBe(0); // locked below level 4
    expect(cd(m, CLEM_ID, 3)).toBe(0);
    setLevel(m, CLEM_ID, 4);
    cast(m, CLEM_ID, 3, MID.x + 1500, MID.y);
    expect(cd(m, CLEM_ID, 3)).toBe(1800);
    expect(w.kRT[CLEM_ID]).toBe(180);
    // Wave C (C1): +40% from Golden Hour plus the fighter's 3 levels × 2.5%: 30 × 10000 / 14750
    expect(attackEvery(w, CLEM_ID)).toBe(20);
    w.attackTimer[CLEM_ID] = 0;
    w.hp[FOE] = w.maxHp[FOE] = 100000;
    let waves = 0;
    let basics = 0;
    for (let t = 0; t < 70; t++) {
      const before = w.pAlive.slice();
      steps(m, 1);
      for (const e of m.events) if (e.type === 'hit' && e.kind === 'basic' && e.src === CLEM_ID) basics++;
      for (let p = 0; p < w.pAlive.length; p++) if (w.pAlive[p] === 1 && before[p] === 0 && w.pKind[p] === PROJECTILE_KIND.wave) waves++;
    }
    expect(basics).toBeGreaterThanOrEqual(3);
    expect(waves).toBe(Math.floor(basics / 3));
  });

  it('talents: Pounce Finish stuns 0.5 s instead of the knockback; Long Swipe reaches 3 m', () => {
    const m = duel();
    const w = m.world;
    setLevel(m, CLEM_ID, 3);
    expect(chooseTalent(m, CLEM_ID, 0, 0)).toBe(true);
    expect(chooseTalent(m, CLEM_ID, 0, 1)).toBe(false); // tier already taken
    const x0 = w.x[FOE];
    for (let i = 0; i < 3; i++) cast(m, CLEM_ID, 0, MID.x + 1500, MID.y);
    expect(w.stunT[FOE]).toBe(15);
    steps(m, 6);
    expect(w.x[FOE]).toBe(x0);

    const m2 = duel();
    setLevel(m2, CLEM_ID, 3);
    chooseTalent(m2, CLEM_ID, 0, 1);
    place(m2, FOE, MID.x + 3000, MID.y, 2048);
    const hp = m2.world.hp[FOE];
    cast(m2, CLEM_ID, 0, MID.x + 3000, MID.y);
    expect(m2.world.hp[FOE]).toBeLessThan(hp);
  });

  it('talents: Steady Stand 1.25 s; Golden Afternoon +2 s; Sunlit Mend heals 15% of damage in Golden Hour', () => {
    const m = duel();
    const w = m.world;
    setLevel(m, CLEM_ID, 9);
    chooseTalent(m, CLEM_ID, 1, 1);
    chooseTalent(m, CLEM_ID, 2, 0);
    cast(m, CLEM_ID, 1, MID.x + 1500, MID.y);
    expect(w.kWT[CLEM_ID]).toBe(38);
    cast(m, CLEM_ID, 3, MID.x + 1500, MID.y);
    expect(w.kRT[CLEM_ID]).toBe(240);

    const m2 = duel();
    const w2 = m2.world;
    setLevel(m2, CLEM_ID, 9);
    chooseTalent(m2, CLEM_ID, 2, 1);
    cast(m2, CLEM_ID, 3, MID.x + 1500, MID.y);
    w2.hp[CLEM_ID] = 100;
    const dealt = dealDamage(m2, CLEM_ID, 0, Kind.Hero, FOE, 200, 'ability');
    expect(w2.hp[CLEM_ID]).toBe(100 + Math.trunc((dealt * 1500) / 10000));
  });

  it('talent Second Wind: a takedown resets Tumble', () => {
    const m = duel();
    const w = m.world;
    setLevel(m, CLEM_ID, 6);
    chooseTalent(m, CLEM_ID, 1, 0);
    cast(m, CLEM_ID, 2, MID.x, MID.y + 10000);
    expect(cd(m, CLEM_ID, 2)).toBe(330 - 2 * 15); // Wave C: Tumble rank 3 at level 6
    steps(m, 8);
    place(m, FOE, w.x[CLEM_ID] + 1000, w.y[CLEM_ID], 2048);
    w.hp[FOE] = 1;
    dealDamage(m, CLEM_ID, 0, Kind.Hero, FOE, 500, 'basic');
    resolveDeaths(m);
    expect(w.alive[FOE]).toBe(0);
    expect(cd(m, CLEM_ID, 2)).toBe(0);
  });
});
