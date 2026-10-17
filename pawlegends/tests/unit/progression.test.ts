import { describe, expect, it } from 'vitest';
import { FOUNTAIN } from '../../src/data/map';
import { TRICKS } from '../../src/data/tricks';
import { XP } from '../../src/data/xp';
import { Op } from '../../src/sim/api';
import { dealDamage, resolveDeaths } from '../../src/sim/combat/damage';
import { stun } from '../../src/sim/effects';
import { step } from '../../src/sim/index';
import { levelForXp } from '../../src/sim/progression/levels';
import { applyOrder } from '../../src/sim/units/hero';
import { G, Kind, TALENT_TIERS } from '../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, setLevel, steps } from './heroes/kit-helpers';
import { putMinion } from './sim-helpers';

const match = () => {
  const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw'], ['pounce', 'snack', 'hiss', 'pounce', 'snack', 'hiss']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -30000 : 30000), MID.y + id * 3000, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  return m;
};

function kill(m: ReturnType<typeof match>, by: number, victim: number): void {
  m.world.hp[victim] = 1;
  dealDamage(m, by, m.world.team[by], Kind.Hero, victim, 1000, 'basic');
  resolveDeaths(m);
}

describe('levels and XP (§6.1)', () => {
  it('XP table: levels 1 to 10 at 0, 120, 300, 540, 840, 1200, 1620, 2100, 2640, 3240', () => {
    expect(XP.toLevel).toEqual([0, 120, 300, 540, 840, 1200, 1620, 2100, 2640, 3240]);
    expect([0, 119, 120, 299, 300, 3239, 3240, 99999].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 9, 10, 10]);
  });

  it('a level adds per-level HP and armour; talents are offered at 3, 6 and 9; bots take the first', () => {
    const m = match();
    const w = m.world;
    setLevel(m, 0, 3);
    expect(w.level[0]).toBe(3);
    expect(w.maxHp[0]).toBe(620 + 2 * 60);
    expect(w.armour[0]).toBe(25 + 2 * 2);
    expect(w.talents[0 * TALENT_TIERS]).toBe(-1); // the human picks
    setLevel(m, 4, 9);
    expect([w.talents[4 * TALENT_TIERS], w.talents[4 * TALENT_TIERS + 1], w.talents[4 * TALENT_TIERS + 2]]).toEqual([0, 0, 0]);
    // The human's pick goes through the Talent command; a locked tier is refused.
    step(m, [{ op: Op.Talent, tier: 1, choice: 1 }]);
    expect(w.talents[1]).toBe(-1);
    step(m, [{ op: Op.Talent, tier: 0, choice: 1 }]);
    expect(w.talents[0]).toBe(1);
  });

  it('kill XP: 100 + 20 × victim level + 25 per streak step (max +100), shared among heroes within 10 m', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    kill(m, 0, 3);
    expect(w.xp[0]).toBe(120);
    expect(m.stats[0].kills).toBe(1);
    expect(w.killStreak[0]).toBe(1);
    // Two heroes near: split.
    const m2 = match();
    place(m2, 3, MID.x, MID.y, 0);
    place(m2, 0, MID.x - 2000, MID.y, 0);
    place(m2, 1, MID.x + 9000, MID.y, 0);
    m2.world.killStreak[3] = 6; // streak bonus capped at +100
    kill(m2, 0, 3);
    expect(m2.world.xp[0]).toBe(110);
    expect(m2.world.xp[1]).toBe(110);
    expect(m2.world.xp[2]).toBe(0);
  });

  it('assists: a hero who hit the victim in the last 6 s shares the XP and gets the assist', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    dealDamage(m, 2, 0, Kind.Hero, 3, 10, 'basic'); // Brutus, 30 m away
    steps(m, 150);
    kill(m, 0, 3);
    expect(m.stats[2].assists).toBe(1);
    expect(w.xp[2]).toBe(60);
    // Older than 6 s: no assist.
    const m2 = match();
    place(m2, 3, MID.x, MID.y, 0);
    place(m2, 0, MID.x - 2000, MID.y, 0);
    dealDamage(m2, 2, 0, Kind.Hero, 3, 10, 'basic');
    m2.world.hurtTick[3] = 0;
    steps(m2, 200);
    kill(m2, 0, 3);
    expect(m2.stats[2].assists).toBe(0);
  });

  it('a kill landed by a tower or minion goes to the last hero who hit the victim', () => {
    const m = match();
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    dealDamage(m, 0, 0, Kind.Hero, 3, 10, 'basic');
    const minion = putMinion(m, 0, MID.x + 1000, MID.y);
    m.world.hp[3] = 1;
    dealDamage(m, minion, 0, Kind.Minion, 3, 100, 'basic');
    resolveDeaths(m);
    expect(m.stats[0].kills).toBe(1);
  });

  it('minion XP is shared by enemy heroes within 10 m; +20% when the team is behind on levels', () => {
    const m = match();
    const w = m.world;
    const minion = putMinion(m, 1, MID.x, MID.y);
    place(m, 0, MID.x - 3000, MID.y, 0);
    w.hp[minion] = 0;
    resolveDeaths(m);
    expect(w.xp[0]).toBe(30);
    const m2 = match();
    setLevel(m2, 3, 2);
    const minion2 = putMinion(m2, 1, MID.x, MID.y);
    place(m2, 0, MID.x - 3000, MID.y, 0);
    m2.world.hp[minion2] = 0;
    resolveDeaths(m2);
    expect(m2.world.xp[0]).toBe(36);
  });

  it('the ultimate unlocks at level 4', () => {
    const m = match();
    cast(m, 0, 3, MID.x, MID.y);
    expect(cd(m, 0, 3)).toBe(0);
    setLevel(m, 0, XP.ultimateLevel);
    cast(m, 0, 3, MID.x, MID.y);
    expect(cd(m, 0, 3)).toBeGreaterThan(0);
  });
});

describe('Nap and regen (§6.1)', () => {
  it('Nap: 4 s channel home, broken by damage', () => {
    const m = match();
    const w = m.world;
    step(m, [{ op: Op.Nap }]);
    expect(w.napT[0]).toBe(120 - 1); // the command tick is the first channel tick
    steps(m, 60);
    dealDamage(m, 3, 1, Kind.Hero, 0, 5, 'basic');
    expect(w.napT[0]).toBe(0);
    steps(m, 80);
    expect(w.x[0]).toBe(MID.x - 30000);
    step(m, [{ op: Op.Nap }]);
    steps(m, 120);
    expect(w.x[0]).toBeLessThan(FOUNTAIN.x + FOUNTAIN.radius);
  });

  it('regen: 1% max HP a second after 5 s without damage', () => {
    const m = match();
    const w = m.world;
    w.hp[0] = 100;
    dealDamage(m, 3, 1, Kind.Hero, 0, 1, 'basic');
    const hp = w.hp[0];
    steps(m, 140);
    expect(w.hp[0]).toBe(hp);
    steps(m, 40);
    expect(w.hp[0]).toBe(hp + Math.trunc(620 / 100));
  });
});

describe('Paw Tricks (§6.7)', () => {
  it('Pounce: blink 4 m, 120 s', () => {
    const m = match();
    place(m, 0, MID.x, MID.y, 0);
    cast(m, 0, 4, MID.x + 10000, MID.y);
    expect(m.world.x[0]).toBe(MID.x + 4000);
    expect(cd(m, 0, 4)).toBe(TRICKS.pounce.cooldown);
  });

  it('Snack Break: 25% max HP over 2 s, broken by hard CC', () => {
    const m = match();
    const w = m.world;
    w.hp[1] = 100;
    w.hurtTick[1] = w.globals[G.Tick];
    applyOrder(m, 1, { op: Op.Trick, x: w.x[1], y: w.y[1] });
    steps(m, 61);
    expect(w.hp[1]).toBe(100 + Math.trunc((480 * 2500) / 10000));
    expect(cd(m, 1, 4)).toBeGreaterThan(TRICKS.snack.cooldown - 70);
    const m2 = match();
    const w2 = m2.world;
    w2.hp[1] = 100;
    w2.hurtTick[1] = w2.globals[G.Tick];
    applyOrder(m2, 1, { op: Op.Trick, x: w2.x[1], y: w2.y[1] });
    steps(m2, 30);
    stun(w2, 1, 10);
    const mid = w2.hp[1];
    steps(m2, 40);
    expect(w2.hp[1]).toBe(mid);
    expect(mid).toBeGreaterThan(100);
  });

  it('Hiss: fear 1 s in a 3 m radius', () => {
    const m = match();
    const w = m.world;
    place(m, 2, MID.x, MID.y, 0);
    place(m, 3, MID.x + 2500, MID.y, 0);
    place(m, 4, MID.x + 4000, MID.y, 0);
    applyOrder(m, 2, { op: Op.Trick, x: MID.x, y: MID.y });
    step(m);
    expect(w.fearT[3]).toBe(TRICKS.hiss.fear);
    expect(w.fearT[4]).toBe(0);
  });
});
