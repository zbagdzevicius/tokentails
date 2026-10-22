// The v2 motion-graphics timeline, the shot grid and the copy gate (no browser).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintTrailerCopy } from './lint-copy.mjs';
import { BEAT_FRAMES, CUTS, CUT15_SEGMENTS, overlayRanges, post, timeline } from './mg-timeline.mjs';
import { SHOTS } from './shots.mjs';

const copy = JSON.parse(readFileSync(new URL('./copy.json', import.meta.url), 'utf8'));

describe('trailer v3 motion graphics', () => {
  it('trailer copy passes the copy gate; banned copy fails it', () => {
    expect(lintTrailerCopy(copy).findings.length).toBe(0);
    const bad = lintTrailerCopy({ A: 'Save a shelter cat', B: 'The #1 game', C: 'Only $5', D: 'EIGHT HEROES in 7 minutes' });
    expect([...new Set(bad.findings.map((f) => f.id))].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('144 BPM: 25 frames per beat; every shot starts on a beat (an eighth in the final teamfight, a half beat after the ping)', () => {
    expect(BEAT_FRAMES).toBe(25);
    for (const s of SHOTS) {
      if (s.id.startsWith('S28') || s.id === 'S22') expect([0, 12, 13]).toContain(s.f0 % 25);
      else expect(s.f0 % 25).toBe(0);
    }
    // the gameplay shots tile the master to the end card without a gap or an overlap (per aspect)
    for (const aspect of ['16x9', '9x16']) {
      const covered = new Map();
      for (const s of SHOTS) {
        if (s.lobby || (s.aspects && !s.aspects.includes(aspect))) continue;
        const f1 = aspect === '9x16' ? (s.portrait?.f1 ?? s.f1) : s.f1;
        for (let f = s.f0; f <= f1; f++) {
          expect(covered.has(f)).toBe(false);
          covered.set(f, s.id);
        }
      }
      for (let f = 0; f < 1600; f++) expect(covered.has(f)).toBe(true);
    }
  });

  it('five kinetic lines on their hits; the end card on the f1600 downbeat', () => {
    const t = timeline('30', '16x9', copy);
    expect(t.find((e) => e.id === 'L1').words.map((w) => w.in)).toEqual([103, 128, 153]);
    expect(t.find((e) => e.id === 'L2a').in).toBe(400);
    expect(t.find((e) => e.id === 'L3').in).toBe(500);
    expect(t.find((e) => e.id === 'L4').in).toBe(700);
    expect(t.find((e) => e.id === 'L5').in).toBe(1450);
    expect(t.find((e) => e.kind === 'endcard').logo).toBe(1600);
    expect(timeline('15', '9x16', copy).find((e) => e.kind === 'endcard').logo).toBe(750);
    // kinetic type sits in the top third, clear of the fights (and their telegraphs) in the lower half
    for (const id of ['L1', 'L2a', 'L2b', 'L3', 'L4', 'L5']) expect(t.find((e) => e.id === id).y).toBeLessThanOrEqual(300);
    for (const cut of ['30', '15']) for (const aspect of ['16x9', '9x16']) for (const [a, b] of overlayRanges(cut, aspect, copy)) expect(a >= 0 && b < CUTS[cut]).toBe(true);
    // 9:16 type stays inside x 80-940 (the right-side rail)
    expect(timeline('30', '9x16', copy).every((e) => !('x' in e) || e.x === 510)).toBe(true);
  });

  it('the 15 s cut is 900 frames of whole segments of the master', () => {
    let next = 0;
    for (const [a, b, d] of CUT15_SEGMENTS) {
      expect(a).toBe(next);
      expect(b + d).toBeLessThan(1800);
      next = b + 1;
    }
    expect(next).toBe(900);
    // the core burst lands on cut f702 (master CORE_HIT 1527)
    expect(CUT15_SEGMENTS.find(([a, b]) => a <= 702 && b >= 702)[2]).toBe(825);
  });

  it('flashes are capped additive blooms: never on frame 0, never two within 4 frames, 25-75 %, only the core and the logo over 45 %', () => {
    for (const cut of ['30', '15']) {
      const fl = post(cut).flash;
      expect(fl.every((x) => x.f >= 1 && x.a >= 0.25 && x.a <= 0.75)).toBe(true);
      expect(fl.filter((x) => x.a > 0.45).length).toBeLessThanOrEqual(2);
      for (let i = 1; i < fl.length; i++) expect(fl[i].f - fl[i - 1].f).toBeGreaterThanOrEqual(4);
    }
  });
});
