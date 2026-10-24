import { describe, expect, it } from 'vitest';
import { extFor, MIME_ORDER, pickMime } from './mime';

describe('pickMime', () => {
  it('prefers MP4 with H.264 + AAC', () => {
    expect(pickMime(() => true)).toEqual({ mime: 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', ext: 'mp4' });
  });
  it('walks the order and falls back to WebM', () => {
    const only = (t: string) => (s: string) => s === t;
    expect(pickMime(only('video/mp4'))).toEqual({ mime: 'video/mp4', ext: 'mp4' });
    expect(pickMime(only('video/webm;codecs=vp8,opus'))).toEqual({ mime: 'video/webm;codecs=vp8,opus', ext: 'webm' });
    expect(pickMime((s) => s.startsWith('video/webm'))?.mime).toBe('video/webm;codecs=vp9,opus');
  });
  it('asks in the documented order', () => {
    const asked: string[] = [];
    pickMime((t) => (asked.push(t), false));
    expect(asked).toEqual([...MIME_ORDER]);
    expect(asked[0].startsWith('video/mp4')).toBe(true);
  });
  it('returns null when nothing records, and survives a throwing probe', () => {
    expect(pickMime(() => false)).toBeNull();
    expect(
      pickMime(() => {
        throw new Error('nope');
      }),
    ).toBeNull();
  });
  it('maps extensions', () => {
    expect(extFor('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extFor('video/webm')).toBe('webm');
    expect(extFor('video/x-matroska')).toBe('webm');
  });
});
