import { describe, expect, it } from 'vitest';
import { NO_INPUT, SIM_VERSION, type Dir8, type TickInput } from '../types';
import { content, dailyRoom } from '../content';
import { decodeCatOrDefault, encodeRoom } from '../codec';
import { encodeInputs, runToEnd } from '../sim';
import { plannerRun } from '../sim/planner';
import { canonicalLogKey, canonicalRuns, checkRoom, cleanName, dayNoUtc, verifyRanked } from './index';
import { DAY1_UTC } from '../content/schedule';

/** The planner bot's run on a ranked daily, recorded tick by tick, then replayed by the client's own runToEnd. */
function scoringRun(dayNo: number) {
  const play = content.resolve(dailyRoom(dayNo), 'ranked', dayNo);
  const inputs: TickInput[] = [];
  plannerRun(play, { onInput: (i) => inputs.push(i) });
  const r = runToEnd(play, decodeCatOrDefault(null), inputs);
  if (r.score <= 0) throw new Error('the planner bot did not score');
  return r;
}

describe('server entry (vendored into the backend)', () => {
  it('replays a ranked run to the same score and hash as the client', () => {
    const r = scoringRun(1);
    const v = verifyRanked({ dayNo: 1, simVersion: SIM_VERSION, runs: encodeInputs(r.inputs), finalHash: r.finalHash });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.score).toBe(r.score);
    expect(v.finalHash).toBe(r.finalHash >>> 0);
    expect(v.hashMatch).toBe(true);
    expect(v.stamp).toBe(r.stamp);
    expect(v.label).toMatch(/#1/);
  });

  it('refuses old sims, bad runs, trailing input and idle runs', () => {
    expect(verifyRanked({ dayNo: 1, simVersion: SIM_VERSION - 1, runs: [] })).toMatchObject({ ok: false, code: 'BADCAT_SIM_VERSION' });
    expect(verifyRanked({ dayNo: 1, simVersion: SIM_VERSION, runs: [[9, 0, 0, 1]] })).toMatchObject({ ok: false, code: 'BADCAT_REPLAY_INVALID' });
    expect(verifyRanked({ dayNo: 1, simVersion: SIM_VERSION, runs: [[1, 0, 8, 1]] })).toMatchObject({ ok: false, code: 'BADCAT_REPLAY_INVALID' });
    expect(verifyRanked({ dayNo: 1.5, simVersion: SIM_VERSION, runs: [] })).toMatchObject({ ok: false, code: 'BADCAT_REPLAY_INVALID' });
    expect(verifyRanked({ dayNo: 1, simVersion: SIM_VERSION, runs: [] })).toMatchObject({ ok: false, code: 'BADCAT_NO_SCORE' });
    const r = scoringRun(1);
    const runs = encodeInputs([...r.inputs, ...Array.from({ length: 40 }, () => ({ ...NO_INPUT, dir: 1 as Dir8 }))]);
    expect(verifyRanked({ dayNo: 1, simVersion: SIM_VERSION, runs })).toMatchObject({ ok: false, code: 'BADCAT_TRAILING_INPUT' });
  });

  it('canonical runs merge equal neighbours and drop trailing idle input', () => {
    expect(canonicalRuns([[1, 2, 0, 3], [1, 2, 0, 2], [0, 0, 0, 9]])).toEqual([[1, 2, 0, 5]]);
    expect(canonicalLogKey({ dayNo: 3, simVersion: SIM_VERSION, runs: [[1, 2, 0, 3], [1, 2, 0, 2]] })).toBe(`badcat|v${SIM_VERSION}|d3|1.2.0.5`);
    expect(canonicalRuns('x')).toBeNull();
    expect(canonicalRuns([[1, 2, 0, 0]])).toBeNull();
  });

  it('dayNoUtc counts UTC days from Day #1', () => {
    expect(dayNoUtc(DAY1_UTC)).toBe(1);
    expect(dayNoUtc(DAY1_UTC + 86_400_000 * 2 + 5)).toBe(3);
    expect(dayNoUtc(DAY1_UTC - 1)).toBe(0);
  });

  it('checks a player room and replays the maker clear run', () => {
    const room = { ...dailyRoom(1), id: 'ugc-test', title: 'My kitchen', author: 'Mia', props: dailyRoom(1).props };
    const code = encodeRoom(room);
    const bad = checkRoom('nope');
    expect(bad.ok).toBe(false);
    const res = checkRoom(code);
    expect(res.room?.author).toBe('Mia');
    expect(res.room?.title).toBe('My kitchen');
    const idle = checkRoom(code, []);
    expect(idle.clear?.ok).toBe(false);
    expect(idle.ok).toBe(false);
  });

  it('cleans names with the game filter', () => {
    expect(cleanName('Mochi')).toBe('Mochi');
    expect(cleanName(42)).toBe('');
  });
});

// The backend's badcat-sim.spec.ts replays these with the vendored bundle and expects the same results. Re-write
// with BADCAT_WRITE_GOLDEN=1 after a SIM_VERSION bump (then `npm run vendor-sim`).
describe('backend golden runs', () => {
  it('backend/src/badcat/fixtures/badcat-golden.json matches the client sim', async () => {
    const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..', '..', '..', 'backend', 'src', 'badcat', 'fixtures');
    const file = join(dir, 'badcat-golden.json');
    const runs = [1, 6, 7, 30].map((dayNo) => {
      const r = scoringRun(dayNo);
      return { dayNo, simVersion: SIM_VERSION, runs: encodeInputs(r.inputs), score: r.score, stamp: r.stamp, finalHash: r.finalHash >>> 0, ticks: r.ticks };
    });
    // A player room (a remix of Day #1) and its maker's clear run, for the backend's room-feed specs.
    const room = { ...dailyRoom(1), id: 'ugc-golden', title: 'Golden kitchen', author: 'Mia', ancestors: ['Kitchen #1'] };
    const code = encodeRoom(room);
    const clearInputs: TickInput[] = [];
    plannerRun(content.resolve(room, 'practice'), { onInput: (i) => clearInputs.push(i) });
    const clear = encodeInputs(clearInputs);
    expect(checkRoom(code, clear).ok).toBe(true);
    const json = JSON.stringify({ simVersion: SIM_VERSION, runs, room: { code, clear } }) + '\n';
    if (process.env.BADCAT_WRITE_GOLDEN === '1') {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, json);
    }
    expect(readFileSync(file, 'utf8')).toBe(json);
  }, 60_000);
});
