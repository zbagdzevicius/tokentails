import { describe, expect, it } from 'vitest';
import { TRACKS } from '../core/track/tracks';
import { buildTrack } from '../core/track/build';
import { decodeTrackCode, encodeTrack } from './codec/track-code';
import { remixOf } from './actions';

describe('remix of an authored track (ugc)', () => {
  it('keeps only what a track code carries, so the editor shows the track that is raced and shared', () => {
    for (const t of TRACKS) {
      const remix = remixOf(t);
      for (const k of ['kind', 'branches', 'hazards', 'coins', 'lineCoins', 'flyover', 'music'] as const) expect(remix[k], `${t.id} ${k}`).toBeUndefined();
      const rt = decodeTrackCode(encodeTrack(remix));
      expect(rt.ok, t.id).toBe(true);
      if (!rt.ok) continue;
      const a = buildTrack(remix);
      const b = buildTrack(rt.track);
      expect(a.branches.length, t.id).toBe(b.branches.length);
      expect(a.length, t.id).toBeCloseTo(b.length, 6);
      // the codec writes a zero drop as no drop
      const norm = (d: typeof remix) => (d.setPieces ?? []).map((p) => (p.drop ? p : (({ drop: _d, ...r }) => r)(p)));
      expect(norm(rt.track), t.id).toEqual(norm(remix));
      expect(rt.track.features, t.id).toEqual(remix.features);
    }
  });
});
