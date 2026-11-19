// Trailer 60 timeline: the edit covers 60.000 s exactly with no gap or overlap, every cut sits on the 120 BPM
// half-beat grid (the 4-way curtain call and the stinger freeze excepted), gameplay is at least 55 % of the runtime,
// and every overlay word is in COPY.
import { describe, expect, it } from 'vitest';
import { BEAT, COPY, EDL, FPS, N } from './timeline.mjs';

describe('trailer60 timeline', () => {
  it('is exactly 60 s, contiguous', () => {
    expect(N / FPS).toBe(60);
    let f = 0;
    for (const s of EDL) {
      expect(s.f).toBe(f);
      expect(s.len).toBeGreaterThan(0);
      f += s.len;
    }
    expect(f).toBe(N);
  });
  it('cuts on the half-beat grid', () => {
    const off = EDL.filter((s) => s.f % (BEAT / 2) !== 0 && !String(s.gp?.take ?? '').startsWith('cc-'));
    expect(off.map((s) => s.f)).toEqual([]);
  });
  it('keeps gameplay at least 55 % of the runtime', () => {
    const gp = EDL.filter((s) => s.gp).reduce((a, s) => a + s.len, 0);
    expect(gp / N).toBeGreaterThanOrEqual(0.55);
  });
  it('sets only the copy list', () => {
    const words = [];
    for (const s of EDL) {
      if (s.text) words.push(s.text);
      for (const it of s.ov?.items ?? []) if (it.text) words.push(it.text);
      if (s.ov?.mg === 'credit') words.push(s.ov.name);
      if (s.ov?.mg === 'coat') words.push(s.ov.name);
    }
    for (const w of words) expect(COPY).toContain(w);
  });
});
