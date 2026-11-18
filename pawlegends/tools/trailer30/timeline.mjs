/**
 * Trailer 30 ("The Rivalry") timeline: 30.000 s at 60 fps, 150 BPM (a beat is 24 frames), every cut on the (half-)beat grid.
 * Each segment is gameplay (`gp`: frames [a, b) of a captured take, master-frame aligned) or a motion-graphics
 * segment drawn by mg.js (`mg`). Pure data: edit.mjs, score.mjs and the tests read it.
 */
export const FPS = 60;
export const BEAT = 24;
export const N = 1800;

/** Section starts (master frames). */
export const CUTS = { hook: 0, vs: 72, charge: 96, montage: 192, war: 576, low: 648, eyes: 720, fight: 768, key: 1200, core: 1272, glory: 1440, end: 1632 };

/**
 * The edit. gp: { take, in } plays take frames in.. for the segment's length; `freeze: [at, len]` holds the take frame
 * at segment frame `at` for `len` frames (an mg 'freeze' overlay draws on it). side: whose champion it is.
 */
export const EDL = [
  { f: 0, len: 48, gp: { take: 'g01-hook-lambo', in: 0 } },
  { f: 48, len: 3, mg: 'impact', still: { take: 'g01-hook-lambo', at: 48 } },
  { f: 51, len: 21, gp: { take: 'g01-hook-lambo', in: 51 } },
  { f: 72, len: 24, mg: 'vs', still: { take: 'g01-hook-lambo', at: 71 } },
  { f: 96, len: 96, gp: { take: 'g02-charge', in: 60 } },
  ...['m1-clem', 'm2-brutus', 'm3-sage', 'm4-cacklejaw', 'm5-bengal', 'm6-marshmallow', 'm7-gabby', 'm8-howler'].map((take, i) => ({
    f: 192 + i * 48, len: 48, gp: { take, in: 26, freeze: [14, 3] }, side: i % 2 ? 'dog' : 'cat',
  })),
  { f: 576, len: 72, mg: 'war' },
  { f: 648, len: 72, gp: { take: 'l1-tower', in: 60 } },
  { f: 720, len: 48, mg: 'eyes' },
  { f: 768, len: 72, gp: { take: 't1-river', in: 12 } },
  { f: 840, len: 72, gp: { take: 't2-lambo', in: 22 } },
  { f: 912, len: 48, gp: { take: 't3-brutus', in: 22 } },
  { f: 960, len: 48, gp: { take: 't4-clem', in: 22 } },
  { f: 1008, len: 48, gp: { take: 't5-triple', in: 60 } },
  { f: 1056, len: 24, gp: { take: 't6-sage', in: 20 } },
  { f: 1080, len: 24, gp: { take: 't7-gabby', in: 20 } },
  { f: 1104, len: 24, gp: { take: 't8-lambo', in: 20 } },
  { f: 1128, len: 24, gp: { take: 't9-bengal', in: 20 } },
  { f: 1152, len: 48, gp: { take: 't10-wedge', in: 36 } },
  { f: 1200, len: 72, mg: 'keyart', still: { take: 't10-wedge', at: 83 } },
  // the burst is drawn ~22 frames after the core's death tick (799.27 s): it lands 2 frames after the cut
  { f: 1272, len: 168, gp: { take: 'v1-core', in: 36 } },
  { f: 1440, len: 192, mg: 'glory' },
  { f: 1632, len: 168, mg: 'end' },
];

/** Designed hits (master frames). */
export const HIT = {
  hookInk: 48,
  towerCrack: 672,
  fightCuts: [768, 840, 912, 960, 1008, 1056, 1080, 1104, 1128, 1152],
  triple: 1008,
  comeback: 1152,
  coreFalling: 1176,
  victory: 1392,
};

/** Announcer name calls on the montage cuts (every line checked by transcription: Bengal, Gabby, ...). */
export const VO = { names: ['name_clem', 'name_brutus', 'name_sage', 'name_cacklejaw', 'name_bengas', 'name_marshmallow', 'name_gabe', 'name_howler'] };

/** Near-silent holes before the two biggest hits. */
export const SILENCE = [[648, 654], [1268, 1272]];

/** On-screen words (copy gate): nothing else is set in type. */
export const COPY = ['CATS', 'DOGS', 'PICK A SIDE.', 'NOT OUT.', 'PLAY FREE', 'pawlegends.app'];
