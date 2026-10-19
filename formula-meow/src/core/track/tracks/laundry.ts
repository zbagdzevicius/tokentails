/**
 * Laundry Spin (GDD 6.1, track 3, theme 2): a pastel laundromat at closing time. The start straight runs past the
 * dryers → into the middle aisle and through the spinning drum (its ribs push you sideways) → round the sorting
 * baskets → up onto the folding table (the high road, two ramps over the folded towels, an S between the
 * baskets) → past the washing line (a swinging sheet) → round the sorting baskets (sock mounds) or down the soap slide
 * along the wall (low grip, a dryer-vent pad) → home.
 */
import type { TrackDef } from '../../../types';

export const LAUNDRY: TrackDef = {
  v: 1,
  id: 'laundry',
  name: 'Laundry Spin',
  theme: 2,
  timeOfDay: 0,
  laps: 3,
  music: 2,
  points: [
    { x: -100, z: -104, h: 0, w: 2 },
    { x: -48, z: -108, h: 0, w: 2 },
    { x: 4, z: -104, h: 0, w: 2 },
    { x: 44, z: -92, h: 0, w: 2 },
    { x: 60, z: -84, h: 0, w: 2 },
    { x: 64, z: -60, h: 0, w: 2 },
    { x: 52, z: -36, h: 0, w: 2 },
    { x: 56, z: -8, h: 0, w: 2 },
    { x: 80, z: 28, h: 0, w: 2 },
    { x: 108, z: 44, h: 0, w: 2 },
    { x: 116, z: 84, h: 0, w: 2 },
    { x: 96, z: 108, h: 1, w: 2 },
    { x: 60, z: 104, h: 2, w: 2 },
    { x: 28, z: 88, h: 3, w: 2 },
    { x: -8, z: 104, h: 3, w: 2 },
    { x: -44, z: 88, h: 3, w: 2 },
    { x: -80, z: 100, h: 2, w: 2 },
    { x: -108, z: 64, h: 1, w: 2 },
    { x: -108, z: 28, h: 0, w: 2 },
    { x: -68, z: 12, h: 0, w: 2 },
    { x: -32, z: -4, h: 0, w: 2 },
    { x: -28, z: -28, h: 0, w: 2 },
    { x: -48, z: -44, h: 0, w: 2 },
    { x: -84, z: -48, h: 0, w: 2 },
    { x: -108, z: -64, h: 0, w: 2 },
    { x: -112, z: -88, h: 0, w: 2 },
  ],
  features: [
    { s: 13, kind: 'start' },
    { s: 30, kind: 'items' },
    { s: 100, kind: 'items' },
    { s: 106, kind: 'pad', side: 0 },
    { s: 136, kind: 'ramp', side: 0 },
    { s: 150, kind: 'ramp', side: 0 },
    { s: 196, kind: 'items' },
    { s: 22, kind: 'offroad', side: 1 },
  ],  branches: [
    // the soap slide: straight down the wall past the washers, slippery, with a dryer-vent pad, instead of the
    // detour round the sorting baskets
    {
      from: 180,
      to: 246,
      points: [
        { x: -116, z: 0, h: 0, w: 1 },
        { x: -118, z: -36, h: 0, w: 1 },
      ],
      surface: 'lowgrip',
      label: 'soap slide',
    },
  ],
  hazards: [
    { kind: 'drum', s: 68, period: 3 },
    { kind: 'laundry', s: 122, period: 3.2 },
  ],
  coins: [
    { s: 22, d: 3, count: 4 },
    { s: 90, d: -3, count: 4 },
    { s: 226, d: 3, count: 5 },
    { s: 0.45 * 255, d: 0, count: 4, branch: 0 },
  ],
  flyover: [
    { x: 0, y: 70, z: -20, lx: 0, ly: 0, lz: 40, t: 0 },
    { x: 110, y: 30, z: 110, lx: 40, ly: 4, lz: 96, t: 1.2 },
    { x: -20, y: 20, z: 60, lx: 52, ly: 0, lz: -20, t: 2.4 },
    { x: -96, y: 8, z: -100, lx: -56, ly: 1, lz: -108, t: 3.5 },
  ],

};
