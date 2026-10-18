import { describe, expect, it } from 'vitest';
import { Op, type Command } from '../../src/sim/api';
import { createMatch, fillPicks, hash, hashTrail, replayRecord, result, snapshot, step } from '../../src/sim/index';
import { applyOrder } from '../../src/sim/units/hero';
import { runReplay } from '../../src/sim/replay';
import { Rng } from '../../src/sim/rng';
import { randomCommand } from './helpers';
import { NIGHTLY } from './bot-helpers';

function playRandom(seed: number, ticks: number) {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
  const r = new Rng(seed ^ 0x5eed);
  for (let t = 0; t < ticks && !result(m); t++) {
    const c = randomCommand(r);
    const list: Command[] = c ? [c] : [];
    if (c && r.int(10) === 0) list.push(randomCommand(r, 10000)!); // two in one tick: the latest wins
    step(m, list);
  }
  return m;
}

describe('determinism (§15 item 1)', { timeout: 120000 }, () => {
  it('the same seed and commands give the same hash trail', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = playRandom(seed, 900);
      const b = playRandom(seed, 900);
      expect(hashTrail(a)).toEqual(hashTrail(b));
      expect(hash(a)).toBe(hash(b));
    }
  });
  it('the hash changes every tick on an empty map', () => {
    const { picks, tricks } = fillPicks(9, 'sage', 'hiss');
    const m = createMatch({ seed: 9, picks, tricks, difficulty: 'normal' });
    let last = hash(m);
    for (let t = 0; t < 60; t++) {
      step(m);
      const h = hash(m);
      expect(h).not.toBe(last);
      last = h;
    }
  });
  it('record then replay gives identical hashes every 30 ticks (full matches)', () => {
    for (const seed of [1, 0xffffffff]) {
      const m = playRandom(seed, 30000);
      const res = result(m);
      expect(res).not.toBeNull();
      const rec = replayRecord(m)!;
      const run = runReplay(rec);
      expect(run.trail).toEqual(hashTrail(m));
      expect(run.result).toEqual(res);
    }
  });
  it('a minions-only match ends with a core kill, and the same seed gives the same hash twice', () => {
    const run = (seed: number) => {
      const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
      const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
      while (!result(m)) step(m);
      return { res: result(m)!, trail: hashTrail(m).slice() };
    };
    const a = run(424242);
    const b = run(424242);
    expect(a.res.reason).toBe('core');
    expect(a.res.ticks).toBeLessThan(19800);
    expect(a.res.finalHash).toBe(b.res.finalHash);
    expect(a.trail).toEqual(b.trail);
  });
});

/**
 * An aggressive human: attack-moves at the enemy and casts every slot and the trick at the nearest visible enemy
 * hero, through the snapshot (as the input layer would). Bot slots also get commands straight into the sim (not
 * replayable, so only used for the same-seed-twice check).
 */
function brawl(seed: number, ticks: number, driveBots: boolean) {
  const hero = (['clem', 'sage', 'brutus', 'cacklejaw'] as const)[seed % 4];
  const trick = (['pounce', 'snack', 'hiss'] as const)[seed % 3];
  const { picks, tricks } = fillPicks(seed, hero, trick);
  const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
  const r = new Rng(seed ^ 0xb7a1);
  for (let t = 0; t < ticks && !result(m); t++) {
    const snap = snapshot(m, 0);
    const me = snap.entities.find((e) => e.id === 0)!;
    let foe = -1;
    let best = Infinity;
    for (const e of snap.entities) {
      if (e.kind !== 'hero' || e.team !== 1 || e.state === 'dead') continue;
      const d = (e.x - me.x) ** 2 + (e.y - me.y) ** 2;
      if (d < best) {
        best = d;
        foe = e.id;
      }
    }
    const target = foe >= 0 ? snap.entities.find((e) => e.id === foe)! : { x: 60000, y: 30000 };
    let cmd: Command | null = null;
    if (t % 20 === 0) cmd = { op: Op.AttackMove, x: target.x, y: target.y };
    else if (t % 7 === 0) cmd = { op: Op.Cast, slot: r.int(4) as 0 | 1 | 2 | 3, x: target.x, y: target.y, id: foe >= 0 && r.int(2) ? foe : 255 };
    else if (t % 151 === 0) cmd = { op: Op.Trick, x: target.x, y: target.y };
    else if (t % 300 === 0) cmd = { op: Op.Talent, tier: r.int(3) as 0 | 1 | 2, choice: r.int(2) as 0 | 1 };
    if (driveBots && t % 9 === 0) {
      for (let slot = 1; slot < 6; slot++) {
        const w = m.world;
        const tx = slot < 3 ? 70000 : 30000;
        applyOrder(m, slot, r.int(3) === 0 ? { op: Op.AttackMove, x: tx, y: 30000 } : { op: Op.Cast, slot: r.int(4) as 0 | 1 | 2 | 3, x: w.x[0] + r.range(-3000, 3000), y: w.y[0] + r.range(-3000, 3000), id: r.int(2) ? 0 : 255 });
      }
    }
    step(m, cmd ? [cmd] : []);
  }
  return m;
}

describe('determinism with abilities (§15 items 1 and 10)', { timeout: 120000 }, () => {
  it('a six-hero brawl with every ability and trick gives the same hash trail twice', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const a = brawl(seed, 3000, true);
      const b = brawl(seed, 3000, true);
      expect(hashTrail(a)).toEqual(hashTrail(b));
      expect(hash(a)).toBe(hash(b));
    }
  });
  it('an ability-heavy human match records and replays to identical hashes every 30 ticks', () => {
    for (const seed of [3, 4, 5, 6]) {
      const m = brawl(seed, 30000, false);
      const res = result(m);
      expect(res).not.toBeNull();
      const run = runReplay(replayRecord(m)!);
      expect(run.trail).toEqual(hashTrail(m));
      expect(run.result).toEqual(res);
    }
  });
});

/**
 * §15 item 1 at scale: random command streams over full matches, recorded then replayed from the record alone, hash
 * trails compared every 30 ticks (tools/lib/fuzz-entry.ts on the bundled sim). Per commit: 24 seeds spread over the
 * uint32 range (0 and 0xffffffff included). Nightly (PAWLEGENDS_NIGHTLY=1): 1,000 seeds in parallel processes
 * (tools/determinism.mjs; also `npm run determinism -- --seeds 1000`).
 */
type Fuzz = typeof import('../../tools/lib/fuzz-entry');
describe('determinism fuzz (§15 item 1)', { timeout: 600000 }, () => {
  it('24 seeds × random command streams: record → replay gives identical hash trails and results', async () => {
    const { importSim } = await import('../../tools/lib/sim-bundle.mjs');
    const fz = (await importSim('tools/lib/fuzz-entry.ts')) as Fuzz;
    const rows = [];
    for (let i = 0; i < 24; i++) rows.push(fz.fuzzMatch(fz.fuzzSeed(i)));
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    expect(new Set(rows.map((r) => r.hero)).size).toBe(4);
    expect(new Set(rows.map((r) => r.difficulty)).size).toBe(3);
  });
});

describe.skipIf(!NIGHTLY)('determinism fuzz nightly (§15 item 1)', { timeout: 3600000 }, () => {
  it('1,000 seeds × random command streams: record → replay gives identical hash trails', async () => {
    const { runFuzz } = await import('../../tools/determinism.mjs');
    const { cpus } = await import('node:os');
    const rows = (await runFuzz(0, 1000, Math.max(1, cpus().length - 2))) as ReturnType<Fuzz['fuzzMatch']>[];
    console.log(`determinism nightly: ${rows.length} seeds, ${rows.reduce((s, r) => s + r.commands, 0)} commands, ${rows.filter((r) => !r.ok).length} mismatches`);
    expect(rows).toHaveLength(1000);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });
});
