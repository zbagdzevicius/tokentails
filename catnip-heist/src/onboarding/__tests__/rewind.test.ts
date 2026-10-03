import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, getLevel, getSolution } from '../../levels';
import { decodeInputs, replay } from '../../sim';
import { canonicalRuns, verifyRun as srcVerifyRun } from '../../sim/server';
import { NO_INPUT, type Axis, type Input, type SimState } from '../../types';
import { HeistSession, KEYFRAME_TICKS } from '../../app/session';
import { REWIND_LEVELS, REWIND_TICKS, canRewind, rewindTarget } from '../rewind';

const here = dirname(fileURLToPath(import.meta.url));
const vendorDir = resolve(here, '..', '..', '..', '..', 'backend', 'src', 'vendor', 'heist-sim');
const bundlePath = join(vendorDir, 'heist-sim.bundle.ts');
const hasVendor = existsSync(bundlePath);

type Verify = (log: unknown) => { ok: boolean; code?: string; ticks?: number; spottedCount?: number; finalHash?: number };
// The backend's copy of the verifier (what POST /user/catbassadors/live runs), when the backend is checked out.
const vendored: Promise<Verify | null> = hasVendor ? import(/* @vite-ignore */ bundlePath).then((m: { verifyRun: Verify }) => m.verifyRun) : Promise.resolve(null);

const DIRS: [Axis, Axis][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/**
 * A real detection: play the solution to `t0`, then walk off it until a dog sees the cat. Searches
 * deterministically for one that happens less than 5 s after leaving the solution, so the rewind
 * lands back on the solution's own path, from which the rest of the solution still wins.
 */
function findDetour(levelId: string, minT0: number): { t0: number; detour: Input[]; spottedTick: number } {
  const level = getLevel(levelId);
  const inputs = decodeInputs(getSolution(levelId).runs);
  const s0 = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
  const states: SimState[] = [s0.cur];
  for (const inp of inputs) {
    s0.stepOnce(inp);
    states.push(s0.cur);
  }
  for (let t0 = minT0; t0 < inputs.length - 1; t0 += 15) {
    for (const [dx, dy] of DIRS) {
      const s = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
      for (let i = 0; i < t0; i++) s.stepOnce(inputs[i]);
      const detour: Input[] = [];
      for (let k = 0; k < REWIND_TICKS - 10; k++) {
        const inp = { ...NO_INPUT, dx, dy };
        detour.push(inp);
        s.stepOnce(inp);
        if (s.cur.events.some((e) => e.type === 'SPOTTED')) return { t0, detour, spottedTick: s.cur.tick };
      }
    }
  }
  throw new Error(`no detection found on ${levelId}`);
}

describe('Rewind 5 s (decision #72)', () => {
  it('is on the first three levels only, and goes back 150 ticks (never before 0)', () => {
    expect(REWIND_LEVELS).toEqual(LEVEL_IDS.slice(0, 3));
    expect(canRewind('heist-01') && canRewind('heist-03')).toBe(true);
    expect(canRewind('heist-04')).toBe(false);
    expect(REWIND_TICKS).toBe(150);
    expect(rewindTarget(400)).toBe(250);
    expect(rewindTarget(90)).toBe(0);
  });

  for (const levelId of REWIND_LEVELS) {
    it(`${levelId}: a rewound, then continued, run is the state a fresh replay reaches, and the verifier accepts it`, async () => {
      const level = getLevel(levelId);
      const solution = getSolution(levelId);
      const inputs = decodeInputs(solution.runs);
      const { t0, detour, spottedTick } = findDetour(levelId, 200);
      const s = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
      for (let i = 0; i < t0; i++) s.stepOnce(inputs[i]);
      for (const inp of detour) s.stepOnce(inp);
      expect(s.cur.spottedCount).toBeGreaterThan(0);
      const target = rewindTarget(spottedTick);
      expect(target).toBeLessThan(t0);
      expect(target).toBeGreaterThan(0);

      expect(s.rewindTo(target)).toBe(target);
      expect(s.rewinds).toBe(1);
      expect(s.inputs).toHaveLength(target);
      expect(s.cur.tick).toBe(target);
      // The rewound state is exactly what replaying the cut log from tick 0 gives.
      const cut = s.log();
      expect(replay(level, cut).final.hash).toBe(s.cur.hash);
      expect(s.cur.spottedCount).toBe(0);

      // Continue with the rest of the solution: the run wins, and the saved log replays to a win.
      for (let i = target; i < inputs.length && !s.done; i++) s.stepOnce(inputs[i]);
      expect(s.cur.won).toBe(true);
      const log = s.log();
      expect(log.ticks).toBe(s.cur.tick);
      expect(canonicalRuns(log.runs)).toEqual(canonicalRuns(solution.runs));

      const src = srcVerifyRun(log);
      expect(src).toMatchObject({ ok: true, finalHash: s.cur.hash, spottedCount: 0 });
      const vendoredVerify = await vendored;
      if (vendoredVerify) expect(vendoredVerify(log)).toMatchObject({ ok: true, finalHash: s.cur.hash, ticks: log.ticks });
    });
  }

  it('two rewinds in one run still give one log the verifier accepts', async () => {
    // Detour, get seen, rewind, walk the same path back to the detour, get seen again, rewind again.
    const levelId = 'heist-01';
    const level = getLevel(levelId);
    const inputs = decodeInputs(getSolution(levelId).runs);
    const { t0, detour, spottedTick } = findDetour(levelId, 400);
    const s = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
    for (let i = 0; i < t0; i++) s.stepOnce(inputs[i]);
    for (let round = 0; round < 2; round++) {
      for (const inp of detour) s.stepOnce(inp);
      expect(s.cur.tick).toBe(spottedTick);
      s.rewindTo(rewindTarget(spottedTick));
      // Back on the solution's path: replay the solution up to t0 again.
      for (let i = s.cur.tick; i < t0; i++) s.stepOnce(inputs[i]);
    }
    expect(s.rewinds).toBe(2);
    for (let i = t0; i < inputs.length && !s.done; i++) s.stepOnce(inputs[i]);
    expect(s.cur.won).toBe(true);
    const vendoredVerify = await vendored;
    const v = (vendoredVerify ?? srcVerifyRun)(s.log());
    expect(v.ok).toBe(true);
  });

  it('re-simulates from the nearest keyframe, across keyframe boundaries', () => {
    const level = getLevel('heist-02');
    const inputs = decodeInputs(getSolution('heist-02').runs);
    const s = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
    for (let i = 0; i < KEYFRAME_TICKS * 3 + 17; i++) s.stepOnce(inputs[i]);
    for (const target of [KEYFRAME_TICKS * 3 + 5, KEYFRAME_TICKS * 2, KEYFRAME_TICKS - 1, 0]) {
      s.rewindTo(target);
      expect(s.cur.hash).toBe(replay(level, s.log()).final.hash);
      for (let i = target; i < target + 40; i++) s.stepOnce(inputs[i]);
      expect(s.cur.hash).toBe(replay(level, s.log()).final.hash);
    }
  });

  it('refuses replay sessions and does nothing past the end or after a win', () => {
    const level = getLevel('heist-01');
    const solution = getSolution('heist-01');
    const watch = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'], replay: solution });
    expect(() => watch.rewindTo(0)).toThrow();
    const s = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
    for (let i = 0; i < 30; i++) s.stepOnce(NO_INPUT);
    expect(s.rewindTo(99)).toBe(30);
    expect(s.rewinds).toBe(0);
  });
});

describe('the sim and the server verifier are unchanged', () => {
  it.skipIf(!hasVendor)('loads the backend verifier (backend/src/vendor/heist-sim)', async () => {
    expect(typeof (await vendored)).toBe('function');
  });

  it.skipIf(!hasVendor)('the vendored bundle still has the sha256 recorded by vendor-sim', () => {
    const manifest = JSON.parse(readFileSync(join(vendorDir, 'heist-sim.sha256.json'), 'utf8')) as { files: Record<string, string>; simVersion: number };
    for (const [file, sha] of Object.entries(manifest.files)) {
      expect(createHash('sha256').update(readFileSync(join(vendorDir, file))).digest('hex'), file).toBe(sha);
    }
  });

  it('every bundled solution still verifies with its recorded final hash', async () => {
    const vendoredVerify = await vendored;
    for (const id of LEVEL_IDS) {
      const sol = getSolution(id);
      expect(srcVerifyRun(sol)).toMatchObject({ ok: true, finalHash: sol.finalHash });
      if (vendoredVerify) expect(vendoredVerify(sol)).toMatchObject({ ok: true, finalHash: sol.finalHash });
    }
  });
});
