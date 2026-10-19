/**
 * Stub tracks (iteration 2 Stabilise): simple valid loops for the four new circuits and the battle arena, so the
 * modes lane can build cups and menus from day one. The tracks lane replaces each one with the real track (GDD 6.1;
 * ITERATION-2.md, lane "tracks"). They are not in the race rotation (`TRACKS`) until they are real.
 */
import type { TrackDef, TrackPoint } from '../../../types';

const P = (pts: Array<[number, number, number?, (0 | 1 | 2 | 3)?]>): TrackPoint[] => pts.map(([x, z, h = 0, w = 2]) => ({ x, z, h, w }));

/** Laundry Spin (theme 2): a rounded rectangle round the machines. */
export const LAUNDRY: TrackDef = {
  v: 1,
  id: 'laundry',
  name: 'Laundry Spin',
  theme: 2,
  timeOfDay: 0,
  laps: 3,
  points: P([
    [-100, -60],
    [-100, 0],
    [-100, 60],
    [-76, 84],
    [-24, 88, 1],
    [24, 88, 1],
    [76, 84],
    [100, 60],
    [100, 0],
    [100, -60],
    [76, -84],
    [24, -88],
    [-24, -88],
    [-76, -84],
  ]),
  features: [
    { s: 10, kind: 'start' },
    { s: 50, kind: 'items' },
    { s: 120, kind: 'pad', side: 0 },
    { s: 180, kind: 'items' },
    { s: 230, kind: 'ramp', side: 0 },
  ],
};

/** Yarn Canyon (theme 3): a long oval with a kink through the mesas. */
export const YARN: TrackDef = {
  v: 1,
  id: 'yarn',
  name: 'Yarn Canyon',
  theme: 3,
  timeOfDay: 1,
  laps: 3,
  points: P([
    [-108, -40],
    [-108, 20],
    [-88, 64],
    [-44, 84, 1],
    [0, 76, 2],
    [44, 84, 1],
    [88, 64],
    [108, 20],
    [108, -40],
    [88, -80],
    [44, -96],
    [0, -88],
    [-44, -96],
    [-88, -80],
  ]),
  features: [
    { s: 8, kind: 'start' },
    { s: 40, kind: 'items' },
    { s: 100, kind: 'ramp', side: 0 },
    { s: 160, kind: 'items' },
    { s: 210, kind: 'pad', side: 0 },
  ],
};

/** Cat Café Chaos (theme 4): a night loop round the tables. */
export const CAFE: TrackDef = {
  v: 1,
  id: 'cafe',
  name: 'Cat Café Chaos',
  theme: 4,
  timeOfDay: 2,
  laps: 3,
  points: P([
    [-96, -72],
    [-104, -8],
    [-88, 52],
    [-40, 84],
    [16, 76],
    [56, 92],
    [96, 72],
    [108, 20],
    [88, -28],
    [100, -76],
    [56, -100],
    [0, -84],
    [-48, -100],
  ]),
  features: [
    { s: 12, kind: 'start' },
    { s: 44, kind: 'items' },
    { s: 110, kind: 'lowgrip' },
    { s: 170, kind: 'items' },
    { s: 220, kind: 'pad', side: 0 },
  ],
};

/** Pink Paw Shelter Sprint (theme 5): a cosy generic shelter loop (no numbers or claims on it). */
export const SHELTER: TrackDef = {
  v: 1,
  id: 'shelter',
  name: 'Pink Paw Shelter Sprint',
  theme: 5,
  timeOfDay: 0,
  laps: 3,
  points: P([
    [-92, -84],
    [-108, -24],
    [-100, 40],
    [-60, 88],
    [0, 96, 1],
    [60, 88],
    [100, 40],
    [108, -24],
    [92, -84],
    [40, -104],
    [-40, -104],
  ]),
  features: [
    { s: 6, kind: 'start' },
    { s: 40, kind: 'items' },
    { s: 96, kind: 'ramp', side: 0 },
    { s: 150, kind: 'items' },
    { s: 200, kind: 'lowgrip' },
  ],
};

/** Living Room Rug (theme 6, `kind: 'arena'`): a wide ring for balloon battle until the real arena lands. */
export const RUG: TrackDef = {
  v: 1,
  id: 'rug',
  name: 'Living Room Rug',
  theme: 6,
  timeOfDay: 0,
  laps: 3,
  kind: 'arena',
  points: P(
    [
      [0, -52],
      [36, -36],
      [52, 0],
      [36, 36],
      [0, 52],
      [-36, 36],
      [-52, 0],
      [-36, -36],
    ].map(([x, z]) => [x, z, 0, 3] as [number, number, number, 3]),
  ),
  features: [
    { s: 0, kind: 'start' },
    { s: 32, kind: 'items' },
    { s: 96, kind: 'items' },
    { s: 160, kind: 'items' },
    { s: 224, kind: 'items' },
  ],
};

export const STUB_TRACKS: readonly TrackDef[] = [LAUNDRY, YARN, CAFE, SHELTER];
export const ARENAS: readonly TrackDef[] = [RUG];
