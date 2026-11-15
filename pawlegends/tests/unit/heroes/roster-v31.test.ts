/**
 * Sim v31 roster (docs/plans/moba/ROSTER-V31.md): Nova (cat mage), Dusty (cat marksman), Barkula (dog mage) and Ranger
 * (dog marksman). One block per hero: data, the passive and every slot through the real cast pipeline.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS, HEROES } from '../../../src/data/heroes';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { kitOf } from '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { targetable } from '../../../src/sim/units/kinds';
import { G } from '../../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, steps, tanky } from './kit-helpers';

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

const clips = (m: ReturnType<typeof heroMatch>, what: string): number => m.events.filter((e) => e.type === 'clip' && e.what === what).length;

/** Step `n` ticks one at a time and count the hit events from `src` on `dst` (the event list is per tick). */
function hitsOver(m: ReturnType<typeof heroMatch>, n: number, src: number, dst: number): number {
  let k = 0;
  for (let t = 0; t < n; t++) {
    steps(m, 1);
    k += m.events.filter((e) => e.type === 'hit' && e.src === src && e.dst === dst).length;
  }
  return k;
}

describe('sim v31 roster: data', () => {
  it('four heroes appended at 24..27, two a side: the third mage and marksman of each side', () => {
    expect(HERO_IDS.slice(24)).toEqual(['nova', 'dusty', 'barkula', 'ranger']);
    expect(['nova', 'dusty', 'barkula', 'ranger'].map((h) => `${HEROES[h as 'nova'].side} ${HEROES[h as 'nova'].role} ${HEROES[h as 'nova'].element}`)).toEqual([
      'cat mage STELLAR',
      'cat marksman FIRE',
      'dog mage DARK',
      'dog marksman WIND',
    ]);
    for (const side of ['cat', 'dog'] as const) {
      const roles = HERO_IDS.filter((h) => HEROES[h].side === side).map((h) => HEROES[h].role);
      expect(roles.length).toBe(14);
      for (const r of ['fighter', 'support', 'tank', 'assassin'] as const) expect(roles.filter((x) => x === r).length, `${side} ${r}`).toBe(2);
      for (const r of ['mage', 'marksman'] as const) expect(roles.filter((x) => x === r).length, `${side} ${r}`).toBe(3);
    }
  });
});

describe('Nova, cat mage', () => {
  const A = baseNumbers(HERO_IDS.indexOf('nova'));
  const NO = 0;

  it('Starfall lands on the point after its arm time: damage and a slow', () => {
    const m = arena('nova', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 6000, MID.y, 2048);
    const hp = w.hp[3];
    cast(m, NO, 0, MID.x + 6000, MID.y);
    steps(m, A.q.arm - 2);
    expect(w.hp[3]).toBe(hp);
    steps(m, 4);
    expect(w.hp[3]).toBeLessThan(hp);
    expect(w.slowT[3]).toBeGreaterThan(0);
  });

  it('Starlight: the same hit deals more from 7 m or further', () => {
    const m = arena('nova', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const k = kitOf(m.world, NO);
    place(m, 3, MID.x + 3000, MID.y, 2048);
    const near = k.outgoing!(m, NO, 3, 1000);
    place(m, 3, MID.x + A.passive.range + 500, MID.y, 2048);
    const far = k.outgoing!(m, NO, 3, 1000);
    expect(near).toBe(1000);
    expect(far).toBe((1000 * A.passive.bonusBp) / 10000);
  });

  it('Shooting Star flies through everything and reveals the heroes it hits', () => {
    const m = arena('nova', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 4000, MID.y, 2048);
    place(m, 4, MID.x + 8000, MID.y, 2048);
    const a = w.hp[3];
    const b = w.hp[4];
    cast(m, NO, 1, MID.x + 9000, MID.y);
    steps(m, 30);
    expect(w.hp[3]).toBeLessThan(a);
    expect(w.hp[4]).toBeLessThan(b);
    expect(w.revealT[4]).toBeGreaterThan(0);
  });

  it('Moon Hop: a dash, and the moonbeam left behind slows a dog standing there', () => {
    const m = arena('nova', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 500, MID.y + 500, 2048);
    cast(m, NO, 2, MID.x - 4000, MID.y);
    steps(m, A.e.arm + 2);
    expect(w.x[NO]).toBeLessThan(MID.x - 2000);
    expect(w.slowT[3]).toBeGreaterThan(0);
  });

  it('METEOR SHOWER: from far away, one hit per meteor on a hero that stays in the circle', () => {
    const m = arena('nova', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    w.level[NO] = 4;
    place(m, 3, MID.x + 12000, MID.y, 2048);
    cast(m, NO, 3, MID.x + 12000, MID.y);
    expect(hitsOver(m, A.r.windup + A.r.arm + A.r.every * A.r.pulses + 4, NO, 3)).toBe(A.r.pulses);
    expect(cd(m, NO, 3)).toBeGreaterThan(0);
  });
});

describe('Dusty, cat marksman', () => {
  const A = baseNumbers(HERO_IDS.indexOf('dusty'));
  const DU = 0;

  it('Four Corks: the fourth basic is a Big Cork (harder, a slow, the reload); Quick Draw loads one at once', () => {
    const m = arena('dusty', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 4000, MID.y, 2048);
    const k = kitOf(w, DU);
    for (let i = 0; i < A.passive.every - 1; i++) {
      expect(k.basic!(m, DU, 3, 100)).toBe(false);
      k.afterBasic!(m, DU, 3);
    }
    w.attackTimer[DU] = 10;
    expect(k.basic!(m, DU, 3, 100)).toBe(true);
    k.afterBasic!(m, DU, 3);
    expect(w.slowT[3]).toBeGreaterThan(0);
    expect(w.attackTimer[DU]).toBe(10 + A.passive.reload);
    expect(w.kCount[DU]).toBe(0);
    expect(clips(m, 'bigcork')).toBe(1);
    cast(m, DU, 2, MID.x - 3000, MID.y);
    expect(w.attackTimer[DU]).toBe(0);
    expect(k.basic!(m, DU, 3, 100)).toBe(true);
  });

  it('Trick Shot hits the target and bounces to the nearest other enemy, a hero first', () => {
    const m = arena('dusty', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 5000, MID.y, 2048);
    place(m, 4, MID.x + 7000, MID.y + 1000, 2048);
    const a = w.hp[3];
    const b = w.hp[4];
    cast(m, DU, 0, w.x[3], w.y[3], 3);
    expect(clips(m, 'ricochet')).toBe(1);
    steps(m, 2);
    expect(w.hp[3]).toBeLessThan(a);
    expect(w.hp[4]).toBeLessThan(b);
    expect(b - w.hp[4]).toBeLessThan(a - w.hp[3]);
  });

  it('Lasso roots the first enemy hero on the line after its wind-up', () => {
    const m = arena('dusty', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    place(m, 3, MID.x + 3000, MID.y, 2048);
    place(m, 4, MID.x + 5000, MID.y, 2048);
    cast(m, DU, 1, MID.x + 5000, MID.y);
    steps(m, A.w.windup - 3);
    expect(w.rootT[3]).toBe(0);
    steps(m, 4);
    expect(w.rootT[3]).toBeGreaterThan(0);
    expect(w.rootT[4]).toBe(0);
  });

  it('HIGH NOON: planted, corks one after another along the aim; a stun ends it', () => {
    const m = arena('dusty', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    const w = m.world;
    w.level[DU] = 4;
    place(m, 3, MID.x + 8000, MID.y, 2048);
    const hp = w.hp[3];
    cast(m, DU, 3, MID.x + 8000, MID.y);
    steps(m, A.r.windup + 1);
    expect(kitOf(w, DU).busy!(w, DU)).toBe(true);
    steps(m, A.r.gap * A.r.shots + 20);
    expect(kitOf(w, DU).busy!(w, DU)).toBe(false);
    expect(w.hp[3]).toBeLessThan(hp);
    // a stun mid-volley ends it
    const m2 = arena('dusty', ['clem', 'sage'], ['brutus', 'cacklejaw', 'brutus']);
    m2.world.level[DU] = 4;
    cast(m2, DU, 3, MID.x + 8000, MID.y);
    steps(m2, A.r.windup + 2);
    m2.world.stunT[DU] = 20;
    steps(m2, 1);
    expect(kitOf(m2.world, DU).busy!(m2.world, DU)).toBe(false);
  });
});

describe('Barkula, dog mage', () => {
  const A = baseNumbers(HERO_IDS.indexOf('barkula'));
  const BA = 0;

  it('Night Thirst: his ability damage on a cat heals him', () => {
    const m = arena('barkula', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    w.hp[BA] = 200;
    kitOf(w, BA).afterDeal!(m, BA, 3, 100, 'ability');
    expect(w.hp[BA]).toBe(200 + (100 * A.passive.heroBp) / 10000);
    kitOf(w, BA).afterDeal!(m, BA, 3, 100, 'basic');
    expect(w.hp[BA]).toBe(200 + (100 * A.passive.heroBp) / 10000);
  });

  it('Bat Bite hits the first unit on the line', () => {
    const m = arena('barkula', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 4000, MID.y, 2048);
    const hp = w.hp[3];
    cast(m, BA, 0, MID.x + 4000, MID.y);
    steps(m, 15);
    expect(w.hp[3]).toBeLessThan(hp);
  });

  it('Bat Swarm pulses on the cats round him while it lasts, and he runs faster', () => {
    const m = arena('barkula', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    cast(m, BA, 1, MID.x, MID.y);
    expect(w.hasteBp[BA]).toBe(A.w.hasteBp);
    expect(hitsOver(m, A.w.duration + 2, BA, 3)).toBe(A.w.duration / A.w.every);
  });

  it('Mist Form: untargetable for a moment, faster, slows gone', () => {
    const m = arena('barkula', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    w.slowT[BA] = 60;
    w.slowBp[BA] = 3000;
    cast(m, BA, 2, MID.x, MID.y);
    expect(w.slowBp[BA]).toBe(0);
    expect(targetable(w, BA, w.team[3])).toBe(false);
    steps(m, A.e.untargetable + 1);
    expect(targetable(w, BA, w.team[3])).toBe(true);
  });

  it('RED MOON: marks the cats near him; only those still near him when it ends are bitten (the clip on each)', () => {
    const m = arena('barkula', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    w.level[BA] = 4;
    place(m, 3, MID.x + 2000, MID.y, 2048);
    place(m, 4, MID.x - 2000, MID.y + 1000, 2048);
    cast(m, BA, 3, MID.x, MID.y);
    steps(m, A.r.windup + 1);
    expect(w.slowT[3]).toBeGreaterThan(0);
    expect(w.slowT[4]).toBeGreaterThan(0);
    place(m, 4, MID.x, MID.y + 12000, 2048);
    const a = w.hp[3];
    w.hp[BA] = 300;
    const bitten: number[] = [];
    for (let t = 0; t < A.r.slow + 2; t++) {
      steps(m, 1);
      for (const e of m.events) if (e.type === 'clip' && e.what === 'bitten') bitten.push(e.id);
    }
    expect(w.hp[3]).toBeLessThan(a);
    expect(w.hp[BA]).toBeGreaterThan(300);
    expect(bitten).toEqual([3]);
  });
});

describe('Ranger, dog marksman', () => {
  const A = baseNumbers(HERO_IDS.indexOf('ranger'));
  const RA = 0;

  it('Camouflage: quiet for long enough, he hides and his next basic is the Camouflage shot', () => {
    const m = arena('ranger', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    w.kChain[RA] = w.globals[G.Tick];
    steps(m, A.passive.still + 2);
    expect(w.stealthT[RA]).toBeGreaterThan(0);
    expect(w.kEmpower[RA]).toBe(1);
    expect(kitOf(w, RA).basic!(m, RA, 3, 100)).toBe(true);
    kitOf(w, RA).afterBasic!(m, RA, 3);
    expect(w.kEmpower[RA]).toBe(0);
    expect(clips(m, 'camoshot')).toBe(1);
  });

  it('Tracer Ball stops at the first hero and reveals it', () => {
    const m = arena('ranger', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 5000, MID.y, 2048);
    place(m, 4, MID.x + 8000, MID.y, 2048);
    const b = w.hp[4];
    cast(m, RA, 0, MID.x + 8000, MID.y);
    steps(m, 30);
    expect(w.revealT[3]).toBeGreaterThan(0);
    expect(w.hp[4]).toBe(b);
  });

  it('Warning Bark knocks the cats in the cone back and slows them', () => {
    const m = arena('ranger', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    place(m, 3, MID.x + 1500, MID.y, 2048);
    cast(m, RA, 1, MID.x + 1500, MID.y);
    steps(m, 12);
    expect(w.x[3]).toBeGreaterThan(MID.x + 2500);
    expect(w.slowT[3]).toBeGreaterThan(0);
  });

  it('Bush Dive: a dash, hidden, and the Camouflage shot loaded', () => {
    const m = arena('ranger', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    cast(m, RA, 2, MID.x - 4000, MID.y);
    expect(w.stealthT[RA]).toBeGreaterThan(0);
    expect(w.kEmpower[RA]).toBe(1);
    steps(m, 10);
    expect(w.x[RA]).toBeLessThan(MID.x - 2000);
  });

  it('LONG SHOT: from far away, balls home in on the cat, which stays revealed; out of the leash it stops', () => {
    const m = arena('ranger', ['brutus', 'nugget'], ['clem', 'sage', 'clem']);
    const w = m.world;
    w.level[RA] = 4;
    place(m, 3, MID.x + 11000, MID.y, 2048);
    w.revealT[3] = 600;
    steps(m, 1);
    const hp = w.hp[3];
    cast(m, RA, 3, w.x[3], w.y[3], 3);
    // the windup event names the target (the render's scope locks on it)
    const ev = { type: 'windup' as const, tick: 0, src: RA, slot: 3 as const, x: 0, y: 0, ticks: A.r.windup } as { dst?: number } & Record<string, unknown>;
    kitOf(w, RA).onWindup!(m, RA, 3, ev as never);
    expect(ev.dst).toBe(3);
    steps(m, A.r.windup);
    expect(w.revealT[3]).toBeGreaterThan(0);
    expect(kitOf(w, RA).busy!(w, RA)).toBe(true);
    expect(hitsOver(m, A.r.gap * A.r.shots + 30, RA, 3)).toBeGreaterThanOrEqual(A.r.shots - 1);
    expect(w.hp[3]).toBeLessThan(hp);
  });
});
