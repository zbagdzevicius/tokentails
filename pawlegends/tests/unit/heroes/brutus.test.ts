import { describe, expect, it } from 'vitest';
import { ZONE_KIND } from '../../../src/data/effects';
import { BRUTUS } from '../../../src/data/heroes/brutus';
import { PROJECTILE_KIND } from '../../../src/data/towers';
import { Op } from '../../../src/sim/api';
import { fireBolt } from '../../../src/sim/combat/attack';
import { dealDamage } from '../../../src/sim/combat/damage';
import { chooseTalent } from '../../../src/sim/heroes/talents';
import { applyOrder } from '../../../src/sim/units/hero';
import { Kind } from '../../../src/sim/world';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Sir Brutus (slot 0) with Sage (slot 1) vs Clem (slot 3, armour 25) and Sage (slot 4).
const BRUTUS_ID = 0;
const ALLY = 1;
const FOE = 3;
const FOE2 = 4;

function arena() {
  const m = heroMatch(['brutus', 'sage', 'clem', 'clem', 'sage', 'cacklejaw']);
  place(m, BRUTUS_ID, MID.x, MID.y, 0);
  place(m, ALLY, MID.x - 15000, MID.y + 15000, 0);
  place(m, FOE, MID.x + 2000, MID.y, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  hold(m, BRUTUS_ID, ALLY, FOE, FOE2);
  tanky(m, ALLY, FOE, FOE2); // not Brutus: Honour is a share of his max HP
  return m;
}

describe('Sir Brutus (§6.5)', () => {
  it('data matches POC.md §6.2 and §6.5', () => {
    expect(BRUTUS.base).toEqual({ hp: 760, hpPerLevel: 80, attack: 46, attackPerLevel: 4, attackEvery: 36, range: 1600, speed: 4800, armour: 40, armourPerLevel: 3 });
    const a = BRUTUS.abilities;
    expect([a.q.cooldown, a.w.cooldown, a.e.cooldown, a.r.cooldown]).toEqual([210, 420, 360, 2250]);
    expect([a.q.radius, a.q.dmg, a.q.dmgPerLevel, a.q.slowBp, a.q.slow]).toEqual([3000, 60, 10, 3000, 45]);
    expect([a.w.duration, a.w.arc]).toEqual([75, 1365]);
    expect([a.e.dash, a.e.knockback, a.e.stun]).toEqual([5000, 2000, 15]);
    expect([a.r.range, a.r.ringRadius, a.r.duration, a.r.reduceBp]).toEqual([5000, 6000, 90, 3000]);
    expect(BRUTUS.passive).toEqual({ shieldCapBp: 1200, buildWindow: 120, decayAfter: 90 });
  });

  it('Honour: hero damage builds a shield up to 12% max HP over 4 s; it decays after 3 s out of combat', () => {
    const m = arena();
    const w = m.world;
    const cap = Math.trunc((760 * 1200) / 10000);
    for (let t = 0; t < 130; t++) {
      if (t % 30 === 0) dealDamage(m, FOE, 1, Kind.Hero, BRUTUS_ID, 1, 'basic');
      steps(m, 1);
    }
    expect(w.kHonour[BRUTUS_ID]).toBe(cap);
    // It absorbs damage before HP.
    const hp = w.hp[BRUTUS_ID];
    dealDamage(m, FOE, 1, Kind.Hero, BRUTUS_ID, 50, 'basic');
    expect(w.hp[BRUTUS_ID]).toBe(hp);
    steps(m, 90 + 130);
    expect(w.kHonour[BRUTUS_ID]).toBe(0);
  });

  it('Shield Slam: ring 3 m, 60 (+10/lvl), slow 30% for 1.5 s; Heavy Slam 45%, Wide Slam 3.8 m', () => {
    const m = arena();
    const w = m.world;
    const hp = w.hp[FOE];
    cast(m, BRUTUS_ID, 0, MID.x, MID.y);
    expect(hp - w.hp[FOE]).toBe(heroHit(60, 25));
    expect([w.slowBp[FOE], w.slowT[FOE]]).toEqual([3000, 45]);
    expect(cd(m, BRUTUS_ID, 0)).toBe(210);
    place(m, FOE, MID.x + 3600, MID.y, 2048);
    w.cooldowns[0] = 0;
    const hp2 = w.hp[FOE];
    cast(m, BRUTUS_ID, 0, MID.x, MID.y);
    expect(w.hp[FOE]).toBe(hp2);

    const m2 = arena();
    setLevel(m2, BRUTUS_ID, 3);
    chooseTalent(m2, BRUTUS_ID, 0, 1);
    place(m2, FOE, MID.x + 4200, MID.y, 2048);
    const hp3 = m2.world.hp[FOE];
    cast(m2, BRUTUS_ID, 0, MID.x, MID.y);
    expect(hp3 - m2.world.hp[FOE]).toBe(heroHit(60 + 2 * 10, 25));

    const m3 = arena();
    setLevel(m3, BRUTUS_ID, 3);
    chooseTalent(m3, BRUTUS_ID, 0, 0);
    cast(m3, BRUTUS_ID, 0, MID.x, MID.y);
    expect(m3.world.slowBp[FOE]).toBe(4500);
  });

  it('Front Guard: 2.5 s, blocks projectiles from the front for Sir Brutus and allies behind him', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 6000, MID.y, 2048);
    place(m, ALLY, MID.x - 1500, MID.y, 0);
    cast(m, BRUTUS_ID, 1, MID.x + 6000, MID.y);
    expect(w.kWT[BRUTUS_ID]).toBe(75);
    const ally = w.hp[ALLY];
    fireBolt(w, FOE, ALLY, 80, 18000, PROJECTILE_KIND.hero);
    steps(m, 30);
    expect(w.hp[ALLY]).toBe(ally);
    // From behind, the guard does not help.
    place(m, FOE, MID.x - 6000, MID.y, 0);
    fireBolt(w, FOE, ALLY, 80, 18000, PROJECTILE_KIND.hero);
    steps(m, 30);
    expect(w.hp[ALLY]).toBeLessThan(ally);
    steps(m, 20);
    expect(w.kWT[BRUTUS_ID]).toBe(0);
  });

  it('Pug Charge: dash 5 m; the first hero hit is knocked back 2 m and stunned 0.5 s', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048);
    cast(m, BRUTUS_ID, 2, MID.x + 9000, MID.y);
    expect(cd(m, BRUTUS_ID, 2)).toBe(360);
    let stunned = false;
    for (let t = 0; t < 10; t++) {
      steps(m, 1);
      if (w.stunT[FOE] > 0) stunned = true;
    }
    expect(stunned).toBe(true);
    expect(w.x[BRUTUS_ID]).toBeLessThan(MID.x + 3000); // stopped at the hero
    expect(w.x[FOE]).toBeGreaterThanOrEqual(MID.x + 3000 + 2000 - 1);

    // Without a hero in the way: the full 5 m (Long Charge: 6.5 m).
    const m2 = arena();
    place(m2, FOE, MID.x, MID.y + 20000, 0);
    cast(m2, BRUTUS_ID, 2, MID.x + 9000, MID.y);
    steps(m2, 12);
    expect(m2.world.x[BRUTUS_ID]).toBe(MID.x + 5000);
    const m3 = arena();
    setLevel(m3, BRUTUS_ID, 6);
    chooseTalent(m3, BRUTUS_ID, 1, 1);
    place(m3, FOE, MID.x, MID.y + 20000, 0);
    cast(m3, BRUTUS_ID, 2, MID.x + 9000, MID.y);
    steps(m3, 12);
    expect(m3.world.x[BRUTUS_ID]).toBe(MID.x + 6500);
  });

  it("Champion's Challenge: tether a hero within 5 m in a 6 m ring for 3 s; 30% less damage from that hero", () => {
    const m = arena();
    const w = m.world;
    setLevel(m, BRUTUS_ID, 4);
    cast(m, BRUTUS_ID, 3, w.x[FOE], w.y[FOE], FOE);
    expect(cd(m, BRUTUS_ID, 3)).toBe(2250);
    const z = w.tether[FOE];
    expect(z).toBeGreaterThanOrEqual(0);
    expect(w.zKind[z]).toBe(ZONE_KIND.arena);
    expect(w.zRadius[z]).toBe(6000);
    // The foe runs: it stays inside.
    w.attackTimer[FOE] = 1 << 20;
    applyOrder(m, FOE, { op: Op.Move, x: MID.x + 20000, y: MID.y });
    steps(m, 60);
    const dx = w.x[FOE] - w.zX[z];
    const dy = w.y[FOE] - w.zY[z];
    expect(dx * dx + dy * dy).toBeLessThanOrEqual(5500 * 5500);
    const hp = w.hp[BRUTUS_ID];
    w.kHonour[BRUTUS_ID] = 0;
    dealDamage(m, FOE, 1, Kind.Hero, BRUTUS_ID, 100, 'basic');
    expect(hp - w.hp[BRUTUS_ID]).toBe(Math.trunc((heroHit(100, 40 + 3 * 3) * 7000) / 10000));
    steps(m, 31);
    expect(w.tether[FOE]).toBe(-1);
    steps(m, 60);
    expect(w.x[FOE] - MID.x).toBeGreaterThan(6000); // free again

    // Out of reach: walks in first.
    const m2 = arena();
    setLevel(m2, BRUTUS_ID, 4);
    place(m2, FOE, MID.x + 9000, MID.y, 2048);
    cast(m2, BRUTUS_ID, 3, MID.x + 9000, MID.y, FOE);
    expect(m2.world.castPhase[BRUTUS_ID]).toBe(1);
    steps(m2, 40);
    expect(m2.world.tether[FOE]).toBeGreaterThanOrEqual(0);
  });

  it('talents: Bulwark 3.5 s, Arena of Honour 4 s, Rally Howl +20% ally speed in the ring', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, BRUTUS_ID, 9);
    chooseTalent(m, BRUTUS_ID, 1, 0);
    chooseTalent(m, BRUTUS_ID, 2, 0);
    cast(m, BRUTUS_ID, 1, MID.x + 2000, MID.y);
    expect(w.kWT[BRUTUS_ID]).toBe(105);
    cast(m, BRUTUS_ID, 3, w.x[FOE], w.y[FOE], FOE);
    expect(w.zTtl[w.tether[FOE]]).toBe(120);

    const m2 = arena();
    setLevel(m2, BRUTUS_ID, 9);
    chooseTalent(m2, BRUTUS_ID, 2, 1);
    place(m2, ALLY, MID.x - 2000, MID.y, 0);
    cast(m2, BRUTUS_ID, 3, m2.world.x[FOE], m2.world.y[FOE], FOE);
    steps(m2, 2);
    expect(m2.world.hasteBp[ALLY]).toBe(2000);
    expect(m2.world.hasteBp[FOE]).toBe(0);
  });
});
