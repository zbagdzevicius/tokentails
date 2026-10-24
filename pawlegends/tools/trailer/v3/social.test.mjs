// Trailer v3 social encodes (G24): the bitrate plan lands every cut inside 8-12 MB.
import { describe, expect, it } from 'vitest';
import { KBPS_MIN, MB, MUX_OVERHEAD, SIZE_BAND, SSIM_FLOOR, bytesFor, inBand, retryBitrate, socialBitrate, socialName, ssimFails } from './social.mjs';

const bytesAt = (kbps, audio, s) => ((kbps + audio) * 1000 * s) / 8 * (1 + MUX_OVERHEAD);

describe('trailer v3 social encodes', () => {
  it('the 15 s cut lands on the 10.5 MB target; the 30 s cut keeps the bitrate floor, both inside the band', () => {
    const k15 = socialBitrate(15);
    expect(Math.abs(bytesAt(k15, 160, 15) - 10.5 * MB)).toBeLessThan(0.01 * MB);
    const k30 = socialBitrate(30);
    // v3.6: 10.5 MB over 30 s was 2.6 Mbit/s (macroblocks in the core fight): the floor holds it at KBPS_MIN or more
    expect(k30).toBe(KBPS_MIN);
    expect(KBPS_MIN).toBeGreaterThanOrEqual(4500);
    for (const [k, s] of [[k15, 15], [k30, 30]]) expect(inBand(bytesAt(k, 160, s))).toBe(true);
    expect(bytesFor(30, k30)).toBeCloseTo(bytesAt(k30, 160, 30), 0);
  });
  it('the hard segment SSIM floor fails a soft copy', () => {
    expect(SSIM_FLOOR).toBeGreaterThanOrEqual(0.99);
    expect(ssimFails(0.983)).toHaveLength(1);
    expect(ssimFails(0.995)).toEqual([]);
    expect(ssimFails(null)).toEqual([]);
  });
  it('a miss is scaled back toward the target', () => {
    expect(retryBitrate(2400, 13 * MB)).toBeLessThan(2400);
    expect(retryBitrate(2400, 7 * MB)).toBeGreaterThan(2400);
  });
  it('band edges, names and a too-small target', () => {
    expect(SIZE_BAND).toEqual([8 * MB, 20 * MB]);
    expect(inBand(7.99 * MB)).toBe(false);
    expect(inBand(20.01 * MB)).toBe(false);
    expect(socialName('/x/pawlegends-trailer-30s-1080p.mp4')).toBe('/x/pawlegends-trailer-30s-1080p-social.mp4');
    expect(() => socialBitrate(30, { targetBytes: 1 * MB })).toThrow();
  });
});
