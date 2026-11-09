import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { DUCHESS } from '../../../src/data/heroes/duchess';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { ZONE_KIND } from '../../../src/data/effects';
import { PROJECTILE_KIND } from '../../../src/data/towers';
import { BOT_AI, BOTS } from '../../../src/data/bots';
import { dealDamage } from '../../../src/sim/combat/damage';
import { addStack, stacksOf } from '../../../src/sim/effects';
import { canCast } from '../../../src/sim/heroes/kit';
import { Op } from '../../../src/sim/api';
import { Rng } from '../../../src/sim/rng';
import { Kind } from '../../../src/sim/world';
import * as bot from '../../../src/sim/bots/heroes/duchess';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Duchess (slot 0) vs Clem (slot 3, armour 25) and Sage (slot 4, armour 15).
const DU = 0;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('duchess'));
const P = A.passive;

function arena() {
  const m = heroMatch(['duchess', 'clem', 'sage', 'clem', 'sage', 'clem']);
  place(m, DU, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 3000, MID.y, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 20000, MID.y + 20000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2);
  return m;
}

describe('Duchess, original cat mage (sim v11)', () => {
  it('data: a DARK cat mage at the spec numbers, no catalog id', () => {
    expect([DUCHESS.side, DUCHESS.role, DUCHESS.element]).toEqual(['cat', 'mage', 'DARK']);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([210, 300, 390, 1950]);
    expect(DUCHESS.passive).toEqual({ stacks: 3, window: 120, stun: 23, dmg: 40, dmgPerLevel: 4, lockout: 180 });
    expect(DUCHESS.pvp).toEqual({ dmgBp: 10550, takenBp: 8675 }); // sim v17 refit (V17.md §6.5): takes 8525 before; sim v15 balance pass; sim v16: deals 10175 before
    expect((DUCHESS as { catalogId?: unknown }).catalogId).toBeUndefined();
  });

  it('Utter Disdain: ability hits stack 1 Disdain each; the third Snubs (stun, bonus damage), then a lockout', () => {
    const m = arena();
    const w = m.world;
    dealDamage(m, DU, 0, Kind.Hero, FOE, 10, 'ability');
    dealDamage(m, DU, 0, Kind.Hero, FOE, 10, 'ability');
    expect(stacksOf(w, FOE)).toBe(2);
    expect(w.stunT[FOE]).toBe(0);
    const hp = w.hp[FOE];
    dealDamage(m, DU, 0, Kind.Hero, FOE, 10, 'ability');
    // consumed, stunned, the bonus hit landed once (the lockout keeps the bonus hit from stacking again)
    expect(stacksOf(w, FOE)).toBe(0);
    expect(w.stunT[FOE]).toBe(P.stun);
    expect(w.mkLock[FOE]).toBe(P.lockout);
    expect(hp - w.hp[FOE]).toBe(heroHit(10, 25) + heroHit(P.dmg, 25));
    // locked out: no stack for 6 s
    dealDamage(m, DU, 0, Kind.Hero, FOE, 10, 'ability');
    expect(stacksOf(w, FOE)).toBe(0);
    steps(m, P.lockout);
    dealDamage(m, DU, 0, Kind.Hero, FOE, 10, 'ability');
    expect(stacksOf(w, FOE)).toBe(1);
  });

  it('Utter Disdain: basics never stack, and the stacks fade 4 s after the last hit', () => {
    const m = arena();
    const w = m.world;
    dealDamage(m, DU, 0, Kind.Hero, FOE, 10, 'basic');
    expect(stacksOf(w, FOE)).toBe(0);
    dealDamage(m, DU, 0, Kind.Hero, FOE, 10, 'ability');
    expect(stacksOf(w, FOE)).toBe(1);
    steps(m, P.window - 1);
    expect(stacksOf(w, FOE)).toBe(1);
    steps(m, 1);
    expect(stacksOf(w, FOE)).toBe(0);
    // an ally is never a victim
    dealDamage(m, DU, 0, Kind.Hero, 1, 10, 'ability');
    expect(stacksOf(w, 1)).toBe(0);
  });

  it('Fluff Puff: a slow fat shot that pierces every unit in its 1.4 m path, slows and stacks Disdain on each hero', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE2, MID.x + 6000, MID.y + 400, 2048);
    const hp = w.hp[FOE];
    const hp2 = w.hp[FOE2];
    cast(m, DU, 0, MID.x + 7000, MID.y);
    expect(w.pKind.includes(PROJECTILE_KIND.fluff)).toBe(true);
    expect(cd(m, DU, 0)).toBe(A.q.cooldown);
    steps(m, 30);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, 25));
    expect(hp2 - w.hp[FOE2]).toBe(heroHit(A.q.dmg, 15));
    expect(w.slowBp[FOE]).toBe(A.q.slowBp);
    expect([stacksOf(w, FOE), stacksOf(w, FOE2)]).toEqual([1, 1]);
  });

  it('Not Amused: after a 0.35 s wind-up, every enemy in the 5 m 80° cone is hit and slowed 35%', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE2, MID.x + 4000, MID.y + 1500, 2048);
    const hp = w.hp[FOE];
    cast(m, DU, 1, MID.x + 3000, MID.y);
    expect(w.hp[FOE]).toBe(hp);
    steps(m, A.w.windup);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.w.dmg, 25));
    expect(w.slowBp[FOE]).toBe(A.w.slowBp);
    expect(w.slowBp[FOE2]).toBe(A.w.slowBp);
    expect(stacksOf(w, FOE)).toBe(1);
    // behind her: nothing
    const far = arena();
    place(far, FOE, MID.x - 3000, MID.y, 0);
    const hpf = far.world.hp[FOE];
    cast(far, DU, 1, MID.x + 3000, MID.y);
    steps(far, A.w.windup);
    expect([far.world.hp[FOE], far.world.slowT[FOE]]).toEqual([hpf, 0]);
  });

  it('Cushion Glide: a 2.2 m fur cloud where she started (2.5 s, slows 30%), then a 4 m glide at 12 m/s', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 500, MID.y + 1000, 2048);
    cast(m, DU, 2, MID.x - 9000, MID.y);
    const z = w.zKind.indexOf(ZONE_KIND.burst);
    expect(z).toBeGreaterThanOrEqual(0);
    expect([w.zX[z], w.zY[z], w.zRadius[z], w.zDmg[z]]).toEqual([MID.x, MID.y, A.e.radius, 0]);
    // 4 m at 12 m/s = 10 ticks (slower than the shared 20 m/s dash)
    steps(m, 5);
    expect(w.x[DU]).toBeGreaterThan(MID.x - A.e.dash);
    steps(m, 6);
    expect(w.x[DU]).toBe(MID.x - A.e.dash);
    expect(w.slowBp[FOE]).toBe(A.e.slowBp);
    expect(cd(m, DU, 2)).toBeGreaterThan(0);
    // the cloud does no damage, so it never stacks Disdain
    expect(stacksOf(w, FOE)).toBe(0);
  });

  it('Royal Decree: after 0.7 s, enemy heroes within 6 m are hit, slowed and gain 1 Disdain (sim v17); she gains a shield', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, DU, 4);
    place(m, FOE2, MID.x - 4000, MID.y + 2000, 0);
    const hp = w.hp[FOE];
    cast(m, DU, 3, MID.x, MID.y);
    expect(w.hp[FOE]).toBe(hp);
    steps(m, A.r.windup);
    const lv = w.level[DU] - 1;
    expect(hp - w.hp[FOE]).toBe(heroHit(A.r.dmg + A.r.dmgPerLevel * lv, 25));
    expect([stacksOf(w, FOE), stacksOf(w, FOE2)]).toEqual([1, 1]);
    expect(w.slowBp[FOE]).toBe(A.r.slowBp);
    expect(w.shield[DU]).toBe(A.r.shield + A.r.shieldPerLevel * lv);
    // the cooldown starts on the cast tick (the step after resolution ticks it once)
    expect(cd(m, DU, 3)).toBeGreaterThanOrEqual(A.r.cooldown - 1);
  });

  it('Royal Decree on a hero already on 2 Disdain Snubs it at once (sim v17: R gives 1)', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, DU, 4);
    addStack(w, FOE, 2, P.stacks, P.window);
    cast(m, DU, 3, MID.x, MID.y);
    steps(m, A.r.windup);
    expect(stacksOf(w, FOE)).toBe(0);
    expect(w.stunT[FOE]).toBeGreaterThan(0);
    expect(w.mkLock[FOE]).toBeGreaterThan(0);
  });

  it('talent Utterly Unamused stuns longer; Imperial Decree reaches 7.5 m', () => {
    const t3 = DUCHESS.talents[2];
    expect(t3[1].mods).toEqual({ passive: { stun: 33 } });
    expect(t3[0].mods).toEqual({ r: { radius: 7500 } });
  });
});

describe('Duchess bot (sim v11)', () => {
  const rng = () => new Rng(11);
  const p = BOTS.normal;

  it('fight: aims Fluff Puff and Not Amused at the hero carrying the most Disdain', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 6000, MID.y, 2048);
    place(m, FOE2, MID.x + 3500, MID.y + 2500, 2048);
    addStack(w, FOE2, 2, P.stacks, P.window);
    expect(bot.disdainTarget(w, DU, A.q.range)).toBe(FOE2);
    // R first: a hero on 2 stacks is within 6 m
    setLevel(m, DU, 4);
    expect(bot.fight(w, DU, FOE, p, rng())).toMatchObject({ op: Op.Cast, slot: 3 });
    w.cooldowns[DU * 5 + 3] = 100;
    const c = bot.fight(w, DU, FOE, p, rng());
    expect(c).toMatchObject({ op: Op.Cast, slot: 1, x: w.x[FOE2], y: w.y[FOE2] });
  });

  it('fight: glides away from a melee foe inside her spacing', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 2000, MID.y, 2048);
    w.cooldowns[DU * 5 + 3] = 100; // no ult (level 1 anyway)
    const c = bot.fight(w, DU, FOE, p, rng());
    expect(BOT_AI.duchessSpacing).toBe(4500);
    expect(c).toMatchObject({ op: Op.Cast, slot: 2 });
    expect((c as { x: number }).x).toBeLessThan(w.x[DU]);
  });

  it('escape: Cushion Glide straight away from the threat', () => {
    const m = arena();
    const w = m.world;
    const c = bot.escape(w, DU, FOE, 0, 0);
    expect(c).toMatchObject({ op: Op.Cast, slot: 2 });
    expect((c as { x: number }).x).toBeLessThan(w.x[DU]);
    w.cooldowns[DU * 5 + 2] = 100;
    expect(canCast(w, DU, 2)).toBe(false);
    expect(bot.escape(w, DU, FOE, 0, 0)).toBeNull();
  });
});
