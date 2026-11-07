import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { FRANKIE } from '../../../src/data/heroes/frankie';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { kitOf } from '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { targetable } from '../../../src/sim/units/kinds';
import { dist2, idiv, isqrt } from '../../../src/sim/fixed';
import { FM } from '../../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Frankie (slot 0) with Brutus (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const FR = 0;
const FOE = 3;
const FOE2 = 4;
const FOE3 = 5;
const A = baseNumbers(HERO_IDS.indexOf('frankie'));

function arena() {
  const m = heroMatch(['frankie', 'brutus', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, FR, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, FOE3, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FR, FOE, FOE2, FOE3);
  return m;
}

const kit = (m: ReturnType<typeof arena>) => kitOf(m.world, FR);

describe('Frankie, original dog assassin (sim v15)', () => {
  it('data: a FIRE dog assassin, index 18', () => {
    expect([FRANKIE.side, FRANKIE.role, FRANKIE.element, FRANKIE.name]).toEqual(['dog', 'assassin', 'FIRE', 'Frankie']);
    expect(HERO_IDS.indexOf('frankie')).toBe(18);
  });

  it('Ketchup and Mustard: an ability and a basic on the same hero (either order) add a Combo, then the lockout', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    let hp = w.hp[FOE];
    kit(m).afterDeal!(m, FR, FOE, 10, 'ability');
    kit(m).afterDeal!(m, FR, FOE, 10, 'ability');
    expect(w.hp[FOE]).toBe(hp);
    kit(m).afterDeal!(m, FR, FOE, 10, 'basic');
    expect(w.hp[FOE]).toBeLessThan(hp);
    expect(w.kHuntT[FR]).toBe(A.passive.lockout);
    // The Combo hit itself never starts a new half (it does not chain), and the lockout blocks the next one.
    hp = w.hp[FOE];
    kit(m).afterDeal!(m, FR, FOE, 10, 'basic');
    kit(m).afterDeal!(m, FR, FOE, 10, 'ability');
    expect(w.hp[FOE]).toBe(hp);
    w.kHuntT[FR] = 0;
    kit(m).afterDeal!(m, FR, FOE, 10, 'basic');
    kit(m).afterDeal!(m, FR, FOE, 10, 'ability');
    expect(w.hp[FOE]).toBeLessThan(hp);
    // A different hero breaks the pair; the window runs out.
    w.kHuntT[FR] = 0;
    hp = w.hp[FOE];
    kit(m).afterDeal!(m, FR, FOE, 10, 'basic');
    kit(m).afterDeal!(m, FR, FOE2, 10, 'ability');
    kit(m).afterDeal!(m, FR, FOE, 10, 'ability');
    expect(w.hp[FOE]).toBe(hp);
    steps(m, A.passive.window + 1);
    const later = w.hp[FOE];
    kit(m).afterDeal!(m, FR, FOE, 10, 'basic');
    expect(w.hp[FOE]).toBe(later);
  });

  it('Weenie Roll: stops at the first enemy hero and knocks it back', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 2500, MID.y, 2048);
    place(m, FOE2, MID.x + 4000, MID.y, 2048);
    const hp = w.hp[FOE];
    const hp2 = w.hp[FOE2];
    cast(m, FR, 0, MID.x + 4500, MID.y);
    steps(m, 12);
    expect(w.hp[FOE]).toBeLessThan(hp);
    expect(w.hp[FOE2]).toBe(hp2);
    expect(w.x[FR]).toBeLessThan(MID.x + 2500);
    expect(w.x[FOE]).toBeGreaterThan(MID.x + 2500);
  });

  it('Dig: untargetable for the whole travel, the stun only on the pop', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 6000, MID.y, 2048);
    cast(m, FR, 1, MID.x + 6000, MID.y);
    const travel = 6000 * 30 / A.w.speed;
    for (let t = 0; t < travel - 2; t++) {
      expect(targetable(w, FR, w.team[FOE])).toBe(false);
      expect(w.stunT[FOE]).toBe(0);
      steps(m, 1);
    }
    steps(m, 4);
    expect(w.kStage[FR]).toBe(0);
    expect(w.stunT[FOE]).toBeGreaterThan(0);
  });

  it('Bun Hop: clears his slow and hastes him', () => {
    const m = arena();
    const w = m.world;
    w.slowT[FR] = 60;
    w.slowBp[FR] = 3000;
    cast(m, FR, 2, MID.x - 3000, MID.y);
    expect(w.slowBp[FR]).toBe(0);
    expect(w.hasteBp[FR]).toBe(A.e.hasteBp);
  });

  it('FOOTLONG!: stuns the first hero, then he snaps beside it before the stun ends; one clip per grab', () => {
    const m = arena();
    const w = m.world;
    w.level[FR] = 4;
    place(m, FOE, MID.x + 8500, MID.y, 2048);
    cast(m, FR, 3, MID.x + 8500, MID.y);
    let stunAt = -1;
    let clips = 0;
    for (let t = 0; t < 30 && stunAt < 0; t++) {
      steps(m, 1);
      clips += m.events.filter((e) => e.type === 'clip' && e.what === 'footlong').length;
      if (w.stunT[FOE] > 0) stunAt = t;
    }
    expect(stunAt).toBeGreaterThanOrEqual(0);
    expect(w.kHuntVictim[FR]).toBe(FOE);
    expect(clips).toBe(1);
    for (let t = 0; t < 20 && w.fmKind[FR] !== FM.None; t++) steps(m, 1);
    expect(w.stunT[FOE]).toBeGreaterThan(0);
    expect(isqrt(dist2(w.x[FR], w.y[FR], w.x[FOE], w.y[FOE]))).toBeLessThan(1500);
  });

  it('FOOTLONG!: a Q roll hit during the flight is not the grab', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    w.kWT[FR] = 5;
    w.fmKind[FR] = FM.Dash;
    kit(m).afterDeal!(m, FR, FOE, 10, 'ability');
    expect(w.stunT[FOE]).toBe(0);
    expect(w.kHuntVictim[FR]).toBe(-1);
  });

  it('FOOTLONG!: a miss gives back 40% of the cooldown exactly, and no clip', () => {
    const m = arena();
    const w = m.world;
    w.level[FR] = 4;
    cast(m, FR, 3, MID.x, MID.y - 9000);
    let clips = 0;
    for (let t = 0; t < 40; t++) {
      steps(m, 1);
      clips += m.events.filter((e) => e.type === 'clip' && e.what === 'footlong').length;
    }
    const r = A.r;
    expect(cd(m, FR, 3)).toBeLessThanOrEqual(idiv(r.cooldown * (10000 - r.missRefundBp), 10000));
    expect(cd(m, FR, 3)).toBeGreaterThan(idiv(r.cooldown * (10000 - r.missRefundBp), 10000) - 40);
    expect(clips).toBe(0);
  });
});
