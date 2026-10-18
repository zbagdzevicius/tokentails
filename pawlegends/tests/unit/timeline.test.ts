import { describe, expect, it } from 'vitest';
import { CORE_STATS } from '../../src/data/towers';
import { SUDDEN_DEATH, TIMELINE, TIMELINE_BY } from '../../src/data/timeline';
import { createMatch, fillPicks, result, snapshot, step, type MatchHandle } from '../../src/sim/index';
import { tieBreakWinner } from '../../src/sim/match';
import { clockAt, phaseAt, waveAt } from '../../src/sim/timeline';
import { G, RANGE } from '../../src/sim/world';

/** Bots off: these runs check the clock rules on a minions-only match that always reaches Sudden Death. */
const newMatch = (seed: number): MatchHandle => {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
  m.world.globals[G.BotsOff] = 1;
  return m;
};

/** Cores that nothing finishes before the safety end (Sudden Death decay is 3% of maxHp a second, sim v4). */
function sturdyCores(m: MatchHandle): void {
  for (let c = RANGE.cores; c < RANGE.fountains; c++) m.world.hp[c] = CORE_STATS.hp * 1000;
}

describe('timeline (§7.3, §15 item 7)', { timeout: 120000 }, () => {
  it('sim v5 phases: gate until 0:03; Easy Sunset 5:00, Sudden Death 7:00; Normal 6:00 and 7:45; Rookie 4:00 and 6:30; safety end 11:00', () => {
    expect(TIMELINE.barrierDrop).toBe(90);
    expect(TIMELINE.sunset).toBe(9000);
    expect(TIMELINE.suddenDeath).toBe(12600);
    expect(TIMELINE.safetyEnd).toBe(19800);
    expect(TIMELINE_BY.easy).toEqual({ sunset: 9000, suddenDeath: 12600 });
    expect(TIMELINE_BY.normal).toEqual({ sunset: 10800, suddenDeath: 13950 });
    expect(TIMELINE_BY.rookie).toEqual({ sunset: 7200, suddenDeath: 11700 });
    expect(phaseAt(89, false)).toBe('gate');
    expect(phaseAt(90, false)).toBe('play');
    expect(phaseAt(8999, false)).toBe('play');
    expect(phaseAt(9000, false)).toBe('sunset');
    expect(phaseAt(12600, false)).toBe('suddenDeath');
    expect(phaseAt(7200, false, 7200, 11250)).toBe('sunset');
    expect(clockAt(0, false)).toEqual({ tick: 0, seconds: 0, phase: 'gate', nextPhaseIn: 90 });
    expect(clockAt(19800, true).phase).toBe('ended');
    // The match keeps its own phase ticks.
    const { picks, tricks } = fillPicks(1, 'clem', 'pounce');
    const rookie = createMatch({ seed: 1, picks, tricks, difficulty: 'rookie' });
    expect([rookie.world.globals[G.Sunset], rookie.world.globals[G.SuddenDeath]]).toEqual([7200, 11700]);
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
  it('emits sunset and suddenDeath once, on their ticks', () => {
    const m = newMatch(5);
    sturdyCores(m);
    const seen: string[] = [];
    while (!result(m)) {
      step(m);
      for (const e of snapshot(m, 0).events) if (e.type === 'sunset' || e.type === 'suddenDeath') seen.push(`${e.type}@${e.tick}`);
    }
    expect(seen).toEqual(['sunset@9000', 'suddenDeath@12600']);
  });
  it('Sudden Death: cores lose exactly 3% max HP a second (no Sunset bonus)', () => {
    const m = newMatch(8);
    while (m.world.globals[G.Tick] < TIMELINE.suddenDeath) step(m);
    const c = RANGE.cores;
    const before = m.world.hp[c];
    for (let i = 0; i < TIMELINE.second * 3; i++) step(m);
    // the core is invulnerable to minions while both inner towers stand: only the decay touches it
    if (m.world.alive[RANGE.towers + 1] === 1 && m.world.alive[RANGE.towers + 3] === 1) {
      expect(before - m.world.hp[c]).toBe(3 * Math.trunc((CORE_STATS.hp * SUDDEN_DEATH.coreDecayBpPerSecond) / 10000));
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
