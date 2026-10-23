// Endless mode: procedurally chained set-piece chunks. Each chunk opens with a calm lead (so chunks never crowd each
// other), then one template: log runs, branch runs, rock slaloms, bamboo, jump gaps, tail vaults, a river stretch,
// a wall-run, a dog chase or a yarn-ball chase, and fish lines. The pool and the hazard density grow with the chunk
// index (difficulty d 0..1 over ~30 chunks); the speed ramp comes from the stage def. SETPIECES lane.
import { pick, range } from '../core/rng';
import type { Rng, StageDef, ThemeId } from '../core/types';
import { vaultArc } from '../setpieces/layout';
import { Script } from './author';

type Kind = 'logs' | 'branches' | 'rocks' | 'mixed' | 'bamboo' | 'gap' | 'vault' | 'river' | 'wall' | 'dog' | 'yarn' | 'fish';
/** templates and the chunk index they unlock at */
const UNLOCK: [Kind, number][] = [
  ['fish', 1],
  ['logs', 1],
  ['branches', 1],
  ['rocks', 2],
  ['gap', 2],
  ['mixed', 3],
  ['vault', 3],
  ['river', 4],
  ['bamboo', 5],
  ['wall', 5],
  ['dog', 7],
  ['yarn', 9],
];
const BIG = new Set<Kind>(['vault', 'river', 'wall', 'dog', 'yarn']);
let last: Kind = 'fish';
let lastBig = -10;

const side = (r: Rng) => (r() < 0.5 ? -1 : 1);

const ENDLESS_THEMES: ThemeId[] = ['meadow', 'gorge', 'sunset'];
let runCount = -1;

export const endless: StageDef = {
  id: 'endless',
  index: 3,
  name: 'Endless Run',
  blurb: 'How far can Mochi go?',
  // each endless run takes the next landscape: meadow, gorge, sunset (core reads it after the first chunk is built)
  get theme(): ThemeId {
    return ENDLESS_THEMES[runCount % ENDLESS_THEMES.length];
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
      last = 'fish';
      lastBig = -10;
      const s = k.run(90, { turn: range(rng, -20, 20) });
      k.fish(s + 24, 0, 8, 3, 'wave', { amp: 2 }).yarn(s + 70, 2);
      return k.pieces;
    }
    const d = Math.min(1, index / 30);
    const pool = UNLOCK.filter(([kind, at]) => index >= at && kind !== last && !(BIG.has(kind) && index - lastBig < 2)).map(([kind]) => kind);
    const kind = pick(rng, pool);
    last = kind;
    if (BIG.has(kind)) lastBig = index;
    // calm lead: a bend with a fish line
    const lead = k.run(range(rng, 40, 60), { turn: range(rng, -35, 35), rise: range(rng, -4, 4) });
    k.fish(lead + 8, range(rng, -2, 2), 5, 3);
    const turn = () => range(rng, -45, 45);
    const n = (lo: number, hi: number) => Math.round(lo + (hi - lo) * d);
    let s: number;
    switch (kind) {
      case 'fish':
        s = k.run(130, { turn: turn(), rise: range(rng, -6, 6) });
        k.fish(s + 6, 0, 10, 3, 'wave', { amp: 2.4 }).treat(s + 50, range(rng, -2, 2)).yarn(s + 80, range(rng, -2, 2)).fish(s + 96, range(rng, -2, 2), 8, 3);
        break;
      case 'logs': {
        const cnt = n(2, 4);
        s = k.run(40 + cnt * 32, { turn: turn() });
        for (let i = 0; i < cnt; i++) {
          const at = s + 20 + i * 32;
          if (rng() < 0.35 + d * 0.3) k.log(at, side(rng) * 2.25, 4.5);
          else k.log(at).fish(at - 8, 0, 6, 2.6, 'arc', { h: 2 });
        }
        break;
      }
      case 'branches': {
        const cnt = n(2, 3);
        s = k.run(40 + cnt * 34, { turn: turn() });
        for (let i = 0; i < cnt; i++) k.branch(s + 20 + i * 34).fish(s + 34 + i * 34, 0, 3, 2.5, 'line', { y: 0.45 });
        break;
      }
      case 'rocks': {
        const cnt = n(3, 6);
        s = k.run(30 + cnt * 22, { turn: turn() });
        let x = side(rng) * 2.3;
        for (let i = 0; i < cnt; i++) {
          k.rock(s + 18 + i * 22, x, range(rng, 0.8, 1.1));
          x = -x;
        }
        k.yarn(s + 10 + cnt * 11, 0);
        break;
      }
      case 'mixed':
        s = k.run(150, { turn: turn(), rise: range(rng, -8, 8) });
        k.log(s + 20).rock(s + 50, side(rng) * 2.3).branch(s + 80).log(s + 110, side(rng) * 2.25, 4.5).fish(s + 124, 0, 6, 3);
        break;
      case 'bamboo': {
        // a slalom: one lane switch per cluster. Spaced by time (not distance) so it never outpaces the speed ramp,
        // and at most 5 clusters (6 at 30 u apart was the spike around 2.5 km); bends stay gentle in the grove
        const cnt = n(3, 5);
        const gap = Math.round(1.45 * (endless.speed.start + (endless.speed.max - endless.speed.start) * d));
        s = k.run(40 + cnt * gap, { turn: turn() * 0.5 });
        let x = side(rng) * 2.6;
        for (let i = 0; i < cnt; i++) {
          k.bamboo(s + 20 + i * gap, x, 3, 2.4).fish(s + 20 + i * gap + Math.round(gap * 0.4), -x, 3, 3);
          x = -x;
        }
        break;
      }
      case 'gap': {
        const g = k.gapJump(36, Math.round(8 + 6 * d), 28, { hint: index < 6 ? 'JUMP!' : '' });
        k.fish(g - 5, 0, 7, 2.6, 'arc', { h: 2.2 });
        break;
      }
      case 'vault': {
        const len = Math.round(22 + 8 * d);
        const v = k.vaultGap(42, len, 36);
        const a = vaultArc(v, len);
        k.treat(a.mid, 0, a.height - 0.2);
        break;
      }
      case 'river': {
        const len = Math.round(220 + 120 * d);
        s = k.riverRun(len, { turn: turn() });
        k.fish(s + 16, side(rng) * 3, 8, 3);
        let at = s + 56;
        let x = side(rng) * 2.6;
        while (at < s + len - 30) {
          const r = rng();
          if (r < 0.45) k.riverrock(at, x, range(rng, 0.9, 1.3));
          else if (r < 0.75) k.driftlog(at, x * 0.9, 5);
          else k.rapid(at).fish(at - 7, 0, 5, 3, 'arc', { h: 2.2 });
          k.fish(at + 12, -x, 4, 3);
          x = -x;
          at += range(rng, 34, 48);
        }
        k.run(30, { width: 9 });
        break;
      }
      case 'wall': {
        const len = Math.round(110 + 40 * d);
        const up = rng() < 0.6;
        s = k.wallRun(len, up ? { rise: range(rng, 20, 34), bank: side(rng) * 35, turn: turn() * 0.5 } : { bank: side(rng) * 55, turn: turn() * 0.6 });
        k.fish(s + 12, 0, 8, 3, 'wave', { amp: 2 }).yarn(s + len - 20, 0);
        k.run(34, { bank: 0 });
        break;
      }
      case 'dog': {
        const len = Math.round(280 + 120 * d);
        s = k.run(len + 40, { turn: turn(), rise: range(rng, -8, 4) });
        k.dogChase(s + 12, len, side(rng));
        for (let at = s + 60; at < s + len - 20; at += range(rng, 60, 80)) {
          if (rng() < 0.6) k.log(at);
          else k.branch(at);
          k.fish(at + 16, 0, 6, 3);
        }
        break;
      }
      case 'yarn': {
        const len = Math.round(300 + 100 * d);
        s = k.run(len + 40, { rise: -range(rng, 10, 24), turn: turn() });
        k.yarnChase(s + 14, len);
        for (let at = s + 70; at < s + len - 20; at += range(rng, 90, 120)) k.log(at).fish(at + 14, 0, 6, 3);
        break;
      }
    }
    return k.pieces;
  },
};
