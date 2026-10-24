// Trailer v3 social encodes (G24): the bitrate plan lands every cut at or under 12 MB.
import { describe, expect, it } from 'vitest';
import { MB, MUX_OVERHEAD, PROFILE, SIZE_BAND, SSIM_FLOOR, TARGET_MB, X264_PARAMS, bytesFor, expectedFrames, inBand, profileFor, retryBitrate, socialBitrate, socialName, ssimFails } from './social.mjs';

const bytesAt = (kbps, audio, s) => ((kbps + audio) * 1000 * s) / 8 * (1 + MUX_OVERHEAD);

describe('trailer v3 social encodes', () => {
  it('both cut lengths land on the target, inside the 12 MB band', () => {
    for (const s of [15, 30]) {
      const { audioKbps } = profileFor(s);
      const k = socialBitrate(s, { audioKbps });
      expect(Math.abs(bytesAt(k, audioKbps, s) - TARGET_MB * MB)).toBeLessThan(0.01 * MB);
      expect(inBand(bytesAt(k, audioKbps, s))).toBe(true);
      expect(bytesFor(s, k, audioKbps)).toBeCloseTo(bytesAt(k, audioKbps, s), 0);
    }
    expect(TARGET_MB * MB).toBeLessThanOrEqual(SIZE_BAND[1]);
  });
  it('v3.10: the 30 s copies run at 30 fps (every second frame), the 15 s copies keep 60 fps', () => {
    expect(profileFor(30.016)).toBe(PROFILE[30]);
    expect(PROFILE[30].fps).toBe(30);
    expect(profileFor(15.018).fps).toBe(60);
    expect(expectedFrames(1800, 30)).toBe(900);
    expect(expectedFrames(900, 60)).toBe(900);
    for (const p of Object.values(PROFILE)) expect(p.audioKbps).toBeGreaterThanOrEqual(128);
    expect(X264_PARAMS).toMatch(/aq-mode=3/);
    expect(X264_PARAMS).toMatch(/psy-rd=/);
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
    expect(SIZE_BAND).toEqual([8 * MB, 12 * MB]);
    expect(inBand(7.99 * MB)).toBe(false);
    expect(inBand(12.01 * MB)).toBe(false);
    expect(socialName('/x/pawlegends-trailer-30s-1080p.mp4')).toBe('/x/pawlegends-trailer-30s-1080p-social.mp4');
    expect(() => socialBitrate(30, { targetBytes: 1 * MB })).toThrow();
  });
});
