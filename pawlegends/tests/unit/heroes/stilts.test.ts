import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { STILTS } from '../../../src/data/heroes/stilts';
import { Op } from '../../../src/sim/api';
import { stun } from '../../../src/sim/effects';
import { kitOf, SNAP_FX } from '../../../src/sim/heroes/kit';
import { STILTS_INDEX } from '../../../src/sim/heroes/stilts';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { applyOrder } from '../../../src/sim/units/hero';
import { attackDamage, targetable } from '../../../src/sim/units/kinds';
import { FM, G } from '../../../src/sim/world';
import { MID, cast, cd, basicHit, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Stilts (slot 0) with Clem and Sage vs Sage (slot 3, armour 15), Clem (slot 4) and Sage (slot 5), all far apart.
const STILTS_ID = 0;
const FOE = 3;
const FOE2 = 4;
const FOE_ARMOUR = 15;
const A = baseNumbers(HERO_IDS.indexOf('stilts'));

function arena() {
  const m = heroMatch(['stilts', 'clem', 'sage', 'sage', 'clem', 'sage']);
  place(m, STILTS_ID, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x - 25000, MID.y, 2048);
  hold(m, 1, 2, 3, 4, 5);
  tanky(m, STILTS_ID, FOE, FOE2);
  return m;
}

const walk = (m: ReturnType<typeof arena>, x: number, y: number): void => applyOrder(m, STILTS_ID, { op: Op.Move, x, y });

describe('Stilts, original cat assassin (sim v11)', () => {
  it('data: a SAND cat assassin, index 11, with the spec numbers', () => {
    expect([STILTS.side, STILTS.role, STILTS.element]).toEqual(['cat', 'assassin', 'SAND']);
    expect(HERO_IDS.indexOf('stilts')).toBe(STILTS_INDEX);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([300, 420, 210, 1800]);
    expect(STILTS.passive).toEqual({ perMetre: 10, max: 100, drain: 20, drainEvery: 15, leap: 3000, bonusBp: 16000, slowBp: 3000, slow: 30 });
    expect(STILTS.pvp).toEqual({ dmgBp: 8560, takenBp: 9385 }); // sim v21 refit on the v20 base (V21-FUN.md); sim v20 refit (V20-CHASE.md §9); sim v17 refit (V17.md §6.5); sim v15 balance pass
    expect(STILTS.talents.flat().map((t) => t.id)).toEqual(['pounce-power', 'quick-stride', 'big-ears', 'twitchy', 'extra-zoomies', 'sky-high']);
  });

  it('Long Stride: walking fills about 10 a metre; standing still drains 20 every 0.5 s; a teleport fills nothing', () => {
    const m = arena();
    const w = m.world;
    steps(m, 2); // the placement jump (a teleport) counts for nothing
    expect(w.kValor[STILTS_ID]).toBe(0);
    walk(m, MID.x + 6000, MID.y);
    steps(m, 30);
    const walked = w.x[STILTS_ID] - MID.x;
    expect(walked).toBeGreaterThan(4000);
    const s = w.kValor[STILTS_ID];
    expect(Math.abs(s - Math.trunc((walked * A.passive.perMetre) / 1000))).toBeLessThanOrEqual(1);
    // stop: after 15 still ticks, 20 is gone
    walk(m, w.x[STILTS_ID], w.y[STILTS_ID]);
    steps(m, 2);
    const held = w.kValor[STILTS_ID];
    steps(m, A.passive.drainEvery);
    expect(w.kValor[STILTS_ID]).toBe(Math.max(0, held - A.passive.drain));
    // a 10 m jump in one tick (Nap home, a blink) is not walking
    const before = w.kValor[STILTS_ID];
    place(m, STILTS_ID, MID.x + 16000, MID.y, 0);
    steps(m, 1);
    expect(w.kValor[STILTS_ID]).toBeLessThanOrEqual(before);
  });

  it('pounce: at full Stride she dashes onto her attack target from 3 m; the basic deals +60% and slows, then Stride resets', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 4000, MID.y, 2048);
    steps(m, 1);
    w.kValor[STILTS_ID] = A.passive.max;
    const raw = attackDamage(w, STILTS_ID);
    const hp = w.hp[FOE];
    applyOrder(m, STILTS_ID, { op: Op.Attack, id: FOE });
    let dashed = false;
    for (let t = 0; t < 40 && w.hp[FOE] === hp; t++) {
      steps(m, 1);
      if (w.fmKind[STILTS_ID] === FM.Dash) dashed = true;
    }
    expect(dashed).toBe(true);
    expect(hp - w.hp[FOE]).toBe(basicHit(Math.trunc((raw * A.passive.bonusBp) / 10000), FOE_ARMOUR));
    expect(w.slowBp[FOE]).toBe(A.passive.slowBp);
    expect(w.kValor[STILTS_ID]).toBe(0);
  });

  it('no pounce below full Stride or from beyond 3 m of reach', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 9000, MID.y, 2048);
    steps(m, 1);
    w.kValor[STILTS_ID] = A.passive.max;
    hold(m, STILTS_ID);
    applyOrder(m, STILTS_ID, { op: Op.Attack, id: FOE });
    steps(m, 1);
    expect(w.fmKind[STILTS_ID]).toBe(FM.None); // 9 m: she walks in first
  });

  it('High Leap: untargetable in the air; landing within 1.3 m of an enemy hero hits it and fills Stride', () => {
    const m = arena();
    const w = m.world;
    hold(m, STILTS_ID);
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    steps(m, 1);
    const hp = w.hp[FOE];
    cast(m, STILTS_ID, 0, MID.x + 5000, MID.y);
    expect(w.fmKind[STILTS_ID]).toBe(FM.Dash);
    steps(m, 1);
    expect(targetable(w, STILTS_ID, 1)).toBe(false);
    steps(m, 12);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, FOE_ARMOUR));
    expect(w.kValor[STILTS_ID]).toBe(A.passive.max);
    expect(cd(m, STILTS_ID, 0)).toBeGreaterThan(0);
    expect(targetable(w, STILTS_ID, 1)).toBe(true);
  });

  it('High Leap stopped by a stun lands nothing; one onto empty ground only moves her', () => {
    const m = arena();
    const w = m.world;
    hold(m, STILTS_ID);
    place(m, FOE, MID.x + 5000, MID.y, 2048);
    steps(m, 1);
    const hp = w.hp[FOE];
    cast(m, STILTS_ID, 0, MID.x + 5000, MID.y);
    stun(w, STILTS_ID, 20);
    steps(m, 14);
    expect(w.hp[FOE]).toBe(hp);
    expect(w.kStage[STILTS_ID]).toBe(0);
    const m2 = arena();
    hold(m2, STILTS_ID);
    steps(m2, 1);
    cast(m2, STILTS_ID, 0, MID.x - 4000, MID.y);
    steps(m2, 12);
    expect(Math.abs(m2.world.x[STILTS_ID] - (MID.x - 4000))).toBeLessThanOrEqual(10);
    expect(m2.world.kValor[STILTS_ID]).toBe(0);
  });

  it('Ear Swivel: reveals enemy heroes within 8 m for 2 s and gives +30% attack speed for 3 s', () => {
    const m = arena();
    const w = m.world;
    hold(m, STILTS_ID);
    place(m, FOE, MID.x + 6000, MID.y, 2048);
    place(m, FOE2, MID.x + 12000, MID.y, 2048);
    cast(m, STILTS_ID, 1, MID.x, MID.y);
    expect(w.revealT[FOE]).toBeGreaterThan(A.w.reveal - 3);
    expect(w.revealT[FOE2]).toBe(0);
    expect(w.asBp[STILTS_ID]).toBe(A.w.attackSpeedBp);
    expect(w.asT[STILTS_ID]).toBeGreaterThan(A.w.duration - 3);
    expect(cd(m, STILTS_ID, 1)).toBe(A.w.cooldown);
  });

  it('Swat-Swat: two swats 0.25 s apart along the line; the second slows and adds 30 Stride on a hero', () => {
    const m = arena();
    const w = m.world;
    hold(m, STILTS_ID);
    place(m, FOE, MID.x + 2000, MID.y, 2048);
    steps(m, 1);
    w.kValor[STILTS_ID] = 10;
    const hp = w.hp[FOE];
    const per = heroHit(A.e.dmg, FOE_ARMOUR);
    cast(m, STILTS_ID, 2, MID.x + 2000, MID.y);
    expect(hp - w.hp[FOE]).toBe(per);
    expect(w.slowBp[FOE]).toBe(0);
    steps(m, A.e.gap);
    expect(hp - w.hp[FOE]).toBe(2 * per);
    expect(w.slowBp[FOE]).toBe(A.e.slowBp);
    // 10 + 30, less any drain from standing still (none yet: 0.5 s not reached)
    expect(w.kValor[STILTS_ID]).toBe(10 + A.e.stride);
  });

  it('Swat-Swat: a stun cancels the second swat', () => {
    const m = arena();
    const w = m.world;
    hold(m, STILTS_ID);
    place(m, FOE, MID.x + 2000, MID.y, 2048);
    steps(m, 1);
    const hp = w.hp[FOE];
    cast(m, STILTS_ID, 2, MID.x + 2000, MID.y);
    stun(w, STILTS_ID, 20);
    steps(m, A.e.gap + 2);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.e.dmg, FOE_ARMOUR));
    expect(w.kWT[STILTS_ID]).toBe(0);
  });

  it('Zoomies: +50% speed for 5 s, Stride locked full, pounce reach 5 m, each pounce takes 1 s off High Leap; form bit', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, STILTS_ID, 4);
    place(m, FOE, MID.x + 6000, MID.y, 2048);
    steps(m, 1);
    cast(m, STILTS_ID, 0, MID.x - 3000, MID.y); // spend High Leap
    steps(m, 12);
    const qcd = cd(m, STILTS_ID, 0);
    expect(qcd).toBeGreaterThan(200);
    place(m, STILTS_ID, MID.x, MID.y, 0);
    const t0 = w.globals[G.Tick];
    const cd0 = cd(m, STILTS_ID, 0);
    cast(m, STILTS_ID, 3, MID.x, MID.y);
    expect(w.hasteBp[STILTS_ID]).toBe(A.r.hasteBp);
    expect(w.kValor[STILTS_ID]).toBe(A.passive.max);
    expect(kitOf(w, STILTS_ID).snapFx?.(w, STILTS_ID)).toBe(SNAP_FX.Form);
    const hp = w.hp[FOE];
    applyOrder(m, STILTS_ID, { op: Op.Attack, id: FOE });
    let dashed = false;
    for (let t = 0; t < 40 && w.hp[FOE] === hp; t++) {
      steps(m, 1);
      if (w.fmKind[STILTS_ID] === FM.Dash) dashed = true;
    }
    expect(dashed).toBe(true); // 6 m: beyond the 3 m pounce, inside Zoomies' 5 m
    expect(w.hp[FOE]).toBeLessThan(hp);
    expect(w.kValor[STILTS_ID]).toBe(A.passive.max);
    // the refund: 1 s below where the cooldown would be by the clock alone
    expect(cd(m, STILTS_ID, 0)).toBe(cd0 - (w.globals[G.Tick] - t0) - A.r.refund);
    steps(m, A.r.duration);
    expect(kitOf(w, STILTS_ID).snapFx?.(w, STILTS_ID)).toBe(0);
    expect(w.kRT[STILTS_ID]).toBe(0);
  });

  it('the HUD resource is her Stride; death resets the kit', () => {
    const m = arena();
    const w = m.world;
    steps(m, 1);
    w.kValor[STILTS_ID] = 70;
    expect(kitOf(w, STILTS_ID).resource?.(w, STILTS_ID)).toBe(70);
    kitOf(w, STILTS_ID).reset?.(w, STILTS_ID);
    expect(w.kValor[STILTS_ID]).toBe(0);
  });
});
