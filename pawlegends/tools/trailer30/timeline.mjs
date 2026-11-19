/**
 * Trailer 30 ("The Rivalry") timeline: 30.000 s at 60 fps, 150 BPM (a beat is 24 frames), every cut on the (half-)beat grid.
 * Each segment is gameplay (`gp`: frames [a, b) of a captured take, master-frame aligned) or a motion-graphics
 * segment drawn by mg.js (`mg`). Pure data: edit.mjs, score.mjs and the tests read it.
 */
export const FPS = 60;
export const BEAT = 24;
export const N = 1800;

/** Section starts (master frames). Round 2: the VS beat holds 0.8 s, the low point is the real tower fall (1.6 s). */
export const CUTS = { hook: 0, vs: 72, charge: 120, montage: 192, war: 576, low: 648, eyes: 744, fight: 792, key: 1200, core: 1248, glory: 1440, end: 1632 };

/** The montage: take, the champion card's splash key, name, ultimate, side. */
export const MONTAGE = [
  { take: 'm1-clem', hero: 'clem', name: 'Clem', ult: 'Golden Hour', side: 'cat' },
  { take: 'm2-brutus', hero: 'brutus', name: 'Sir Brutus', ult: 'Champion\u2019s Challenge', side: 'dog' },
  { take: 'm3-sage', hero: 'sage', name: 'Sage', ult: 'Moonshot', side: 'cat' },
  { take: 'm4-cacklejaw', hero: 'cacklejaw', name: 'Cacklejaw', ult: 'Pack Hunt', side: 'dog' },
  { take: 'm5-bengal', hero: 'bengas', name: 'Bengal', ult: 'Curtains Up!', side: 'cat' },
  { take: 'm6-marshmallow', hero: 'marshmallow', name: 'Marshmallow', ult: 'Snow Day!', side: 'dog' },
  { take: 'm7-gabby', hero: 'gabe', name: 'Gabby', ult: 'Under Her Spell', side: 'cat' },
  { take: 'm8-howler', hero: 'howler', name: 'Howler', ult: 'The Scream', side: 'dog' },
];

/**
 * Take in-points (take frames) per shot; edit.mjs and the QC read them. Set from the round 2 takes (frame dumps).
 */
export const IN = {
  hook: 0, charge: 60, montage: 26, freezeAt: 14, tower: 72, t1: 12, t2: 22, t3: 22, t4: 22, t5: 60, t6: 20, t7: 20, t9: 20, t10: 36, core: 76,
};

/**
 * The edit. gp: { take, in } plays take frames in.. for the segment's length; `freeze: [at, len]` holds the take frame
 * at segment frame `at` for `len` frames (an mg 'freeze' overlay draws on it); `ov`: a transparent mg overlay drawn
 * over the whole segment. side: whose champion it is.
 */
export const EDL = [
  { f: 0, len: 48, gp: { take: 'g01-hook-lambo', in: IN.hook } },
  { f: 48, len: 3, mg: 'impact', still: { take: 'g01-hook-lambo', at: IN.hook + 48 } },
  { f: 51, len: 21, gp: { take: 'g01-hook-lambo', in: IN.hook + 51 } },
  { f: 72, len: 48, mg: 'vs', still: { take: 'g01-hook-lambo', at: IN.hook + 71 } },
  { f: 120, len: 72, gp: { take: 'g02-charge', in: IN.charge }, ov: { mg: 'caption', text: 'TOPPLE THEIR TOWERS.', color: '#FFD21F' } },
  ...MONTAGE.map((m, i) => ({
    f: 192 + i * 48, len: 48, gp: { take: m.take, in: IN.montage, freeze: [IN.freezeAt, 3] }, side: m.side,
    ov: { mg: 'name', hero: m.hero, name: m.name, ult: m.ult, side: m.side },
  })),
  { f: 576, len: 72, mg: 'war' },
  { f: 648, len: 96, gp: { take: 'l1-tower', in: IN.tower } },
  { f: 744, len: 48, mg: 'eyes' },
  { f: 792, len: 72, gp: { take: 't1-river', in: IN.t1 } },
  { f: 864, len: 72, gp: { take: 't2-lambo', in: IN.t2 } },
  { f: 936, len: 48, gp: { take: 't3-brutus', in: IN.t3 } },
  { f: 984, len: 48, gp: { take: 't4-clem', in: IN.t4 } },
  { f: 1032, len: 48, gp: { take: 't5-triple', in: IN.t5 } },
  { f: 1080, len: 24, gp: { take: 't6-sage', in: IN.t6 } },
  { f: 1104, len: 24, gp: { take: 't7-gabby', in: IN.t7 } },
  { f: 1128, len: 24, gp: { take: 't9-bengal', in: IN.t9 } },
  { f: 1152, len: 48, gp: { take: 't10-wedge', in: IN.t10 }, ov: { mg: 'caption', text: 'TAKE THEIR CORE.', color: '#FF3D9A' } },
  { f: 1200, len: 48, mg: 'keyart', still: { take: 't10-wedge', at: IN.t10 + 47 } },
  { f: 1248, len: 192, gp: { take: 'v1-core', in: IN.core }, ov: { mg: 'victory', at: 0 } },
  { f: 1440, len: 192, mg: 'glory' },
  { f: 1632, len: 168, mg: 'end' },
];

/** Designed hits (master frames). towerCrack: the tower's death tick on screen (set from the take). */
export const HIT = {
  hookInk: 48,
  towerCrack: 692,
  fightCuts: [792, 864, 936, 984, 1032, 1080, 1104, 1128, 1152],
  triple: 1032,
  comeback: 1152,
  coreFalling: 1176,
  victory: 1272,
};

/** Announcer name calls on the montage cuts (every line checked by transcription: Bengal, Gabby, ...). */
export const VO = { names: ['name_clem', 'name_brutus', 'name_sage', 'name_cacklejaw', 'name_bengas', 'name_marshmallow', 'name_gabe', 'name_howler'] };

/** Near-silent holes before the two biggest hits (the tower's crack, the core burst). */
export const SILENCE = [[HIT.towerCrack - 6, HIT.towerCrack], [1244, 1248]];

/** On-screen words (copy gate): nothing else is set in type. */
export const COPY = ['CATS', 'DOGS', 'TOPPLE THEIR TOWERS.', ...MONTAGE.flatMap((m) => [m.name, m.ult]), 'PICK A SIDE.', 'NOT OUT.', 'TAKE THEIR CORE.', 'VICTORY!', 'TEAM CAT', 'TEAM DOG', 'CATS VS DOGS. PICK A SIDE.', '5V5 AND 3V3 TEAM BATTLES', 'PLAY FREE IN YOUR BROWSER', 'pawlegends.app'];
