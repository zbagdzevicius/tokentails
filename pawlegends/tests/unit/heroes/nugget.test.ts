import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { NUGGET } from '../../../src/data/heroes/nugget';
import { PROJECTILE_KIND } from '../../../src/data/towers';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { NUGGET_KIT, herdPoint } from '../../../src/sim/heroes/nugget';
import { snapshot } from '../../../src/sim/index';
import { attackRange, radiusOf } from '../../../src/sim/units/kinds';
import { FM, RANGE } from '../../../src/sim/world';
import { MID, cast, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Nugget (slot 0) with Brutus (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const NG = 0;
const ALLY = 1;
const ALLY2 = 2;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('nugget'));

function arena() {
  const m = heroMatch(['nugget', 'brutus', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, NG, MID.x, MID.y, 0);
  place(m, ALLY, MID.x - 20000, MID.y + 15000, 0);
  place(m, ALLY2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2);
  return m;
}

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.round(Math.hypot(ax - bx, ay - by));

describe('Nugget, original dog support (sim v13)', () => {
  it('data: a FAIRY dog support, index 12', () => {
    expect([NUGGET.side, NUGGET.role, NUGGET.element, NUGGET.name]).toEqual(['dog', 'support', 'FAIRY', 'Nugget']);
    expect(HERO_IDS.indexOf('nugget')).toBe(12);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([210, 390, 450, 2100]);
  });

  it('Treat Pouch: ready at the start; a basic on an enemy hero heals the most hurt ally near him, then it recharges', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x + 1000, MID.y, 0);
    place(m, ALLY2, MID.x - 1000, MID.y, 0);
    w.hp[ALLY] = w.maxHp[ALLY] >> 1;
    w.hp[ALLY2] = w.maxHp[ALLY2] - 10;
    expect(w.kValor[NG]).toBe(1);
    expect(snapshot(m, 0).entities.find((e) => e.id === NG)?.resource).toBe(255);
    const before = w.hp[ALLY];
    NUGGET_KIT.afterBasic!(m, NG, FOE);
    expect(w.hp[ALLY] - before).toBe(A.passive.heal);
    expect(w.kValor[NG]).toBe(0);
    expect(w.kHuntT[NG]).toBe(A.passive.every);
    // A basic on a minion or with the pouch empty does nothing.
    const again = w.hp[ALLY];
    NUGGET_KIT.afterBasic!(m, NG, FOE);
    expect(w.hp[ALLY]).toBe(again);
    steps(m, A.passive.every + 1);
    expect(w.kValor[NG]).toBe(1);
  });

  it('Frisbee: a piercing disc of its own projectile kind', () => {
    const m = arena();
    const w = m.world;
    cast(m, NG, 0, MID.x + 8000, MID.y);
    const p = [...w.pAlive].findIndex((a, i) => a === 1 && w.pOwner[i] === NG);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(w.pKind[p]).toBe(PROJECTILE_KIND.frisbee);
  });

  it('Best Friend: dashes to the ally nearest the aim, then shields and hastes them both', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x + 4000, MID.y, 0);
    cast(m, NG, 1, MID.x + 4000, MID.y);
    expect(w.fmKind[NG]).toBe(FM.Dash);
    steps(m, 10);
    expect(w.shield[ALLY]).toBeGreaterThan(0);
    expect(w.hasteT[ALLY]).toBeGreaterThan(0);
    expect(w.hasteT[NG]).toBeGreaterThan(0);
    expect(dist(w.x[NG], w.y[NG], w.x[ALLY], w.y[ALLY])).toBeLessThan(radiusOf(w, NG) + radiusOf(w, ALLY) + A.w.gap + 50);
  });

  it('Best Friend with no ally near: a solo hop and half the shield on himself (never fizzles)', () => {
    const m = arena();
    const w = m.world;
    cast(m, NG, 1, MID.x + 6000, MID.y);
    steps(m, 10);
    expect(w.x[NG]).toBe(MID.x + A.w.soloDash);
    expect(w.shield[NG]).toBe(A.w.shield >> 1);
  });

  it('Sploot: rooted, takes less, the Form bit, and allies within the radius heal over it', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x + 2000, MID.y, 0);
    w.hp[ALLY] = w.maxHp[ALLY] >> 1;
    const before = w.hp[ALLY];
    cast(m, NG, 2, MID.x, MID.y);
    expect(w.rootT[NG]).toBeGreaterThan(0);
    expect(snapshot(m, 0).entities.find((e) => e.id === NG)?.form).toBe(true);
    expect(NUGGET_KIT.incoming!(m, NG, FOE, 1000)).toBe(1000 - (1000 * A.e.reduceBp) / 10000);
    // The heal over time is queued on the ally (on top of any regeneration).
    expect(w.healT[ALLY]).toBe(A.e.duration);
    expect(w.healLeft[ALLY]).toBe(A.e.heal);
    steps(m, A.e.duration + 1);
    expect(w.healLeft[ALLY]).toBe(0);
    expect(w.hp[ALLY] - before).toBeGreaterThanOrEqual(A.e.heal);
    expect(snapshot(m, 0).entities.find((e) => e.id === NG)?.form === true).toBe(false);
  });

  it('Herding Time: enemy heroes in his ring skid toward the herd point and stop on it, hurt and slowed; allies speed up', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    place(m, FOE2, MID.x + 1000, MID.y + 3500, 2048);
    place(m, ALLY, MID.x - 1000, MID.y, 0);
    const hp = w.hp[FOE];
    // Herd point 1 m behind him: FOE is 4 m from it (pushed 2 m), FOE2 about 4.3 m (pushed 2 m).
    const px = MID.x - 1000;
    const py = MID.y;
    w.level[NG] = 4;
    cast(m, NG, 3, px, py);
    steps(m, A.r.windup + 8);
    expect(w.x[FOE]).toBe(MID.x + 3000 - A.r.push);
    expect(w.y[FOE]).toBe(MID.y);
    expect(dist(w.x[FOE2], w.y[FOE2], px, py)).toBeLessThan(dist(MID.x + 1000, MID.y + 3500, px, py));
    expect(hp - w.hp[FOE]).toBeGreaterThan(0);
    expect(w.slowBp[FOE]).toBe(A.r.slowBp);
    expect(w.hasteBp[ALLY]).toBe(A.r.allyHasteBp);
  });

  it('Herding Time: a foe closer to the point than the push stops on the point, never past it', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    w.level[NG] = 4;
    cast(m, NG, 3, MID.x + 500, MID.y);
    steps(m, A.r.windup + 8);
    expect(w.x[FOE]).toBe(MID.x + 500);
  });

  it('Herding Time: the herd point is clamped out of his own towers’ range + 1 m', () => {
    const m = arena();
    const w = m.world;
    // Team 0's first tower; Nugget beside it, aiming at the tower itself.
    let t = RANGE.towers;
    while (w.team[t] !== 0) t++;
    place(m, NG, w.x[t] + 2000, w.y[t], 0);
    const pt = herdPoint(w, NG, w.x[t] + 500, w.y[t]);
    const keep = attackRange(w, t) + radiusOf(w, t) + A.r.towerMargin;
    expect(dist(pt[0], pt[1], w.x[t], w.y[t])).toBeGreaterThanOrEqual(keep - 2);
  });
});
