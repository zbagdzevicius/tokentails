import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { MEATBALL } from '../../../src/data/heroes/meatball';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { EFFECTS } from '../../../src/data/effects';
import { dealDamage } from '../../../src/sim/combat/damage';
import { stun } from '../../../src/sim/effects';
import { snapshot } from '../../../src/sim/index';
import { FM, Kind } from '../../../src/sim/world';
import { BOT_AI } from '../../../src/data/bots';
import { Rng } from '../../../src/sim/rng';
import { Op } from '../../../src/sim/api';
import { escape, fight } from '../../../src/sim/bots/heroes/meatball';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Meatball (slot 0) with Clem (1) and Sage (2) vs Clem (slot 3, armour 25) and Sage (slot 4).
const MB = 0;
const ALLY = 1;
const ALLY2 = 2;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('meatball'));
const P = A.passive;

function arena() {
  const m = heroMatch(['meatball', 'clem', 'sage', 'clem', 'sage', 'clem']);
  place(m, MB, MID.x, MID.y, 0);
  place(m, ALLY, MID.x - 20000, MID.y + 15000, 0);
  place(m, ALLY2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2);
  return m;
}

const formOf = (m: ReturnType<typeof arena>, id: number): boolean => snapshot(m, 0).entities.find((e) => e.id === id)?.form === true;

describe('Meatball, original cat tank (sim v11)', () => {
  it('data: a GRASS cat tank, the widest numbers in the spec', () => {
    expect([MEATBALL.side, MEATBALL.role, MEATBALL.element, MEATBALL.name]).toEqual(['cat', 'tank', 'GRASS', 'Meatball']);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([270, 420, 450, 2100]);
    expect([A.q.dash, A.w.charm, A.r.duration, A.r.rehit]).toEqual([6000, 23, 120, 30]);
  });

  it('Bowling Roll: rolls 6 m; units beside the path are knocked sideways off it, hurt and (heroes) slowed', () => {
    const m = arena();
    const w = m.world;
    // FOE just left of the path (+y), FOE2 just right of it (−y)
    place(m, FOE, MID.x + 3000, MID.y + 400, 2048);
    place(m, FOE2, MID.x + 4500, MID.y - 400, 2048);
    const hp = w.hp[FOE];
    cast(m, MB, 0, MID.x + 10000, MID.y);
    expect(w.fmKind[MB]).toBe(FM.Dash);
    expect(formOf(m, MB)).toBe(true);
    steps(m, 12);
    expect(w.x[MB]).toBe(MID.x + A.q.dash);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, 25));
    expect(w.y[FOE]).toBe(MID.y + 400 + A.q.push);
    expect(w.x[FOE]).toBe(MID.x + 3000);
    expect(w.y[FOE2]).toBe(MID.y - 400 - A.q.push);
    expect(w.slowBp[FOE]).toBe(A.q.slowBp);
    expect(formOf(m, MB)).toBe(false);
    expect(cd(m, MB, 0)).toBeGreaterThan(0);
  });

  it('Bowling Roll: a unit dead on the line goes to the left; each unit is hit once per roll', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    const hp = w.hp[FOE];
    cast(m, MB, 0, MID.x + 10000, MID.y);
    steps(m, 12);
    expect(w.y[FOE]).toBe(MID.y + A.q.push);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, 25));
  });

  it('Loaf Mode: rooted, 40% less damage while it lasts; enemy heroes within 3 m are charmed to him', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 2500, MID.y, 2048);
    place(m, FOE2, MID.x + 6000, MID.y, 2048);
    tanky(m, MB);
    const plain = dealDamage(m, FOE2, 1, Kind.Hero, MB, 200, 'basic');
    cast(m, MB, 1, MID.x, MID.y);
    // Sim v17 (V17.md §3.2): the Loaf winds up 9 ticks first.
    expect(w.fearSrc[FOE]).toBe(-1);
    steps(m, 8);
    expect(w.rootT[MB]).toBeGreaterThan(0);
    expect(w.kRT[MB]).toBeGreaterThan(0);
    expect(w.fearSrc[FOE]).toBe(MB);
    expect(w.slowBp[FOE]).toBe(A.w.slowBp);
    expect(w.fearT[FOE2]).toBe(0);
    const cut = dealDamage(m, FOE2, 1, Kind.Hero, MB, 200, 'basic');
    expect(cut).toBe(Math.trunc((plain * (10000 - A.w.reduceBp)) / 10000));
    // no rolling out of a loaf (rooted: mobility casts are refused)
    cast(m, MB, 0, MID.x + 9000, MID.y);
    expect(w.fmKind[MB]).toBe(FM.None);
    steps(m, A.w.duration);
    expect(w.kRT[MB]).toBe(0);
    expect(dealDamage(m, FOE2, 1, Kind.Hero, MB, 200, 'basic')).toBe(plain);
  });

  it('Big Brother: dashes to the ally nearest the aim, shields it 8% of his max HP and knocks enemy heroes off it', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x - 5000, MID.y, 0);
    place(m, FOE, MID.x - 6000, MID.y + 500, 2048);
    cast(m, MB, 2, MID.x - 5200, MID.y + 300);
    steps(m, 8);
    expect(w.kStage[MB]).toBe(0);
    expect(w.x[MB]).toBeLessThan(MID.x - 3000);
    expect(w.shield[ALLY]).toBe(Math.trunc((w.maxHp[MB] * A.e.shieldBp) / 10000));
    expect(w.fmKind[FOE]).toBe(FM.Knock);
    steps(m, EFFECTS.knockbackTicks + 1);
    expect(Math.hypot(w.x[FOE] - w.x[ALLY], w.y[FOE] - w.y[ALLY])).toBeGreaterThan(A.e.push);
    // no ballform on Big Brother's dash
    expect(formOf(m, MB)).toBe(false);
  });

  it('Big Brother with nobody near the aim: a 4 m hop and half the shield on himself (never fizzles)', () => {
    const m = arena();
    const w = m.world;
    cast(m, MB, 2, MID.x + 9000, MID.y);
    steps(m, 10);
    expect(w.x[MB]).toBe(MID.x + A.e.soloDash);
    expect(w.shield[MB]).toBe(Math.trunc((w.maxHp[MB] * A.e.shieldBp) / 10000) >> 1);
    expect(cd(m, MB, 2)).toBeGreaterThan(0);
  });

  it('Unstoppable Chonk: cleanses a root, CC immunity and haste; bumped heroes take damage and fly, once per second each', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, MB, 4);
    w.rootT[MB] = 60;
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    const hp = w.hp[FOE];
    cast(m, MB, 3, MID.x, MID.y);
    expect(w.rootT[MB]).toBe(0);
    expect(w.ccImmT[MB]).toBeGreaterThan(0);
    expect(w.hasteBp[MB]).toBe(A.r.hasteBp);
    expect(formOf(m, MB)).toBe(true);
    steps(m, 1);
    const dmg = heroHit(A.r.dmg + A.r.dmgPerLevel * 3, 25);
    expect(hp - w.hp[FOE]).toBe(dmg);
    expect(w.fmKind[FOE]).toBe(FM.Knock);
    // pull the foe back next to him: no second bump inside the rehit window, one after it
    steps(m, EFFECTS.knockbackTicks + 1);
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    steps(m, 5);
    expect(hp - w.hp[FOE]).toBe(dmg);
    steps(m, A.r.rehit);
    expect(hp - w.hp[FOE]).toBe(dmg * 2);
    // CC bounces off him while it lasts
    stun(w, MB, 30);
    expect(w.stunT[MB]).toBe(0);
    steps(m, A.r.duration);
    expect(formOf(m, MB)).toBe(false);
  });

  it('Food Coma: a hit that drops him below 30% puts up a 15% max-HP shield for 3 s, then a 60 s lockout', () => {
    const m = arena();
    const w = m.world;
    w.hp[MB] = Math.trunc((w.maxHp[MB] * P.thresholdBp) / 10000) + 20;
    dealDamage(m, FOE, 1, Kind.Hero, MB, 100, 'basic');
    const sh = Math.trunc((w.maxHp[MB] * P.shieldBp) / 10000);
    expect(w.kHuntT[MB]).toBe(P.cooldown);
    // the shield soaked the hit that triggered it
    expect(w.shield[MB]).toBeLessThan(sh);
    expect(w.shield[MB]).toBeGreaterThan(sh - 100);
    expect(w.shieldT[MB]).toBe(P.duration);
    // inside the lockout: no new shield
    w.shield[MB] = 0;
    dealDamage(m, FOE, 1, Kind.Hero, MB, 50, 'basic');
    expect(w.shield[MB]).toBe(0);
    steps(m, 30);
    expect(w.kHuntT[MB]).toBe(P.cooldown - 30);
  });

  it('bot: rolls at a foe on the line, peels for a hurt ally, escapes by hopping to a friend', () => {
    const m = arena();
    const w = m.world;
    const rng = new Rng(3);
    const p = { aimErrorSteps: 0 } as Parameters<typeof fight>[3];
    place(m, FOE, MID.x + 4000, MID.y, 2048);
    const c = fight(w, MB, FOE, p, rng);
    expect(c && c.op === Op.Cast && c.slot).toBe(0);
    // a hurt ally with a foe on top of it: Big Brother to it
    place(m, ALLY, MID.x - 4000, MID.y, 0);
    w.hp[ALLY] = w.maxHp[ALLY] >> 2;
    place(m, FOE2, MID.x - 4500, MID.y + 1000, 2048);
    const peel = fight(w, MB, FOE, p, rng);
    expect(peel && peel.op === Op.Cast && peel.slot).toBe(2);
    expect(BOT_AI.meatballPeelRange).toBeGreaterThan(0);
    // escape from FOE (east): the friend farther west
    const esc = escape(w, MB, FOE, 0, 0);
    expect(esc && esc.op === Op.Cast && esc.slot).toBe(2);
  });
});
