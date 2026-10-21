import { describe, expect, it } from 'vitest';
import { ZONE_KIND } from '../../../src/data/effects';
import { SAGE } from '../../../src/data/heroes/sage';
import { PROJECTILE_KIND } from '../../../src/data/towers';
import { chooseTalent } from '../../../src/sim/heroes/talents';
import { NO_TARGET, Op } from '../../../src/sim/api';
import { snapshot, step } from '../../../src/sim/index';
import { putMinion, towerId } from '../sim-helpers';
import { MID, afterArmour, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Sage (slot 0) vs Sir Brutus (slot 3, armour 40) and Clem (slot 4, armour 25).
const SAGE_ID = 0;
const FOE = 3;
const FOE2 = 4;

function range() {
  const m = heroMatch(['sage', 'clem', 'brutus', 'brutus', 'clem', 'cacklejaw']);
  place(m, SAGE_ID, MID.x, MID.y, 0);
  place(m, FOE, MID.x + 1500, MID.y, 2048);
  place(m, FOE2, MID.x + 20000, MID.y + 20000, 2048);
  hold(m, SAGE_ID, FOE, FOE2);
  tanky(m, SAGE_ID, FOE, FOE2);
  return m;
}

const alive = (m: ReturnType<typeof range>, kind: number): number => {
  let n = 0;
  for (let p = 0; p < m.world.pAlive.length; p++) if (m.world.pAlive[p] === 1 && m.world.pKind[p] === kind) n++;
  return n;
};

describe('Sage (§6.4)', () => {
  it('data matches POC.md §6.2 and §6.4', () => {
    expect(SAGE.base).toEqual({ hp: 480, hpPerLevel: 50, attack: 52, attackPerLevel: 5, attackEvery: 27, range: 6000, speed: 4900, armour: 15, armourPerLevel: 2 });
    const a = SAGE.abilities;
    expect([a.q.cooldown, a.w.cooldown, a.e.cooldown, a.r.cooldown]).toEqual([210, 420, 360, 2100]);
    expect([a.q.arrows, a.q.arc, a.q.range, a.q.dmg, a.q.dmgPerLevel, a.q.maxPerTarget]).toEqual([5, 569, 7000, 55, 10, 3]);
    expect([a.w.range, a.w.arm, a.w.root, a.w.duration, a.w.maxTraps]).toEqual([6000, 15, 30, 900, 2]);
    expect(a.e.dash).toBe(3000);
    expect([a.r.windup, a.r.range, a.r.width, a.r.dmg, a.r.dmgPerLevel, a.r.minionBp]).toEqual([30, 40000, 1200, 220, 40, 5000]);
    expect([SAGE.passive.everyNth, SAGE.passive.pierceRange]).toEqual([4, 7000]);
  });

  it('Volley: 5 arrows in a 50° cone; one target takes at most 3', () => {
    const m = range();
    const w = m.world;
    const hp = w.hp[FOE];
    cast(m, SAGE_ID, 0, MID.x + 1500, MID.y);
    expect(alive(m, PROJECTILE_KIND.arrow)).toBeGreaterThan(0);
    expect(cd(m, SAGE_ID, 0)).toBe(210);
    steps(m, 15);
    expect(hp - w.hp[FOE]).toBe(3 * heroHit(55, 40));
    expect(alive(m, PROJECTILE_KIND.arrow)).toBe(0);
  });

  it('Volley fires 5 arrows (Wide Volley: 7); Sticky Arrows slow 20% for 1 s', () => {
    const count = (talent: number) => {
      const m = range();
      if (talent >= 0) {
        setLevel(m, SAGE_ID, 3);
        chooseTalent(m, SAGE_ID, 0, talent);
      }
      place(m, FOE, MID.x - 20000, MID.y, 0);
      m.world.globals[0] = 300;
      cast(m, SAGE_ID, 0, MID.x + 5000, MID.y);
      return alive(m, PROJECTILE_KIND.arrow);
    };
    expect(count(-1)).toBe(5);
    expect(count(0)).toBe(7);
    const m = range();
    setLevel(m, SAGE_ID, 3);
    chooseTalent(m, SAGE_ID, 0, 1);
    cast(m, SAGE_ID, 0, MID.x + 1500, MID.y);
    steps(m, 3);
    expect(m.world.slowBp[FOE]).toBe(2000);
    expect(m.world.slowT[FOE]).toBeGreaterThan(25);
  });

  it('Steady Paw: every 4th basic pierces in a 7 m line, full damage to each target', () => {
    const m = range();
    const w = m.world;
    place(m, FOE, MID.x - 20000, MID.y, 0);
    const a = putMinion(m, 1, MID.x + 3000, MID.y);
    const b = putMinion(m, 1, MID.x + 5500, MID.y);
    w.hp[a] = w.maxHp[a] = 100000;
    w.hp[b] = w.maxHp[b] = 100000;
    w.attackTimer[SAGE_ID] = 0;
    let pierces = 0;
    let bHits = 0;
    for (let t = 0; t < 27 * 4 + 30; t++) {
      const before = w.pAlive.slice();
      steps(m, 1);
      for (let p = 0; p < w.pAlive.length; p++) if (w.pAlive[p] === 1 && before[p] === 0 && w.pKind[p] === PROJECTILE_KIND.pierce) pierces++;
      for (const e of m.events) if (e.type === 'hit' && e.dst === b && e.src === SAGE_ID) bHits++;
    }
    expect(pierces).toBe(1);
    expect(bHits).toBe(1); // only the pierce shot reaches the minion behind
    expect(w.maxHp[b] - w.hp[b]).toBe(afterArmour(52, 10));
  });

  it('Sun Snare: arms after 0.5 s, roots 1 s, at most 2, hidden from the enemy; out of range it walks in', () => {
    const m = range();
    const w = m.world;
    place(m, FOE, MID.x + 20000, MID.y, 0);
    cast(m, SAGE_ID, 1, MID.x + 4000, MID.y);
    expect(cd(m, SAGE_ID, 1)).toBe(420);
    let z = -1;
    for (let i = 0; i < w.zAlive.length; i++) if (w.zAlive[i] === 1 && w.zKind[i] === ZONE_KIND.trap) z = i;
    expect(z).toBeGreaterThanOrEqual(0);
    expect(snapshot(m, 1).zones.some((s) => s.kind === ZONE_KIND.trap)).toBe(false);
    expect(snapshot(m, 0).zones.some((s) => s.kind === ZONE_KIND.trap)).toBe(true);
    // An enemy on it before it arms is not caught.
    place(m, FOE, MID.x + 4000, MID.y, 0);
    steps(m, 10);
    expect(w.rootT[FOE]).toBe(0);
    steps(m, 5);
    expect(w.rootT[FOE]).toBeGreaterThan(25);
    expect(w.zAlive[z]).toBe(0);

    // Max 2 traps: the third replaces the oldest.
    const m2 = range();
    place(m2, FOE, MID.x + 20000, MID.y, 0);
    for (let i = 0; i < 3; i++) {
      m2.world.cooldowns[SAGE_ID * 5 + 1] = 0;
      cast(m2, SAGE_ID, 1, MID.x + 1000 * (i + 1), MID.y);
    }
    let traps = 0;
    for (let i = 0; i < m2.world.zAlive.length; i++) if (m2.world.zAlive[i] === 1 && m2.world.zKind[i] === ZONE_KIND.trap) traps++;
    expect(traps).toBe(2);

    // A point beyond 6 m: Sage walks in, then sets it.
    const m3 = range();
    place(m3, FOE, MID.x + 20000, MID.y, 0);
    m3.world.globals[0] = 300;
    cast(m3, SAGE_ID, 1, MID.x + 9000, MID.y);
    expect(m3.world.castPhase[SAGE_ID]).toBe(1);
    expect(cd(m3, SAGE_ID, 1)).toBe(0);
    steps(m3, 30 * 2);
    expect(cd(m3, SAGE_ID, 1)).toBeGreaterThan(0);
    expect(m3.world.x[SAGE_ID]).toBeGreaterThan(MID.x + 2500);
  });

  it('Hop Back: dash 3 m away from the aim', () => {
    const m = range();
    cast(m, SAGE_ID, 2, MID.x + 5000, MID.y);
    steps(m, 8);
    expect(m.world.x[SAGE_ID]).toBe(MID.x - 3000);
    expect(cd(m, SAGE_ID, 2)).toBeGreaterThan(340);
  });

  it('Moonshot: 1 s windup, then a 40 m line: first hero takes 220 (+40/lvl), minions passed 50%', () => {
    const m = range();
    const w = m.world;
    setLevel(m, SAGE_ID, 4);
    place(m, FOE, MID.x + 20000, MID.y, 2048);
    place(m, FOE2, MID.x + 30000, MID.y, 2048);
    const minion = putMinion(m, 1, MID.x + 10000, MID.y);
    w.hp[minion] = w.maxHp[minion] = 5000;
    w.stunT[minion] = 1000; // keep it on the line (it would walk to its lane)
    // Through the command path (slot 0 is the human), so the windup event lands in this tick's events.
    step(m, [{ op: Op.Cast, slot: 3, x: MID.x + 20000, y: MID.y, id: NO_TARGET }]);
    expect(m.events.some((e) => e.type === 'windup' && e.src === SAGE_ID && e.ticks === 30)).toBe(true);
    expect(alive(m, PROJECTILE_KIND.moonshot)).toBe(0);
    steps(m, 28);
    expect(alive(m, PROJECTILE_KIND.moonshot)).toBe(0);
    steps(m, 1);
    expect(alive(m, PROJECTILE_KIND.moonshot)).toBe(1);
    expect(cd(m, SAGE_ID, 3)).toBe(2100);
    const hp = w.hp[FOE];
    const hp2 = w.hp[FOE2];
    steps(m, 30);
    const dmg = 220 + 40 * 3;
    expect(hp - w.hp[FOE]).toBe(heroHit(dmg, 40));
    expect(w.hp[FOE2]).toBe(hp2); // stopped at the first hero
    expect(w.maxHp[minion] - w.hp[minion]).toBe(afterArmour(Math.trunc(dmg / 2), 10));
  });

  it('talents: Twin Snares (3 traps, root 1.25 s), Full Moon 50 s, Moon Mark reveals 4 s; Piercing Shot leaves Hop Back at 12 s', () => {
    const m = range();
    const w = m.world;
    setLevel(m, SAGE_ID, 9);
    chooseTalent(m, SAGE_ID, 1, 0);
    chooseTalent(m, SAGE_ID, 2, 1);
    place(m, FOE, MID.x + 20000, MID.y, 0);
    for (let i = 0; i < 3; i++) {
      w.cooldowns[SAGE_ID * 5 + 1] = 0;
      cast(m, SAGE_ID, 1, MID.x + 1000 * (i + 1), MID.y);
    }
    let traps = 0;
    for (let i = 0; i < w.zAlive.length; i++) if (w.zAlive[i] === 1 && w.zKind[i] === ZONE_KIND.trap) traps++;
    expect(traps).toBe(3);
    steps(m, 20);
    place(m, FOE, MID.x + 1000, MID.y, 0);
    steps(m, 1);
    expect(w.rootT[FOE]).toBe(38);
    cast(m, SAGE_ID, 3, MID.x + 1000, MID.y);
    steps(m, 35);
    expect(w.revealT[FOE]).toBeGreaterThan(100);

    const m2 = range();
    setLevel(m2, SAGE_ID, 9);
    chooseTalent(m2, SAGE_ID, 1, 1);
    chooseTalent(m2, SAGE_ID, 2, 0);
    cast(m2, SAGE_ID, 2, MID.x + 5000, MID.y);
    expect(cd(m2, SAGE_ID, 2)).toBe(360); // sim v10: the level-6 branch replaced Quick Hop (8 s)
    steps(m2, 8); // no cast while hopping
    cast(m2, SAGE_ID, 3, MID.x + 5000, MID.y);
    steps(m2, 30);
    expect(cd(m2, SAGE_ID, 3)).toBeGreaterThan(1450);
    expect(cd(m2, SAGE_ID, 3)).toBeLessThanOrEqual(1500);
  });
});

describe('Sage: Piercing Shot (sim v10, GAPS B6 level-6 branch)', () => {
  it('Volley becomes one 9 m line, 600 mm wide, that pierces every enemy in it', () => {
    const m = range();
    const w = m.world;
    setLevel(m, SAGE_ID, 6);
    expect(chooseTalent(m, SAGE_ID, 1, 1)).toBe(true);
    place(m, FOE2, MID.x + 8000, MID.y, 2048);
    const minion = putMinion(m, 1, MID.x + 4000, MID.y);
    const hp = w.hp[FOE];
    const hp2 = w.hp[FOE2];
    cast(m, SAGE_ID, 0, MID.x + 1500, MID.y);
    expect(alive(m, PROJECTILE_KIND.lance)).toBe(1);
    expect(alive(m, PROJECTILE_KIND.arrow)).toBe(0);
    expect(cd(m, SAGE_ID, 0)).toBe(210);
    steps(m, 15);
    const dmg = 95 + 14 * 5;
    expect(hp - w.hp[FOE]).toBe(heroHit(dmg, 40));
    expect(hp2 - w.hp[FOE2]).toBe(heroHit(dmg, 25)); // through the first hero and the minion
    expect(w.maxHp[minion] - w.hp[minion]).toBeGreaterThan(0);
    expect(alive(m, PROJECTILE_KIND.lance)).toBe(0);
  });

  it('a hero beside the line is missed (one line, not a cone); the snapshot marks the branch for both teams', () => {
    const m = range();
    const w = m.world;
    setLevel(m, SAGE_ID, 6);
    chooseTalent(m, SAGE_ID, 1, 1);
    place(m, FOE2, MID.x + 3000, MID.y + 1400, 2048);
    const hp2 = w.hp[FOE2];
    cast(m, SAGE_ID, 0, MID.x + 1500, MID.y);
    steps(m, 15);
    expect(w.hp[FOE2]).toBe(hp2);
    for (const team of [0, 1] as const) expect(snapshot(m, team).entities.find((e) => e.id === SAGE_ID)?.branch).toBe(true);
    expect(snapshot(m, 1).entities.find((e) => e.id === FOE)?.branch).toBeUndefined();
  });
});

describe('Sage vs structures', () => {
  it('Steady Paw never skips a tower: every basic at a structure is a bolt that lands', () => {
    const m = heroMatch(['sage', 'clem', 'brutus', 'brutus', 'clem', 'cacklejaw']);
    const w = m.world;
    const tower = towerId(1, 0); // Woof Sunny outer (66, 51)
    // Put a Purrhaven minion near it so backdoor protection does not halve the numbers, and the tower busy with it.
    putMinion(m, 0, w.x[tower] - 3000, w.y[tower] - 2000);
    place(m, SAGE_ID, w.x[tower] - 6500, w.y[tower], 0);
    hold(m, 1, 2, 3, 4, 5);
    w.attackTimer[SAGE_ID] = 0;
    let bolts = 0;
    for (let t = 0; t < 27 * 4 + 20; t++) {
      steps(m, 1);
      for (const e of m.events) if (e.type === 'hit' && e.src === SAGE_ID && e.dst === tower) bolts++;
    }
    expect(bolts).toBeGreaterThanOrEqual(4);
  });
});
