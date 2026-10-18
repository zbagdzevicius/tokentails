import { describe, expect, it } from 'vitest';
import { FOUNTAIN } from '../../src/data/map';
import { TRICKS } from '../../src/data/tricks';
import { TAKEDOWN_HEAL, XP } from '../../src/data/xp';
import { Op } from '../../src/sim/api';
import { dealDamage, resolveDeaths } from '../../src/sim/combat/damage';
import { stun } from '../../src/sim/effects';
import { step } from '../../src/sim/index';
import { levelForXp } from '../../src/sim/progression/levels';
import { applyOrder } from '../../src/sim/units/hero';
import { G, Kind, RANGE, TALENT_TIERS } from '../../src/sim/world';
import { TOWERS } from '../../src/data/towers';
import { TOWER_SPOTS } from '../../src/data/map';
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
  it('XP table (sim v4): levels 1 to 10 at 0, 60, 200, 360, 580, 860, 1200, 1600, 2060, 2580', () => {
    expect(XP.toLevel).toEqual([0, 60, 200, 360, 580, 860, 1200, 1600, 2060, 2580]);
    expect([0, 59, 60, 199, 200, 2579, 2580, 99999].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 9, 10, 10]);
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

  it('kill XP (sim v4): 80 + 15 × victim level + the bounty (20 per streak step from 3, max +80), shared within 10 m', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    kill(m, 0, 3);
    expect(w.xp[0]).toBe(95);
    expect(m.stats[0].kills).toBe(1);
    expect(w.killStreak[0]).toBe(1);
    expect(m.events.some((e) => e.type === 'firstBlood' && e.killer === 0 && e.victim === 3)).toBe(true);
    // Two heroes near: split, with the victim's bounty; ending it sends `shutdown`.
    const m2 = match();
    place(m2, 3, MID.x, MID.y, 0);
    place(m2, 0, MID.x - 2000, MID.y, 0);
    place(m2, 1, MID.x + 9000, MID.y, 0);
    m2.world.killStreak[3] = 6; // bounty capped at +80
    kill(m2, 0, 3);
    expect(m2.world.xp[0]).toBe(Math.trunc((95 + 80) / 2));
    expect(m2.world.xp[1]).toBe(Math.trunc((95 + 80) / 2));
    expect(m2.world.xp[2]).toBe(0);
    expect(m2.events.some((e) => e.type === 'shutdown' && e.killer === 0 && e.victim === 3 && e.value === 80)).toBe(true);
    expect(m2.world.killStreak[3]).toBe(0);
  });

  it('a third takedown in a row puts a bounty on the hero (`bounty` event)', () => {
    const m = match();
    place(m, 0, MID.x - 2000, MID.y, 0);
    for (const v of [3, 4, 5]) {
      place(m, v, MID.x, MID.y, 0);
      kill(m, 0, v);
    }
    expect(m.world.killStreak[0]).toBe(3);
    expect(m.events.some((e) => e.type === 'bounty' && e.id === 0 && e.value === 60)).toBe(true);
  });

  it('upset: a victim more than one level above its killer gives +50% kill XP', () => {
    const m = match();
    setLevel(m, 3, 3);
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    const before = m.world.xp[0];
    kill(m, 0, 3);
    // 80 + 15 × 3 = 125, × 1.5; slot 0 is one level-average behind beyond the free first: catch-up does not apply yet.
    expect(m.world.xp[0] - before).toBe(Math.trunc((125 * 15000) / 10000));
  });

  it('takedown heal (sim v4): every credited hero gets TAKEDOWN_HEAL of its max HP back (a `buff` event)', () => {
    const m = match();
    const w = m.world;
    setLevel(m, 0, 2); // the kill's 95 XP then stays short of level 3 (no level-up heal)
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    w.hp[0] = 100;
    kill(m, 0, 3);
    expect(w.level[0]).toBe(2);
    expect(w.hp[0]).toBe(100 + Math.trunc((w.maxHp[0] * TAKEDOWN_HEAL.healBp) / 10000));
    expect(m.events.some((e) => e.type === 'buff' && e.id === 0 && e.kind === 'takedown')).toBe(true);
  });

  it('assists: a hero who hit the victim in the last 10 s shares the XP and gets the assist', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 0, MID.x - 2000, MID.y, 0);
    dealDamage(m, 2, 0, Kind.Hero, 3, 10, 'basic'); // Brutus, 30 m away
    steps(m, 280);
    const before = w.xp[2]; // the trickle (2 XP a second) kept running
    kill(m, 0, 3);
    expect(m.stats[2].assists).toBe(1);
    expect(w.xp[2] - before).toBe(Math.trunc(95 / 2));
    // Older than 10 s: no assist.
    const m2 = match();
    place(m2, 3, MID.x, MID.y, 0);
    place(m2, 0, MID.x - 2000, MID.y, 0);
    dealDamage(m2, 2, 0, Kind.Hero, 3, 10, 'basic');
    steps(m2, 310);
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

  it('minion XP is shared by enemy heroes within 10 m; catch-up +35% a level behind the enemy average beyond the first (sim v8), max +75%', () => {
    const m = match();
    const w = m.world;
    const minion = putMinion(m, 1, MID.x, MID.y);
    place(m, 0, MID.x - 3000, MID.y, 0);
    w.hp[minion] = 0;
    resolveDeaths(m);
    expect(w.xp[0]).toBe(30);
    const minionXp = (enemyLevel: number): number => {
      const m2 = match();
      for (const e of [3, 4, 5]) setLevel(m2, e, enemyLevel);
      const minion2 = putMinion(m2, 1, MID.x, MID.y);
      place(m2, 0, MID.x - 3000, MID.y, 0);
      m2.world.hp[minion2] = 0;
      resolveDeaths(m2);
      return m2.world.xp[0];
    };
    expect(minionXp(2)).toBe(30); // one level behind: free
    expect(minionXp(3)).toBe(Math.trunc((30 * 13500) / 10000)); // two behind: +35%
    expect(minionXp(4)).toBe(Math.trunc((30 * 17000) / 10000));
    expect(minionXp(8)).toBe(Math.trunc((30 * 17500) / 10000)); // capped at +75%
  });

  it('XP trickle: 2 XP a second for every living hero from the first wave; a level-up heals 30% max HP', () => {
    const m = match();
    const w = m.world;
    const xp = w.xp[1];
    steps(m, 30);
    expect(w.xp[1] - xp).toBe(XP.trickleXpPerSecond);
    w.hp[1] = 100;
    setLevel(m, 1, 2);
    const per = 50; // Sage: +50 HP a level
    expect(w.hp[1]).toBe(100 + per + Math.trunc((w.maxHp[1] * XP.levelUpHealBp) / 10000));
  });

  it("a fallen tower gives every living hero of the team that took it TOWERS.teamXp", () => {
    const m = match();
    const w = m.world;
    const tower = RANGE.towers + TOWER_SPOTS.length; // Woof's first tower
    const before = [0, 1, 2, 3].map((h) => w.xp[h]);
    w.hp[tower] = 1;
    dealDamage(m, 0, 0, Kind.Hero, tower, 1000, 'basic', { pierce: true });
    resolveDeaths(m);
    expect(w.alive[tower]).toBe(0);
    expect([0, 1, 2].map((h) => w.xp[h] - before[h])).toEqual([TOWERS.teamXp, TOWERS.teamXp, TOWERS.teamXp]);
    expect(w.xp[3]).toBe(before[3]);
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

  it('regen (sim v4): 3% max HP a second after 3 s without damage from an enemy hero', () => {
    const m = match();
    const w = m.world;
    w.hp[0] = 100;
    dealDamage(m, 3, 1, Kind.Hero, 0, 1, 'basic'); // at tick 300
    const hp = w.hp[0];
    steps(m, 85);
    expect(w.hp[0]).toBe(hp);
    steps(m, 40); // the per-second ticks 390 and 420
    expect(w.hp[0]).toBe(hp + 2 * Math.trunc((620 * 300) / 10000));
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
    w.kHurt[1] = w.globals[G.Tick]; // in combat: no regen on top (sim v4)
    applyOrder(m, 1, { op: Op.Trick, x: w.x[1], y: w.y[1] });
    steps(m, 61);
    expect(w.hp[1]).toBe(100 + Math.trunc((480 * 2500) / 10000));
    expect(cd(m, 1, 4)).toBeGreaterThan(TRICKS.snack.cooldown - 70);
    const m2 = match();
    const w2 = m2.world;
    w2.hp[1] = 100;
    w2.hurtTick[1] = w2.globals[G.Tick];
    w2.kHurt[1] = w2.globals[G.Tick];
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
