/**
 * Living Room Rug (theme 6, `kind: 'arena'`): the balloon-battle arena, a round rug about 80 m across in a sunny
 * living room. The track's ring is only the frame the query measures from; the whole floor out to the rug's edge is
 * drivable. Two ramps, eight item box clusters, and cover: the coffee table in the middle, the sofa, an armchair, a
 * cat tree and a plant pot (solid props, tracks/extras.ts `blocks`).
 */
import type { TrackDef } from '../../../types';

export const RUG: TrackDef = {
  v: 1,
  id: 'rug',
  name: 'Living Room Rug',
  theme: 6,
  timeOfDay: 0,
  laps: 3,
  kind: 'arena',
  music: 6,
  points: [
    { x: 0, z: -20, h: 0, w: 3 },
    { x: 16, z: -12, h: 0, w: 3 },
    { x: 20, z: 0, h: 0, w: 3 },
    { x: 16, z: 12, h: 0, w: 3 },
    { x: 0, z: 20, h: 0, w: 3 },
    { x: -16, z: 12, h: 0, w: 3 },
    { x: -20, z: 0, h: 0, w: 3 },
    { x: -16, z: -12, h: 0, w: 3 },
  ],
  features: [
    { s: 0, kind: 'start' },
    { s: 16, kind: 'items' },
    { s: 48, kind: 'items' },
    { s: 80, kind: 'items' },
    { s: 112, kind: 'items' },
    { s: 144, kind: 'items' },
    { s: 176, kind: 'items' },
    { s: 208, kind: 'items' },
    { s: 240, kind: 'items' },
    { s: 64, kind: 'ramp', side: 0 },
    { s: 192, kind: 'ramp', side: 0 },
  ],
  flyover: [
    { x: 0, y: 46, z: -60, lx: 0, ly: 0, lz: 0, t: 0 },
    { x: 56, y: 30, z: 0, lx: 0, ly: 0, lz: 0, t: 1.6 },
    { x: 0, y: 14, z: 44, lx: 0, ly: 0, lz: 0, t: 3.5 },
  ],
};
