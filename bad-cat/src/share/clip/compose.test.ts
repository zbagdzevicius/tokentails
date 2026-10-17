import { describe, expect, it } from 'vitest';
import { FACE_RECT } from '../../types';
import { openerSourceRect, pushRect } from './compose';
import { pickFrameIndices } from './video-opener';
import { CAPTION_STYLES, captionStyle, revealText } from './styles';

describe('openerSourceRect', () => {
  it('cover-fits a landscape photo and stays inside it', () => {
    const r = openerSourceRect(4000, 3000, 0);
    expect(r.h).toBeCloseTo(3000);
    expect(r.w).toBeCloseTo(3000 * (720 / 1280));
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(4000 + 1e-6);
  });

  it('push-in shrinks the source rect by 3 %', () => {
    const a = openerSourceRect(1080, 1920, 0);
    const b = openerSourceRect(1080, 1920, 1);
    expect(a.w / b.w).toBeCloseTo(1.03);
  });

  it('maps the face crop onto FACE_RECT for the match cut', () => {
    const crop = { x: 400, y: 600, w: 300, h: 300 };
    const r = openerSourceRect(1440, 2560, 0, crop);
    const scale = 720 / r.w;
    expect(crop.w * scale).toBeCloseTo(FACE_RECT.w);
    const faceCx = (crop.x + crop.w / 2 - r.x) * scale;
    const faceCy = (crop.y + crop.h / 2 - r.y) * scale;
    expect(faceCx).toBeCloseTo(FACE_RECT.x + FACE_RECT.w / 2);
    expect(faceCy).toBeCloseTo(FACE_RECT.y + FACE_RECT.h / 2);
  });
});

describe('video opener frames', () => {
  it('pushRect scales in 3 % around the face anchor and stays inside the frame', () => {
    const a = pushRect(540, 960, 0);
    expect(a).toEqual({ x: 0, y: 0, w: 540, h: 960 });
    const b = pushRect(540, 960, 1);
    expect(540 / b.w).toBeCloseTo(1.03);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h).toBeLessThanOrEqual(960 + 1e-9);
    // the face centre maps to the same output point
    const fx = ((FACE_RECT.x + FACE_RECT.w / 2) / 720) * 540;
    expect(((fx - b.x) / b.w) * 720).toBeCloseTo(FACE_RECT.x + FACE_RECT.w / 2);
  });

  it('maps decoded media times onto 60 output frames', () => {
    const times = Array.from({ length: 50 }, (_, i) => i / 24); // a 24 fps phone video
    const idx = pickFrameIndices(times, 60, 30);
    expect(idx).toHaveLength(60);
    expect(idx[0]).toBe(0);
    for (let k = 1; k < 60; k++) expect(idx[k]).toBeGreaterThanOrEqual(idx[k - 1]);
    expect(idx[59]).toBe(47);
    expect(pickFrameIndices([], 60)).toEqual([]);
    expect(pickFrameIndices([0], 3)).toEqual([0, 0, 0]);
  });
});

describe('caption styles', () => {
  it('has the default + 4 Club styles; unknown ids fall back to the default', () => {
    expect(CAPTION_STYLES.map((s) => s.name)).toEqual(['Default', 'Classic', 'Comic', 'Neon', 'Typewriter']);
    expect(CAPTION_STYLES.filter((s) => s.club)).toHaveLength(4);
    expect(captionStyle(9).id).toBe(0);
    expect(captionStyle(undefined).id).toBe(0);
  });

  it('Typewriter reveals 2 characters a frame; Comic is upper case', () => {
    const tw = captionStyle(4);
    expect(revealText('POV: hello', tw, 0)).toBe('PO');
    expect(revealText('POV: hello', tw, 2)).toBe('POV: h');
    expect(revealText('POV: hello', tw, 99)).toBe('POV: hello');
    expect(revealText('Mochi', captionStyle(2), 0)).toBe('MOCHI');
  });
});
