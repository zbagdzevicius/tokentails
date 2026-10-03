import { describe, expect, it } from 'vitest';
import { HEIST_LEVEL_CAPS, HEIST_MAX_TICKS } from '../../shared-contracts/caps';
import { getLevel, getSolution, LEVEL_IDS } from '../../levels';
import { replay, type InputLog, type InputRun } from '../replay';
import {
  CAMPAIGN_SEED,
  CAT_IDS,
  LEVELS,
  MAX_REPLAY_TICKS,
  SIM_VERSION,
  canonicalLogKey,
  canonicalRuns,
  computeStars,
  verifyRun,
} from '../server';
import { STAR_CLEAN, STAR_COINS, STAR_RULES as SIM_STAR_RULES, STAR_WIN, pawRating, starCount } from '../score';
import { STAR_RULES as PROGRESS_STAR_RULES, runStars, starCount as progressStarCount } from '../../ui/levels/progress';
import { pawRating as uiPawRating } from '../../ui/logic';

const solution = (id: string): InputLog => JSON.parse(JSON.stringify(getSolution(id))) as InputLog;
const withRuns = (log: InputLog, runs: InputRun[]): InputLog => ({ ...log, runs, ticks: runs.reduce((n, r) => n + r[3], 0) });

describe('sim server entry', () => {
  it('exports the 8 campaign levels in order with caps derived from the level files', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(LEVEL_IDS);
    expect(LEVELS.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const info of LEVELS) {
      const level = getLevel(info.id);
      expect(info.coins).toBe(level.coins.length);
      expect(info.parTicks).toBe(level.meta.parTicks);
      expect(info.maxScore).toBe(level.coins.length * 10 + 50);
      expect(info.tickCap).toBe(Math.min(4 * level.meta.parTicks, 18000));
    }
  });

  it('pins HEIST_LEVEL_CAPS in shared/caps.ts to the sim (plan G2: 250, 240, 220, 270, 240, 240, 240, 310)', () => {
    expect(LEVELS.map((l) => l.maxScore)).toEqual(HEIST_LEVEL_CAPS);
    expect(HEIST_LEVEL_CAPS).toEqual([250, 240, 220, 270, 240, 240, 240, 310]);
    expect(MAX_REPLAY_TICKS).toBe(HEIST_MAX_TICKS);
  });

  it('lists the picker cats, including the default crew', () => {
    expect(CAT_IDS.length).toBeGreaterThan(10);
    expect(new Set(CAT_IDS).size).toBe(CAT_IDS.length);
    expect(CAT_IDS).toContain('bob');
    expect(CAT_IDS).toContain('oreo');
  });

  describe.each(LEVEL_IDS.map((id) => [id]))('golden solution %s', (id) => {
    it('verifies with the recorded score, hash and stars, matching replay()', () => {
      const log = solution(id);
      const result = verifyRun(log);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const level = getLevel(id);
      const { final } = replay(level, log);
      expect(result.ticks).toBe(log.ticks);
      expect(result.score).toBe(log.score);
      expect(result.score).toBe(final.score);
      expect(result.finalHash).toBe(log.finalHash);
      expect(result.coins).toBe(log.coins);
      expect(result.spottedCount).toBe(log.spottedCount);
      expect(result.stars).toBe(runStars({ coins: final.coinsCollected, ticks: final.tick, spottedCount: final.spottedCount }, true, level));
      expect(result.score).toBeLessThanOrEqual(LEVELS[result.levelIndex].maxScore);
      expect(log.ticks).toBeLessThanOrEqual(LEVELS[result.levelIndex].tickCap);
    });

    it('refuses input after the winning tick', () => {
      const log = solution(id);
      const result = verifyRun(withRuns(log, [...log.runs, [0, 0, 0, 1]]));
      expect(result).toMatchObject({ ok: false, code: 'HEIST_TRAILING_INPUT' });
    });

    it('refuses a run cut short of the win', () => {
      const log = solution(id);
      const runs = log.runs.map((r) => [...r] as InputRun);
      runs[runs.length - 1][3] -= 1;
      if (runs[runs.length - 1][3] === 0) runs.pop();
      expect(verifyRun(withRuns(log, runs))).toMatchObject({ ok: false, code: 'HEIST_NOT_WON' });
    });
  });

  it.each<[string, (log: InputLog) => unknown]>([
    ['wrong seed', (log) => ({ ...log, seed: 2 })],
    ['seed 0', (log) => ({ ...log, seed: 0 })],
    ['unknown cat id', (log) => ({ ...log, catIds: ['bob', 'not-a-cat'] })],
    ['the same cat twice', (log) => ({ ...log, catIds: ['bob', 'bob'] })],
    ['three cats', (log) => ({ ...log, catIds: ['bob', 'oreo', 'coco'] })],
    ['unknown level', (log) => ({ ...log, levelId: 'heist-99' })],
    ['ticks not matching the runs', (log) => ({ ...log, ticks: log.ticks + 1 })],
    ['a zero count', (log) => ({ ...log, runs: [[0, 0, 0, 0], ...log.runs] })],
    ['dx 2', (log) => ({ ...log, runs: [[2, 0, 0, 1], ...log.runs.slice(1)] })],
    ['flags 8', (log) => ({ ...log, runs: [[0, 0, 8, log.runs[0][3]], ...log.runs.slice(1)] })],
    ['a fractional count', (log) => ({ ...log, runs: [[0, 0, 0, 0.5], ...log.runs] })],
    ['a 3-element run', (log) => ({ ...log, runs: [[0, 0, 1], ...log.runs] })],
    ['no runs', (log) => ({ ...log, runs: [], ticks: 0 })],
    ['not an object', () => 'heist'],
    ['null', () => null],
  ])('refuses %s with HEIST_REPLAY_INVALID', (_name, mutate) => {
    expect(verifyRun(mutate(solution('heist-01')))).toMatchObject({ ok: false, code: 'HEIST_REPLAY_INVALID' });
  });

  it('refuses another sim version with HEIST_SIM_VERSION', () => {
    expect(verifyRun({ ...solution('heist-01'), simVersion: SIM_VERSION - 1 })).toMatchObject({ ok: false, code: 'HEIST_SIM_VERSION' });
  });

  it('refuses a log over the per-level tick cap before simulating', () => {
    const cap = LEVELS[1].tickCap; // heist-02: 4 x 2250 = 9000
    const log: InputLog = { ...solution('heist-02'), runs: [[0, 0, 0, cap + 1]], ticks: cap + 1 };
    const started = performance.now();
    expect(verifyRun(log)).toMatchObject({ ok: false, code: 'HEIST_REPLAY_INVALID' });
    // An idle 9001-tick replay would take far longer than the structural check.
    expect(performance.now() - started).toBeLessThan(50);
    const atCap: InputLog = { ...log, runs: [[0, 0, 0, cap]], ticks: cap };
    expect(verifyRun(atCap)).toMatchObject({ ok: false, code: 'HEIST_NOT_WON' });
  });

  it('accepts any two known cats: the crew does not change the simulation', () => {
    const result = verifyRun({ ...solution('heist-01'), catIds: [CAT_IDS[CAT_IDS.length - 1], CAT_IDS[0]] });
    expect(result).toMatchObject({ ok: true, score: getSolution('heist-01').score });
  });

  it('ignores the client-reported score, hash and extra fields', () => {
    const result = verifyRun({ ...solution('heist-03'), score: 99999, finalHash: 1, coins: 999, runId: 'x' });
    expect(result).toMatchObject({ ok: true, score: getSolution('heist-03').score });
  });

  it('uses the campaign seed', () => {
    expect(CAMPAIGN_SEED).toBe(1);
    for (const id of LEVEL_IDS) expect(getSolution(id).seed).toBe(CAMPAIGN_SEED);
  });

  describe('canonical runs and the digest key', () => {
    it('merges adjacent identical inputs, so a split recording gives the same key', () => {
      const log = solution('heist-01');
      const split = log.runs.flatMap((r): InputRun[] => (r[3] > 1 ? [[r[0], r[1], r[2], 1], [r[0], r[1], r[2], r[3] - 1]] : [r]));
      expect(split.length).toBeGreaterThan(log.runs.length);
      expect(canonicalRuns(split)).toEqual(canonicalRuns(log.runs));
      expect(canonicalLogKey({ ...log, runs: split })).toBe(canonicalLogKey(log));
      const verified = verifyRun({ ...log, runs: split });
      expect(verified.ok && verified.runs).toEqual(canonicalRuns(log.runs));
    });

    it('leaves the crew out of the key and keeps level, seed, version and inputs in it', () => {
      const log = solution('heist-01');
      const key = canonicalLogKey(log);
      expect(canonicalLogKey({ ...log, catIds: ['coco', 'fox'] } as InputLog)).toBe(key);
      expect(canonicalLogKey({ ...log, seed: 2 })).not.toBe(key);
      expect(canonicalLogKey({ ...log, simVersion: 9 })).not.toBe(key);
      expect(canonicalLogKey({ ...log, levelId: 'heist-02' })).not.toBe(key);
      expect(canonicalLogKey(withRuns(log, [[0, 0, 0, 1], ...log.runs]))).not.toBe(key);
    });
  });
});

describe('star rules (src/sim/score.ts)', () => {
  it('are the rules the level select and progress store use', () => {
    expect(SIM_STAR_RULES).toEqual(PROGRESS_STAR_RULES);
    for (let mask = 0; mask < 8; mask++) expect(starCount(mask)).toBe(progressStarCount(mask));
  });

  it('computeStars matches progress runStars on every combination', () => {
    const level = getLevel('heist-01');
    const par = level.meta.parTicks;
    const coins = level.coins.length;
    for (const won of [false, true])
      for (const c of [0, coins - 1, coins, coins + 1])
        for (const ticks of [1, par - 1, par, par + 1])
          for (const spottedCount of [0, 1, 3]) {
            const r = { coins: c, ticks, spottedCount };
            expect(computeStars(r, won, level)).toBe(runStars(r, won, level));
          }
    expect(computeStars({ coins, ticks: par, spottedCount: 0 }, true, level)).toBe(STAR_WIN | STAR_COINS | STAR_CLEAN);
    expect(computeStars({ coins, ticks: par, spottedCount: 0 }, true, { coins, meta: { parTicks: par } })).toBe(7);
  });

  it('the results-screen paw rating is unchanged (logic.ts re-exports it)', () => {
    expect(uiPawRating).toBe(pawRating);
    expect(pawRating({ coins: 20, rescued: true, ticks: 100, spottedCount: 0 }, 20, 200)).toBe(3);
    expect(pawRating({ coins: 20, rescued: false, ticks: 100, spottedCount: 0 }, 20, 200)).toBe(2);
    expect(pawRating({ coins: 0, rescued: true, ticks: 100, spottedCount: 0 }, 0, 0)).toBe(1);
    expect(pawRating({ coins: 5, rescued: true, ticks: 300, spottedCount: 1 }, 20, 200)).toBe(1);
  });
});
