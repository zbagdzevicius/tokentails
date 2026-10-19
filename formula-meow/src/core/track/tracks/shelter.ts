/**
 * Pink Paw Shelter Sprint (GDD 6.1, track 6, theme 5): a cosy, generic cat shelter (no numbers, no claims): past the
 * welcome desk → the hallway of cat trees → up and over the big cat tree (a ramp) → the feeding corner (a spilled
 * bowl of milk) → through the play room (a short cut with a roomba on patrol) or round the scratching posts → the
 * nap-room straight home. The field is the Pink Paw roster (as of 2026-10-04).
 */
import type { TrackDef } from '../../../types';

export const SHELTER: TrackDef = {
  v: 1,
  id: 'shelter',
  name: 'Pink Paw Shelter Sprint',
  theme: 5,
  timeOfDay: 0,
  laps: 3,
  music: 5,
  points: [
    { x: 104, z: -92, h: 0, w: 2 },
    { x: 108, z: -40, h: 0, w: 2 },
    { x: 100, z: -4, h: 0, w: 2 },
    { x: 76, z: 8, h: 0, w: 2 },
    { x: 72, z: 36, h: 0, w: 2 },
    { x: 100, z: 56, h: 0, w: 2 },
    { x: 96, z: 92, h: 0, w: 2 },
    { x: 56, z: 104, h: 0, w: 2 },
    { x: 16, z: 100, h: 1, w: 2 },
    { x: -20, z: 96, h: 2, w: 2 },
    { x: -56, z: 104, h: 1, w: 2 },
    { x: -88, z: 100, h: 0, w: 2 },
    { x: -112, z: 68, h: 0, w: 2 },
    { x: -112, z: 24, h: 0, w: 2 },
    { x: -80, z: 12, h: 0, w: 2 },
    { x: -56, z: -8, h: 0, w: 2 },
    { x: -72, z: -36, h: 0, w: 2 },
    { x: -100, z: -48, h: 0, w: 2 },
    { x: -108, z: -80, h: 0, w: 2 },
    { x: -80, z: -104, h: 0, w: 2 },
    { x: -32, z: -108, h: 0, w: 2 },
    { x: 12, z: -96, h: 0, w: 2 },
    { x: 44, z: -112, h: 0, w: 2 },
    { x: 80, z: -108, h: 0, w: 2 },
  ],
  features: [
    { s: 8, kind: 'start' },
    { s: 18, kind: 'items' },
    { s: 88, kind: 'ramp', side: 0 },
    { s: 104, kind: 'items' },
    { s: 128, kind: 'pad', side: 0 },
    { s: 196, kind: 'items' },
    { s: 212, kind: 'ramp', side: 0 },
  ],  branches: [
    // the play room: straight through, past the toys, with the roomba on patrol
    {
      from: 139,
      to: 187,
      points: [
        { x: -112, z: 0, h: 0, w: 1 },
        { x: -112, z: -40, h: 0, w: 1 },
      ],
      label: 'play room',
    },
  ],
  hazards: [
    { kind: 'milk', s: 44, side: 1 },
    { kind: 'roomba', s: 128, branch: 0 },
  ],
  coins: [
    { s: 60, d: -3, count: 4 },
    { s: 160, d: 2, count: 5 },
    { s: 228, d: -3, count: 4 },
    { s: 0.3 * 255, d: 0, count: 4, branch: 0 },
  ],
  flyover: [
    { x: 0, y: 64, z: 0, lx: 0, ly: 0, lz: 60, t: 0 },
    { x: -40, y: 26, z: 130, lx: -20, ly: 3, lz: 96, t: 1.2 },
    { x: -130, y: 18, z: -20, lx: -100, ly: 0, lz: -40, t: 2.4 },
    { x: 100, y: 8, z: -118, lx: 106, ly: 1, lz: -64, t: 3.5 },
  ],

};
