import { describe, expect, it } from 'vitest';
import { PathBuilder } from '../core/path';
import { makeRng, pick } from '../core/rng';
import { Track } from '../core/track';
import type { ThemeId } from '../core/types';
import { blockAllowed, BLOCKS, blocksFor } from '../stages/blocks';
import { validateLayout } from '../stages/validate';
import { buildTrail, trailStage } from './build';
import { CODE_MAX, decodeTrail, encodeTrail, MAX_BLOCKS, SEED_MAX, THEMES, type Pace, type Trail } from './code';
import { mapData, mapFrame } from './minimap';
import { analyzeTrail, MAX_LEN, MAX_SECONDS, MIN_LEN, MIN_SECONDS, randomTrail, STARTER, validateTrail } from './validate';

const T = (blocks: string[], o: Partial<Trail> = {}): Trail => ({
  v: 1,
  name: 'Test trail',
  theme: 'meadow',
  pace: 1,
  seed: 77,
  blocks: blocks.map((id) => ({ id, mirror: false, hard: false })),
  ...o,
});

describe('trail codes', () => {
  it('round trips every field', () => {
    const t: Trail = { v: 1, name: 'Zoë Paws 9', theme: 'sunset', pace: 2, seed: SEED_MAX - 1, blocks: BLOCKS.map((b, i) => ({ id: b.id, mirror: i % 2 === 1, hard: i % 3 === 0 })).slice(0, 24) };
    const code = encodeTrail(t);
    expect(code.length).toBeLessThanOrEqual(CODE_MAX);
    expect(code).toMatch(/^1s2[0-9a-z]{3}([0-9a-z][0-3])+-[A-Za-z0-9_-]*$/);
    expect(decodeTrail(code)).toEqual(t);
  });
  it('carries the maker as the author (older codes have none; a long author gives way first)', () => {
    const t = { v: 1 as const, name: 'Sleepy Dash', author: 'Zig', theme: 'meadow' as const, pace: 1 as const, seed: 77, blocks: [{ id: '0', mirror: false, hard: false }, { id: '3', mirror: true, hard: false }] };
    const code = encodeTrail(t);
    expect(code).toContain('.');
    expect(decodeTrail(code)).toEqual(t);
    expect(decodeTrail(code.slice(0, code.indexOf('.')))?.author).toBeUndefined();
    expect(decodeTrail(`${code}!`)).toBeNull();
    const long = { ...t, name: 'ab'.repeat(7), author: 'ミアちゃんミアちゃんミアちゃん', blocks: Array.from({ length: 24 }, () => ({ id: '0', mirror: false, hard: false })) };
    const lc = encodeTrail(long);
    expect(lc.length).toBeLessThanOrEqual(CODE_MAX);
    expect(decodeTrail(lc)?.name).toBe(long.name);
  });
  it('sanitises names and keeps a max-length code under the limit (wide letters are shortened)', () => {
    const t = T(new Array(MAX_BLOCKS).fill('f'), { name: '<b>𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜</b>' });
    const code = encodeTrail(t);
    expect(code.length).toBeLessThanOrEqual(CODE_MAX);
    const d = decodeTrail(code)!;
    expect(d).not.toBeNull();
    expect(d.name).not.toContain('<');
    expect(decodeTrail(encodeTrail(T(['0', '4'], { name: 'Ab<script>' })))!.name).toBe('Abscript');
    expect(decodeTrail(encodeTrail(T(['0', '4'], { name: '' })))!.name).toBe('My trail');
  });
  it('returns null on garbage and never throws', () => {
    const bad: unknown[] = [
      undefined, null, 42, {}, '', '1', '1m1000', '2m1000041-QQ', '1x1000041-QQ', '1m3000041-QQ', '1m10000-QQ', '1m1000041QQ', '1m100004-QQ',
      '1m1000Z41-QQ', '1m1000044-QQ', '1m1000041-Q', '1m1000041-@@@@', '1m1000041-' + 'A'.repeat(200), '1m1000041-_w', `1m1000${'00'.repeat(25)}-QQ`,
    ];
    for (const b of bad) expect(decodeTrail(b), String(b)).toBeNull();
    const r = makeRng(3);
    const chars = '01m2s-_aZ9xg';
    for (let i = 0; i < 2000; i++) {
      let s = '';
      const n = Math.floor(r() * 40);
      for (let j = 0; j < n; j++) s += chars[Math.floor(r() * chars.length)];
      expect(() => decodeTrail(s)).not.toThrow();
    }
    // invalid utf-8 bytes in the name
    expect(decodeTrail('1m1000041-_w')).toBeNull();
  });
});

describe('trail build', () => {
  it('is deterministic: the same code lays the same course (session rng ignored)', () => {
    const t = randomTrail(5);
    const a = new Track();
    const b = new Track();
    const pa = trailStage(t).build!(new PathBuilder(a, trailStage(t).start), makeRng(1));
    const pb = trailStage(decodeTrail(encodeTrail(t))!).build!(new PathBuilder(b, trailStage(t).start), makeRng(999));
    expect(pb).toEqual(pa);
    expect(b.length).toBe(a.length);
    expect(JSON.stringify(b.segments)).toBe(JSON.stringify(a.segments));
  });
  it('stage def: id trail, index 91, pace speeds, no bells, ends with the finish arch on ground', () => {
    for (const pace of [0, 1, 2] as Pace[]) {
      const st = trailStage({ ...STARTER, pace });
      expect(st.id).toBe('trail');
      expect(st.index).toBe(91);
      expect(st.bells).toBe(0);
      expect(st.scoreTarget).toBe(0);
      expect(st.music).toBe(STARTER.theme);
      expect([st.speed.start, st.speed.max]).toEqual([[18, 24], [20, 28], [22, 31]][pace]);
    }
    const t = new Track();
    const pieces = buildTrail(STARTER, new PathBuilder(t, trailStage(STARTER).start));
    expect(pieces.some((p) => p.type === 'finish')).toBe(true);
    expect(pieces.some((p) => p.type === 'bell')).toBe(false);
    expect(t.kindAt(t.length - 1)).toBe('ground');
  });
});

describe('trail validation', () => {
  it('the starter course is valid', () => {
    const c = validateTrail(STARTER);
    expect(c.errors).toEqual([]);
    expect(c.ok).toBe(true);
  });
  it('every block alone validates in each allowed theme, mirrored and hard, at every pace', () => {
    for (const b of BLOCKS) {
      for (const theme of THEMES) {
        if (!blockAllowed(b, theme)) continue;
        for (const [mirror, hard] of [[false, false], [true, true], [true, false], [false, true]])
          for (const pace of [0, 2] as Pace[]) {
            // alone = the block twice is the shortest legal trail; validateLayout must be clean either way
            const t: Trail = { v: 1, name: 'x', theme, pace, seed: 11, blocks: [{ id: b.id, mirror, hard }] };
            const a = analyzeTrail(t);
            expect(validateLayout(a.stage, a.track, a.pieces), `${b.key} ${theme}`).toEqual([]);
            expect(a.errors.every((e) => e.block === -1), `${b.key} ${theme}: ${JSON.stringify(a.errors)}`).toBe(true);
          }
      }
    }
  });
  it('rejects blocks the theme does not offer, too few and too many blocks, too short and too long', () => {
    const cloud = BLOCKS.find((b) => b.key === 'cloud')!;
    expect(cloud.themes).toBeDefined();
    const bad = validateTrail(T(['0', cloud.id, '4'], { theme: 'meadow' }));
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.block === 1)).toBe(true);
    expect(validateTrail(T(['0'])).errors[0].message).toMatch(/at least 2/);
    expect(validateTrail(T(['a', 'a'])).ok).toBe(false); // two jump gaps: too short
    expect(validateTrail(T(['a', 'a'])).errors.some((e) => /short/.test(e.message))).toBe(true);
    const long = validateTrail(T(new Array(MAX_BLOCKS).fill('f'), { pace: 0 }));
    expect(long.ok).toBe(false);
    expect(long.length > MAX_LEN || long.seconds > MAX_SECONDS).toBe(true);
    expect(validateTrail({ ...T(new Array(MAX_BLOCKS + 1).fill('0')) }).ok).toBe(false);
  });
  it('composability fuzz: 300 random trails (every block, mirror, hard, theme, pace) lay a fair course', () => {
    const r = makeRng(2026);
    const used = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const theme = pick(r, THEMES) as ThemeId;
      const pool = blocksFor(theme);
      const n = 2 + Math.floor(r() * 14);
      const blocks = [];
      for (let j = 0; j < n; j++) {
        const b = pick(r, pool);
        used.add(b.id);
        blocks.push({ id: b.id, mirror: r() < 0.5, hard: r() < 0.4 });
      }
      const t: Trail = { v: 1, name: `Fuzz ${i}`, theme, pace: Math.floor(r() * 3) as Pace, seed: Math.floor(r() * SEED_MAX), blocks };
      const a = analyzeTrail(t);
      const tag = `#${i} ${encodeTrail(t)}`;
      expect(validateLayout(a.stage, a.track, a.pieces), tag).toEqual([]);
      // only the length / time limits may complain about a random mix
      for (const e of a.errors) expect(e.block, `${tag}: ${e.message}`).toBe(-1);
      if (a.length >= MIN_LEN && a.length <= MAX_LEN && a.seconds >= MIN_SECONDS && a.seconds <= MAX_SECONDS) expect(a.ok, tag).toBe(true);
    }
    expect(used.size).toBe(BLOCKS.length);
  });
  it('RANDOM always validates and stays inside the time bounds', () => {
    for (let seed = 0; seed < 300; seed++) {
      const t = randomTrail(seed);
      const c = validateTrail(t);
      expect(c.errors, `seed ${seed} ${encodeTrail(t)}`).toEqual([]);
      expect(c.seconds).toBeGreaterThanOrEqual(MIN_SECONDS);
      expect(c.seconds).toBeLessThanOrEqual(MAX_SECONDS);
      expect(c.length).toBeGreaterThanOrEqual(MIN_LEN);
      expect(c.difficulty).toBeGreaterThanOrEqual(1);
      expect(c.difficulty).toBeLessThanOrEqual(5);
      expect(decodeTrail(encodeTrail(t))).toEqual({ ...t, blocks: t.blocks });
    }
    // fixed theme / pace / name are kept
    const t = randomTrail(9, { theme: 'gorge', pace: 0, name: 'Mine' });
    expect([t.theme, t.pace, t.name]).toEqual(['gorge', 0, 'Mine']);
  });
  it('long big set pieces do not dilute the rating: an all-hard turbo nightmare is a 5, a short chill trail a 1', () => {
    const night = validateTrail({ ...T([...'edfgcbaheficgd']), theme: 'gorge', pace: 2, blocks: [...'edfgcbaheficgd'].map((id) => ({ id, mirror: false, hard: true })) });
    expect(night.difficulty).toBe(5);
    expect(validateTrail(T(['0', '3', '0', '1', '9'], { pace: 0 })).difficulty).toBe(1);
    // one hard block among nine normal ones on turbo is not a 4 any more
    const mostly = validateTrail({ ...T([...'034567891']), pace: 2, blocks: [...'034567891'].map((id, i) => ({ id, mirror: false, hard: i === 3 })) });
    expect(mostly.difficulty).toBeLessThan(night.difficulty);
    expect(mostly.difficulty).toBeLessThanOrEqual(3);
  });
  it('difficulty grows with hard blocks and pace', () => {
    const easy = validateTrail(T(['0', '3', '0', '1', '9'], { pace: 0 })).difficulty;
    const hard = validateTrail({ ...T(['7', '6', '4', 'f', '8', '7'], { pace: 2 }), blocks: ['7', '6', '4', 'f', '8', '7'].map((id) => ({ id, mirror: false, hard: true })) }).difficulty;
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('minimap projection', () => {
  it('fits the course into the box, start on the left, one block index per point', () => {
    const a = analyzeTrail(STARTER);
    for (const aspect of [1, 2.2, 0.6]) {
      const m = mapData(a.track, a.ranges, a.length, aspect);
      expect(m.aspect).toBeCloseTo(aspect);
      for (let i = 0; i < m.n; i++) {
        expect(m.xs[i]).toBeGreaterThanOrEqual(-1e-4);
        expect(m.xs[i]).toBeLessThanOrEqual(1 + 1e-4);
        expect(m.ys[i]).toBeGreaterThanOrEqual(-1e-4);
        expect(m.ys[i]).toBeLessThanOrEqual(1 + 1e-4);
        expect(m.block[i]).toBeLessThan(STARTER.blocks.length);
      }
      expect(m.xs[0]).toBeLessThanOrEqual(m.xs[m.n - 1]);
      expect(new Set(m.block).size).toBe(STARTER.blocks.length + 1); // every block + the start/end straights
      const f = mapFrame(m, 400, 200);
      expect(f.sx / f.sy).toBeCloseTo(aspect);
      expect(f.ox).toBeGreaterThanOrEqual(0);
      expect(f.oy).toBeGreaterThanOrEqual(0);
    }
  });
});
