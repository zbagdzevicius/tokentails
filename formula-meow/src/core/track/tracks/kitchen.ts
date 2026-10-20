/**
 * Kitchen Counter GP (GDD 6.1, track 1, FTUE): a giant counter top in butter-yellow daylight. Start straight → first
 * item row → the wide tutorial hairpin → an S onto the cutting board → the board's ramp → the cutting-board cut (a
 * crumb-strewn shortcut, off-road, a boost pad at its end) or the long way round the fruit bowl → the sink splash
 * (low grip, a milk puddle) → the toaster on the tiles → back along the bottom. Gameplay is data only; the props live
 * in dressing/kitchen.ts.
 *
 * Set pieces (SIM_VERSION 8, the Engine step's reference examples, one of each kind; tracks-A owns the final placement,
 * docs/plans/formula-meow/SETPIECES.md section 12): the mixing-bowl wall ride round the tutorial hairpin, the sink
 * gap (replaces the board's ramp), the bread-bin tunnel on the bottom straight (the pad moved into it) and a loop on
 * the bottom straight after it (the toaster moved to the tunnel's exit).
 */
import type { TrackDef } from '../../../types';

export const KITCHEN: TrackDef = {
  v: 1,
  id: 'kitchen',
  name: 'Kitchen Counter',
  theme: 0,
  timeOfDay: 0,
  laps: 3,
  music: 0,
  points: [
    { x: -104, z: -80, h: 0, w: 2 },
    { x: -104, z: -32, h: 0, w: 2 },
    { x: -104, z: 16, h: 0, w: 2 },
    { x: -100, z: 48, h: 0, w: 3 },
    { x: -80, z: 68, h: 0, w: 3 },
    { x: -56, z: 64, h: 0, w: 3 },
    { x: -48, z: 40, h: 0, w: 3 },
    { x: -52, z: 12, h: 0, w: 2 },
    { x: -44, z: -16, h: 0, w: 2 },
    { x: -20, z: -32, h: 0, w: 2 },
    { x: 4, z: -24, h: 1, w: 2 },
    { x: 20, z: 0, h: 2, w: 2 },
    { x: 24, z: 32, h: 2, w: 2 },
    { x: 28, z: 64, h: 2, w: 2 },
    { x: 40, z: 92, h: 1, w: 2 },
    { x: 68, z: 108, h: 1, w: 2 },
    { x: 100, z: 100, h: 0, w: 2 },
    { x: 116, z: 72, h: 0, w: 2 },
    { x: 116, z: 36, h: 0, w: 2 },
    { x: 108, z: 4, h: 0, w: 2 },
    { x: 112, z: -32, h: 0, w: 2 },
    { x: 100, z: -68, h: 0, w: 2 },
    { x: 68, z: -92, h: 0, w: 2 },
    { x: 28, z: -104, h: 0, w: 2 },
    { x: -16, z: -112, h: 0, w: 2 },
    { x: -60, z: -116, h: 0, w: 2 },
    { x: -92, z: -108, h: 0, w: 2 },
  ],
  features: [
    { s: 14, kind: 'start' },
    { s: 26, kind: 'items' },
    { s: 113, kind: 'items' },
    { s: 158, kind: 'items' },
    { s: 165, kind: 'lowgrip' },
    { s: 205, kind: 'pad', side: 0 },
    { s: 236, kind: 'ramp', side: 0 },
  ],
  setPieces: [
    { kind: 'jump', s: 116, gap: 12, drop: 1.5 },
    { kind: 'wall', s: 177, len: 16 },
    { kind: 'tunnel', s: 196, len: 14 },
    { kind: 'loop', s: 217 },
  ],
  branches: [
    // the crumb cut across the S: shorter, but crumbs are off-road (pays with a boost); a pad at its end
    {
      from: 58,
      to: 108,
      points: [
        { x: -36, z: 10, h: 0, w: 0 },
        { x: -28, z: -4, h: 0, w: 0 },
        { x: -14, z: -10, h: 0, w: 0 },
        { x: 0, z: -4, h: 0, w: 0 },
        { x: 6, z: 10, h: 1, w: 0 },
      ],
      surface: 'offroad',
      label: 'crumb cut',
    },
  ],
  hazards: [
    { kind: 'milk', s: 168, side: -1 },
    { kind: 'toaster', s: 212, side: 1, period: 4 },
  ],
  coins: [
    { s: 20, d: 3.5, count: 4 },
    { s: 140, d: -3, count: 5 },
    { s: 202, d: -3, count: 4 },
    { s: 0.55 * 255, d: 0, count: 3, branch: 0 },
  ],
  flyover: [
    { x: -60, y: 60, z: 40, lx: 0, ly: 0, lz: 0, t: 0 },
    { x: 40, y: 40, z: 120, lx: 40, ly: 2, lz: 40, t: 1.2 },
    { x: 60, y: 24, z: -60, lx: -40, ly: 0, lz: -60, t: 2.4 },
    { x: -96, y: 8, z: -70, lx: -104, ly: 1, lz: -20, t: 3.5 },
  ],
};
