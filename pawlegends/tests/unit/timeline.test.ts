import { describe, expect, it } from 'vitest';
import { CORE_STATS } from '../../src/data/towers';
import { TIMELINE } from '../../src/data/timeline';
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

/** Cores that Sudden Death decay cannot finish (decay is 2% of maxHp a second): the match reaches the safety end. */
function sturdyCores(m: MatchHandle): void {
  for (let c = RANGE.cores; c < RANGE.fountains; c++) m.world.hp[c] = CORE_STATS.hp * 10;
}

describe('timeline (§7.3, §15 item 7)', { timeout: 120000 }, () => {
  it('phases change at 300, 14,400, 18,000 and the safety end is 19,800', () => {
    expect(TIMELINE.sunset).toBe(14400);
    expect(TIMELINE.suddenDeath).toBe(18000);
    expect(TIMELINE.safetyEnd).toBe(19800);
    expect(phaseAt(299, false)).toBe('gate');
    expect(phaseAt(300, false)).toBe('play');
    expect(phaseAt(14399, false)).toBe('play');
    expect(phaseAt(14400, false)).toBe('sunset');
    expect(phaseAt(18000, false)).toBe('suddenDeath');
    expect(clockAt(0, false)).toEqual({ tick: 0, seconds: 0, phase: 'gate', nextPhaseIn: 300 });
    expect(clockAt(19800, true).phase).toBe('ended');
  });
  it('waves every 25 s from 0:30; from 3:00 every 3rd wave carries a siege', () => {
    expect(waveAt(899, 0)).toBe(-1);
    expect(waveAt(900, 0)).toBe(0);
    expect(waveAt(900 + 750, 0)).toBe(0);
    expect(waveAt(900 + 751, 0)).toBe(-1);
    expect(waveAt(5400, 0)).toBe(1); // 3:00 is a wave tick: the first siege wave
    expect(waveAt(5400 + 750, 1)).toBe(0);
    expect(waveAt(5400 + 1500, 2)).toBe(0);
    expect(waveAt(5400 + 2250, 3)).toBe(1);
  });
  it('emits sunset and suddenDeath once, on their ticks', () => {
    const m = newMatch(5);
    const seen: string[] = [];
    while (!result(m)) {
      step(m);
      for (const e of snapshot(m, 0).events) if (e.type === 'sunset' || e.type === 'suddenDeath') seen.push(`${e.type}@${e.tick}`);
    }
    expect(seen).toEqual(['sunset@14400', 'suddenDeath@18000']);
  });
  it('Sudden Death: cores lose exactly 2% max HP a second (no Sunset bonus)', () => {
    const m = newMatch(8);
    while (m.world.globals[G.Tick] < TIMELINE.suddenDeath) step(m);
    const c = RANGE.cores;
    const before = m.world.hp[c];
    for (let i = 0; i < TIMELINE.second * 3; i++) step(m);
    // the core is invulnerable to minions while both inner towers stand: only the decay touches it
    if (m.world.alive[RANGE.towers + 1] === 1 && m.world.alive[RANGE.towers + 3] === 1) expect(before - m.world.hp[c]).toBe(80 * 3);
  });
  it('safety end: lower core HP loses', () => {
    const m = newMatch(6);
    sturdyCores(m);
    m.world.hp[RANGE.cores] -= 1;
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
