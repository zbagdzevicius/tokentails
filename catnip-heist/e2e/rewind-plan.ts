import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeistSession } from '../src/app/session';
import { decodeInputs, encodeInputs, type InputLog, type InputRun } from '../src/sim';
import { loadLevel } from '../src/sim/level';
import { NO_INPUT, type Axis, type Input } from '../src/types';

/**
 * A real detection for the Rewind e2e, worked out at test time from the current sim and solution
 * (the same sources the e2e build bundles), so the spec never pins a tick or hash that a re-solve or
 * a sim change makes stale. Mirrors findDetour in src/onboarding/__tests__/rewind.test.ts: play the
 * solution to t0, then walk off it until a dog sees the cat within 5 s, so the rewind lands back on
 * the solution's own path.
 */
const here = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(here, '../src/levels');
/**
 * REWIND_TICKS and rewindTarget of src/onboarding/rewind.ts, restated: that module imports the level
 * registry (JSON imports Node ESM cannot load in the Playwright runner). The spec checks the page's
 * rewind lands exactly here, so a change there fails loudly rather than silently.
 */
const REWIND_TICKS = 150;
const rewindTarget = (spottedTick: number) => Math.max(0, spottedTick - REWIND_TICKS);
const DIRS: [Axis, Axis][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export interface RewindPlan {
  solution: InputLog & { finalHash: number };
  /** Solution prefix to t0, then the detour: feed this and the detection happens on its last tick. */
  detourRuns: InputRun[];
  t0: number;
  spottedTick: number;
  /** Where Rewind 5 s lands, and the state hash a fresh replay of the cut log reaches there. */
  rewoundTick: number;
  rewoundHash: number;
}

export function planRewind(levelId: string, minT0 = 200): RewindPlan {
  const level = loadLevel(JSON.parse(readFileSync(join(levelsDir, `${levelId}.json`), 'utf8')));
  const solution = JSON.parse(readFileSync(join(levelsDir, `${levelId}.solution.json`), 'utf8')) as RewindPlan['solution'];
  const inputs = decodeInputs(solution.runs);
  const fresh = () => new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
  for (let t0 = minT0; t0 < inputs.length - 1; t0 += 15) {
    for (const [dx, dy] of DIRS) {
      const s = fresh();
      for (let i = 0; i < t0; i++) s.stepOnce(inputs[i]);
      const detour: Input[] = [];
      for (let k = 0; k < REWIND_TICKS - 10; k++) {
        const inp = { ...NO_INPUT, dx, dy };
        detour.push(inp);
        s.stepOnce(inp);
        if (!s.cur.events.some((e) => e.type === 'SPOTTED')) continue;
        const spottedTick = s.cur.tick;
        const rewoundTick = rewindTarget(spottedTick);
        if (rewoundTick >= t0 || rewoundTick <= 0) break;
        // Independent of the page's rewind: a fresh session that plays only the cut log.
        const r = fresh();
        for (let i = 0; i < rewoundTick; i++) r.stepOnce(inputs[i]);
        return { solution, detourRuns: encodeInputs([...inputs.slice(0, t0), ...detour]), t0, spottedTick, rewoundTick, rewoundHash: r.cur.hash };
      }
    }
  }
  throw new Error(`no detection found on ${levelId}`);
}
