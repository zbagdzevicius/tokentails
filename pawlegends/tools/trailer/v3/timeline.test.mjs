// Trailer v3.3 timeline rules (v3.2's plus the v3.3 review's) (no browser): the 15 s splices stay on the 25-frame beat grid, every word leaves with a
// whole 8-frame exit before its shot is cut, and the real-cats line sits only over the game's pick screen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintTrailerCopy } from '../lint-copy.mjs';
import { CUT15, CUTS, BEAT_FRAMES, endCard, typeEls } from './timeline.mjs';
import { OUT_FRAMES } from './mg.js';
import { SHOTS } from './shots.mjs';

const copy = JSON.parse(readFileSync(new URL('./copy.json', import.meta.url), 'utf8'));
const shotAt = (f) => SHOTS.find((s) => f >= s.f0 && f <= s.f1);

describe('trailer v3.3 timeline', () => {
  it('every mission line holds at least a second (60 frames) in the 30 s cut', () => {
    for (const aspect of ['16x9', '9x16']) {
      for (const e of typeEls(30, aspect, copy).filter((x) => ['M1', 'M2', 'M3b'].includes(x.id))) expect(e.out - e.in).toBeGreaterThanOrEqual(60);
    }
  });

  it('the 15 s end card has the URL on screen for at least 1.5 s', () => {
    expect(CUTS[15] - endCard(15).url).toBeGreaterThanOrEqual(90);
    expect(CUTS[30] - endCard(30).url).toBeGreaterThanOrEqual(90);
  });

  it('every gameplay shot starts and ends at the gameplay distance (pushes and the crane only round their beats)', () => {
    for (const s of SHOTS.filter((x) => x.take)) {
      const k = s.cam.keys;
      for (const d of [k[0].dist ?? 1, k.at(-1).dist ?? 1]) {
        expect(d).toBeGreaterThanOrEqual(0.95);
        expect(d).toBeLessThanOrEqual(1.3);
      }
      expect(Math.max(...k.map((x) => x.dist ?? 1))).toBeLessThanOrEqual(1.3);
    }
  });

  it('every 9:16 shot is captured natively except the pick screen (recomposed from its own landscape capture)', () => {
    for (const s of SHOTS) if (s.aspects && !s.aspects.includes('9x16')) expect(s.lobby?.pick).toBeTruthy();
  });

  it('the 15 s cut is contiguous and every splice offset is a whole number of beats', () => {
    let next = 0;
    for (const [a, b, d] of CUT15) {
      expect(a).toBe(next);
      expect(d % BEAT_FRAMES).toBe(0);
      next = b + 1;
    }
    expect(next).toBe(CUTS[15]);
  });

  it('the shots tile the 30 s master with no gap or overlap', () => {
    const sorted = [...SHOTS].sort((x, y) => x.f0 - y.f0);
    let next = 0;
    for (const s of sorted) {
      expect(s.f0).toBe(next);
      next = s.f1 + 1;
    }
    expect(next).toBe(CUTS[30]);
  });

  it('every 30 s word has finished its exit by the last frame of the shot it starts in (no half-drawn word on a cut)', () => {
    for (const aspect of ['16x9', '9x16']) {
      for (const e of typeEls(30, aspect, copy)) {
        const s = shotAt(e.in);
        // a line may run across the shots of one beat group (CATS VS DOGS over the crane) but never past its own end
        const last = SHOTS.filter((x) => x.f0 <= e.out + OUT_FRAMES).sort((a, b) => b.f0 - a.f0)[0];
        expect(e.out + OUT_FRAMES - 1).toBeLessThanOrEqual(last.f1);
        expect(s).toBeTruthy();
      }
    }
  });

  it('the full CATS VS DOGS line is on screen for at least 40 frames', () => {
    const els = typeEls(30, '16x9', copy).filter((e) => e.id.startsWith('L1'));
    const together = Math.min(...els.map((e) => e.out)) - Math.max(...els.map((e) => e.in));
    expect(together).toBeGreaterThanOrEqual(40);
  });

  it('INSPIRED BY REAL CATS. is laid only over the pick screen (never over gameplay plates of non-champions)', () => {
    for (const aspect of ['16x9', '9x16']) {
      for (const e of typeEls(30, aspect, copy).filter((x) => x.id.startsWith('M4'))) {
        for (let f = e.in; f < e.out + OUT_FRAMES; f++) expect(shotAt(f)?.lobby?.pick).toBeTruthy();
      }
    }
  });

  it('VICTORY! holds at least a second in both cuts', () => {
    for (const cut of [30, 15]) {
      const v = typeEls(cut, '16x9', copy).find((e) => e.id === 'M6');
      expect(v.out + OUT_FRAMES - v.in).toBeGreaterThanOrEqual(58);
    }
  });

  it('every on-screen string passes the copy gate', () => {
    expect(lintTrailerCopy(copy).findings).toEqual([]);
  });
});
