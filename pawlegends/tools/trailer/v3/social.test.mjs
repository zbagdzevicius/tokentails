// Trailer v3 social encodes (G24): the bitrate plan lands every cut inside 8-12 MB.
import { describe, expect, it } from 'vitest';
import { MB, MUX_OVERHEAD, SIZE_BAND, inBand, retryBitrate, socialBitrate, socialName } from './social.mjs';

const bytesAt = (kbps, audio, s) => ((kbps + audio) * 1000 * s) / 8 * (1 + MUX_OVERHEAD);

describe('trailer v3 social encodes', () => {
  it('the planned bitrate lands each cut on the 10.5 MB target, inside the band', () => {
    for (const s of [30, 15]) {
      const kbps = socialBitrate(s);
      const bytes = bytesAt(kbps, 160, s);
      expect(Math.abs(bytes - 10.5 * MB)).toBeLessThan(0.01 * MB);
      expect(inBand(bytes)).toBe(true);
    }
    expect(socialBitrate(15)).toBeGreaterThan(socialBitrate(30) * 1.9);
  });
  it('a miss is scaled back toward the target', () => {
    expect(retryBitrate(2400, 13 * MB)).toBeLessThan(2400);
    expect(retryBitrate(2400, 7 * MB)).toBeGreaterThan(2400);
  });
  it('band edges, names and a too-small target', () => {
    expect(SIZE_BAND).toEqual([8 * MB, 12 * MB]);
    expect(inBand(7.99 * MB)).toBe(false);
    expect(inBand(12.01 * MB)).toBe(false);
    expect(socialName('/x/pawlegends-trailer-30s-1080p.mp4')).toBe('/x/pawlegends-trailer-30s-1080p-social.mp4');
    expect(() => socialBitrate(30, { targetBytes: 1 * MB })).toThrow();
  });
});
