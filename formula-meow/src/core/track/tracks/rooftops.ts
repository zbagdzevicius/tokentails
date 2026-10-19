/**
 * Kaunas Neon Rooftops (GDD 6.1, track 2): night synthwave over tin roofs. Climbs between roof levels, two chimney
 * jumps, a billboard corner cut (off-road, boost only), the Pink Paw garage on the bottom straight.
 */
import type { TrackDef } from '../../../types';

export const ROOFTOPS: TrackDef = {
  v: 1,
  id: 'rooftops',
  name: 'Neon Rooftops',
  theme: 1,
  timeOfDay: 2,
  laps: 3,
  points: [
    { x: -100, z: -40, h: 1, w: 2 },
    { x: -100, z: 8, h: 1, w: 2 },
    { x: -92, z: 48, h: 2, w: 2 },
    { x: -64, z: 72, h: 2, w: 2 },
    { x: -32, z: 64, h: 3, w: 1 },
    { x: -20, z: 36, h: 3, w: 1 },
    { x: 0, z: 24, h: 3, w: 1 },
    { x: 16, z: 36, h: 3, w: 1 },
    { x: 24, z: 60, h: 4, w: 2 },
    { x: 48, z: 80, h: 4, w: 2 },
    { x: 84, z: 72, h: 3, w: 2 },
    { x: 100, z: 40, h: 3, w: 2 },
    // iteration 2 (B13): the (88, 8) chicane and the kink at (12,-52) → (-4,-44) → (-24,-56) trapped 50cc karts
    // against the wall (51 head-on hits in 12 races); both are now wide single-radius bends (~20–23 m), width 3
    { x: 96, z: 8, h: 2, w: 2 },
    { x: 100, z: -24, h: 2, w: 2 },
    { x: 96, z: -64, h: 1, w: 2 },
    { x: 68, z: -88, h: 1, w: 3 },
    { x: 32, z: -84, h: 1, w: 3 },
    { x: 12, z: -64, h: 2, w: 3 },
    { x: -8, z: -56, h: 2, w: 3 },
    { x: -28, z: -64, h: 2, w: 3 },
    { x: -44, z: -92, h: 1, w: 2 },
    { x: -80, z: -96, h: 1, w: 2 },
  ],
  features: [
    { s: 6, kind: 'start' },
    { s: 28, kind: 'items' },
    { s: 60, kind: 'ramp', side: 0 },
    { s: 92, kind: 'pad', side: 0 },
    { s: 120, kind: 'items' },
    { s: 162, kind: 'items' },
    { s: 176, kind: 'ramp', side: 0 },
    { s: 215, kind: 'offroad', side: -1 },
    { s: 248, kind: 'pad', side: 0 },
  ],
};
