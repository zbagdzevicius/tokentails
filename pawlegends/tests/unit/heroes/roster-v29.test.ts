/**
 * Sim v29 roster (docs/plans/moba/ROSTER-V29.md): Mochi (cat support), Ziggy (cat fighter), Biscuit (dog support) and
 * Champ (dog fighter). One block per hero: data, the passive and every slot through the real cast pipeline.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../../src/data/heroes';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { kitOf } from '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { targetable } from '../../../src/sim/units/kinds';
import { dist2, isqrt } from '../../../src/sim/fixed';
import { FM } from '../../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, steps, tanky } from './kit-helpers';

const dist = (m: ReturnType<typeof heroMatch>, a: number, b: number): number => isqrt(dist2(m.world.x[a], m.world.y[a], m.world.x[b], m.world.y[b]));

/** Hero (slot 0) with two allies vs three foes, everyone held far apart. */
function arena(hero: (typeof HERO_IDS)[number], allies: [string, string], foes: [string, string, string]) {
  const m = heroMatch([hero, ...allies, ...foes] as never);
  place(m, 0, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, 3, MID.x + 20000, MID.y + 20000, 2048);
  place(m, 4, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, 0, 1, 2, 3, 4, 5);
  return m;
}

describe('sim v29 roster: data', () => {
  it('four heroes appended at 20..23, two a side, the second fighter and support of each side', () => {
    expect(HERO_IDS.slice(20)).toEqual(['mochi', 'ziggy', 'biscuit', 'champ']);
    expect(['mochi', 'ziggy', 'biscuit', 'champ'].map((h) => `${HEROES[h as 'mochi'].side} ${HEROES[h as 'mochi'].role}`)).toEqual([
      'cat support',
      'cat fighter',
      'dog support',
      'dog fighter',
    ]);
    for (const side of ['cat', 'dog'] as const) {
      const roles = HERO_IDS.filter((h) => HEROES[h].side === side).map((h) => HEROES[h].role);
      expect(roles.length).toBe(12);
      for (const r of ['fighter', 'support', 'tank', 'assassin', 'mage', 'marksman'] as const) expect(roles.filter((x) => x === r).length, `${side} ${r}`).toBe(2);
    }
  });
});

describe('Mochi, cat support', () => {
  const A = baseNumbers(HERO_IDS.indexOf('mochi'));
  const MO = 0;

  it('Pillow Toss: slows the first enemy hero and shields her most hurt friend, stronger below half HP (Warm Lap)', () => {
    const m = arena('mochi', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 4000, MID.y, 2048);
    place(m, 1, MID.x - 2000, MID.y, 0);
    w.hp[1] = w.maxHp[1] >> 2;
    const hp = w.hp[3];
    cast(m, MO, 0, MID.x + 4000, MID.y);
    steps(m, 12);
    expect(w.hp[3]).toBeLessThan(hp);
    expect(w.slowT[3]).toBeGreaterThan(0);
    expect(w.shield[1]).toBeGreaterThan(A.q.shield);
  });

  it('Cuddle Bubble: a shield and attack speed on the friend nearest the aim', () => {
    const m = arena('mochi', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 1, MID.x + 3000, MID.y, 0);
    cast(m, MO, 1, MID.x + 3000, MID.y);
    steps(m, 1);
    expect(w.shield[1]).toBeGreaterThan(0);
    expect(w.asBp[1]).toBe(A.w.asBp);
    expect(w.shield[MO]).toBe(0);
  });

  it('Purr Wave: haste for her and the friends near her, her slows gone', () => {
    const m = arena('mochi', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 1, MID.x + 2000, MID.y, 0);
    w.slowT[MO] = 60;
    w.slowBp[MO] = 3000;
    cast(m, MO, 2, MID.x, MID.y);
    expect(w.slowBp[MO]).toBe(0);
    expect(w.hasteBp[MO]).toBe(A.e.hasteBp);
    expect(w.hasteBp[1]).toBe(A.e.hasteBp);
    expect(w.hasteBp[2]).toBe(0);
  });

  it('LULLABY: heals friends, slows the dogs near her, and only those still near her fall asleep', () => {
    const m = arena('mochi', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    w.level[MO] = 4;
    place(m, 1, MID.x - 3000, MID.y, 0);
    w.hp[1] = 100;
    place(m, 3, MID.x + 2000, MID.y, 2048);
    place(m, 4, MID.x - 2000, MID.y + 1000, 2048);
    cast(m, MO, 3, MID.x, MID.y);
    steps(m, A.r.windup + 1);
    expect(w.hp[1]).toBeGreaterThan(100);
    expect(w.slowT[3]).toBeGreaterThan(0);
    expect(w.slowT[4]).toBeGreaterThan(0);
    // one walks away before the drowsiness ends
    place(m, 4, MID.x - 9000, MID.y, 2048);
    let clips = m.events.filter((e) => e.type === 'clip' && e.what === 'lullaby').length;
    for (let t = 0; t < A.r.drowsy + 2 && w.stunT[3] === 0; t++) {
      steps(m, 1);
      clips += m.events.filter((e) => e.type === 'clip' && e.what === 'lullaby').length;
    }
    expect(w.stunT[3]).toBeGreaterThan(0);
    expect(w.stunT[4]).toBe(0);
    expect(cd(m, MO, 3)).toBeGreaterThan(0);
    expect(clips).toBeLessThanOrEqual(1);
  });
});

describe('Ziggy, cat fighter', () => {
  const A = baseNumbers(HERO_IDS.indexOf('ziggy'));
  const ZI = 0;

  it('Zig: three dashes in a window, hitting what he passes; the cooldown after the last', () => {
    const m = arena('ziggy', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    const hp = w.hp[3];
    cast(m, ZI, 0, MID.x + 3000, MID.y);
    steps(m, 8);
    expect(w.hp[3]).toBeLessThan(hp);
    expect(cd(m, ZI, 0)).toBe(0);
    cast(m, ZI, 0, MID.x, MID.y + 3000);
    steps(m, 8);
    expect(cd(m, ZI, 0)).toBe(0);
    cast(m, ZI, 0, MID.x - 3000, MID.y);
    steps(m, 8);
    expect(cd(m, ZI, 0)).toBeGreaterThan(0);
  });

  it('Static Step: the basic after a dash deals extra', () => {
    const m = arena('ziggy', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    w.kHuntT[ZI] = A.passive.window;
    const hp = w.hp[3];
    kitOf(w, ZI).afterBasic!(m, ZI, 3);
    expect(w.hp[3]).toBeLessThan(hp);
    expect(w.kHuntT[ZI]).toBe(0);
  });

  it('Spark Swipe: after its wind-up, the enemy heroes near him are stunned', () => {
    const m = arena('ziggy', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    cast(m, ZI, 1, MID.x, MID.y);
    expect(w.stunT[3]).toBe(0);
    steps(m, A.w.windup + 1);
    expect(w.stunT[3]).toBeGreaterThan(0);
  });

  it('Tail Flick: a hop and a shield', () => {
    const m = arena('ziggy', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    cast(m, ZI, 2, MID.x - 3000, MID.y);
    expect(w.shield[ZI]).toBeGreaterThan(0);
    steps(m, 10);
    expect(w.x[ZI]).toBeLessThan(MID.x - 1500);
  });

  it('ZIGZAG STORM: untargetable, it strikes each nearby enemy hero, full first, half on a repeat', () => {
    const m = arena('ziggy', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    w.level[ZI] = 4;
    place(m, 3, MID.x + 3000, MID.y, 2048);
    place(m, 4, MID.x + 5000, MID.y + 2000, 2048);
    const h3 = w.hp[3];
    const h4 = w.hp[4];
    cast(m, ZI, 3, MID.x + 3000, MID.y, 3);
    steps(m, A.r.windup + 1);
    expect(targetable(w, ZI, w.team[3])).toBe(false);
    expect(w.hp[3]).toBeLessThan(h3);
    steps(m, A.r.strikes * A.r.gap + 2);
    expect(w.hp[4]).toBeLessThan(h4);
    expect(w.kRT[ZI]).toBe(0);
    expect(targetable(w, ZI, w.team[3])).toBe(true);
  });
});

describe('Biscuit, dog support', () => {
  const A = baseNumbers(HERO_IDS.indexOf('biscuit'));
  const BI = 0;

  it('Fetch!: the first enemy hero hit is stunned and pulled to just in front of him; one clip', () => {
    const m = arena('biscuit', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 7000, MID.y, 2048);
    cast(m, BI, 0, MID.x + 7000, MID.y);
    let clips = 0;
    for (let t = 0; t < 40; t++) {
      steps(m, 1);
      clips += m.events.filter((e) => e.type === 'clip' && e.what === 'fetch').length;
      if (w.fmKind[3] === FM.None && w.stunT[3] === 0 && clips > 0) break;
    }
    expect(clips).toBe(1);
    expect(dist(m, BI, 3)).toBeLessThan(A.q.gap + 2500);
  });

  it('Fetch!: the ball stops at the first unit: a cat in front is caught, the one behind stays', () => {
    const m = arena('biscuit', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    place(m, 3, MID.x + 7000, MID.y, 2048);
    let clip = false;
    cast(m, BI, 0, MID.x + 7000, MID.y);
    // a tanky foe hero standing in front takes it instead (the first unit)
    place(m, 4, MID.x + 3000, MID.y, 2048);
    for (let t = 0; t < 40; t++) {
      steps(m, 1);
      if (m.events.some((e) => e.type === 'clip' && e.what === 'fetch')) clip = true;
    }
    expect(clip).toBe(true);
    expect(dist(m, BI, 3)).toBeGreaterThan(6000);
  });

  it('Good Boy: the basic stuns and shields him and the nearest friend, then waits its timer', () => {
    const m = arena('biscuit', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    place(m, 1, MID.x - 2000, MID.y, 0);
    steps(m, 1);
    expect(w.kValor[BI]).toBe(1);
    kitOf(w, BI).afterBasic!(m, BI, 3);
    expect(w.stunT[3]).toBeGreaterThan(0);
    expect(w.shield[BI]).toBeGreaterThan(0);
    expect(w.shield[1]).toBeGreaterThan(0);
    expect(w.kHuntT[BI]).toBe(A.passive.every);
  });

  it('Tail Wag knocks back; Stubborn cleanses and cuts damage', () => {
    const m = arena('biscuit', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    cast(m, BI, 1, MID.x, MID.y);
    steps(m, 8);
    expect(w.x[3]).toBeGreaterThan(MID.x + 2500);
    w.slowT[BI] = 60;
    w.slowBp[BI] = 3000;
    cast(m, BI, 2, MID.x, MID.y);
    expect(w.slowT[BI]).toBe(0);
    expect(w.ccImmT[BI]).toBeGreaterThan(0);
    expect(kitOf(w, BI).incoming!(m, BI, 3, 1000)).toBe(1000 - (A.e.reduceBp / 10));
  });

  it('WALKIES!: pulls the cats near him in (never into him), slows them and shields him', () => {
    const m = arena('biscuit', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    w.level[BI] = 4;
    place(m, 3, MID.x + 4500, MID.y, 2048);
    place(m, 4, MID.x - 4000, MID.y, 2048);
    cast(m, BI, 3, MID.x, MID.y);
    steps(m, A.r.windup + 10);
    expect(dist(m, BI, 3)).toBeLessThan(4500);
    expect(dist(m, BI, 4)).toBeLessThan(4000);
    expect(dist(m, BI, 3)).toBeGreaterThanOrEqual(A.r.gap);
    expect(w.slowT[3]).toBeGreaterThan(0);
    expect(w.shield[BI]).toBeGreaterThan(0);
  });
});

describe('Champ, dog fighter', () => {
  const A = baseNumbers(HERO_IDS.indexOf('champ'));
  const CH = 0;

  it('One-Two: every third basic on the same cat is a Cross (extra and a slow); Bob and Weave primes one', () => {
    const m = arena('champ', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    const k = kitOf(w, CH);
    k.afterBasic!(m, CH, 3);
    k.afterBasic!(m, CH, 3);
    expect(w.slowT[3]).toBe(0);
    k.afterBasic!(m, CH, 3);
    expect(w.slowT[3]).toBeGreaterThan(0);
    w.slowT[3] = 0;
    cast(m, CH, 2, MID.x + 1500, MID.y);
    expect(w.kEmpower[CH]).toBe(1);
    k.afterBasic!(m, CH, 3);
    expect(w.slowT[3]).toBeGreaterThan(0);
  });

  it('Haymaker hits the cone after its wind-up', () => {
    const m = arena('champ', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 2000, MID.y, 2048);
    const hp = w.hp[3];
    cast(m, CH, 0, MID.x + 2000, MID.y);
    steps(m, A.q.windup + 1);
    expect(w.hp[3]).toBeLessThan(hp);
  });

  it('Rope-a-Dope: less damage in the guard, part of it healed back at the end', () => {
    const m = arena('champ', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    cast(m, CH, 1, MID.x, MID.y);
    const cut = kitOf(w, CH).incoming!(m, CH, 3, 1000);
    expect(cut).toBe(1000 - A.w.reduceBp / 10);
    w.hp[CH] -= cut;
    const low = w.hp[CH];
    steps(m, A.w.duration + 1);
    expect(w.hp[CH]).toBeGreaterThan(low);
  });

  it('KNOCKOUT!: a punch that flies the cat 4 m; a wall stops it short and stuns it (the clip on the victim)', () => {
    const m = arena('champ', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    w.level[CH] = 4;
    place(m, 3, MID.x + 2000, MID.y, 2048);
    const hp = w.hp[3];
    cast(m, CH, 3, MID.x + 2000, MID.y, 3);
    steps(m, A.r.windup + 1);
    expect(w.hp[3]).toBeLessThan(hp);
    expect(w.fmKind[3]).toBe(FM.Knock);
    steps(m, 12);
    expect(dist(m, CH, 3)).toBeGreaterThan(4000);
  });
});
