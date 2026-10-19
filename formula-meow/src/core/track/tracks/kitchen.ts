/**
 * Kitchen Counter GP (GDD 6.1, track 1, FTUE): a giant counter top in butter-yellow daylight. Start straight →
 * first item row → the wide tutorial hairpin → an S onto the cutting board → the board's ramp → the sink splash
 * (low grip) → back along the tiles. Gameplay is data only; the props live in dressing/kitchen.ts.
 */
import type { TrackDef } from '../../../types';

export const KITCHEN: TrackDef = {
  v: 1,
  id: 'kitchen',
  name: 'Kitchen Counter',
  theme: 0,
  timeOfDay: 0,
  laps: 3,
  points: [
    { x: -40, z: -88, h: 0, w: 2 },
    { x: -40, z: -40, h: 0, w: 2 },
    { x: -40, z: 8, h: 0, w: 2 },
    { x: -36, z: 44, h: 0, w: 3 },
    { x: -20, z: 68, h: 0, w: 3 },
    { x: 4, z: 76, h: 0, w: 3 },
    { x: 20, z: 52, h: 0, w: 2 },
    { x: 16, z: 20, h: 0, w: 2 },
    { x: 28, z: -8, h: 0, w: 2 },
    { x: 56, z: -16, h: 1, w: 2 },
    { x: 76, z: 4, h: 2, w: 1 },
    { x: 92, z: 24, h: 2, w: 1 },
    { x: 112, z: 20, h: 2, w: 1 },
    { x: 124, z: -4, h: 2, w: 1 },
    { x: 116, z: -28, h: 2, w: 2 },
    { x: 96, z: -60, h: 1, w: 2 },
    { x: 64, z: -76, h: 0, w: 2 },
    { x: 36, z: -104, h: 0, w: 2 },
    { x: 0, z: -124, h: 0, w: 2 },
    { x: -28, z: -112, h: 0, w: 2 },
  ],
  features: [
    { s: 14, kind: 'start' },
    { s: 40, kind: 'items' },
    { s: 135, kind: 'offroad', side: -1 },
    { s: 150, kind: 'items' },
    { s: 167, kind: 'pad', side: 0 },
    { s: 186, kind: 'ramp', side: 0 },
    { s: 210, kind: 'lowgrip' },
    { s: 232, kind: 'items' },
  ],
};
