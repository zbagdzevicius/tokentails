import { describe, expect, it } from 'vitest';
import { encodeGif, encodeGifWithin, gifPalette, lzwDecode, lzwEncode, quantize, scaleFrame, type GifFrame } from './gif';

function frame(w: number, h: number, f: (x: number, y: number) => [number, number, number]): GifFrame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { width: w, height: h, data };
}

/** Pull the LZW data of the first image out of a GIF (skipping extensions). */
function firstImage(gif: Uint8Array): { w: number; h: number; lzw: Uint8Array; minCode: number } {
  let p = 13 + 256 * 3;
  while (gif[p] === 0x21) {
    p += 2;
    while (gif[p] !== 0) p += gif[p] + 1;
    p++;
  }
  expect(gif[p]).toBe(0x2c);
  const w = gif[p + 5] | (gif[p + 6] << 8);
  const h = gif[p + 7] | (gif[p + 8] << 8);
  p += 10;
  const minCode = gif[p++];
  const parts: number[] = [];
  while (gif[p] !== 0) {
    const n = gif[p++];
    for (let i = 0; i < n; i++) parts.push(gif[p++]);
  }
  return { w, h, lzw: Uint8Array.from(parts), minCode };
}

describe('GIF89a encoder', () => {
  it('writes the header, logical screen, loop extension and trailer', () => {
    const g = encodeGif([frame(4, 3, () => [255, 0, 0]), frame(4, 3, () => [0, 0, 255])], { delayCs: 7 });
    expect(String.fromCharCode(...g.slice(0, 6))).toBe('GIF89a');
    expect(g[6] | (g[7] << 8)).toBe(4);
    expect(g[8] | (g[9] << 8)).toBe(3);
    expect(g[10]).toBe(0xf7);
    expect(String.fromCharCode(...g.slice(13 + 768 + 3, 13 + 768 + 14))).toBe('NETSCAPE2.0');
    expect(g[g.length - 1]).toBe(0x3b);
    // two Graphic Control Extensions with the 7 cs delay
    let gce = 0;
    for (let i = 0; i < g.length - 5; i++) if (g[i] === 0x21 && g[i + 1] === 0xf9 && g[i + 2] === 4 && g[i + 4] === 7) gce++;
    expect(gce).toBe(2);
  });

  it('LZW round trips a tiny image and a long noisy stream (code size growth + table reset)', () => {
    const tiny = Uint8Array.from([0, 0, 0, 1, 1, 2, 0, 0, 0, 1, 1, 2, 255]);
    expect(Array.from(lzwDecode(lzwEncode(tiny)))).toEqual(Array.from(tiny));
    let s = 7;
    const long = new Uint8Array(60000);
    for (let i = 0; i < long.length; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      long[i] = (s >>> 16) % 37;
    }
    expect(Array.from(lzwDecode(lzwEncode(long)))).toEqual(Array.from(long));
    expect(Array.from(lzwDecode(lzwEncode(new Uint8Array(0))))).toEqual([]);
  });

  it('the image data in the file decodes back to the quantized pixels', () => {
    const f = frame(5, 4, (x, y) => [x * 60, y * 80, 128]);
    const g = encodeGif([f]);
    const img = firstImage(g);
    expect([img.w, img.h, img.minCode]).toEqual([5, 4, 8]);
    expect(Array.from(lzwDecode(img.lzw, img.minCode))).toEqual(Array.from(quantize(f)));
  });

  it('palette has 256 entries, pure black and white', () => {
    const p = gifPalette();
    expect(p.length).toBe(768);
    expect([p[0], p[1], p[2]]).toEqual([0, 0, 0]);
    expect([p[251 * 3], p[251 * 3 + 1], p[251 * 3 + 2]]).toEqual([255, 255, 255]);
  });

  it('fits a byte budget by dropping frames and scaling', () => {
    let s = 1;
    const noisy = Array.from({ length: 6 }, () =>
      frame(120, 200, () => {
        s = (s * 1103515245 + 12345) >>> 0;
        return [(s >>> 8) & 255, (s >>> 16) & 255, (s >>> 24) & 255];
      }),
    );
    const full = encodeGif(noisy);
    const small = encodeGifWithin(noisy, Math.floor(full.length * 0.4));
    expect(small).not.toBeNull();
    expect(small!.length).toBeLessThanOrEqual(Math.floor(full.length * 0.4));
    expect(encodeGifWithin(noisy, 100)).toBeNull();
    expect(scaleFrame(noisy[0], 0.5).width).toBe(60);
  });
});
