/**
 * Diagnose-only chase harness dump (not in `npm test`). Run:
 *
 *   npx vitest run --config tools/chase-harness/vitest.config.ts tools/chase-harness/chase-harness.test.ts
 *
 * Every hero × path × speed (order), × lag × speed × path (hold, tap) and × speed × path (aclick); writes JSON to
 * CHASE_OUT (default /tmp/chase-harness.json). CHASE_ONE=hero,path,mode,pct,lag prints one run.
 */
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import type { HeroId } from '../../src/sim/api';
import { lineClear } from '../../src/sim/map/grid';
import { heroMatch } from '../../tests/unit/heroes/kit-helpers';
import { run, type Mode, type Path, type Result } from './harness';

describe('chase harness', () => {
  it('runs', () => {
    const m = heroMatch(['clem', 'clem', 'clem', 'clem', 'clem', 'clem']);
    if (!lineClear(m.grid, 30000, 35000, 66000, 35000)) throw new Error('lane not clear');
    if (process.env.CHASE_ONE) {
      const [h, p, mo, pct, lag] = process.env.CHASE_ONE.split(',');
      console.log(JSON.stringify(run(h as HeroId, p as Path, mo as Mode, Number(pct), Number(lag))));
      return;
    }
    const out: Result[] = [];
    const paths: Path[] = ['straight', 'zigzag', 'tower', 'slowedFoe', 'slowedMe', 'dash'];
    for (const hero of HERO_IDS) {
      for (const path of paths) for (const pct of [-10, -5, 0, 5, 10]) out.push(run(hero, path, 'order', pct));
      for (const mode of ['hold', 'tap'] as const) for (const lag of [0, 4]) for (const pct of [0, 5]) for (const path of ['straight', 'zigzag', 'tower'] as const) out.push(run(hero, path, mode, pct, lag));
      for (const mode of ['aclick', 'amove'] as const) for (const pct of [0, 5]) for (const path of ['straight', 'zigzag', 'tower'] as const) out.push(run(hero, path, mode, pct));
    }
    writeFileSync(process.env.CHASE_OUT ?? '/tmp/chase-harness.json', JSON.stringify(out));
  }, 900000);
});
