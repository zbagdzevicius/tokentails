/**
 * Cat Café Chaos (GDD 6.1, track 5, theme 4): a cat café after closing, fairy lights on, the night shift of roombas
 * out. Start along the window → the table slalom (a tight chicane between the tables) → the koi pond gap → round the
 * bookshelf → the kitchen pass (a narrow short cut behind the counter with a boost pad) or the long way round the
 * counter past the roombas and up the coffee cup's side → through the cat tree → round the mug handle → the cushion
 * corner home.
 *
 * Set pieces (SIM_VERSION 8, tracks-B, SETPIECES.md section 12; bright emissive skins on the dark theme):
 * - the koi pond (lip s104, a 12 m gap, flat: the plan's 0.8 m drop would sink the landing deck under the café floor
 *   plane at y −0.08, so the pond and landing never showed): the clean-landing boost replaces the pad that was at s112; the
 *   launch floor covers a kart the roomba at s100 slowed down;
 * - the coffee-cup half-pipe on the long way round the counter (s146–158, the outside of the right-hander);
 * - the cat-tree tunnel (s198–212), the items at its mouth;
 * - the mug-handle loop (zone s220–232 after the strip): replaces the ramp at s216; the roomba moved to s242.
 */
import type { TrackDef } from '../../../types';

export const CAFE: TrackDef = {
  v: 1,
  id: 'cafe',
  name: 'Cat Café Chaos',
  theme: 4,
  timeOfDay: 2,
  laps: 3,
  music: 4,
  points: [
    { x: -100, z: -104, h: 0, w: 3 },
    { x: -48, z: -108, h: 0, w: 3 },
    { x: 0, z: -104, h: 0, w: 3 },
    { x: 40, z: -100, h: 0, w: 3 },
    { x: 56, z: -84, h: 0, w: 3 },
    { x: 56, z: -52, h: 0, w: 3 },
    { x: 68, z: -32, h: 0, w: 3 },
    { x: 100, z: -28, h: 0, w: 3 },
    { x: 116, z: 8, h: 0, w: 3 },
    { x: 108, z: 52, h: 0, w: 3 },
    { x: 88, z: 88, h: 0, w: 3 },
    { x: 56, z: 104, h: 0, w: 3 },
    { x: 32, z: 80, h: 0, w: 3 },
    { x: 8, z: 44, h: 0, w: 3 },
    { x: -20, z: 56, h: 0, w: 3 },
    { x: -32, z: 92, h: 0, w: 3 },
    { x: -64, z: 108, h: 0, w: 3 },
    { x: -96, z: 88, h: 0, w: 3 },
    { x: -112, z: 48, h: 0, w: 3 },
    { x: -112, z: 0, h: 0, w: 3 },
    { x: -108, z: -52, h: 0, w: 3 },
    { x: -112, z: -84, h: 0, w: 3 },
  ],
  features: [
    { s: 13, kind: 'start' },
    { s: 22, kind: 'ramp', side: 0 },
    { s: 34, kind: 'items' },
    { s: 92, kind: 'items' },
    { s: 198, kind: 'items' },
  ],
  setPieces: [
    { kind: 'jump', s: 104, gap: 12, drop: 0 }, // flat: the café road sits on the floor, so a drop would sink the landing under it
    { kind: 'wall', s: 146, len: 12, side: 1 }, // the outside of the bend (curvature + = left: side +1),
    { kind: 'tunnel', s: 198, len: 14 },
    { kind: 'loop', s: 220 },
  ],
  branches: [
    // the kitchen pass: a narrow lane behind the counter, a boost pad in the middle
    {
      from: 121,
      to: 179,
      points: [
        { x: 20, z: 110, h: 0, w: 0 },
        { x: -4, z: 110, h: 0, w: 0 },
      ],
      label: 'kitchen pass',
    },
  ],
  hazards: [
    { kind: 'roomba', s: 100, phase: 0 },
    { kind: 'roomba', s: 242, phase: 0.5 },
  ],
  coins: [
    { s: 60, d: 0, count: 4 },
    { s: 152, d: -2, count: 5 },
    { s: 228, d: 3, count: 4 },
    { s: 0.5 * 255, d: 0, count: 3, branch: 0 },
  ],
  flyover: [
    { x: 0, y: 60, z: -20, lx: 0, ly: 0, lz: 40, t: 0 },
    { x: 120, y: 26, z: 100, lx: 60, ly: 2, lz: 60, t: 1.2 },
    { x: -40, y: 18, z: 40, lx: -112, ly: 0, lz: 0, t: 2.4 },
    { x: -100, y: 8, z: -92, lx: -60, ly: 1, lz: -108, t: 3.5 },
  ],

};
