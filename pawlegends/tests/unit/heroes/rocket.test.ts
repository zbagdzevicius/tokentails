import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { ROCKET } from '../../../src/data/heroes/rocket';
import { PROJECTILE_KIND } from '../../../src/data/towers';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { canCast, kitBusy, kitOf } from '../../../src/sim/heroes/kit';
import { abil, baseNumbers } from '../../../src/sim/heroes/talents';
import { targetable } from '../../../src/sim/units/kinds';
import { stun } from '../../../src/sim/effects';
import { applyBp, dist2 } from '../../../src/sim/fixed';
import { FM, TALENT_TIERS } from '../../../src/sim/world';
import { MID, cast, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Rocket (slot 0) with Brutus (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const RK = 0;
const FOE = 3;
const FOE2 = 4;
const FOE3 = 5;
const A = baseNumbers(HERO_IDS.indexOf('rocket'));

function arena() {
  const m = heroMatch(['rocket', 'brutus', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, RK, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, FOE3, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, RK, FOE, FOE2, FOE3);
  return m;
}

const kit = (m: ReturnType<typeof arena>) => kitOf(m.world, RK);

/** Damage of the basic bolt Rocket fired (the newest hero bolt he owns), or −1. */
function boltDmg(m: ReturnType<typeof arena>): number {
  const w = m.world;
  for (let p = w.pAlive.length - 1; p >= 0; p--) if (w.pAlive[p] === 1 && w.pOwner[p] === RK && w.pKind[p] === PROJECTILE_KIND.hero) return w.pDmg[p];
  return -1;
}

describe('Rocket, original dog marksman (sim v15)', () => {
  it('data: a GRASS dog marksman, index 17', () => {
    expect([ROCKET.side, ROCKET.role, ROCKET.element, ROCKET.name]).toEqual(['dog', 'marksman', 'GRASS', 'Rocket']);
    expect(HERO_IDS.indexOf('rocket')).toBe(17);
  });

  it('Sighthound: a basic on an enemy hero 4.5 m or more away hits harder; a close one or a minion target does not', () => {
    const m = arena();
    place(m, FOE, MID.x + A.passive.range + 100, MID.y, 2048);
    expect(kit(m).basic!(m, RK, FOE, 100)).toBe(true);
    expect(boltDmg(m)).toBe(applyBp(100, A.passive.bonusBp));
    place(m, FOE, MID.x + A.passive.range - 1000, MID.y, 2048);
    expect(kit(m).basic!(m, RK, FOE, 100)).toBe(false);
  });

  it('Lure Shot: a hero hit reveals it and hastes him; his SQUIRREL! hit does not (the in-kit guard)', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    const hp = w.hp[FOE];
    cast(m, RK, 0, MID.x + 5000, MID.y);
    steps(m, 12);
    expect(w.hp[FOE]).toBeLessThan(hp);
    expect(w.revealT[FOE]).toBeGreaterThan(0);
    expect(w.hasteBp[RK]).toBe(A.q.hasteBp);
    w.hasteT[RK] = 0;
    w.hasteBp[RK] = 0;
    cast(m, RK, 2, MID.x + 5000, MID.y);
    steps(m, A.e.windup + 1);
    expect(w.hasteBp[RK]).toBe(0);
  });

  it('Photo Finish: the next basic hits harder and slows, once; the load expires', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 9000, MID.y, 2048);
    cast(m, RK, 1, MID.x + 3000, MID.y);
    expect(w.kWindow[RK]).toBe(A.w.window);
    place(m, FOE, w.x[RK] + 2000, w.y[RK], 2048);
    expect(kit(m).basic!(m, RK, FOE, 100)).toBe(true);
    expect(boltDmg(m)).toBe(applyBp(100, A.w.bonusBp));
    kit(m).afterBasic!(m, RK, FOE);
    expect(w.slowBp[FOE]).toBe(A.w.slowBp);
    expect(w.kWindow[RK]).toBe(0);
    expect(kit(m).basic!(m, RK, FOE, 100)).toBe(false);
    cast(m, RK, 1, MID.x, MID.y);
    steps(m, A.w.window + 1);
    expect(w.kWindow[RK]).toBe(0);
  });

  it('SQUIRREL!: caught heroes end closer to the toy; a CC-immune hero is not moved; one outside the ring is not hit', () => {
    const m = arena();
    const w = m.world;
    const px = MID.x + 5000;
    const py = MID.y;
    place(m, FOE, px + 1800, py, 2048);
    place(m, FOE2, px, py - 1800, 2048);
    place(m, FOE3, px + 6000, py + 6000, 2048);
    w.ccImmT[FOE2] = 200;
    const d0 = dist2(w.x[FOE], w.y[FOE], px, py);
    const hp3 = w.hp[FOE3];
    const hp2 = w.hp[FOE2];
    cast(m, RK, 2, px, py);
    steps(m, A.e.windup);
    expect(w.fearT[FOE]).toBeGreaterThan(0);
    expect(w.hp[FOE2]).toBeLessThan(hp2);
    expect(w.fearT[FOE2]).toBe(0);
    steps(m, A.e.lure);
    expect(dist2(w.x[FOE], w.y[FOE], px, py)).toBeLessThan(d0);
    expect(w.x[FOE2]).toBe(px);
    expect(w.y[FOE2]).toBe(py - 1800);
    expect(w.hp[FOE3]).toBe(hp3);
  });

  it('ZOOM… ZZZ: untargetable, each hero hit once and Clocked; then always the nap (busy, tougher), one zzz clip', () => {
    const m = arena();
    const w = m.world;
    w.level[RK] = 4;
    place(m, FOE, MID.x + 4000, MID.y, 2048);
    place(m, FOE2, MID.x + 7000, MID.y + 300, 2048);
    const hp = w.hp[FOE];
    cast(m, RK, 3, MID.x + 11000, MID.y);
    steps(m, A.r.windup);
    expect(w.kStage[RK]).toBe(1);
    expect(targetable(w, RK, w.team[FOE])).toBe(false);
    let zzz = 0;
    for (let t = 0; t < 20; t++) {
      steps(m, 1);
      zzz += m.events.filter((e) => e.type === 'clip' && e.what === 'zzz').length;
    }
    expect(w.kStage[RK]).toBe(0);
    expect(w.kRT[RK]).toBeGreaterThan(0);
    const once = hp - w.hp[FOE];
    expect(once).toBeGreaterThan(0);
    expect(w.kCount[RK] & (1 << FOE)).not.toBe(0);
    expect(w.kCount[RK] & (1 << FOE2)).not.toBe(0);
    // Clocked: his basics on that hero hit harder (Sighthound off: close by).
    place(m, FOE, w.x[RK] + 2000, w.y[RK], 2048);
    expect(kit(m).basic!(m, RK, FOE, 100)).toBe(true);
    expect(boltDmg(m)).toBe(applyBp(100, A.r.clockedBp));
    // The nap: no cast, no move, no basic even when CC-immune; half damage.
    w.ccImmT[RK] = 100;
    expect(kitBusy(w, RK)).toBe(true);
    expect(canCast(w, RK, 0)).toBe(false);
    expect(kit(m).incoming!(m, RK, FOE, 1000)).toBe(applyBp(1000, 10000 - A.r.napReduceBp));
    expect(zzz).toBe(1);
    steps(m, A.r.nap + 1);
    expect(kitBusy(w, RK)).toBe(false);
  });

  it('ZOOM… ZZZ: a sprint cut short by a stun still ends in the nap', () => {
    const m = arena();
    const w = m.world;
    w.level[RK] = 4;
    cast(m, RK, 3, MID.x + 11000, MID.y);
    steps(m, A.r.windup + 2);
    expect(w.fmKind[RK]).toBe(FM.Dash);
    stun(w, RK, 10);
    steps(m, 1);
    expect(w.kRT[RK]).toBeGreaterThan(0);
    expect(m.events.some((e) => e.type === 'clip' && e.what === 'zzz')).toBe(true);
  });

  it('ZOOM… ZZZ: a root refuses it like every other dash (QA v15)', () => {
    const m = arena();
    const w = m.world;
    w.level[RK] = 4;
    w.rootT[RK] = 60;
    expect(canCast(w, RK, 1)).toBe(false);
    expect(canCast(w, RK, 3)).toBe(false);
    w.rootT[RK] = 0;
    expect(canCast(w, RK, 3)).toBe(true);
  });

  it('Power Nap: the nap heals', () => {
    const m = arena();
    const w = m.world;
    w.level[RK] = 9;
    w.talents[RK * TALENT_TIERS + 2] = 0;
    expect(abil(w, RK).r.napHealBp).toBe(1200);
    w.hp[RK] = w.maxHp[RK] >> 1;
    cast(m, RK, 3, MID.x + 11000, MID.y);
    steps(m, 30);
    expect(w.healLeft[RK] + w.hp[RK]).toBeGreaterThan(w.maxHp[RK] >> 1);
  });
});
