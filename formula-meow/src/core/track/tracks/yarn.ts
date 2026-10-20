/**
 * Yarn Canyon (GDD 6.1, track 4, theme 3): sunset over red mesas strung with giant yarn. Up the start straight →
 * climb onto the mesa → the knitting-needle bridge across the canyon (no walls: off the edge is a fall) → down to the
 * canyon floor → the yarn-ball gap (a straight short cut down the canyon wall; only a fast kart clears the gap) or the
 * switchbacks past the geyser → the loose-thread boost strip home.
 *
 * Set pieces (SIM_VERSION 8, tracks-B, SETPIECES.md section 12): the thread pads fire you into the mesa tunnel
 * (s24–36, items moved out of it to s38), you exit onto the needle bridge with the sunset ahead and hop the broken
 * strand (lip s56, a 10 m gap, flat, with rails over the gap and landing so the bridge's open edge is never live
 * mid-jump), and on the switchbacks the canyon wall curls up into a ride round the right-hander after the steam (the
 * outside, s148–160). The yarn-ball gap's net is in tracks/extras.ts.
 */
import type { TrackDef } from '../../../types';

export const YARN: TrackDef = {
  v: 1,
  id: 'yarn',
  name: 'Yarn Canyon',
  theme: 3,
  timeOfDay: 1,
  laps: 3,
  music: 3,
  points: [
    { x: 108, z: -56, h: 0, w: 2 },
    { x: 108, z: -8, h: 0, w: 2 },
    { x: 100, z: 28, h: 1, w: 2 },
    { x: 80, z: 52, h: 2, w: 2 },
    { x: 52, z: 64, h: 3, w: 1 },
    { x: 16, z: 68, h: 3, w: 1 },
    { x: -20, z: 68, h: 3, w: 1 },
    { x: -52, z: 80, h: 3, w: 2 },
    { x: -84, z: 100, h: 2, w: 2 },
    { x: -112, z: 84, h: 1, w: 2 },
    { x: -112, z: 44, h: 0, w: 2 },
    { x: -92, z: 12, h: 0, w: 2 },
    { x: -48, z: 24, h: 0, w: 2 },
    { x: -20, z: 0, h: 0, w: 2 },
    { x: -36, z: -28, h: 0, w: 2 },
    { x: -80, z: -36, h: 0, w: 2 },
    { x: -104, z: -60, h: 0, w: 2 },
    { x: -84, z: -92, h: 0, w: 2 },
    { x: -44, z: -100, h: 0, w: 2 },
    { x: -8, z: -112, h: 0, w: 2 },
    { x: 24, z: -88, h: 0, w: 2 },
    { x: 56, z: -104, h: 0, w: 2 },
    { x: 88, z: -88, h: 0, w: 2 },
  ],
  features: [
    { s: 8, kind: 'start' },
    { s: 14, kind: 'pad', side: 0 },
    { s: 18, kind: 'pad', side: 0 },
    { s: 22, kind: 'pad', side: 0 },
    { s: 38, kind: 'items' },
    { s: 98, kind: 'items' },
    { s: 194, kind: 'items' },
    { s: 206, kind: 'ramp', side: 0 },
    { s: 244, kind: 'ramp', side: 0 },
  ],
  setPieces: [
    { kind: 'tunnel', s: 24, len: 12 },
    { kind: 'jump', s: 56, gap: 10, drop: 0 },
    { kind: 'wall', s: 148, len: 12, side: 1 }, // the outside of the bend (curvature + = left: side +1),
  ],
  branches: [
    // the yarn-ball gap: straight down the canyon wall, a pad, then a gap only a fast kart clears
    {
      from: 107,
      to: 177,
      points: [
        { x: -114, z: 16, h: 0, w: 1 },
        { x: -114, z: -28, h: 0, w: 1 },
      ],
      label: 'yarn-ball gap',
    },
  ],
  hazards: [{ kind: 'steam', s: 142, side: -1, period: 6 }],
  coins: [
    { s: 40, d: 3, count: 4 },
    { s: 158, d: -3, count: 5 },
    { s: 216, d: 2, count: 4 },
    { s: 0.25 * 255, d: 0, count: 3, branch: 0 },
  ],
  flyover: [
    { x: 0, y: 60, z: 120, lx: 0, ly: 6, lz: 60, t: 0 },
    { x: -60, y: 30, z: 40, lx: 0, ly: 6, lz: 68, t: 1.2 },
    { x: 60, y: 24, z: -120, lx: 100, ly: 0, lz: -60, t: 2.4 },
    { x: 104, y: 9, z: -76, lx: 108, ly: 1, lz: -24, t: 3.5 },
  ],

};
