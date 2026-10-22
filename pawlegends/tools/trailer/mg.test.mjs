// The motion-graphics timeline and the copy gate (no browser).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintTrailerCopy } from './lint-copy.mjs';
import { CUTS, overlayRanges, post, timeline } from './mg-timeline.mjs';

const copy = JSON.parse(readFileSync(new URL('./copy.json', import.meta.url), 'utf8'));

describe('trailer motion graphics', () => {
it('trailer copy passes the copy gate; banned copy fails it', () => {
  expect(lintTrailerCopy(copy).findings.length).toBe(0);
  const bad = lintTrailerCopy({ A: 'Save a shelter cat', B: 'The #1 game', C: 'Only $5', D: 'EIGHT HEROES in 7 minutes' });
  expect([...new Set(bad.findings.map((f) => f.id))].sort()).toEqual(['A', 'B', 'C', 'D']);
});

it('every element sits inside its cut, on the storyboard frames', () => {
  for (const cut of ['30', '15']) {
    for (const aspect of ['16x9', '9x16']) {
      for (const [a, b] of overlayRanges(cut, aspect, copy)) expect(a >= 0 && b < CUTS[cut]).toBe(true);
    }
  }
  const t = timeline('30', '16x9', copy);
  expect(t.find((e) => e.id === 'L3').words.map((w) => w.in)).toEqual([240, 270, 300]);
  expect(t.find((e) => e.id === 'L6').out.at).toBe(1410);
  expect(t.find((e) => e.kind === 'endcard').logo).toBe(1560);
  expect(timeline('15', '9x16', copy).find((e) => e.kind === 'endcard').logo).toBe(720);
  // frame 0 is the landed CLANK! (no flash on it), and the match cut lands on f186
  expect(post('30').flash.some((f) => f.f === 0)).toBe(false);
  expect(t.find((e) => e.id === 'CLK').words[0].in).toBeLessThan(-11);
  expect(t.find((e) => e.id === 'L2').in).toBe(192);
  expect(t.find((e) => e.id === 'L2').out.at - t.find((e) => e.id === 'L2').in).toBeGreaterThanOrEqual(40);
  // the end fades to black, the last frame black (never a 1-frame snap)
  expect(t.find((e) => e.kind === 'endcard').fade).toEqual([1764, 1787]);
  // no black frame between the hang and the core (S25 opens on the core, whole); L4 holds through S12 (f486-593)
  expect(t.find((e) => e.kind === 'black')).toBeUndefined();
  expect(t.find((e) => e.id === 'L4').out.at).toBe(590);
  // 9:16 type stays inside x 80-940 (the right-side rail)
  expect(timeline('30', '9x16', copy).every((e) => !('x' in e) || e.x === 510)).toBe(true);
  // 15 s: the URL is up for at least 2 s before the fade
  const e15 = timeline('15', '16x9', copy).find((e) => e.kind === 'endcard');
  expect(e15.fade[0] - e15.url[0]).toBeGreaterThanOrEqual(120);
});
});
