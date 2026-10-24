import { describe, expect, it } from 'vitest';
import { HAZARD_TYPES } from '../core/checkpoints';
import { PathBuilder } from '../core/path';
import { makeRng } from '../core/rng';
import { Track } from '../core/track';
import type { PieceSpec, StageDef } from '../core/types';
import { Script } from './author';
import { BLOCKS, MIN_LEAD } from './blocks';
import { endless, ENDLESS_UNLOCK } from './endless';
import { validateLayout } from './validate';

const FAST: StageDef = { ...endless, speed: { start: 22, max: 31, rampDist: 2400 } };
const START = { x: 0, y: 0, z: 0, heading: 0, width: 9 };

function lay(build: (k: Script) => void): { t: Track; pieces: PieceSpec[]; s0: number; s1: number } {
  const t = new Track();
  const k = new Script(new PathBuilder(t, START));
  k.run(40);
  const s0 = k.s;
  build(k);
  const s1 = k.s;
  k.run(60);
  return { t, pieces: k.pieces, s0, s1 };
}

describe('block library', () => {
  it('has at least 18 blocks with unique single base-36 ids and keys', () => {
    expect(BLOCKS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(BLOCKS.length);
    expect(new Set(BLOCKS.map((b) => b.key)).size).toBe(BLOCKS.length);
    for (const b of BLOCKS) {
      expect(b.id).toMatch(/^[0-9a-z]$/);
      expect(b.icon.startsWith('<svg')).toBe(true);
      expect(b.name.length).toBeGreaterThan(2);
    }
    for (const key of ['fish', 'bendL', 'bendR', 'hill', 'logs', 'branches', 'rocks', 'mixed', 'bamboo', 'puddles', 'gap', 'pounce', 'vault', 'river', 'wall', 'dog', 'yarn', 'cloud', 'bridge'])
      expect(BLOCKS.some((b) => b.key === key), key).toBe(true);
  });

  for (const b of BLOCKS) {
    it(`${b.key}: calm lead, ends on ground, fair at turbo speed (plain, mirrored, hard, both)`, () => {
      for (const [mirror, hard] of [[false, false], [true, false], [false, true], [true, true]]) {
        for (const seed of [1, 2, 3, 99]) {
          const { t, pieces, s0, s1 } = lay((k) => b.build(k, makeRng(seed), { mirror, hard, d: hard ? 0.9 : 0.35 }));
          expect(s1 - s0).toBeGreaterThan(80);
          const tag = `${b.key} mirror ${mirror} hard ${hard} seed ${seed}`;
          // no hazard and no special surface in the first MIN_LEAD u
          for (const p of pieces) if (HAZARD_TYPES.has(p.type) && p.type !== 'edge') expect(p.s, `${tag}: ${p.type}`).toBeGreaterThan(s0 + MIN_LEAD);
          for (let s = s0; s < s0 + MIN_LEAD; s++) expect(t.kindAt(s), tag).toBe('ground');
          // ends on plain flat ground
          expect(t.kindAt(s1 - 1), tag).toBe('ground');
          for (const p of pieces) expect(p.s + (p.len ?? 0), `${tag}: ${p.type}`).toBeLessThanOrEqual(s1 + 0.01);
          expect(validateLayout(FAST, t, pieces), tag).toEqual([]);
        }
      }
    });
  }
});

describe('endless determinism (the Daily Run depends on it)', () => {
  const run = (seed: number, n: number) => {
    const t = new Track();
    const b = new PathBuilder(t, endless.start);
    const rng = makeRng(seed);
    const out: PieceSpec[][] = [];
    for (let i = 0; i < n; i++) out.push(endless.chunk!(b, rng, i));
    const pts = [0, 0.25, 0.5, 0.75, 1].map((u) => t.kindAt(t.length * u));
    return { pieces: JSON.stringify(out), length: t.length, pts, segs: JSON.stringify(t.segments) };
  };
  it('same rng sequence + index order = identical chunks, even after other runs left module state behind', () => {
    const a = run(4242, 40);
    run(7, 13); // a different run stops half way (generator state left mid-run)
    run(99, 3);
    const b = run(4242, 40);
    expect(b).toEqual(a);
    expect(run(4243, 40).pieces).not.toEqual(a.pieces);
  });
  it('every endless pool key is a block, and the pool grows with the index', () => {
    for (const [key] of ENDLESS_UNLOCK) expect(BLOCKS.some((b) => b.key === key), key).toBe(true);
    const seen = new Set<string>();
    const t = new Track();
    const b = new PathBuilder(t, endless.start);
    const rng = makeRng(5);
    for (let i = 0; i < 120; i++) for (const p of endless.chunk!(b, rng, i)) seen.add(p.type);
    for (const k of ['log', 'branch', 'rock', 'vault', 'river', 'wallrun', 'dog', 'yarnchase', 'cloud', 'puddle', 'bamboo']) expect(seen.has(k), k).toBe(true);
  });
});
