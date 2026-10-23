import { describe, expect, it } from 'vitest';
import { PathBuilder } from '../core/path';
import { makeRng } from '../core/rng';
import { Track } from '../core/track';
import { BELLS, type PieceSpec, type StageDef } from '../core/types';
import { endless } from './endless';
import { gorge } from './gorge';
import { meadow } from './meadow';
import { sunset } from './sunset';
import { bellRules, GOOD_RUN, goodRunScore, perfectScore, runSeconds, validateLayout } from './validate';

const KNOWN = new Set([
  'log', 'rock', 'branch', 'puddle', 'bamboo', 'sign', 'edge', 'cpflag', 'finish', 'hint',
  'fish', 'bell', 'yarn', 'treat', 'ring', 'vault', 'cloud', 'wallrun', 'river', 'riverrock', 'driftlog', 'rapid', 'dog', 'yarnchase',
]);

function build(st: StageDef): { t: Track; pieces: PieceSpec[] } {
  const t = new Track();
  const pieces = st.build!(new PathBuilder(t, st.start), makeRng(1));
  return { t, pieces };
}

describe('campaign stages', () => {
  for (const st of [meadow, gorge, sunset]) {
    describe(st.id, () => {
      const { t, pieces } = build(st);
      it('builds: 7 distinct bells, pieces on the track, known types, ends on ground', () => {
        const bells = pieces.filter((p) => p.type === 'bell').map((p) => p.params?.index);
        expect(new Set(bells).size).toBe(BELLS);
        expect(bells.length).toBe(BELLS);
        for (const p of pieces) {
          expect(KNOWN.has(p.type), p.type).toBe(true);
          expect(p.s).toBeGreaterThanOrEqual(0);
          expect(p.s).toBeLessThanOrEqual(t.length);
          expect(Number.isFinite(p.s)).toBe(true);
        }
        expect(t.kindAt(t.length - 1)).toBe('ground');
      });
      it('lasts 90..150 s (GDD)', () => {
        const avg = t.length / ((st.speed.start + st.speed.max) / 2);
        const ramped = runSeconds(st, t.length);
        expect(avg).toBeGreaterThan(90);
        expect(avg).toBeLessThan(150);
        expect(ramped).toBeGreaterThan(88);
        expect(ramped).toBeLessThan(150);
      });
      it('is fair: reaction time, no hazards in arcs or on rims, every special segment has its piece', () => {
        expect(validateLayout(st, t, pieces)).toEqual([]);
      });
      it('follows the bell rules (air, set-piece route, off the racing line)', () => {
        expect(bellRules(t, pieces)).toEqual({ air: true, route: true, offLine: true });
      });
      it('score target matches a good run (one hit, 9 of 10 fish): a clean run beats it, a sloppy one does not', () => {
        const good = goodRunScore(pieces, t.length);
        const best = perfectScore(pieces, t.length);
        const clean = goodRunScore(pieces, t.length, { ...GOOD_RUN, hits: 0 });
        const sloppy = goodRunScore(pieces, t.length, { hits: 2, missEvery: 7, hearts: 1 });
        const info = `good ${good}, clean ${clean}, sloppy ${sloppy}, perfect ${best}`;
        expect(st.scoreTarget, info).toBeGreaterThan(good * 0.95);
        expect(st.scoreTarget, info).toBeLessThan(good * 1.05);
        expect(st.scoreTarget, info).toBeLessThan(clean * 0.95);
        expect(st.scoreTarget, info).toBeGreaterThan(sloppy * 1.1);
        expect(st.scoreTarget, info).toBeLessThan(best * 0.85);
      });
    });
  }
  it('stage 1 teaches jump, slide, the air bell, the vault and the pounce with prompts', () => {
    const { pieces } = build(meadow);
    const texts = pieces.filter((p) => p.type === 'hint').map((p) => String(p.params?.text));
    expect(texts).toContain('JUMP!');
    expect(texts).toContain('SLIDE!');
    expect(texts).toContain('GRAB IT IN THE AIR!');
    expect(texts.some((x) => x.includes('POUNCE'))).toBe(true);
    expect(pieces.some((p) => p.type === 'vault')).toBe(true);
  });
  it('stage 2 has a wall-run, a river and the dog; stage 3 has the cloud and the yarn chase', () => {
    const g = build(gorge).pieces.map((p) => p.type);
    expect(g).toEqual(expect.arrayContaining(['wallrun', 'river', 'dog', 'vault', 'rapid']));
    const s = build(sunset).pieces.map((p) => p.type);
    expect(s).toEqual(expect.arrayContaining(['cloud', 'yarnchase', 'wallrun', 'vault', 'bamboo', 'ring']));
  });
});

describe('endless', () => {
  for (const seed of [1, 7, 42, 999]) {
    it(`seed ${seed}: 60 chunks always add path and stay fair`, () => {
      const t = new Track();
      const b = new PathBuilder(t, endless.start);
      const rng = makeRng(seed);
      const pieces: PieceSpec[] = [];
      for (let i = 0; i < 60; i++) {
        const before = t.length;
        const add = endless.chunk!(b, rng, i);
        expect(t.length).toBeGreaterThan(before);
        for (const p of add) {
          expect(KNOWN.has(p.type), p.type).toBe(true);
          expect(p.s).toBeGreaterThanOrEqual(before - 0.01);
          expect(p.s).toBeLessThanOrEqual(t.length);
        }
        pieces.push(...add);
      }
      expect(validateLayout(endless, t, pieces)).toEqual([]);
      expect(pieces.some((p) => p.type === 'bell')).toBe(false);
      // the variety shows up over a long run
      const types = new Set(pieces.map((p) => p.type));
      for (const k of ['log', 'branch', 'rock', 'vault', 'river', 'fish']) expect(types.has(k), k).toBe(true);
    });
  }
});
