import { describe, expect, it } from 'vitest';
import { CLIP_SIZE, clipFileName, clipSeconds, clipShareText, cropRect, defaultFraming, momentTick, pickMime } from '../../src/share/clip';

// SHARE-PUSH.md §1: the highlight clip's pure rules.

describe('clip format', () => {
  it('prefers MP4 (plays everywhere, saves to Photos), falls back to WebM, none when nothing records', () => {
    expect(pickMime(() => true)).toEqual({ mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' });
    expect(pickMime((m) => m.startsWith('video/webm'))).toEqual({ mime: 'video/webm;codecs=vp9,opus', ext: 'webm' });
    expect(pickMime((m) => m === 'video/mp4')).toEqual({ mime: 'video/mp4', ext: 'mp4' });
    expect(pickMime(() => false)).toBeNull();
    expect(
      pickMime(() => {
        throw new Error('no');
      }),
    ).toBeNull();
  });
});

describe('framing', () => {
  it('vertical is 720x1280, wide 1280x720', () => {
    expect(CLIP_SIZE.vertical).toEqual([720, 1280]);
    expect(CLIP_SIZE.wide).toEqual([1280, 720]);
  });
  it('crops the centre of a landscape view for a vertical clip', () => {
    const r = cropRect(1920, 1080, 720, 1280);
    expect(r.h).toBe(1080);
    expect(r.w).toBe(608);
    expect(r.x).toBe(656);
    expect(r.y).toBe(0);
  });
  it('crops top and bottom of a tall view for a wide clip, and keeps a same-shape view whole', () => {
    expect(cropRect(1080, 1920, 1280, 720)).toEqual({ x: 0, y: 656, w: 1080, h: 608 });
    expect(cropRect(1280, 720, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(cropRect(0, 0, 720, 1280)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
  it('suggests vertical on a phone or a portrait screen', () => {
    expect(defaultFraming({ touch: true, w: 844, h: 390 })).toBe('vertical');
    expect(defaultFraming({ touch: false, w: 800, h: 1200 })).toBe('vertical');
    expect(defaultFraming({ touch: false, w: 1280, h: 720 })).toBe('wide');
  });
  it('lengths are 10, 15 or 20 s', () => {
    expect(clipSeconds(10)).toBe(10);
    expect(clipSeconds(20)).toBe(20);
    expect(clipSeconds(60)).toBe(15);
    expect(clipSeconds('10')).toBe(15);
  });
});

describe('Legend Moment window', () => {
  const total = 30 * 600;
  it('opens 4 s before the busiest takedown window', () => {
    // one lone takedown at 1:00, a triple at 5:00-5:08
    const t = momentTick({ total, scouted: total, takedowns: [1800, 9000, 9120, 9240] }, 15);
    expect(t).toBe(9000 - 120);
  });
  it('without takedowns: the last seconds of the match', () => {
    expect(momentTick({ total, scouted: total, takedowns: [] }, 15)).toBe(total - 1 - 450);
  });
  it('never starts where the clip would run past what can be played', () => {
    const t = momentTick({ total, scouted: total, takedowns: [total - 30] }, 15);
    expect(t + 450).toBeLessThanOrEqual(total - 1);
    expect(momentTick({ total: 300, scouted: 300, takedowns: [100] }, 15)).toBe(0);
  });
});

describe('clip names and text', () => {
  it('a dated file name and a share line with the moment', () => {
    expect(clipFileName('mp4', new Date(2026, 10, 14))).toBe('paw-legends-clip-20261114.mp4');
    expect(clipShareText('Shut down!', 'Clem')).toBe('Shut down! with Clem in Paw Legends!');
    expect(clipShareText(null, 'Clem')).toBe('My Legend Moment with Clem in Paw Legends!');
  });
});
