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
  music: 1,
  points: [
    { x: -100, z: -40, h: 1, w: 2 },
    { x: -100, z: 8, h: 1, w: 2 },
    { x: -92, z: 48, h: 2, w: 2 },
    { x: -96, z: 84, h: 2, w: 2 },
    { x: -68, z: 108, h: 3, w: 2 },
    { x: -36, z: 100, h: 3, w: 2 },
    { x: -28, z: 68, h: 3, w: 1 },
    { x: -20, z: 36, h: 3, w: 1 },
    { x: 0, z: 24, h: 3, w: 1 },
    { x: 16, z: 36, h: 3, w: 1 },
    { x: 24, z: 60, h: 4, w: 2 },
    { x: 48, z: 80, h: 4, w: 2 },
    { x: 84, z: 72, h: 3, w: 2 },
    { x: 100, z: 40, h: 3, w: 2 },
    { x: 92, z: 8, h: 2, w: 2 },
    { x: 60, z: -4, h: 2, w: 2 },
    { x: 52, z: -32, h: 2, w: 2 },
    { x: 76, z: -48, h: 2, w: 2 },
    { x: 104, z: -56, h: 1, w: 2 },
    { x: 112, z: -80, h: 1, w: 2 },
    { x: 96, z: -100, h: 1, w: 3 },
    { x: 64, z: -100, h: 1, w: 3 },
    { x: 32, z: -88, h: 1, w: 3 },
    { x: 12, z: -64, h: 2, w: 3 },
    { x: -8, z: -56, h: 2, w: 3 },
    { x: -28, z: -64, h: 2, w: 3 },
    { x: -44, z: -92, h: 1, w: 2 },
    { x: -80, z: -96, h: 1, w: 2 },
  ],
  features: [
    { s: 28, kind: 'start' },
    { s: 38, kind: 'items' },
    { s: 60, kind: 'ramp', side: 0 },
    { s: 92, kind: 'pad', side: 0 },
    { s: 120, kind: 'items' },
    { s: 176, kind: 'ramp', side: 0 },
    { s: 196, kind: 'items' },
    { s: 250, kind: 'pad', side: 0 },
  ],  branches: [
    // the billboard cut: a narrow alley behind the big neon billboard, shorter than the long way round the corner
    {
      from: 211,
      to: 4,
      points: [
        { x: -44, z: -54, h: 2, w: 0 },
        { x: -84, z: -56, h: 2, w: 0 },
      ],
      label: 'billboard cut',
    },
  ],
  hazards: [{ kind: 'steam', s: 156, side: 1, period: 6 }],
  coins: [
    { s: 40, d: -3, count: 4 },
    { s: 104, d: 3, count: 5 },
    { s: 162, d: -2, count: 4 },
    { s: 0.5 * 255, d: 0, count: 3, branch: 0 },
  ],
  flyover: [
    { x: 40, y: 70, z: 110, lx: 0, ly: 0, lz: 0, t: 0 },
    { x: 120, y: 40, z: -40, lx: 40, ly: 4, lz: -40, t: 1.2 },
    { x: -40, y: 30, z: -110, lx: -80, ly: 2, lz: -60, t: 2.4 },
    { x: -96, y: 10, z: -70, lx: -100, ly: 2, lz: -24, t: 3.5 },
  ],

};
