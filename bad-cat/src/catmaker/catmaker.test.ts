import { describe, expect, it } from 'vitest';
import { rgb565, rgb888 } from '../types';
import { FUR_CHIPS, chipIndexOf565, chipToSpec, deriveSecondary, nearestChip } from './body-colour';
import {
  MIN_CROP_PX,
  OVAL_RX,
  OVAL_RY,
  clampCrop,
  dragCrop,
  featherAlpha,
  initialCrop,
  pinchCrop,
  ringMedianColour,
  type Crop,
} from './face-decal';
import { cropToOpener, fitSize, isHeic, isVideo } from './photo-input';
import { openerSourceRect } from '../share/clip/compose';
import { FACE_RECT, CLIP_W, CLIP_H } from '../types';
import { createPhotoStore } from './photo-store';
import { localNameFilter } from './CatMaker';

function fill(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = f(x, y);
      const i = (y * w + x) * 4;
      p[i] = r;
      p[i + 1] = g;
      p[i + 2] = b;
      p[i + 3] = a;
    }
  return p;
}

describe('ringMedianColour', () => {
  it('returns the ring colour, ignoring the face in the middle and the corners', () => {
    const n = 64;
    const px = fill(n, n, (x, y) => {
      const nx = (x + 0.5 - n / 2) / (n * OVAL_RX);
      const ny = (y + 0.5 - n / 2) / (n * OVAL_RY);
      const d = Math.hypot(nx, ny);
      if (d > 1) return [0, 0, 255, 255]; // background (blue)
      if (d >= 0.72) return [217, 130, 59, 255]; // ginger fur ring
      return [255, 255, 255, 255]; // white face
    });
    expect(ringMedianColour(px, n, n)).toBe(0xd9823b);
  });
  it('is robust to a minority of outliers in the ring', () => {
    const n = 32;
    let k = 0;
    const px = fill(n, n, () => (k++ % 5 === 0 ? [255, 0, 0, 255] : [100, 100, 100, 255]));
    expect(ringMedianColour(px, n, n)).toBe(0x646464);
  });
  it('ignores transparent pixels and falls back to grey when nothing is opaque', () => {
    expect(ringMedianColour(fill(8, 8, () => [10, 20, 30, 0]), 8, 8)).toBe(0x808080);
  });
  it('falls back to all opaque pixels if the ring is empty', () => {
    const px = fill(2, 2, () => [50, 60, 70, 255]);
    expect(ringMedianColour(px, 2, 2)).toBe(0x323c46);
  });
});

describe('crop maths', () => {
  const inside = (c: Crop, w: number, h: number): void => {
    expect(c.w).toBe(c.h);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(w + 1e-9);
    expect(c.y + c.h).toBeLessThanOrEqual(h + 1e-9);
    // the inscribed oval's extremes are inside the photo
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    expect(cx - c.w * OVAL_RX).toBeGreaterThanOrEqual(0);
    expect(cx + c.w * OVAL_RX).toBeLessThanOrEqual(w);
    expect(cy - c.h * OVAL_RY).toBeGreaterThanOrEqual(0);
    expect(cy + c.h * OVAL_RY).toBeLessThanOrEqual(h);
  };

  it('pre-places a centred square crop', () => {
    const c = initialCrop(1200, 1600);
    inside(c, 1200, 1600);
    expect(c.x + c.w / 2).toBeCloseTo(600);
    expect(c.y + c.h / 2).toBeCloseTo(800);
  });
  it('drag clamps to the photo edges', () => {
    let c = initialCrop(800, 600);
    c = dragCrop(c, -5000, -5000, 800, 600);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    c = dragCrop(c, 99999, 99999, 800, 600);
    expect(c.x + c.w).toBe(800);
    expect(c.y + c.h).toBe(600);
    inside(c, 800, 600);
  });
  it('pinch grows to the short side at most and shrinks to MIN_CROP_PX at least', () => {
    let c = initialCrop(800, 600);
    c = pinchCrop(c, 100, 800, 600);
    expect(c.w).toBe(600);
    inside(c, 800, 600);
    c = pinchCrop(c, 0.0001, 800, 600);
    expect(c.w).toBe(MIN_CROP_PX);
    inside(c, 800, 600);
  });
  it('pinch keeps the centre when there is room', () => {
    const c0 = initialCrop(1000, 1000);
    const c = pinchCrop(c0, 0.5, 1000, 1000);
    expect(c.x + c.w / 2).toBeCloseTo(c0.x + c0.w / 2);
    expect(c.y + c.h / 2).toBeCloseTo(c0.y + c0.h / 2);
  });
  it('pinch near an edge pushes the crop back inside', () => {
    let c = dragCrop(initialCrop(1000, 800), 9999, 0, 1000, 800);
    c = pinchCrop(c, 1.4, 1000, 800);
    inside(c, 1000, 800);
  });
  it('random drag/pinch sequences always stay inside', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const w = 640;
    const h = 1136;
    let c = initialCrop(w, h);
    for (let i = 0; i < 500; i++) {
      c = rnd() < 0.5 ? dragCrop(c, (rnd() - 0.5) * 800, (rnd() - 0.5) * 800, w, h) : pinchCrop(c, 0.3 + rnd() * 2, w, h);
      inside(c, w, h);
    }
  });
  it('clamp handles tiny photos and garbage input', () => {
    const c = clampCrop({ x: NaN, y: Infinity, w: NaN, h: 5 }, 20, 30);
    expect(c.w).toBe(20);
    inside(c, 20, 30);
  });
});

describe('featherAlpha', () => {
  it('is opaque in the middle, transparent in the corners, and monotone across the feather', () => {
    expect(featherAlpha(128, 128, 256)).toBe(255);
    expect(featherAlpha(0, 0, 256)).toBe(0);
    let prev = 255;
    for (let x = 128; x < 256; x++) {
      const a = featherAlpha(x, 128, 256);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
    expect(prev).toBe(0);
  });
});

describe('colour chips (RGB → RGB565)', () => {
  it('maps a chip to its RGB565 value and back', () => {
    for (const c of FUR_CHIPS) {
      const v = chipToSpec(c);
      expect(v).toBe(rgb565(c.rgb));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffff);
      expect(chipIndexOf565(v)).toBe(FUR_CHIPS.indexOf(c));
      // round trip stays within the 565 quantisation step
      const back = rgb888(v);
      expect(Math.abs(((back >> 16) & 0xff) - ((c.rgb >> 16) & 0xff))).toBeLessThanOrEqual(7);
    }
  });
  it('nearest chip of a photo colour', () => {
    const idx = (id: string): number => FUR_CHIPS.findIndex((c) => c.id === id);
    expect(nearestChip(0xe0883f)).toBe(idx('ginger'));
    expect(nearestChip(0x101010)).toBe(idx('black'));
    expect(nearestChip(0xfafafa)).toBe(idx('white'));
    expect(nearestChip(0x9c9ca4)).toBe(idx('grey'));
  });
  it('custom colours are not a chip', () => {
    expect(chipIndexOf565(rgb565(0x12ab34))).toBe(-1);
  });
  it('derived stripes are darker, or lighter on a black cat', () => {
    const lum = (c: number): number => {
      const r = rgb888(c);
      return ((r >> 16) & 255) + ((r >> 8) & 255) + (r & 255);
    };
    const ginger = rgb565(0xd9823b);
    expect(lum(deriveSecondary(ginger))).toBeLessThan(lum(ginger));
    const black = rgb565(0x23201f);
    expect(lum(deriveSecondary(black))).toBeGreaterThan(lum(black));
  });
});

describe('photo input helpers', () => {
  it('detects HEIC and video files', () => {
    expect(isHeic({ type: 'image/heic', name: 'a' })).toBe(true);
    expect(isHeic({ type: '', name: 'IMG_1.HEIC' })).toBe(true);
    expect(isHeic({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
    expect(isVideo({ type: 'video/quicktime', name: 'x' })).toBe(true);
    expect(isVideo({ type: '', name: 'clip.MOV' })).toBe(true);
    expect(isVideo({ type: 'image/png', name: 'x.png' })).toBe(false);
  });
  it('fits large photos to the working size', () => {
    expect(fitSize(4032, 3024, 1600)).toEqual({ w: 1600, h: 1200, scale: 2.52 });
    expect(fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600, scale: 1 });
  });
});

describe('photo store', () => {
  const blob = (s: string): Blob => new Blob([s], { type: 'image/png' });
  it('falls back to memory when indexedDB is undefined', async () => {
    const st = createPhotoStore(undefined);
    expect(st.persistent).toBe(false);
    expect(await st.get(0)).toBeNull();
    await st.put(0, { face: { texture: blob('f'), crop: { x: 1, y: 2, w: 3, h: 3 } }, opener: { media: blob('o'), kind: 'photo' } });
    const r = await st.get(0);
    expect(r?.face?.crop).toEqual({ x: 1, y: 2, w: 3, h: 3 });
    expect(r?.opener?.kind).toBe('photo');
    await st.remove(0);
    expect(await st.get(0)).toBeNull();
  });
  it('falls back to memory when indexedDB.open throws', async () => {
    const st = createPhotoStore({
      open: () => {
        throw new Error('SecurityError');
      },
    });
    await st.put(1, { opener: { media: blob('o'), kind: 'photo' } });
    expect(st.persistent).toBe(false);
    expect((await st.get(1))?.opener?.kind).toBe('photo');
  });
  it('falls back to memory when the open request errors', async () => {
    const fakeReq: Record<string, unknown> = {};
    const st = createPhotoStore({
      open: () => {
        setTimeout(() => (fakeReq.onerror as () => void)?.(), 0);
        return fakeReq as unknown as IDBOpenDBRequest;
      },
    });
    expect(await st.get(2)).toBeNull();
    expect(st.persistent).toBe(false);
    await st.put(2, {});
    expect(await st.get(2)).toEqual({});
  });
  it('never hangs when the open request fires no event (WebKit): falls back to memory after the timeout', async () => {
    const st = createPhotoStore({ open: () => ({}) as unknown as IDBOpenDBRequest }, 30);
    const t0 = Date.now();
    expect(await st.get(3)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(st.persistent).toBe(false);
  });
});

describe('local name filter', () => {
  it('trims, strips control chars and caps at 12', () => {
    expect(localNameFilter('  Mochi\u0007 ')).toBe('Mochi');
    expect(localNameFilter('Sir Fluffington III')).toBe('Sir Fluffing');
    expect(localNameFilter('www.spam.com')).toBe('');
    expect(localNameFilter('see https://x')).toBe('');
  });
});

describe('face crop for the clip match cut (round 3)', () => {
  it('a 4032 x 3024 photo: the stored crop is in opener pixels and lands on FACE_RECT', () => {
    const work = fitSize(4032, 3024, 1600); // 1600 x 1200 working copy
    const opener = fitSize(work.w, work.h, 1280); // 1280 x 960 opener
    expect([opener.w, opener.h]).toEqual([1280, 960]);
    const workCrop = { x: 700, y: 400, w: 200, h: 200 }; // the face in the working canvas
    const crop = cropToOpener(workCrop, work.w, work.h);
    expect(crop).toEqual({ x: 560, y: 320, w: 160, h: 160 });
    // the composer maps the crop centre onto FACE_RECT's centre at a scale that makes the face FACE_RECT wide
    const r = openerSourceRect(opener.w, opener.h, 0, crop, { w: CLIP_W, h: CLIP_H });
    const scale = CLIP_W / r.w;
    const fx = (crop.x + crop.w / 2 - r.x) * scale;
    const fy = (crop.y + crop.h / 2 - r.y) * scale;
    expect(Math.abs(fx - (FACE_RECT.x + FACE_RECT.w / 2))).toBeLessThan(2);
    expect(Math.abs(fy - (FACE_RECT.y + FACE_RECT.h / 2))).toBeLessThan(2);
    expect(Math.abs(crop.w * scale - FACE_RECT.w)).toBeLessThan(2);
    // the old source-pixel crop (x 2.52 of the working copy) would not fit the opener: centre-crop fallback
    const legacy = { x: 1764, y: 756, w: 1008, h: 1008 };
    const lr = openerSourceRect(opener.w, opener.h, 0, legacy, { w: CLIP_W, h: CLIP_H });
    expect(lr).toEqual(openerSourceRect(opener.w, opener.h, 0, null, { w: CLIP_W, h: CLIP_H }));
  });
});
