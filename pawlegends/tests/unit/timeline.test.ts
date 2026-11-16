import { limit } from './cpu-budget';
import { describe, expect, it } from 'vitest';
import { CORE_STATS } from '../../src/data/towers';
import { TIMELINE, TIMELINE_BY } from '../../src/data/timeline';
import { createMatch, fillPicks, result, snapshot, step, type MatchHandle } from '../../src/sim/index';
import { tieBreakWinner } from '../../src/sim/match';
import { clockAt, phaseAt, waveAt } from '../../src/sim/timeline';
import { G, RANGE } from '../../src/sim/world';

/** Bots off: these runs check the clock rules on a minions-only match that always reaches late Sunset. */
const newMatch = (seed: number): MatchHandle => {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
  m.world.globals[G.BotsOff] = 1;
  return m;
};

/** Cores that nothing finishes before the safety end. */
function sturdyCores(m: MatchHandle): void {
  for (let c = RANGE.cores; c < RANGE.fountains; c++) m.world.hp[c] = CORE_STATS.hp * 1000;
}

describe('timeline (§7.3, §15 item 7)', { timeout: limit(120000) }, () => {
  it('sim v12 phases: gate until 0:03; defaults 5:00 and 7:00; Easy Sunset 5:45, late 7:45; Normal and Hard 6:45 and 8:30; Rookie 4:00 and 6:15; safety end 11:00; sim v32: Sunset is the last phase', () => {
    expect(TIMELINE.barrierDrop).toBe(90);
    expect(TIMELINE.sunset).toBe(9000);
    expect(TIMELINE.late).toBe(12600);
    expect(TIMELINE.safetyEnd).toBe(19800);
    expect(TIMELINE_BY.easy).toEqual({ sunset: 10350, late: 13950 });
    expect(TIMELINE_BY.normal).toEqual({ sunset: 12150, late: 15300 });
    expect(TIMELINE_BY.hard).toEqual({ sunset: 12150, late: 15300 });
    expect(TIMELINE_BY.rookie).toEqual({ sunset: 7200, late: 11700 });
    expect(phaseAt(89, false)).toBe('gate');
    expect(phaseAt(90, false)).toBe('play');
    expect(phaseAt(8999, false)).toBe('play');
    expect(phaseAt(9000, false)).toBe('sunset');
    expect(phaseAt(12600, false)).toBe('sunset');
    expect(phaseAt(19000, false)).toBe('sunset');
    expect(phaseAt(7200, false, 7200)).toBe('sunset');
    expect(clockAt(0, false)).toEqual({ tick: 0, seconds: 0, phase: 'gate', nextPhaseIn: 90 });
    // no designed end: Sunset counts down to nothing (the safety end is never a countdown); Blitz's 3:15 is
    expect(clockAt(13000, false).nextPhaseIn).toBe(0);
    expect(clockAt(5000, false, 2700, 5850).nextPhaseIn).toBe(850);
    expect(clockAt(19800, true).phase).toBe('ended');
    // The match keeps its own phase ticks.
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    const rookie = createMatch({ seed: 1, picks, tricks, difficulty: 'rookie' });
    expect([rookie.world.globals[G.Sunset], rookie.world.globals[G.Late]]).toEqual([7200, 11700]);
  });
  it('waves every 20 s from 0:08; from 2:00 every 3rd wave carries a siege', () => {
    expect(waveAt(239, 0)).toBe(-1);
    expect(waveAt(240, 0)).toBe(0);
    expect(waveAt(240 + 600, 0)).toBe(0);
    expect(waveAt(240 + 601, 0)).toBe(-1);
    expect(waveAt(3600, 0)).toBe(-1); // 2:00 is not a wave tick: the first siege wave is the next one
    expect(waveAt(3840, 0)).toBe(1);
    expect(waveAt(3840 + 600, 1)).toBe(0);
    expect(waveAt(3840 + 1200, 2)).toBe(0);
    expect(waveAt(3840 + 1800, 3)).toBe(1);
  });
  it('emits sunset once, on its tick (sim v32: no suddenDeath event)', () => {
    const m = newMatch(5);
    sturdyCores(m);
    const seen: string[] = [];
    while (!result(m)) {
      step(m);
      for (const e of snapshot(m, 0).events) if ((e.type as string) === 'sunset' || (e.type as string) === 'suddenDeath') seen.push(`${e.type}@${e.tick}`);
    }
    expect(seen).toEqual(['sunset@10350']);
  });
  it('sim v32: nothing burns the cores in late Sunset', () => {
    const m = newMatch(8);
    sturdyCores(m);
    while (m.world.globals[G.Tick] < TIMELINE_BY.easy.late) step(m);
    const c = RANGE.cores;
    // the core is invulnerable to minions while both inner towers stand: with no decay nothing touches it
    if (m.world.alive[RANGE.towers + 1] === 1 && m.world.alive[RANGE.towers + 3] === 1) {
      const before = m.world.hp[c];
      for (let i = 0; i < TIMELINE.second * 3; i++) step(m);
      expect(m.world.hp[c]).toBe(before);
    }
  });
  it('safety end: lower core HP loses', () => {
    const m = newMatch(6);
    sturdyCores(m);
    while (m.world.globals[G.Tick] < TIMELINE.safetyEnd - 1) step(m);
    m.world.hp[RANGE.cores] = m.world.hp[RANGE.cores + 1] - 1;
    while (!result(m)) step(m);
    const res = result(m)!;
    expect(res.ticks).toBe(19800);
    expect(res.reason).toBe('safetyEnd');
    expect(res.winner).toBe(1);
    expect(res.outcome).toBe('lost');
  });
  it('tie-break: equal cores → more tower damage wins → seeded coin', () => {
    const m = newMatch(7);
    const w = m.world;
    w.hp[RANGE.cores] = 100;
    w.hp[RANGE.cores + 1] = 100;
    w.globals[G.TowerDamage0] = 5;
    w.globals[G.TowerDamage1] = 9;
    expect(tieBreakWinner(w, 7)).toBe(1);
    w.globals[G.TowerDamage0] = 12;
    expect(tieBreakWinner(w, 7)).toBe(0);
    w.globals[G.TowerDamage1] = 12;
    const coin = tieBreakWinner(w, 7);
    expect(tieBreakWinner(w, 7)).toBe(coin);
    const coins = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => tieBreakWinner(w, s)));
    expect(coins.size).toBe(2); // the coin depends on the seed
  });
});
