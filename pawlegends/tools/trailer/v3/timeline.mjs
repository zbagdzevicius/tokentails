/**
 * Trailer v3 timeline as data (pure: the browser compositor mg.js, the score and the edit all read it). Frames are each
 * cut's own (60 fps, 144 BPM: 25 frames per beat).
 *
 * Type rules (storyboard §5): every word slams in whole at 118 % and settles in 6 frames (no ghost glyphs, no stacked
 * copies), exits with a 12° mask wipe that has fully cleared 3 frames before the next cut, and sits over open ground,
 * never over the fight. Five lines in all, every string from v3/copy.json (copy gate: lint-copy.mjs).
 */

export const ASPECTS = { '16x9': { W: 1920, H: 1080 }, '9x16': { W: 1080, H: 1920 } };
export const CUTS = { 30: 1800, 15: 900 };
export const BEAT_FRAMES = 25;

/**
 * The 15 s cut as segments of the 30 s master: [cutFrom, cutTo, offset] (master = cut + offset). v3.2: every offset is
 * a multiple of 25 frames (one beat at 144 BPM), so the spliced score never jumps off the beat grid.
 */
export const CUT15 = [
  [0, 149, 0], // v3.4: the exchange and the crane to the whole Crossing, CATS VS DOGS
  [150, 224, 25], // 3V3 IN YOUR BROWSER (S02 master 175-249, the real HUD)
  [225, 274, 75], // Clem's Tumble at Sir Brutus (S03)
  [275, 324, 75], // Cacklejaw's Pack Hunt on Gabė (S04)
  [325, 374, 225], // Gabė's Under Her Spell (S09 master 550-599)
  [375, 474, 425], // the dog tower cracks and falls along the lane, TOPPLE THEIR TOWERS. (S13 master 800-899)
  [475, 614, 775], // TAKE THEIR CORE., the core falls, VICTORY! (S15 master 1250-1389)
  [615, 689, 775], // INSPIRED BY REAL CATS. (S18 master 1390-1464, the pick screen)
  [690, 899, 825], // TEAM CAT OR TEAM DOG? (S17 master 1515-1589, 75 frames), then the end card (master 1590-1724)
];

/** Cut frame -> 30 s master frame. */
export function sourceFrame(cut, f) {
  if (String(cut) === '30') return f;
  for (const [a, b, d] of CUT15) if (f >= a && f <= b) return f + d;
  throw new Error(`15 s frame ${f} not in a segment`);
}

/** Master frames -> the 15 s cut's frames that show them (every segment that keeps the frame). */
export function mapTo15(f) {
  return CUT15.filter(([a, b, d]) => f >= a + d && f <= b + d).map(([, , d]) => f - d);
}

/**
 * v3.4 type positions (x, y fractions of the frame) found by a free-space search over every frame's hero, plate,
 * pop and structure boxes (QC); 9:16 keeps every word inside y 0.12-0.78 (the platforms' caption and button bands).
 */
export const POS = { L2: [0.75, 0.62], M1: [0.5, 0.82], M2: [0.5, 0.86], M7: [0.5, 0.1], N3: [0.2, 0.84], N4: [0.2, 0.84], N6: [0.2, 0.84], N7: [0.2, 0.84], N8: [0.2, 0.84], N9: [0.75, 0.84], N10: [0.2, 0.9] };
export const POS_V = { N3: [0.5, 0.74], N4: [0.5, 0.74], N6: [0.5, 0.74], N7: [0.5, 0.74], N8: [0.5, 0.74], N9: [0.5, 0.74], N10: [0.5, 0.2] };

export const COLORS = {
  cream: '#FFF8EE',
  cocoa: '#4A2E24',
  rose: '#FF6FA3',
  roseDeep: '#E0457E',
  navy: '#1F3F8F',
  navyLight: '#3E6AD8',
  gold: '#FFD24A',
  pinkDeep: '#E07396',
};

/**
 * v3.5 glare limits (shares of the frame, read by v3/edit.mjs on the picture without the type). v3.4 allowed 8 % / 15 %
 * near-white (Y >= 225, unsaturated) per shot (mean / worst frame), 7 % / 10 % blown out (Y >= 235) and a 2 % blob on
 * 3 frames in a row, and let white shockwave rims and zone circles of 1-3.7 % through; the v3.5 render (walls in their
 * own capped colour, screen-blended ground marks) peaks at a 0.6 % blob and 1.6 % blown out, so anything that brings a
 * white rim back fails.
 */
export const GLARE = { white: 0.035, worst: 0.05, clip: 0.015, worstClip: 0.03, blobRun: 0.01, runFrames: 2, blobPeak: 0.015 };

/**
 * The local-glare gate on a master's per-frame largest blown-out blob (share of the frame): runs of `GLARE.runFrames`
 * gameplay frames over `GLARE.blobRun` (their first frames) and single gameplay frames over `GLARE.blobPeak`.
 */
export function glareBlobFails(blobs, gameplay = () => true, g = GLARE) {
  const runs = [];
  const peaks = [];
  for (let i = 0, run = 0; i < blobs.length; i++) {
    const on = gameplay(i);
    run = on && blobs[i] > g.blobRun ? run + 1 : 0;
    if (run === g.runFrames) runs.push(i - g.runFrames + 1);
    if (on && blobs[i] > g.blobPeak) peaks.push(i);
  }
  return { runs, peaks };
}

/** The end card's first frame (the logo slam on the downbeat) per cut. */
export const END_AT = { 30: 1600, 15: 765 };

/** v3.3: the core's killing blow and burst (master frame; the score's boom and the zoom land here). */
export const CORE_HIT = 1331;

/**
 * Type elements. `x`, `y` are fractions of the frame (the word's centre); `size` px (cap-height based on 1080 p);
 * `in` the slam frame, `out` the wipe's first frame (cleared 4 frames later). style: 'cat' (rose, cocoa outline),
 * 'dog' (navy on a cream outline), 'plain' (cream, cocoa outline), 'gold'.
 */
export function typeEls(cut, aspect, c) {
  const v = aspect === '9x16';
  const els = [];
  const w = (id, text, f, out, x, y, size, style = 'plain') => els.push({ id, text, in: f, out, x, y, size, style });
  // every line is placed in the 30 s master's frames, then mapped into the 15 s cut (a line whose span the 15 s cut
  // does not show whole is left out)
  const L = [];
  const add = (...a) => L.push(a);
  // S01 (v3.5): CATS over the cat side, VS on the river, DOGS over the dog side of the whole Crossing as the crane
  // opens it: CATS on the f62 half-beat as the crane reaches the wide (the cat motif), VS on the sixteenth pickup (f68),
  // DOGS on the f75 beat (the dog motif), the whole line held 40 frames, out on f115 and gone by f123, before the
  // plates fade back in on the way down (f124). 9:16 (the quarter orbit): the yarn core is at the top, the doghouse at
  // the bottom
  if (v) {
    add('L1a', c.L1a, 62, 115, 0.5, 0.37, 150, 'cat');
    add('L1b', c.L1b, 68, 115, 0.5, 0.49, 90, 'plain');
    add('L1c', c.L1c, 75, 115, 0.5, 0.62, 150, 'dog');
  } else {
    add('L1a', c.L1a, 62, 115, 0.335, 0.47, 120, 'cat');
    add('L1b', c.L1b, 68, 115, 0.5, 0.5, 80, 'plain');
    add('L1c', c.L1c, 75, 115, 0.665, 0.53, 120, 'dog');
  }
  // S02: 3V3 IN YOUR BROWSER on the beats (f175, f200) in open meadow, clear of the six and the HUD
  if (v) {
    add('L2a', c.L2a, 175, 285, 0.5, 0.69, 150, 'gold');
    add('L2b', c.L2b, 200, 285, 0.5, 0.765, 70, 'plain');
  } else {
    add('L2a', c.L2a, 175, 285, 0.75, 0.18, 120, 'gold');
    add('L2b', c.L2b, 200, 285, 0.74, 0.28, 56, 'plain');
  }
  // v3.4 name tags: who each rivalry and champion shot is (cats in rose, dogs in navy), in at the shot's second
  // beat-eighth, out 10 frames before its cut
  for (const [id, key, f0, style] of [['N3', 'N_CLEM', 300, 'cat'], ['N4', 'N_CACK', 350, 'dog'], ['N6', 'N_BRUTUS', 400, 'dog'], ['N7', 'N_AVIETE', 450, 'cat'], ['N8', 'N_BENGAS', 500, 'cat'], ['N9', 'N_GABE', 550, 'cat'], ['N10', 'N_LAMBO', 600, 'cat']]) {
    const [x, y] = (v ? POS_V : POS)[id] ?? (v ? [0.5, 0.74] : [0.2, 0.84]);
    add(id, c[key], f0 + 4, f0 + 39, x, y, v ? 90 : 70, style);
  }
  // the mission, one line per beat (S11 push, S13 tower, S16 Pudding, S15 core)
  add('M1', c.M1, 655, 735, 0.5, v ? 0.74 : POS.M1[1], v ? 96 : 100, 'gold');
  add('M2', c.M2, 775, 885, 0.5, v ? 0.74 : POS.M2[1], v ? 80 : 84, 'gold');
  add('M7', c.M7, 1035, 1135, v ? 0.5 : POS.M7[0], v ? 0.74 : POS.M7[1], v ? 96 : 100, 'gold');
  if (v) {
    add('M3a', c.M3v1, 1165, 1300, 0.5, 0.14, 110, 'gold');
    add('M3b', c.M3v2, 1172, 1300, 0.5, 0.21, 140, 'gold');
  } else {
    add('M3a', c.M3v1, 1165, 1300, 0.84, 0.16, 66, 'gold');
    add('M3b', c.M3v2, 1172, 1300, 0.84, 0.245, 96, 'gold');
  }
  // S15: VICTORY! as the doghouse caves in (CORE_HIT), below it
  add('M6', c.M6, CORE_HIT + 1, 1382, 0.5, v ? 0.74 : 0.84, v ? 140 : 150, 'gold');
  // S18: INSPIRED BY REAL CATS. over the game's pick screen, under the detail panel (16:9) / under the panel (9:16)
  if (v) {
    add('M4a', c.M4v1, 1395, 1490, 0.5, 0.71, 84, 'plain');
    add('M4b', c.M4v2, 1401, 1490, 0.5, 0.77, 110, 'cat');
  } else {
    add('M4a', c.M4v1, 1395, 1490, 0.235, 0.84, 72, 'plain');
    // (the landing variant's longer line, REAL SHELTER CATS., smaller so it stays left of the pedestal)
    add('M4b', c.M4v2, 1401, 1490, 0.235, 0.92, c.M4v2.length > 12 ? 70 : 96, 'cat');
  }
  // S17: TEAM CAT under the cats, OR between, TEAM DOG? under the dogs (16:9); 9:16 TEAM CAT above the cat row,
  // OR between the rows, TEAM DOG? below the dog row, all inside the platforms' safe band (y 0.12-0.78)
  if (v) {
    add('M5a', c.M5a, 1505, 1590, 0.5, 0.14, 130, 'cat');
    add('M5b', c.M5b, 1512, 1590, 0.5, 0.47, 64, 'plain');
    add('M5c', c.M5c, 1518, 1590, 0.5, 0.77, 110, 'dog');
  } else {
    add('M5a', c.M5a, 1505, 1590, 0.25, 0.83, 110, 'cat');
    add('M5b', c.M5b, 1512, 1590, 0.5, 0.83, 64, 'plain');
    add('M5c', c.M5c, 1518, 1590, 0.75, 0.83, 100, 'dog');
  }
  if (String(cut) === '30') {
    for (const a of L) w(...a);
    return els;
  }
  for (const [id, text, f, out, x, y, size, style] of L) {
    // the 15 s cut: the first run of cut frames that show the line's master span; it slams where the run starts and
    // is wiped 3 frames before the run is cut (a line carried across two segments is not slammed again)
    let r0 = -1;
    let r1 = -1;
    for (let k = 0; k < CUTS[15]; k++) {
      const m = sourceFrame(15, k);
      const on = m >= f && m <= out + 8;
      if (on && r0 < 0) r0 = k;
      if (on && r0 >= 0) r1 = k;
      if (!on && r0 >= 0) break;
    }
    if (r0 < 0 || r1 - r0 < 20) continue;
    // v3.4: the 15 s cut's call to pick a side slams after its cut (690) and holds TEAM DOG? 52 frames
    const own = { M5a: [692, 757], M5b: [699, 757], M5c: [705, 757] }[id];
    if (own) {
      w(id, text, own[0], own[1], x, y, size, style);
      continue;
    }
    // v3.2: the 8-frame exit ends with the run (a line cut by the splice leaves on its own, never half-drawn)
    const natural = sourceFrame(15, r1) >= out + 8;
    w(id, text, r0, natural ? r1 - 8 : r1 - 9, x, y, size, style);
  }
  return els;
}

/** The end card: logo slam, CTA, URL, credit (cut frames); held sharp to the last frame. */
export function endCard(cut) {
  // v3.3: the 15 s end card is its own 125-frame timeline (the URL up from 805: 1.6 s on screen)
  return String(cut) === '30' ? { logo: 1600, cta: 1625, url: 1650, credit: 1675, end: 1800 } : { logo: 765, cta: 780, url: 795, credit: 810, end: 900 };
}

/**
 * Picture accents for the edit (master frames; the 15 s cut keeps those it shows). `punch`: an exposure lift of
 * <= +15 % for one frame in place of any white flash; `shake`: { f, px, n } a decaying shake of n frames, <= 10 px.
 */
const POST30 = {
  punch: [],
  shake: [
    { f: 22, px: 5, n: 4 }, { f: 324, px: 4, n: 3 }, { f: 360, px: 4, n: 3 }, { f: 855, px: 4, n: 4 }, { f: 895, px: 7, n: 6 },
    { f: 906, px: 4, n: 3 }, { f: CORE_HIT, px: 8, n: 6 },
  ],
};
export function post(cut) {
  if (String(cut) === '30') return POST30;
  const keep = (l) => l.flatMap((x) => mapTo15(x.f).map((f) => ({ ...x, f })));
  return { punch: keep(POST30.punch), shake: keep(POST30.shake) };
}

/** Designed impacts (the music dips under each). */
export const IMPACTS = {
  30: [22, 324, 360, 420, 451, 524, 590, 645, 855, 895, 906, 1120, CORE_HIT],
};
IMPACTS[15] = IMPACTS[30].flatMap((f) => mapTo15(f));

/** End-card plate: the line-up (S17) darkened 35 % and blurred 6 px from END_AT on. */
export const END_PLATE = { darken: 0.65, blur: 6 };
