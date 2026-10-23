import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { LAMBO } from '../../../src/data/heroes/lambo';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { PROJECTILE_KIND } from '../../../src/data/towers';
import { dealDamage } from '../../../src/sim/combat/damage';
import { stun } from '../../../src/sim/effects';
import { isqrt } from '../../../src/sim/fixed';
import { FM, Kind } from '../../../src/sim/world';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Lambo (slot 0) with Clem (slot 1) vs Clem (slot 3, armour 25) and Sage (slot 4).
const LAMBO_ID = 0;
const ALLY = 1;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('lambo'));

function arena() {
  const m = heroMatch(['lambo', 'clem', 'sage', 'clem', 'sage', 'clem']);
  place(m, LAMBO_ID, MID.x, MID.y, 0);
  place(m, ALLY, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 3000, MID.y, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 20000, MID.y + 20000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, ALLY, FOE, FOE2);
  return m;
}

const dist = (m: ReturnType<typeof arena>, a: number, b: number): number => isqrt((m.world.x[a] - m.world.x[b]) ** 2 + (m.world.y[a] - m.world.y[b]) ** 2);

describe('Lambo, shelter champion tank (sim v9)', () => {
  it('data: a STELLAR cat tank with cooldowns inside the GDD bands', () => {
    expect([LAMBO.side, LAMBO.role, LAMBO.element]).toEqual(['cat', 'tank', 'STELLAR']);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([240, 420, 420, 2100]);
    expect(A.r.root).toBe(30); // 1.0 s (casual-friendly CC chain)
    // the final spec: the text matches the data (Big Hug 7% / 4.5% of his max HP), the hero-fight tuning nudged down
    expect([A.w.selfBp, A.w.allyBp]).toEqual([700, 450]);
    expect(LAMBO.pvp).toEqual({ dmgBp: 10500, takenBp: 9100 });
    expect(LAMBO.talents.flat().map((t) => t.id)).toEqual(['long-toss', 'extra-crispy-tuna', 'bigger-hug', 'flop-further', 'fairy-light-finale', 'wide-tangle']);
  });

  it('Brave With Friends: 10% less damage with an allied hero within 4 m', () => {
    expect(A.passive.reduceBp).toBe(1000);
    const m = arena();
    const w = m.world;
    tanky(m, LAMBO_ID);
    let hp = w.hp[LAMBO_ID];
    dealDamage(m, FOE, 1, Kind.Hero, LAMBO_ID, 200, 'basic');
    const alone = hp - w.hp[LAMBO_ID];
    place(m, ALLY, MID.x - 3000, MID.y, 0);
    hp = w.hp[LAMBO_ID];
    dealDamage(m, FOE, 1, Kind.Hero, LAMBO_ID, 200, 'basic');
    const brave = hp - w.hp[LAMBO_ID];
    expect(brave).toBe(Math.trunc((alone * (10000 - A.passive.reduceBp)) / 10000));
  });

  it('Tuna Toss: a skillshot that stops at the first unit it hits and slows it', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE2, MID.x + 5000, MID.y, 2048); // behind FOE on the same line
    const hp = w.hp[FOE];
    const hp2 = w.hp[FOE2];
    cast(m, LAMBO_ID, 0, MID.x + 6000, MID.y);
    expect(w.pKind.includes(PROJECTILE_KIND.tuna)).toBe(true);
    steps(m, 20);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, 25));
    expect(w.slowBp[FOE]).toBe(A.q.slowBp);
    expect(w.hp[FOE2]).toBe(hp2);
    expect(cd(m, LAMBO_ID, 0)).toBeGreaterThan(0);
  });

  it('Big Hug: a shield on Lambo and on the nearest allied hero within 4 m (shares of his max HP)', () => {
    const m = arena();
    const w = m.world;
    place(m, ALLY, MID.x - 2000, MID.y, 0);
    cast(m, LAMBO_ID, 1, MID.x, MID.y);
    expect(w.shield[LAMBO_ID]).toBe(Math.trunc((w.maxHp[LAMBO_ID] * A.w.selfBp) / 10000));
    expect(w.shield[ALLY]).toBe(Math.trunc((w.maxHp[LAMBO_ID] * A.w.allyBp) / 10000));
    expect(cd(m, LAMBO_ID, 1)).toBe(A.w.cooldown);
  });

  it('Belly Flop: lands a 2.2 m ring that damages and stuns; a hop stopped by a stun lands nothing', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 4500, MID.y, 2048);
    const hp = w.hp[FOE];
    cast(m, LAMBO_ID, 2, MID.x + 4000, MID.y);
    expect(w.fmKind[LAMBO_ID]).toBe(FM.Dash);
    let stunned = false;
    for (let t = 0; t < 12; t++) {
      steps(m, 1);
      if (w.stunT[FOE] > 0) stunned = true;
    }
    expect(stunned).toBe(true);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.e.dmg, 25));

    const m2 = arena();
    const w2 = m2.world;
    place(m2, FOE, MID.x + 4500, MID.y, 2048);
    const hp2 = w2.hp[FOE];
    cast(m2, LAMBO_ID, 2, MID.x + 4000, MID.y);
    stun(w2, LAMBO_ID, 20);
    steps(m2, 12);
    expect(w2.hp[FOE]).toBe(hp2);
    expect(w2.stunT[FOE]).toBe(0);
    expect(w2.kStage[LAMBO_ID]).toBe(0);
  });

  it('Tangled Lights: 0.5 s wind-up, pulls enemy heroes toward Lambo but never past him, damage and a 1 s root', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, LAMBO_ID, 4);
    place(m, FOE, MID.x + 4000, MID.y, 2048);
    place(m, FOE2, MID.x - 1200, MID.y + 400, 0); // already hugging him: no pull
    const hp = w.hp[FOE];
    const before = dist(m, LAMBO_ID, FOE);
    cast(m, LAMBO_ID, 3, MID.x, MID.y);
    steps(m, A.r.windup);
    expect(w.rootT[FOE]).toBeGreaterThan(0);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.r.dmg + 3 * A.r.dmgPerLevel, 25));
    steps(m, 10);
    const after = dist(m, LAMBO_ID, FOE);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThanOrEqual(A.r.pull + 50);
    // Never past him: still on his +x side, outside both footprints.
    expect(w.x[FOE]).toBeGreaterThan(w.x[LAMBO_ID]);
    expect(after).toBeGreaterThanOrEqual(1000);
    expect(w.x[FOE2]).toBeLessThan(w.x[LAMBO_ID]);
    expect(cd(m, LAMBO_ID, 3)).toBeGreaterThan(0);
  });
});
