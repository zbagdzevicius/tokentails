// Trailer 30 timeline: the edit covers 30.000 s exactly, every cut sits on the 150 BPM beat grid (or the hook's
// ink frame), gameplay stays at least 60 % of the runtime, and the on-screen copy is the short list in COPY.
import { describe, expect, it } from 'vitest';
import { BEAT, CUTS, EDL, FPS, HIT, N, SILENCE } from './timeline.mjs';

describe('trailer30 timeline', () => {
  it('covers 1800 frames at 60 fps with no gap or overlap', () => {
    expect(N / FPS).toBe(30);
    let f = 0;
    for (const s of EDL) {
      expect(s.f).toBe(f);
      expect(s.len).toBeGreaterThan(0);
      f += s.len;
    }
    expect(f).toBe(N);
  });

  it('cuts on the half-beat grid (the 3-frame ink impact inside the hook is the one exception)', () => {
    for (const s of EDL) if (!(s.mg === 'impact' || s.f === 51)) expect(s.f % (BEAT / 2)).toBe(0);
    for (const f of Object.values(CUTS)) expect(f % (BEAT / 2)).toBe(0);
  });

  it('keeps gameplay dominant', () => {
    const gp = EDL.filter((s) => s.gp || s.mg === 'impact').reduce((a, s) => a + s.len, 0);
    expect(gp / N).toBeGreaterThanOrEqual(0.6);
  });

  it('opens each silence hole right before a big hit', () => {
    expect(SILENCE.map(([, b]) => b)).toEqual([HIT.towerCrack, CUTS.core]);
  });

  it('freezes inside the segment', () => {
    for (const s of EDL) if (s.gp?.freeze) expect(s.gp.freeze[0] + s.gp.freeze[1]).toBeLessThan(s.len);
  });
});
