import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { GABE } from '../../../src/data/heroes/gabe';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { EFFECTS } from '../../../src/data/effects';
import { dealDamage } from '../../../src/sim/combat/damage';
import { isqrt } from '../../../src/sim/fixed';
import { snapshot } from '../../../src/sim/index';
import { Kind } from '../../../src/sim/world';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Gabė (slot 0) with Clem (1) and Sage (2) vs Clem (slot 3, armour 25) and Sage (slot 4).
const GB = 0;
const ALLY = 1;
const ALLY2 = 2;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('gabe'));
const P = A.passive;

function arena() {
  const m = heroMatch(['gabe', 'clem', 'sage', 'clem', 'sage', 'clem']);
  place(m, GB, MID.x, MID.y, 0);
  place(m, ALLY, MID.x - 20000, MID.y + 15000, 0);
  place(m, ALLY2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 4000, MID.y, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 20000, MID.y + 20000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2);
  return m;
}

const dist = (m: ReturnType<typeof arena>, a: number, b: number): number => isqrt((m.world.x[a] - m.world.x[b]) ** 2 + (m.world.y[a] - m.world.y[b]) ** 2);

describe('Gabė, shelter champion support (sim v9)', () => {
  it('data: a WIND cat support; the charm is 1 s', () => {
    expect([GABE.side, GABE.role, GABE.element, GABE.name]).toEqual(['cat', 'support', 'WIND', 'Gabė']);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([210, 360, 420, 2100]);
    expect([A.r.charm, A.r.windup]).toEqual([30, 15]);
  });

  it('Heart Breeze: a basic hit on a hero heals the allied hero with the lowest HP share within 6 m (her included)', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x - 2000, MID.y, 0);
    place(m, ALLY2, MID.x - 3000, MID.y, 0);
    w.hp[ALLY] = w.maxHp[ALLY] >> 1;
    w.hp[ALLY2] = w.maxHp[ALLY2] >> 2;
    const before = w.hp[ALLY2];
    dealDamage(m, GB, 0, Kind.Hero, FOE, 50, 'basic');
    expect(w.hp[ALLY2] - before).toBe(P.heal);
    // An ability hit does not heal.
    const again = w.hp[ALLY2];
    dealDamage(m, GB, 0, Kind.Hero, FOE, 50, 'ability');
    expect(w.hp[ALLY2]).toBe(again);
    // Out of 6 m: the weakest in range (Gabė herself when she is lower).
    place(m, ALLY2, MID.x - 9000, MID.y, 0);
    w.hp[GB] = 10;
    dealDamage(m, GB, 0, Kind.Hero, FOE, 50, 'basic');
    expect(w.hp[GB]).toBe(10 + P.heal);
  });

  it('Heart Balloon: pops after 0.5 s in a 2.2 m disc, damaging enemies and healing allied heroes', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    place(m, ALLY, MID.x + 5000, MID.y + 1500, 0);
    const hp = w.hp[FOE];
    cast(m, GB, 0, MID.x + 5000, MID.y);
    expect(w.hp[FOE]).toBe(hp);
    // The pop: count only the balloon's heal (out-of-combat regen also ticks once a second).
    let healed = 0;
    for (let t = 0; t < A.q.arm + 1; t++) {
      w.hp[ALLY] = 100;
      steps(m, 1);
      if (m.events.some((e) => e.type === 'hit' && e.src === GB && e.dst === FOE)) healed = w.hp[ALLY] - 100;
    }
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, 25));
    expect(healed).toBe(A.q.heal);
    steps(m, 30);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, 25)); // one pulse only
    expect(cd(m, GB, 0)).toBeGreaterThan(0);
  });

  it('Wing Wrap: shield and speed on the allied hero nearest the aim, else on herself', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x - 4000, MID.y, 0);
    cast(m, GB, 1, MID.x - 3500, MID.y + 500);
    expect(w.shield[ALLY]).toBe(A.w.shield);
    expect(w.hasteBp[ALLY]).toBe(A.w.hasteBp);
    expect(w.shield[GB]).toBe(0);
    // Aimed where no ally stands (within 2.5 m of the point): herself, and Gabė does not walk.
    const m2 = arena();
    setLevel(m2, GB, 2);
    cast(m2, GB, 1, MID.x + 30000, MID.y);
    expect(m2.world.shield[GB]).toBe(A.w.shield + A.w.shieldPerLevel);
    expect(m2.world.x[GB]).toBe(MID.x);
  });

  it('Chase the Wind: dash 4 m; allied heroes she passes get +25% speed', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x - 2000, MID.y + 800, 0);
    cast(m, GB, 2, MID.x - 9000, MID.y);
    steps(m, 8);
    expect(w.x[GB]).toBe(MID.x - A.e.dash);
    expect(w.hasteBp[ALLY]).toBe(A.e.hasteBp);
  });

  it('Under Her Spell: charmed heroes walk toward Gabė at half speed, stop within 1 m, cannot act; the charm ends if she dies', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, GB, 4);
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    place(m, FOE2, MID.x + 3000, MID.y + 4000, 2048); // outside the 90° cone
    cast(m, GB, 3, MID.x + 3000, MID.y);
    steps(m, A.r.windup);
    expect(w.fearT[FOE]).toBeGreaterThan(0);
    expect(w.fearSrc[FOE]).toBe(GB);
    expect(w.slowBp[FOE]).toBe(A.r.slowBp);
    expect(w.fearT[FOE2]).toBe(0);
    expect(snapshot(m, 0).entities.find((e) => e.id === FOE)?.charmed).toBe(true);
    const d0 = dist(m, GB, FOE);
    steps(m, 10);
    expect(dist(m, GB, FOE)).toBeLessThan(d0);
    steps(m, 20);
    expect(dist(m, GB, FOE)).toBeGreaterThanOrEqual(EFFECTS.charmStop - 200);
    expect(w.fearT[FOE]).toBe(0);
    expect(w.fearSrc[FOE]).toBe(-1);

    const m2 = arena();
    const w2 = m2.world;
    setLevel(m2, GB, 4);
    place(m2, FOE, MID.x + 5000, MID.y, 2048);
    cast(m2, GB, 3, MID.x + 5000, MID.y);
    steps(m2, A.r.windup);
    expect(w2.fearT[FOE]).toBeGreaterThan(0);
    w2.hp[GB] = 1;
    dealDamage(m2, FOE2, 1, Kind.Hero, GB, 500, 'basic');
    steps(m2, 2);
    expect(w2.alive[GB]).toBe(0);
    expect([w2.fearT[FOE], w2.fearSrc[FOE]]).toEqual([0, -1]);
  });

  it('a charm that stops short: the charmed hero never walks inside 1 m', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, GB, 4);
    place(m, FOE, MID.x + 1600, MID.y, 2048);
    cast(m, GB, 3, MID.x + 1600, MID.y);
    steps(m, A.r.windup + 25);
    expect(dist(m, GB, FOE)).toBeGreaterThanOrEqual(EFFECTS.charmStop);
    expect(w.x[FOE]).toBeGreaterThan(w.x[GB]);
  });
});
