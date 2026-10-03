import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSprigGreen, nightLiftSprig, SPRIG_NIGHT_MINT } from '../../render/catnipNight';

// The sprig palette is the client master's (client/art/catnip/palette.json).
const palette = JSON.parse(readFileSync(resolve(__dirname, '../../../../client/art/catnip/palette.json'), 'utf8')).colors as Record<string, string>;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luma = ([r, g, b]: number[]) => 0.299 * r + 0.587 * g + 0.114 * b;

describe('catnip sprig night lift (review 3e #4)', () => {
  it('treats leaves, stem and outline as green and the lavender spike as not', () => {
    for (const k of ['o', 'd', 'v', 'm', 'l', 'S', 's']) expect(isSprigGreen(...(rgb(palette[k]) as [number, number, number])), k).toBe(true);
    for (const k of ['p', 'L', 'w']) expect(isSprigGreen(...(rgb(palette[k]) as [number, number, number])), k).toBe(false);
  });

  it('lightens every green toward mint, keeps the spike, alpha and the source', () => {
    const keys = Object.keys(palette);
    const data = new Uint8ClampedArray((keys.length + 1) * 4);
    keys.forEach((k, i) => data.set([...rgb(palette[k]), 255], i * 4));
    data.set([10, 200, 10, 0], keys.length * 4); // transparent: untouched
    const before = data.slice();
    const out = nightLiftSprig({ width: keys.length + 1, height: 1, data });
    expect(Array.from(data)).toEqual(Array.from(before));
    keys.forEach((k, i) => {
      const a = Array.from(before.slice(i * 4, i * 4 + 3));
      const b = Array.from(out.data.slice(i * 4, i * 4 + 4));
      expect(b[3]).toBe(255);
      if (['p', 'L', 'w'].includes(k)) expect(b.slice(0, 3), k).toEqual(a);
      else {
        expect(luma(b) >= luma(a) || luma(a) > luma([...SPRIG_NIGHT_MINT]), k).toBe(true);
        // Still green after the lift, so the shape reads as leaves.
        expect(isSprigGreen(b[0], b[1], b[2]), k).toBe(true);
      }
    });
    expect(Array.from(out.data.slice(keys.length * 4))).toEqual([10, 200, 10, 0]);
  });
});
