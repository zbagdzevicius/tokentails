import { describe, expect, it } from 'vitest';
import { cropRect, outputSize, VERTICAL_BIAS, watermarkBox } from './layout';

describe('cropRect', () => {
  it('16:9 of a 16:9 source is the whole frame', () => {
    expect(cropRect(1280, 720, '16:9')).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });
  it('9:16 of a landscape source is a centred full-height strip', () => {
    const c = cropRect(1280, 720, '9:16');
    expect(c.sh).toBe(720);
    expect(c.sw).toBe(405);
    expect(c.sx).toBe(Math.floor((1280 - 405) / 2));
    expect(c.sy).toBe(0);
  });
  it('9:16 of a tall phone source moves the picture up (the window sits lower, Mochi stays in)', () => {
    const c = cropRect(390, 844, '9:16');
    expect(c.sw).toBe(390);
    expect(c.sh).toBe(693);
    const centred = (844 - 693) / 2;
    expect(c.sy).toBe(Math.min(844 - 693, Math.round(centred + 844 * VERTICAL_BIAS)));
    expect(c.sy).toBeGreaterThan(centred);
    // Mochi sits at ~77% of a phone screen: inside the crop with room below
    const mochi = (0.77 * 844 - c.sy) / c.sh;
    expect(mochi).toBeGreaterThan(0.6);
    expect(mochi).toBeLessThan(0.8);
  });
  it('16:9 of a portrait source is centred', () => {
    const c = cropRect(390, 844, '16:9');
    expect(c.sw).toBe(390);
    expect(c.sh).toBe(219);
    expect(c.sy).toBe(Math.round((844 - 219) / 2));
  });
  it('always inside the source', () => {
    for (const [w, h] of [[1, 1], [3000, 10], [10, 3000], [2560, 1440], [1170, 2532]]) {
      for (const a of ['16:9', '9:16'] as const) {
        const c = cropRect(w, h, a);
        expect(c.sx).toBeGreaterThanOrEqual(0);
        expect(c.sy).toBeGreaterThanOrEqual(0);
        expect(c.sx + c.sw).toBeLessThanOrEqual(w);
        expect(c.sy + c.sh).toBeLessThanOrEqual(h);
        expect(c.sw).toBeGreaterThan(0);
        expect(c.sh).toBeGreaterThan(0);
      }
    }
  });
});

describe('outputSize', () => {
  it('scales the long edge to maxLong with even sides', () => {
    expect(outputSize({ sw: 2560, sh: 1440 }, 1280)).toEqual({ w: 1280, h: 720 });
    expect(outputSize({ sw: 405, sh: 720 }, 1280)).toEqual({ w: 720, h: 1280 });
    const p = outputSize({ sw: 390, sh: 693 }, 960);
    expect(p.h).toBe(960);
    expect(p.w % 2).toBe(0);
    expect(Math.abs(p.w / p.h - 390 / 693)).toBeLessThan(0.01);
  });
  it('upscales at most 2x', () => {
    expect(outputSize({ sw: 300, sh: 200 }, 1280)).toEqual({ w: 600, h: 400 });
  });
  it('never returns odd or zero sides', () => {
    for (const [sw, sh] of [[1, 1], [333, 777], [1001, 563]]) {
      const o = outputSize({ sw, sh }, 959);
      expect(o.w % 2).toBe(0);
      expect(o.h % 2).toBe(0);
      expect(o.w).toBeGreaterThan(0);
    }
  });
});

describe('watermarkBox', () => {
  it('text is about 3.2% of the height on landscape', () => {
    const b = watermarkBox(1280, 720);
    expect(b.font).toBe(23);
    expect(b.right).toBeLessThan(1280);
    expect(b.bottom).toBeLessThan(720);
  });
  it('narrow frames get a smaller font so the text fits', () => {
    const b = watermarkBox(720, 1280);
    expect(b.font).toBeLessThan(1280 * 0.032);
    expect(b.font * 0.6 * 24).toBeLessThan(720);
  });
});
