// Endless mode: procedurally chained blocks from the shared block library (blocks.ts, which the Trail Maker uses too).
// Each block opens with a calm lead (so chunks never crowd each other), then its set piece: log runs, branch runs,
// rock slaloms, bamboo, puddles, bridges, jump and pounce gaps, tail vaults, a river stretch, a wall-run, a dog chase,
// a yarn-ball chase or the puff cloud. The pool and the hazard density grow with the chunk index (difficulty d 0..1
// over ~30 chunks); the speed ramp comes from the stage def. SETPIECES / TRAILS lane.
//
// DETERMINISM CONTRACT (the Daily Run calls endless.chunk(b, seededRng, i) with its own rng): for the same rng
// sequence and index order the chunks are identical, and index 0 resets every bit of generator state below.
import { range } from '../core/rng';
import type { Rng, StageDef, ThemeId } from '../core/types';
import { Script } from './author';
import { blockByKey, type BlockDef } from './blocks';

/** block keys, the chunk index they unlock at and their weight in the draw (calm path blocks are rarer) */
export const ENDLESS_UNLOCK: readonly [string, number, number][] = [
  ['fish', 1, 1],
  ['logs', 1, 1],
  ['branches', 1, 1],
  ['bendL', 2, 0.4],
  ['bendR', 2, 0.4],
  ['rocks', 2, 1],
  ['gap', 2, 1],
  ['puddles', 2, 0.5],
  ['hill', 3, 0.5],
  ['mixed', 3, 1],
  ['vault', 3, 1.2],
  ['bridge', 3, 0.5],
  ['river', 4, 1.3],
  ['sbend', 4, 0.4],
  ['bamboo', 5, 1],
  ['wall', 5, 1.3],
  ['pounce', 6, 0.8],
  ['dog', 7, 1.2],
  ['yarn', 9, 1.1],
  ['cloud', 11, 0.9],
];
const POOL: readonly { block: BlockDef; at: number; w: number }[] = ENDLESS_UNLOCK.map(([key, at, w]) => ({ block: blockByKey(key)!, at, w }));
const pool: { block: BlockDef; w: number }[] = [];

/** one weighted draw (one rng call) */
function draw(rng: Rng): BlockDef {
  let total = 0;
  for (const e of pool) total += e.w;
  let x = rng() * total;
  for (const e of pool) if ((x -= e.w) < 0) return e.block;
  return pool[pool.length - 1].block;
}

// generator state (reset at index 0)
let last = '';
let lastBig = -10;

const ENDLESS_THEMES: ThemeId[] = ['meadow', 'gorge', 'sunset'];
let runCount = -1;

/** chunk 0: a calm opening straight with fish and a yarn ball */
function opening(k: Script, rng: Rng): void {
  const s = k.run(90, { turn: range(rng, -20, 20) });
  k.fish(s + 24, 0, 8, 3, 'wave', { amp: 2 }).yarn(s + 70, 2);
}

export const endless: StageDef = {
  id: 'endless',
  index: 3,
  name: 'Endless Run',
  blurb: 'How far can Mochi go?',
  // each endless run takes the next landscape: meadow, gorge, sunset (core reads it after the first chunk is built)
  get theme(): ThemeId {
    return ENDLESS_THEMES[((runCount % 3) + 3) % 3];
  },
  music: 'endless',
  speed: { start: 19, max: 30, rampDist: 9000 },
  scoreTarget: 0,
  bells: 0,
  start: { x: 0, y: 0, z: 0, heading: 0, width: 9 },
  chunk(b, rng, index) {
    const k = new Script(b);
    if (index === 0) {
      runCount++;
      last = '';
      lastBig = -10;
      opening(k, rng);
      return k.pieces;
    }
    const d = Math.min(1, index / 30);
    pool.length = 0;
    for (const e of POOL) if (index >= e.at && e.block.key !== last && !(e.block.big && index - lastBig < 2)) pool.push(e);
    const block = draw(rng);
    last = block.key;
    if (block.big) lastBig = index;
    const mirror = rng() < 0.5;
    block.build(k, rng, { mirror, hard: false, d });
    return k.pieces;
  },
};
