// Trailer v3.4 timeline rules (v3.3's plus the v3.3 review's); v3.3 rules (v3.2's plus the v3.3 review's) (no browser): the 15 s splices stay on the 25-frame beat grid, every word leaves with a
// whole 8-frame exit before its shot is cut, and the real-cats line sits only over the game's pick screen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintTrailerCopy } from '../lint-copy.mjs';
import { CORE_HIT, CUT15, CUTS, BEAT_FRAMES, endCard, typeEls } from './timeline.mjs';
import { OUT_FRAMES } from './mg.js';
import { SHOTS } from './shots.mjs';

const copy = JSON.parse(readFileSync(new URL('./copy.json', import.meta.url), 'utf8'));
const shotAt = (f) => SHOTS.find((s) => f >= s.f0 && f <= s.f1);

describe('trailer v3.4 timeline', () => {
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
    // v3.4: the hook's crane ends on the whole Crossing (both bases under CATS VS DOGS) and the next shot is the
    // gameplay view again; its rise is tested below
    for (const s of SHOTS.filter((x) => x.take && x.id !== 'S01')) {
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

  it('the hook starts at the gameplay distance and cranes to the whole Crossing (2.5x to 4x) for CATS VS DOGS', () => {
    const k = SHOTS.find((x) => x.id === 'S01').cam.keys;
    expect(k[0].dist).toBe(1);
    const wide = Math.max(...k.map((x) => x.dist ?? 1));
    expect(wide).toBeGreaterThanOrEqual(2.5);
    expect(wide).toBeLessThanOrEqual(4);
    const l1 = typeEls(30, '16x9', copy).filter((e) => e.id.startsWith('L1'));
    const wideFrom = k.find((x) => x.dist === wide).f;
    for (const e of l1) expect(e.in).toBeGreaterThanOrEqual(wideFrom);
    // CATS on the cat side (left), DOGS on the dog side (right)
    expect(l1.find((e) => e.id === 'L1a').x).toBeLessThan(0.5);
    expect(l1.find((e) => e.id === 'L1c').x).toBeGreaterThan(0.5);
  });

  it('TEAM CAT OR TEAM DOG? slams after its cut and TEAM DOG? holds at least 50 frames in both cuts', () => {
    for (const cut of [30, 15]) {
      for (const aspect of ['16x9', '9x16']) {
        const els = typeEls(cut, aspect, copy);
        const dog = els.find((e) => e.id === 'M5c');
        expect(dog.out - dog.in).toBeGreaterThanOrEqual(50);
        const cat = els.find((e) => e.id === 'M5a');
        const segStart = cut === 15 ? CUT15.find(([a, b, d]) => a <= cat.in && b >= cat.in)[0] : SHOTS.find((x) => x.id === 'S17').f0;
        expect(cat.in).toBeGreaterThan(segStart);
      }
    }
  });

  it('every 9:16 word sits inside the platforms\' safe band (y 0.12-0.78) outside the end card', () => {
    for (const cut of [30, 15]) for (const e of typeEls(cut, '9x16', copy)) {
      expect(e.y).toBeGreaterThanOrEqual(0.12);
      expect(e.y).toBeLessThanOrEqual(0.78);
    }
  });

  it('VICTORY! lands with the core burst (CORE_HIT), not before it', () => {
    const v = typeEls(30, '16x9', copy).find((e) => e.id === 'M6');
    expect(v.in).toBeGreaterThan(CORE_HIT);
  });

  it('every rivalry and champion shot carries a name tag in its team colour', () => {
    const els = typeEls(30, '16x9', copy);
    for (const [id, style] of [['N3', 'cat'], ['N4', 'dog'], ['N6', 'dog'], ['N7', 'cat'], ['N8', 'cat'], ['N9', 'cat'], ['N10', 'cat']]) {
      const e = els.find((x) => x.id === id);
      expect(e.style).toBe(style);
      expect(e.out - e.in).toBeGreaterThanOrEqual(30);
    }
  });

  it('every on-screen string passes the copy gate', () => {
    expect(lintTrailerCopy(copy).findings).toEqual([]);
  });
});
