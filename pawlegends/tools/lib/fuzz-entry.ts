/**
 * Determinism fuzz (POC.md §15 item 1): one seed → a full match with a random human command stream (the in-sim bots
 * play the other five slots), recorded, then replayed from the record alone. The two hash trails (one hash every 30
 * ticks) and the results must be identical. Bundled for Node by tools/determinism.mjs and tests/unit/determinism.test.ts.
 */
import { Op, type Command, type Difficulty, type HeroId, type TrickId } from '../../src/sim/api';
import { createMatch, fillPicks, hashTrail, replayRecord, result, step } from '../../src/sim/index';
import { runReplay } from '../../src/sim/replay';
import { Rng } from '../../src/sim/rng';
import { randomCommand } from '../../tests/unit/helpers';

const HEROES: readonly HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss'];
const LEVELS: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** The i-th fuzz seed: spread over the whole uint32 range; i = 0 is 0 and i = 1 is 0xffffffff. */
export const fuzzSeed = (i: number): number => (i === 0 ? 0 : i === 1 ? 0xffffffff : Math.imul(i, 0x9e3779b1) >>> 0);

export interface FuzzResult {
  seed: number;
  hero: HeroId;
  difficulty: Difficulty;
  ticks: number;
  commands: number;
  ok: boolean;
  /** Index of the first differing hash in the trail, or −1. */
  firstDiff: number;
  finalHash: string;
  inputChars: number;
}

/** Play one fuzz match (no replay). `trail` folds the whole hash trail (one hash every 30 ticks) into one hex. */
export function fuzzPlay(seed: number) {
  const r = new Rng(seed ^ 0x5eed);
  const hero = HEROES[r.int(HEROES.length)];
  const trick = TRICKS[r.int(TRICKS.length)];
  const difficulty = LEVELS[r.int(LEVELS.length)];
  // Command rate per tick from 2% to 40%, and some ticks with two commands (the latest wins).
  const rateBp = 200 + r.int(3800);
  const { picks, tricks } = fillPicks(seed, hero, trick);
  const m = createMatch({ seed, picks, tricks, difficulty });
  let commands = 0;
  while (!result(m)) {
    const list: Command[] = [];
    const c = randomCommand(r, rateBp);
    if (c) list.push(c);
    if (c && r.int(10) === 0) list.push(randomCommand(r, 10000) ?? { op: Op.Stop });
    if (r.int(4000) === 0) list.push({ op: Op.Trick, x: r.range(0, 100000), y: r.range(0, 60000) });
    commands += list.length;
    step(m, list);
  }
  return { match: m, hero, difficulty, commands, result: result(m)!, trail: foldTrail(hashTrail(m)) };
}

/** FNV-1a over the hash trail, as 8 hex digits. */
export function foldTrail(trail: readonly number[]): string {
  let h = 0x811c9dc5;
  for (const v of trail) {
    for (let k = 0; k < 4; k++) {
      h ^= (v >>> (k * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Final hash and folded trail of a fuzz match: what tests/e2e/determinism-browser.spec.ts compares across engines. */
export function fuzzFinal(seed: number): { seed: number; finalHash: string; trail: string; ticks: number } {
  const p = fuzzPlay(seed);
  return { seed, finalHash: p.result.finalHash, trail: p.trail, ticks: p.result.ticks };
}

export function fuzzMatch(seed: number): FuzzResult {
  const { match: m, hero, difficulty, commands, result: res } = fuzzPlay(seed);
  const rec = replayRecord(m)!;
  const run = runReplay(rec);
  const a = hashTrail(m);
  const b = run.trail;
  let firstDiff = -1;
  for (let i = 0; i < Math.max(a.length, b.length) && firstDiff < 0; i++) if (a[i] !== b[i]) firstDiff = i;
  const same = run.result !== null && JSON.stringify(run.result) === JSON.stringify(res);
  return { seed, hero, difficulty, ticks: res.ticks, commands, ok: firstDiff < 0 && same, firstDiff, finalHash: res.finalHash, inputChars: rec.inputs.length };
}
