import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { AVIETE } from '../../../src/data/heroes/aviete';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { BUSHES } from '../../../src/data/map';
import { snapshot } from '../../../src/sim/index';
import { isqrt } from '../../../src/sim/fixed';
import { G } from '../../../src/sim/world';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Avietė (slot 0) vs Clem (slot 3, armour 25) and Sage (slot 4, armour 15).
const AV = 0;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('aviete'));
const P = A.passive;
const BUSH = BUSHES[0];

function arena() {
  const m = heroMatch(['aviete', 'clem', 'sage', 'clem', 'sage', 'clem']);
  place(m, AV, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 2000, MID.y, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 20000, MID.y + 20000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2);
  return m;
}

describe('Avietė, shelter champion assassin (sim v9)', () => {
  it('data: an ELECTRIC cat assassin; no stealth in the kit', () => {
    expect([AVIETE.side, AVIETE.role, AVIETE.element, AVIETE.name]).toEqual(['cat', 'assassin', 'ELECTRIC', 'Avietė']);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([180, 420, 420, 1950]);
    expect(P).toEqual({ brushTime: 30, hold: 120, bonus: 60, bonusPerLevel: 10, stun: 15, lockout: 240 });
  });

  it('Shy, Then Shiny: 1 s in brush charges her; the next hit on a hero deals bonus damage and stuns; 8 s lockout', () => {
    const m = arena();
    const w = m.world;
    place(m, AV, BUSH.x, BUSH.y, 0);
    steps(m, P.brushTime - 2);
    expect(w.kRT[AV]).toBe(0);
    steps(m, 4);
    expect(w.kRT[AV]).toBe(P.hold);
    expect(snapshot(m, 1).entities.find((e) => e.id === AV)).toBeUndefined(); // hidden in brush: no glow for the enemy there
    // Out of brush the charge holds for 4 s, and both teams see the glow.
    place(m, AV, MID.x, MID.y, 0);
    steps(m, 2);
    expect(w.kRT[AV]).toBeGreaterThan(P.hold - 5);
    expect(snapshot(m, 1).entities.find((e) => e.id === AV)?.charged).toBe(true);
    const hp = w.hp[FOE];
    cast(m, AV, 0, MID.x + 2000, MID.y);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg + P.bonus, 25));
    expect(w.stunT[FOE]).toBeGreaterThan(0);
    expect([w.kRT[AV], w.kHuntT[AV] > 0]).toEqual([0, true]);
    // Locked out: back in brush she does not charge until the lockout ends.
    place(m, AV, BUSH.x, BUSH.y, 0);
    steps(m, P.brushTime + 5);
    expect(w.kRT[AV]).toBe(0);
    steps(m, P.lockout);
    expect(w.kRT[AV]).toBe(P.hold);
  });

  it('the charge runs out 4 s after she leaves brush', () => {
    const m = arena();
    const w = m.world;
    place(m, AV, BUSH.x, BUSH.y, 0);
    steps(m, P.brushTime + 2);
    place(m, AV, MID.x - 10000, MID.y, 0);
    steps(m, P.hold + 2);
    expect(w.kRT[AV]).toBe(0);
  });

  it('Shiny Coat: charged at once and +20% speed, unless locked out', () => {
    const m = arena();
    const w = m.world;
    cast(m, AV, 1, MID.x, MID.y);
    expect(w.kRT[AV]).toBeGreaterThan(0);
    expect(w.hasteBp[AV]).toBe(A.w.speedBp);
    expect(cd(m, AV, 1)).toBe(A.w.cooldown);
    w.kRT[AV] = 0;
    w.kHuntT[AV] = 100;
    w.cooldowns[1] = 0;
    cast(m, AV, 1, MID.x, MID.y);
    expect(w.kRT[AV]).toBe(0);
  });

  it('Live Wire: blink up to 4.5 m; a recast within 2 s blinks back; the cooldown starts at the return or when the window closes', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 20000, MID.y + 5000, 2048);
    cast(m, AV, 2, MID.x - 9000, MID.y);
    expect(w.x[AV]).toBe(MID.x - A.e.blink);
    expect(cd(m, AV, 2)).toBe(0);
    steps(m, 10);
    cast(m, AV, 2, MID.x, MID.y);
    expect([w.x[AV], w.y[AV]]).toEqual([MID.x, MID.y]);
    expect(cd(m, AV, 2)).toBe(A.e.cooldown);

    // Unused: the window closes and the cooldown counts from the cast.
    const m2 = arena();
    cast(m2, AV, 2, MID.x - 9000, MID.y);
    const at = m2.world.globals[G.Tick];
    steps(m2, A.e.recastWindow + 2);
    expect(m2.world.kStage[AV]).toBe(0);
    const elapsed = m2.world.globals[G.Tick] - at;
    expect(Math.abs(cd(m2, AV, 2) - (A.e.cooldown - elapsed))).toBeLessThanOrEqual(2);
  });

  it('Short Circuit: blinks beside an enemy hero, hits it, slows heroes near the landing; the return to the cast point keeps the E cooldown', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, AV, 4);
    place(m, FOE, MID.x + 5500, MID.y, 2048);
    place(m, FOE2, MID.x + 7000, MID.y + 1000, 2048);
    w.cooldowns[2] = 200; // Live Wire on cooldown
    const hp = w.hp[FOE];
    cast(m, AV, 3, MID.x + 5500, MID.y, FOE);
    const d = isqrt((w.x[AV] - w.x[FOE]) ** 2 + (w.y[AV] - w.y[FOE]) ** 2);
    expect(d).toBeLessThanOrEqual(1100);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.r.dmg + 3 * A.r.dmgPerLevel, 25));
    expect([w.slowBp[FOE], w.slowBp[FOE2]]).toEqual([A.r.slowBp, A.r.slowBp]);
    expect(w.kStage[AV]).toBe(2);
    const ecd = cd(m, AV, 2);
    cast(m, AV, 2, MID.x, MID.y); // the recast is open although E is on cooldown
    expect([w.x[AV], w.y[AV]]).toEqual([MID.x, MID.y]);
    expect(cd(m, AV, 2)).toBe(ecd - 1);
    expect(cd(m, AV, 3)).toBeGreaterThan(0);
  });

  it('snapshot: the open E return shows E ready and never Q (display matches canCast)', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 20000, MID.y + 5000, 2048);
    const mine = () => snapshot(m, 0).entities.find((e) => e.id === AV)!.cooldowns!;
    cast(m, AV, 0, MID.x + 2000, MID.y);
    cast(m, AV, 2, MID.x - 9000, MID.y);
    expect(w.kWindow[AV]).toBeGreaterThan(0);
    expect(mine()[0]).toBeGreaterThan(0);
    expect(mine()[2]).toBe(0);

    // After Short Circuit with E on cooldown, the return shows E ready.
    const m2 = arena();
    setLevel(m2, AV, 4);
    place(m2, FOE, MID.x + 5500, MID.y, 2048);
    m2.world.cooldowns[2] = 200;
    cast(m2, AV, 3, MID.x + 5500, MID.y, FOE);
    expect(m2.world.kStage[AV]).toBe(2);
    expect(m2.world.cooldowns[2]).toBeGreaterThan(0);
    expect(snapshot(m2, 0).entities.find((e) => e.id === AV)!.cooldowns![2]).toBe(0);
  });

});
