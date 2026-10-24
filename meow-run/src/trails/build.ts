// Trail -> course (TRAILS lane). Pure (node-importable). A 40 u start straight, the blocks in order (laid with
// makeRng(trail.seed), so the same code always lays the same course), a 60 u straight and the finish arch.
import type { PathBuilder } from '../core/path';
import { makeRng } from '../core/rng';
import type { PieceSpec, StageDef } from '../core/types';
import { Script } from '../stages/author';
import { blockById, HARD_D, TRAIL_D } from '../stages/blocks';
import { PACES, type Trail } from './code';

export const START_LEN = 40;
export const END_LEN = 60;
export const TRAIL_RAMP = 2400;

/** where each block landed on the track (block i covers [s0, s1)) */
export interface BlockRange {
  s0: number;
  s1: number;
}

export function buildTrail(trail: Trail, b: PathBuilder, ranges?: BlockRange[]): PieceSpec[] {
  const k = new Script(b);
  const rng = makeRng(trail.seed);
  k.run(START_LEN);
  for (const tb of trail.blocks) {
    const def = blockById(tb.id);
    const s0 = k.s;
    if (def) def.build(k, rng, { mirror: tb.mirror, hard: tb.hard, d: tb.hard ? HARD_D : TRAIL_D });
    ranges?.push({ s0, s1: k.s });
  }
  k.run(END_LEN);
  k.finish(k.s - 1, 'TRAIL CLEAR!');
  return k.pieces;
}

export function trailSpeed(trail: Trail): StageDef['speed'] {
  const p = PACES[trail.pace] ?? PACES[1];
  return { start: p.start, max: p.max, rampDist: TRAIL_RAMP };
}

/** The 'trail' StageDef for a course (index 91, not on the stage map). It ignores the session rng. */
export function trailStage(trail: Trail): StageDef {
  return {
    id: 'trail',
    index: 91,
    // the maker's credit rides with the name everywhere it shows (callout, results, cards, clips)
    name: trail.author ? `${trail.name} by ${trail.author}` : trail.name,
    blurb: `A trail with ${trail.blocks.length} blocks`,
    theme: trail.theme,
    music: trail.theme,
    speed: trailSpeed(trail),
    scoreTarget: 0,
    bells: 0,
    start: { x: 0, y: 0, z: 0, heading: 0, width: 9 },
    build: (b) => buildTrail(trail, b),
  };
}
