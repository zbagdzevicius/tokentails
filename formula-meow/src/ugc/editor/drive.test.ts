import { describe, expect, it } from 'vitest';
import { raceConfig, world } from '../../test/fixtures';
import { playerBot } from '../../items-ai/balance/bots';
import { doodleToPoints, starterFeatures, type P2 } from './doodle';
import { validateTrack } from './validate';
import { decodeTrackCode, encodeTrack } from '../codec/track-code';

function stroke(rx: number, rz: number, lobes: number, wobble: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < 156; i++) {
    const a = (i / 160) * Math.PI * 2;
    const w = 1 + wobble * Math.sin(a * lobes);
    out.push({ x: Math.cos(a) * rx * w, z: Math.sin(a) * rz * w });
  }
  return out;
}

describe('a doodled track is raceable (validator = drivable)', () => {
  for (const [rx, rz, lobes, wob] of [
    [100, 70, 3, 0.15],
    [70, 110, 4, 0.1],
  ] as const) {
    it(`${rx}×${rz} doodle: the shared code races to the finish with the bot and the field`, () => {
      const d = doodleToPoints(stroke(rx, rz, lobes, wob));
      expect(d.ok).toBe(true);
      if (!d.ok) return;
      const def = { ...starterFeatures(d.points, 1), name: 'Bot Test' };
      expect(validateTrack(def).issues).toEqual([]);
      const back = decodeTrackCode(encodeTrack(def));
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      const w = world(raceConfig(back.track, { seed: 3, cls: 1, humans: [5] }));
      while (!w.done) w.step([playerBot(w.ctx, 5, 0.5)]);
      const r = w.result();
      expect(r.player.time).not.toBeNull();
      // a lap of a 300–1200 m track never takes the bot more than a minute
      expect(r.player.time!).toBeLessThan(back.track.laps * 60);
      expect(r.places.filter((p) => p.time != null).length).toBeGreaterThanOrEqual(6);
    });
  }
});
