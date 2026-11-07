import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { DOMINO } from '../../../src/data/heroes/domino';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { kitOf } from '../../../src/sim/heroes/kit';
import { dotsPath } from '../../../src/sim/heroes/domino';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { addStack } from '../../../src/sim/effects';
import { snapshot } from '../../../src/sim/index';
import { hashedArrays } from '../../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Domino (slot 0) with Duchess (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const DM = 0;
const FOE = 3;
const FOE2 = 4;
const FOE3 = 5;
const A = baseNumbers(HERO_IDS.indexOf('domino'));

function arena() {
  const m = heroMatch(['domino', 'duchess', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, DM, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, FOE3, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, DM, FOE, FOE2, FOE3);
  return m;
}

const kit = (m: ReturnType<typeof arena>) => kitOf(m.world, DM);

describe('Domino, original dog mage (sim v15)', () => {
  it('data: a STELLAR dog mage, index 19; the Spot arrays are hashed', () => {
    expect([DOMINO.side, DOMINO.role, DOMINO.element, DOMINO.name]).toEqual(['dog', 'mage', 'STELLAR', 'Domino']);
    expect(HERO_IDS.indexOf('domino')).toBe(19);
    const w = arena().world;
    const hashed = hashedArrays(w);
    expect(hashed).toContain(w.dotN);
    expect(hashed).toContain(w.dotT);
  });

  it('Spot On: ability hits stack Spots to max and refresh; a basic adds none; they expire; the snapshot shows them', () => {
    const m = arena();
    const w = m.world;
    for (let i = 0; i < 5; i++) kit(m).afterDeal!(m, DM, FOE, 10, 'ability');
    expect(w.dotN[FOE]).toBe(A.passive.max);
    kit(m).afterDeal!(m, DM, FOE2, 10, 'basic');
    expect(w.dotN[FOE2]).toBe(0);
    expect(snapshot(m, 1).entities.find((e) => e.id === FOE)?.dots).toBe(A.passive.max);
    expect(snapshot(m, 0).entities.find((e) => e.id === DM)?.resource).toBe(A.passive.max);
    steps(m, A.passive.ttl);
    expect(w.dotN[FOE]).toBe(0);
  });

  it('Spot On: each Spot adds to his damage on that hero', () => {
    const m = arena();
    const w = m.world;
    w.dotN[FOE] = 2;
    expect(kit(m).outgoing!(m, DM, FOE, 1000)).toBe(1000 + (2 * A.passive.perDotBp) / 10);
    expect(kit(m).outgoing!(m, DM, FOE2, 1000)).toBe(1000);
  });

  it('Splatter: the pulse adds a Spot and slows', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    cast(m, DM, 1, MID.x + 5000, MID.y);
    steps(m, A.w.windup + 1);
    expect(w.dotN[FOE]).toBe(1);
    expect(w.slowBp[FOE]).toBe(A.w.slowBp);
  });

  it('Splatter: no Spot when Domino died before the pulse (the zone still hits)', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    // Duchess keeps the team's sight on the cat once Domino is down (vision decides what a zone can hit).
    place(m, 1, MID.x + 2000, MID.y + 2000, 0);
    const hp = w.hp[FOE];
    cast(m, DM, 1, MID.x + 5000, MID.y);
    w.hp[DM] = 0;
    steps(m, A.w.windup + 1);
    expect(w.alive[DM]).toBe(0);
    expect(w.hp[FOE]).toBeLessThan(hp);
    expect(w.dotN[FOE]).toBe(0);
  });

  it('Big Shake: knocks enemies back and clears his slow (only)', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    w.slowT[DM] = 60;
    w.slowBp[DM] = 3000;
    w.rootT[DM] = 30;
    cast(m, DM, 2, MID.x, MID.y);
    expect(w.slowBp[DM]).toBe(0);
    expect(w.rootT[DM]).toBeGreaterThan(0);
    expect(w.dotN[FOE]).toBe(1);
    steps(m, 12);
    expect(w.x[FOE]).toBeGreaterThan(MID.x + 1500 + A.e.push / 2);
  });

  it('CONNECT THE DOTS!: nearest first along the chain (id tie-break), damage and root by Spots, a line slows others once, Spots used up', () => {
    const m = arena();
    const w = m.world;
    w.level[DM] = 4;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    place(m, FOE2, MID.x + 9000, MID.y, 2048);
    // FOE3 stands on the FOE → FOE2 link with no Spot.
    place(m, FOE3, MID.x + 6000, MID.y + 200, 2048);
    w.dotN[FOE] = 1;
    w.dotT[FOE] = 100;
    w.dotN[FOE2] = 3;
    w.dotT[FOE2] = 100;
    const hp = [w.hp[FOE], w.hp[FOE2], w.hp[FOE3]];
    cast(m, DM, 3, MID.x, MID.y);
    let dots = 0;
    for (let t = 0; t < A.r.windup; t++) {
      steps(m, 1);
      dots += m.events.filter((e) => e.type === 'clip' && e.what === 'dots').length;
    }
    expect(dotsPath()).toEqual([FOE, FOE2]);
    expect(w.rootT[FOE]).toBeGreaterThanOrEqual(A.r.root + A.r.rootPerDot - 1);
    expect(w.rootT[FOE2]).toBeGreaterThanOrEqual(A.r.root + 3 * A.r.rootPerDot - 1);
    expect(hp[1] - w.hp[FOE2]).toBeGreaterThan(hp[0] - w.hp[FOE]);
    expect(w.hp[FOE3]).toBeLessThan(hp[2]);
    expect(w.slowBp[FOE3]).toBe(A.r.slowBp);
    expect(w.rootT[FOE3]).toBe(0);
    expect([w.dotN[FOE], w.dotN[FOE2], w.dotN[FOE3]]).toEqual([0, 0, 0]);
    expect(dots).toBe(1);
  });

  it('CONNECT THE DOTS!: with no Spotted hero it links the nearest enemy hero; with none in range it fizzles (no cooldown)', () => {
    const m = arena();
    const w = m.world;
    w.level[DM] = 4;
    cast(m, DM, 3, MID.x, MID.y);
    steps(m, A.r.windup);
    expect(cd(m, DM, 3)).toBe(0);
    place(m, FOE2, MID.x + 6000, MID.y, 2048);
    place(m, FOE, MID.x + 8000, MID.y, 2048);
    cast(m, DM, 3, MID.x, MID.y);
    steps(m, A.r.windup);
    expect(dotsPath()).toEqual([FOE2]);
    expect(cd(m, DM, 3)).toBeGreaterThan(0);
    expect(m.events.some((e) => e.type === 'clip' && e.what === 'dots')).toBe(false);
  });

  it('his death clears his Spots; a Duchess on his team keeps her own Disdain counter', () => {
    const m = arena();
    const w = m.world;
    kit(m).afterDeal!(m, DM, FOE, 10, 'ability');
    addStack(w, FOE, 2, 3, 100);
    expect([w.dotN[FOE], w.mkStack[FOE]]).toEqual([1, 2]);
    w.hp[DM] = 0;
    steps(m, 1);
    expect(w.dotN[FOE]).toBe(0);
    expect(w.mkStack[FOE]).toBe(2);
  });
});
