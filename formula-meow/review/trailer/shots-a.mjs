// Trailer group A shot recipes (STORYBOARD section 8, group A) as data for capture-a.mjs.
// Every take is `len + 120` frames: a 60-frame handle, the cut window (cut f0 = take frame 60), a 60-frame handle.
// `at` = the cut frame where the anchor tick is shown. `seed: null` = pick by the sweep (`want` scores each candidate
// occurrence; ties go to the earlier seed). Seeds chosen by the sweep are written to build/anchors-A.json.
export const H = 60;
const SW = Array.from({ length: 40 }, (_, i) => i + 1);

export const SHOTS = {
  S01: { track: 'rooftops', cls: 2, seeds: SW, spec: { cond: 'LOOP_TOP', score: 'rivalsAhead', window: 0, scoreBefore: 70 }, at: 70, len: 100 },
  S02: { track: 'kitchen', cls: 2, seeds: SW, spec: { event: { type: 'go', anyKart: true }, score: 'midGrid' }, at: 2, len: 50 },
  S03: { track: 'cafe', cls: 2, seeds: SW, spec: { event: { type: 'driftStart', afterGo: true }, score: 'rivalsClose', window: 30, scoreBefore: 20 }, at: 20, len: 50, firstOnly: true },
  S04: { track: 'laundry', cls: 1, seeds: [7], spec: { cond: 'WALL_ON', offset: 18 }, at: 10, len: 50, wall: true },
  S05: { track: 'yarn', cls: 2, seeds: [7], spec: { cond: 'JUMP_MID', score: 'rivalAirNear', window: 25, scoreBefore: 25 }, at: 25, len: 50 },
  S06: { track: 'rooftops', cls: 2, seeds: 'S01', spec: { cond: 'TUNNEL_MID' }, at: 25, len: 50 },
  S07: { track: 'shelter', cls: 1, seeds: SW, spec: { cond: 'LOOP_IN', score: 'kartsOnWheel', window: 40 }, at: 8, len: 50, tv: true },
  // alternate take of S07 (same anchor) on the chase rig: the TV camera sits inside the wheel and its spokes hide the karts
  S07c: { track: 'shelter', cls: 1, anchorOf: 'S07', spec: { cond: 'LOOP_IN' }, at: 8, len: 50 },
  S19: { track: 'kitchen', cls: 2, seeds: SW, spec: { cond: 'JUMP_MID', score: 'rivalAirNear', window: 25, scoreBefore: 25 }, at: 25, len: 50 },
  S26: { track: 'laundry', cls: 2, seeds: SW, spec: { cond: 'LOOP_TOP', score: 'rivalOnLoopAhead', window: 11, scoreBefore: 14 }, at: 14, len: 25 },
  S27: { track: 'cafe', cls: 2, seeds: SW, spec: { cond: 'LOOP_TOP', score: 'rivalsAhead', window: 13, scoreBefore: 12 }, at: 12, len: 25 },
  S28: { track: 'shelter', cls: 1, seeds: [7], spec: { cond: 'WALL_ON', offset: 18 }, at: 6, len: 25, wall: true },
  S29: { track: 'cafe', cls: 2, seeds: 'S34', spec: { cond: 'JUMP_MID' }, at: 12, len: 25 },
  S30: { track: 'rooftops', cls: 1, seeds: [7], spec: { cond: 'WALL_ON', offset: 18 }, at: 8, len: 25, wall: true },
  S31: { track: 'kitchen', cls: 2, seeds: SW, spec: { cond: 'TUNNEL_MID', score: 'rivalsAhead', window: 13, scoreBefore: 12 }, at: 12, len: 25 },
  S32: { track: 'laundry', cls: 2, seeds: SW, spec: { cond: 'JUMP_LAND', score: 'rivalsAhead', window: 9, scoreBefore: 16 }, at: 16, len: 25 },
  S33: { track: 'kitchen', cls: 1, seeds: [7], spec: { cond: 'WALL_ON', offset: 18 }, at: 8, len: 25, wall: true },
  // the hero slow motion: anchored on the landing (cut f100); the speed profile is solved from the measured flight
  S34: { track: 'cafe', cls: 2, seeds: SW, spec: { cond: 'JUMP_LAND', score: 'rivalAirNear', window: 0, scoreBefore: 50 }, at: 100, len: 125, slowmo: 'hero' },
  // alternate take of S34 (same anchor): the launch on cut f10 at 1x, then ~0.53x (all the flight allows)
  S34b: { track: 'cafe', cls: 2, anchorOf: 'S34', spec: { cond: 'JUMP_LAND' }, at: 100, len: 125, slowmo: 'launch' },
  S35: { track: ['kitchen', 'cafe'], cls: 2, seeds: SW, spec: { event: { type: 'finish', a: 1 } }, at: 20, len: 75, firstOnly: true },
};
