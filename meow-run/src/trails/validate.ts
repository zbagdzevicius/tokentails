// Trail validation, difficulty and the RANDOM trail (TRAILS lane). Pure (node-importable).
// A trail is fair when it decodes within the limits, its theme offers every block, the built course passes the same
// layout validator as the campaign (stages/validate.ts: gaps, vaults, clouds, walls, rivers, reaction spacing at
// top speed) and its length and run time are in bounds. Finishability is structural on top of that: every set piece
// avoids soft-locks (a missed vault falls past the gap, the cloud auto-summons), and the maker must finish a trail once
// before it can be shared.
import { PathBuilder } from '../core/path';
import { makeRng, pick } from '../core/rng';
import { Track } from '../core/track';
import type { PieceSpec, StageDef, ThemeId } from '../core/types';
import { HAZARDS } from '../setpieces/layout';
import { blockAllowed, blockById, blocksFor, type BlockDef } from '../stages/blocks';
import { runSeconds, validateLayout } from '../stages/validate';
import { buildTrail, trailStage, type BlockRange } from './build';
import { DEFAULT_TRAIL_NAME, MAX_BLOCKS, MIN_BLOCKS, normalizeTrail, SEED_MAX, THEMES, type Pace, type Trail, type TrailBlock } from './code';

export const MIN_LEN = 400;
export const MAX_LEN = 6000;
export const MIN_SECONDS = 25;
export const MAX_SECONDS = 240;

export const THEME_NAMES: Record<ThemeId, string> = { meadow: 'Sunny Meadow', gorge: 'River Gorge', sunset: 'Sunset Hills' };

export interface TrailError {
  /** the block index the problem is in (-1 = the whole trail) */
  block: number;
  message: string;
}
export interface TrailCheck {
  ok: boolean;
  errors: TrailError[];
  /** u from the start to the finish line */
  length: number;
  /** seconds to run it at the pace's ramped speed (no boosts) */
  seconds: number;
  /** 1..5 */
  difficulty: number;
}
export interface TrailAnalysis extends TrailCheck {
  stage: StageDef;
  track: Track;
  pieces: PieceSpec[];
  ranges: BlockRange[];
}

const BIG_TYPES = new Set(['vault', 'cloud', 'wallrun', 'river', 'dog', 'yarnchase']);

/** 1..5 from hazard density, big set pieces, gaps and the pace */
/**
 * Difficulty 1..5. Each block weighs in on its own (a big set piece 1.6, other blocks by the hazards they hold,
 * x1.5 when hard), averaged over the blocks, plus the hazard density per second of running, all times the pace. So
 * long set pieces do not dilute the rating: an all-hard turbo trail of big set pieces is a 5.
 */
export function difficultyOf(
  pieces: readonly PieceSpec[],
  track: Track,
  pace: Pace,
  length: number,
  blocks: readonly { id: string; hard: boolean }[] = [],
  ranges: readonly BlockRange[] = [],
  seconds = 0,
): number {
  return Math.max(1, Math.min(5, 1 + Math.floor(difficultyScore(pieces, track, pace, length, blocks, ranges, seconds))));
}
/** the raw score behind difficultyOf (0 .. about 5) */
export function difficultyScore(
  pieces: readonly PieceSpec[],
  track: Track,
  pace: Pace,
  length: number,
  blocks: readonly { id: string; hard: boolean }[],
  ranges: readonly BlockRange[],
  seconds: number,
): number {
  let load = 0;
  for (const p of pieces) {
    if (HAZARDS[p.type]) load += 1;
    else if (BIG_TYPES.has(p.type)) load += 1.6;
  }
  for (const g of track.segments) if (g.kind === 'gap' && g.s1 <= length) load += 1.2;
  // per block
  let sum = 0;
  let n = 0;
  for (let i = 0; i < blocks.length; i++) {
    const def = blockById(blocks[i].id);
    if (!def) continue;
    let w: number;
    if (def.big) w = 1.6;
    else {
      const r = ranges[i];
      let hz = 0;
      if (r) {
        for (const p of pieces) if (p.s >= r.s0 - 0.5 && p.s < r.s1 + 0.5 && HAZARDS[p.type]) hz++;
        for (const g of track.segments) if (g.kind === 'gap' && g.s0 >= r.s0 - 0.5 && g.s0 < r.s1 + 0.5) hz += 1.2;
      }
      w = Math.max(0.25, Math.min(1.3, hz * 0.32));
    }
    sum += w * (blocks[i].hard ? 1.5 : 1);
    n++;
  }
  const perBlock = n ? sum / n : (load / Math.max(1, length)) * 100 * 0.6;
  // hazards per second of running (the pace speeds it up)
  const perSec = seconds > 0 ? load / seconds : (load / Math.max(1, length)) * 20;
  const paceMul = pace === 0 ? 0.82 : pace === 1 ? 1 : 1.22;
  return (perBlock * 1.25 + perSec * 1.6) * paceMul * 1.15;
}

const blockAt = (ranges: readonly BlockRange[], s: number): number => {
  for (let i = 0; i < ranges.length; i++) if (s >= ranges[i].s0 - 0.5 && s < ranges[i].s1 + 0.5) return i;
  return -1;
};

/** Build the trail on a fresh track and check it (the editor uses the track for its minimap). */
export function analyzeTrail(input: Trail): TrailAnalysis {
  const trail = normalizeTrail(input);
  const errors: TrailError[] = [];
  if (input.blocks.length < MIN_BLOCKS) errors.push({ block: -1, message: `Add at least ${MIN_BLOCKS} blocks` });
  if (input.blocks.length > MAX_BLOCKS) errors.push({ block: -1, message: `At most ${MAX_BLOCKS} blocks` });
  trail.blocks.forEach((b, i) => {
    const def = blockById(b.id);
    if (!def) errors.push({ block: i, message: 'Unknown block' });
    else if (!blockAllowed(def, trail.theme)) errors.push({ block: i, message: `${def.name} is not available in ${THEME_NAMES[trail.theme]}` });
  });
  const stage = trailStage(trail);
  const track = new Track();
  const ranges: BlockRange[] = [];
  const pieces = buildTrail(trail, new PathBuilder(track, stage.start), ranges);
  const length = track.length;
  for (const problem of validateLayout(stage, track, pieces)) {
    const m = /at (-?\d+(?:\.\d+)?)/.exec(problem);
    const i = m ? blockAt(ranges, Number(m[1])) : -1;
    const name = i >= 0 ? (blockById(trail.blocks[i].id)?.name ?? 'Block') : 'Trail';
    errors.push({ block: i, message: `${name} does not fit here (${problem})` });
  }
  const seconds = runSeconds(stage, length);
  if (trail.blocks.length >= MIN_BLOCKS) {
    if (length < MIN_LEN) errors.push({ block: -1, message: `Too short: add a block (${MIN_LEN} m minimum)` });
    else if (seconds < MIN_SECONDS) errors.push({ block: -1, message: `Too quick: add a block (${MIN_SECONDS} s minimum)` });
  }
  if (length > MAX_LEN) errors.push({ block: -1, message: `Too long: remove a block (${MAX_LEN / 1000} km maximum)` });
  else if (seconds > MAX_SECONDS) errors.push({ block: -1, message: 'Too long to run (4 min maximum): remove a block or go faster' });
  return { ok: errors.length === 0, errors, length, seconds, difficulty: difficultyOf(pieces, track, trail.pace, length, trail.blocks, ranges, seconds), stage, track, pieces, ranges };
}

export function validateTrail(trail: Trail): TrailCheck {
  const a = analyzeTrail(trail);
  return { ok: a.ok, errors: a.errors, length: a.length, seconds: a.seconds, difficulty: a.difficulty };
}

// ---------------------------------------------------------------- random trails
const ADJ = ['Zoomy', 'Fishy', 'Sunny', 'Purry', 'Fuzzy', 'Sneaky', 'Bouncy', 'Comfy', 'Sparkly', 'Wild', 'Sleepy', 'Turbo'];
const NOUN = ['Paws', 'Dash', 'Path', 'Loop', 'Trail', 'Romp', 'Zoom', 'Hop', 'Scamper', 'Run', 'Ramble', 'Whiskers'];
export function randomName(seed: number): string {
  const r = makeRng(seed * 31 + 7);
  const a = pick(r, ADJ);
  const n = pick(r, NOUN);
  return `${a} ${n}`.slice(0, 14).trim();
}

/** a random block list for a theme: 5..10 blocks, never the same block twice in a row, at most 3 big set pieces */
function randomBlocks(r: () => number, theme: ThemeId, n: number): TrailBlock[] {
  const pool = blocksFor(theme);
  const out: TrailBlock[] = [];
  let bigs = 0;
  let prev: BlockDef | null = null;
  while (out.length < n) {
    const b = pick(r, pool);
    if (b === prev || (b.big && bigs >= 3)) continue;
    if (b.big) bigs++;
    prev = b;
    out.push({ id: b.id, mirror: r() < 0.4, hard: r() < 0.25 });
  }
  return out;
}

/** The STARTER course (the 'trail' stage before the player makes one). Always valid. */
export const STARTER: Trail = {
  v: 1,
  name: "Mochi's trail",
  theme: 'meadow',
  pace: 1,
  seed: 1234,
  blocks: [
    { id: '0', mirror: false, hard: false },
    { id: '4', mirror: false, hard: false },
    { id: 'a', mirror: false, hard: false },
    { id: '1', mirror: false, hard: false },
    { id: '5', mirror: false, hard: false },
    { id: 'i', mirror: false, hard: false },
    { id: 'c', mirror: false, hard: false },
    { id: '6', mirror: true, hard: false },
  ],
};

/**
 * A random trail that always validates (RANDOM in the editor, the test hook). theme / pace / name may be fixed by the
 * caller; everything else comes from the seed.
 */
export function randomTrail(seed: number, o: { theme?: ThemeId; pace?: Pace; name?: string; count?: number } = {}): Trail {
  const r = makeRng((seed >>> 0) * 2654435761 + 97);
  const theme = o.theme ?? pick(r, THEMES);
  const pace = o.pace ?? (Math.floor(r() * 3) as Pace);
  const n = o.count ?? 5 + Math.floor(r() * 6);
  const t: Trail = { v: 1, name: o.name || randomName(seed), theme, pace, seed: Math.floor(r() * SEED_MAX), blocks: randomBlocks(r, theme, Math.max(MIN_BLOCKS, Math.min(MAX_BLOCKS, n))) };
  for (let guard = 0; guard < 40; guard++) {
    const c = validateTrail(t);
    if (c.ok) return t;
    if ((c.length > MAX_LEN || c.seconds > MAX_SECONDS) && t.blocks.length > MIN_BLOCKS) t.blocks.pop();
    else if ((c.length < MIN_LEN || c.seconds < MIN_SECONDS) && t.blocks.length < MAX_BLOCKS) t.blocks.push(...randomBlocks(r, theme, 1));
    else t.blocks = randomBlocks(r, theme, Math.max(MIN_BLOCKS, Math.min(MAX_BLOCKS, n)));
  }
  return { ...STARTER, name: t.name || DEFAULT_TRAIL_NAME, theme, pace };
}
