import { describe, expect, it } from 'vitest';
import { CACKLEJAW } from '../../../src/data/heroes/cacklejaw';
import { BUSHES } from '../../../src/data/map';
import { dealDamage, resolveDeaths } from '../../../src/sim/combat/damage';
import { chooseTalent } from '../../../src/sim/heroes/talents';
import { snapshot } from '../../../src/sim/index';
import { targetable } from '../../../src/sim/units/kinds';
import { G, Kind } from '../../../src/sim/world';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Cacklejaw (slot 0) with Clem (slot 1) vs Sage (slot 3, armour 15) and Sir Brutus (slot 4, armour 40).
const CJ = 0;
const ALLY = 1;
const FOE = 3;
const FOE2 = 4;

function hunt() {
  const m = heroMatch(['cacklejaw', 'clem', 'sage', 'sage', 'brutus', 'clem']);
  place(m, CJ, MID.x, MID.y, 0);
  place(m, ALLY, MID.x - 20000, MID.y + 20000, 0);
  place(m, FOE, MID.x + 1500, MID.y, 0); // facing away from Cacklejaw
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  hold(m, CJ, ALLY, FOE, FOE2);
  tanky(m, ALLY, FOE, FOE2);
  return m;
}

const hpLoss = (m: ReturnType<typeof hunt>, id: number, f: () => void): number => {
  const hp = m.world.hp[id];
  f();
  return hp - m.world.hp[id];
};

describe('Cacklejaw (§6.6)', () => {
  it('data matches POC.md §6.2 and §6.6', () => {
    expect(CACKLEJAW.base).toEqual({ hp: 520, hpPerLevel: 55, attack: 60, attackPerLevel: 6, attackEvery: 29, range: 1600, speed: 5200, armour: 20, armourPerLevel: 2 });
    const a = CACKLEJAW.abilities;
    expect([a.q.cooldown, a.w.cooldown, a.e.cooldown, a.r.cooldown]).toEqual([240, 390, 480, 1800]);
    expect([a.q.dash, a.q.dmg, a.q.dmgPerLevel, a.q.recasts, a.q.recastWindow]).toEqual([4000, 75, 12, 1, 90]);
    expect([a.w.range, a.w.arc, a.w.fear]).toEqual([3000, 796, 24]);
    expect([a.e.duration, a.e.speedBp, a.e.brushLinger]).toEqual([90, 2000, 45]);
    expect([a.r.range, a.r.dmg, a.r.dmgPerLevel, a.r.missingHpBp, a.r.resetWindow, a.r.resets]).toEqual([12000, 150, 30, 1000, 90, 1]);
    expect(CACKLEJAW.passive).toEqual({ bonusBp: 12000, behindArc: 1365, allyRange: 4000 });
  });

  it('Pack Flank: +20% from behind (over 120°) or with an allied hero within 4 m of the target', () => {
    const m = hunt();
    const base = heroHit(100, 15);
    expect(hpLoss(m, FOE, () => dealDamage(m, CJ, 0, Kind.Hero, FOE, 100, 'basic'))).toBe(heroHit(120, 15));
    m.world.facing[FOE] = 2048; // now facing Cacklejaw
    expect(hpLoss(m, FOE, () => dealDamage(m, CJ, 0, Kind.Hero, FOE, 100, 'basic'))).toBe(base);
    place(m, ALLY, MID.x + 1500, MID.y + 3000, 0);
    m.world.facing[FOE] = 2048;
    expect(hpLoss(m, FOE, () => dealDamage(m, CJ, 0, Kind.Hero, FOE, 100, 'basic'))).toBe(heroHit(120, 15));
  });

  it('Jeer Slash: dash 4 m through a line, 75 (+12/lvl); a hero hit opens one recast within 3 s', () => {
    const m = hunt();
    const w = m.world;
    w.facing[FOE] = 2048; // no flank bonus
    const lost = hpLoss(m, FOE, () => {
      cast(m, CJ, 0, MID.x + 5000, MID.y);
      steps(m, 8);
    });
    expect(lost).toBe(heroHit(75, 15));
    expect(w.x[CJ]).toBe(MID.x + 4000);
    expect(cd(m, CJ, 0)).toBe(0); // recast window open
    expect(w.kWindow[CJ]).toBeGreaterThan(80);
    cast(m, CJ, 0, MID.x, MID.y);
    expect(cd(m, CJ, 0)).toBe(240);
    // No hero hit: straight to cooldown, no recast.
    const m2 = hunt();
    place(m2, FOE, MID.x, MID.y + 20000, 0);
    cast(m2, CJ, 0, MID.x + 5000, MID.y);
    steps(m2, 8);
    expect(cd(m2, CJ, 0)).toBeGreaterThan(230);
    expect(m2.world.kStage[CJ]).toBe(0);
    // The window lapses: cooldown.
    const m3 = hunt();
    cast(m3, CJ, 0, MID.x + 5000, MID.y);
    steps(m3, 8 + 90);
    expect(cd(m3, CJ, 0)).toBeGreaterThan(230);
  });

  it('Gloat: cone 3 m, 70°, fear 0.8 s (Smug: 9 s; sim v10 Wide Gloat: 105°, same 3 m)', () => {
    const m = hunt();
    const w = m.world;
    cast(m, CJ, 1, MID.x + 1500, MID.y);
    expect(w.fearT[FOE]).toBe(24);
    expect(cd(m, CJ, 1)).toBe(390);
    const x0 = w.x[FOE];
    steps(m, 10);
    expect(w.x[FOE]).toBeGreaterThan(x0); // runs away
    const m2 = hunt();
    setLevel(m2, CJ, 6);
    // 45° off the aim, 2 m out: outside the 70° cone, inside Wide Gloat's 105°.
    place(m2, FOE, MID.x + 1414, MID.y + 1414, 0);
    const base = hunt();
    place(base, FOE, MID.x + 1414, MID.y + 1414, 0);
    cast(base, CJ, 1, MID.x + 2000, MID.y);
    expect(base.world.fearT[FOE]).toBe(0);
    chooseTalent(m2, CJ, 1, 1);
    cast(m2, CJ, 1, MID.x + 2000, MID.y);
    expect(m2.world.fearT[FOE]).toBe(24);
    // Sim v10: no longer 4 m (a 4 m fear opener pushed foes out of reach: fewer cores fell before Sudden Death).
    const far = hunt();
    setLevel(far, CJ, 6);
    chooseTalent(far, CJ, 1, 1);
    place(far, FOE, MID.x + 3800, MID.y, 0);
    cast(far, CJ, 1, MID.x + 3800, MID.y);
    expect(far.world.fearT[FOE]).toBe(0);
    const m3 = hunt();
    setLevel(m3, CJ, 6);
    chooseTalent(m3, CJ, 1, 0);
    cast(m3, CJ, 1, MID.x + 1500, MID.y);
    expect(cd(m3, CJ, 1)).toBe(270);
  });

  it('Bush Slink: 3 s stealth, +20% speed, hidden from the enemy; attacking breaks it; in brush it lasts', () => {
    const m = hunt();
    const w = m.world;
    place(m, FOE, MID.x + 8000, MID.y, 0);
    cast(m, CJ, 2, MID.x, MID.y);
    expect(cd(m, CJ, 2)).toBe(480);
    steps(m, 1);
    expect(w.hasteBp[CJ]).toBe(2000);
    expect(snapshot(m, 1).entities.some((e) => e.id === CJ)).toBe(false);
    expect(snapshot(m, 0).entities.some((e) => e.id === CJ)).toBe(true);
    expect(targetable(w, CJ, 1)).toBe(false);
    dealDamage(m, CJ, 0, Kind.Hero, FOE, 10, 'basic');
    expect(w.stealthT[CJ]).toBe(0);
    steps(m, 1);
    expect(snapshot(m, 1).entities.some((e) => e.id === CJ)).toBe(true);
    // Expires after 3 s in the open.
    const m2 = hunt();
    place(m2, FOE, MID.x + 8000, MID.y, 0);
    cast(m2, CJ, 2, MID.x, MID.y);
    steps(m2, 89);
    expect(m2.world.stealthT[CJ]).toBeGreaterThan(0);
    steps(m2, 1);
    expect(m2.world.stealthT[CJ]).toBe(0);
    // In a bush: lasts while inside and 1.5 s after leaving.
    const m3 = hunt();
    const b = BUSHES[0];
    place(m3, CJ, b.x, b.y, 0);
    place(m3, FOE, MID.x + 20000, MID.y, 0);
    cast(m3, CJ, 2, b.x, b.y);
    steps(m3, 200);
    expect(m3.world.stealthT[CJ]).toBeGreaterThan(0);
    place(m3, CJ, b.x + 6000, b.y, 0);
    steps(m3, 44);
    expect(m3.world.stealthT[CJ]).toBeGreaterThan(0);
    steps(m3, 2);
    expect(m3.world.stealthT[CJ]).toBe(0);
  });

  it('Pack Hunt: marks the lowest-HP enemy hero within 12 m, dashes to it: 150 (+30/lvl) + 10% missing HP', () => {
    const m = hunt();
    const w = m.world;
    setLevel(m, CJ, 4);
    place(m, FOE, MID.x + 8000, MID.y, 2048);
    place(m, FOE2, MID.x + 6000, MID.y + 2000, 2048);
    w.hp[FOE] = 3000; // lower HP than FOE2: the mark goes to FOE although FOE2 is nearer
    w.hurtTick[FOE] = w.globals[G.Tick];
    w.kHurt[FOE] = w.globals[G.Tick]; // in combat (hit by an enemy hero, sim v4): no regen while the dash flies
    cast(m, CJ, 3, MID.x, MID.y);
    expect(cd(m, CJ, 3)).toBe(1800);
    expect(w.revealT[FOE]).toBeGreaterThan(0);
    const missing = w.maxHp[FOE] - 3000;
    const lost = hpLoss(m, FOE, () => steps(m, 20));
    expect(lost).toBe(heroHit(150 + 30 * 3 + Math.trunc((missing * 1000) / 10000), 15));
    expect(w.hp[FOE2]).toBe(w.maxHp[FOE2]);
    // Nobody in 12 m: nothing happens, no cooldown.
    const m2 = hunt();
    setLevel(m2, CJ, 4);
    place(m2, FOE, MID.x + 30000, MID.y, 0);
    cast(m2, CJ, 3, MID.x, MID.y);
    expect(cd(m2, CJ, 3)).toBe(0);
  });

  it('Pack Hunt: a takedown within 3 s resets the cooldown once (Feeding Frenzy: twice)', () => {
    const run = (frenzy: boolean) => {
      const m = hunt();
      const w = m.world;
      setLevel(m, CJ, 9);
      if (frenzy) chooseTalent(m, CJ, 2, 0);
      let resets = 0;
      for (let k = 0; k < 3; k++) {
        place(m, FOE, w.x[CJ] + 4000, w.y[CJ], 2048);
        w.alive[FOE] = 1;
        w.hp[FOE] = 600;
        w.timer[FOE] = 0;
        cast(m, CJ, 3, w.x[CJ], w.y[CJ]);
        steps(m, 10);
        w.hp[FOE] = 1;
        dealDamage(m, CJ, 0, Kind.Hero, FOE, 100, 'basic');
        resolveDeaths(m);
        if (cd(m, CJ, 3) === 0) resets++;
        else break;
      }
      return resets;
    };
    expect(run(false)).toBe(1);
    expect(run(true)).toBe(2);
  });

  it('talents: Long Jeer 5.5 m; Cruel Jeer recast slows 30% for 1 s; Ambush first hit out of stealth +40%', () => {
    const m = hunt();
    setLevel(m, CJ, 3);
    chooseTalent(m, CJ, 0, 0);
    place(m, FOE, MID.x, MID.y + 20000, 0);
    cast(m, CJ, 0, MID.x + 9000, MID.y);
    steps(m, 10);
    expect(m.world.x[CJ]).toBe(MID.x + 5500);

    const m2 = hunt();
    const w2 = m2.world;
    setLevel(m2, CJ, 3);
    chooseTalent(m2, CJ, 0, 1);
    cast(m2, CJ, 0, MID.x + 5000, MID.y);
    steps(m2, 8);
    expect(w2.slowT[FOE]).toBe(0);
    place(m2, FOE, w2.x[CJ] - 1500, w2.y[CJ], 0);
    cast(m2, CJ, 0, w2.x[CJ] - 5000, w2.y[CJ]);
    steps(m2, 3);
    expect(w2.slowBp[FOE]).toBe(3000);

    const m3 = hunt();
    const w3 = m3.world;
    setLevel(m3, CJ, 9);
    chooseTalent(m3, CJ, 2, 1);
    w3.facing[FOE] = 2048;
    cast(m3, CJ, 2, MID.x, MID.y);
    expect(hpLoss(m3, FOE, () => dealDamage(m3, CJ, 0, Kind.Hero, FOE, 100, 'basic'))).toBe(heroHit(140, 15));
    expect(hpLoss(m3, FOE, () => dealDamage(m3, CJ, 0, Kind.Hero, FOE, 100, 'basic'))).toBe(heroHit(100, 15));
  });
});
