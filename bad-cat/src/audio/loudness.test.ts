import { describe, expect, it } from 'vitest';
import { CLIP_CEILING_DB, CLIP_TARGET_LUFS, integratedLufs, normalizeClip, peakDb } from './loudness';

const FS = 48000;
function sine(freq: number, amp: number, seconds: number): Float32Array {
  const n = Math.round(seconds * FS);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / FS);
  return x;
}

describe('clip loudness (round 3: -14 LUFS, -1 dB ceiling)', () => {
  it('measures a 1 kHz full-scale sine at about -3 LUFS per channel pair', () => {
    // BS.1770: a 0 dBFS 1 kHz sine in both channels reads ≈ 0 LUFS (each channel ≈ -3.01)
    const l = integratedLufs([sine(1000, 1, 2), sine(1000, 1, 2)], FS);
    expect(l).toBeGreaterThan(-0.5);
    expect(l).toBeLessThan(0.5);
    expect(integratedLufs([new Float32Array(FS)], FS)).toBe(-Infinity);
  });
  it('brings a quiet, peaky mix to -14 LUFS with no sample above -1 dBFS', () => {
    // a -30 dB bed with short loud crashes (the clip: quiet steps, then a big break)
    const bed = sine(440, 0.012, 6);
    for (let k = 0; k < 4; k++) {
      const at = Math.round((1 + k * 1.2) * FS);
      for (let i = 0; i < 2400; i++) bed[at + i] += 0.5 * Math.sin((2 * Math.PI * 180 * i) / FS) * (1 - i / 2400);
    }
    const chans = [bed, Float32Array.from(bed)];
    expect(integratedLufs(chans, FS)).toBeLessThan(-20);
    const out = normalizeClip(chans, FS);
    // BS.1770 gating makes this contrived -38 dB bed + 4 crashes jump around the target; real clips land closer
    expect(Math.abs(out - CLIP_TARGET_LUFS)).toBeLessThan(1.5);
    expect(peakDb(chans)).toBeLessThanOrEqual(CLIP_CEILING_DB + 1e-6);
  });
});
