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

/** The 15 s cut as segments of the 30 s master: [cutFrom, cutTo, offset] (master = cut + offset; offsets on the beat). */
export const CUT15 = [
  [0, 149, 0], // the hook and CATS VS DOGS
  [150, 199, 25], // 3V3 IN YOUR BROWSER (S02 f175-224)
  [200, 249, 50], // CLANK (S03)
  [250, 299, 100], // Moonshot (S05)
  [300, 349, 150], // Avietė (S07)
  [350, 399, 200], // Gabė (S09)
  [400, 449, 200], // Lambo (S10)
  [450, 549, 300], // the tower falls (S13)
  [550, 649, 550], // TAKE THEIR CORE. (S15)
  [650, 749, 630], // the core bursts on f670 (S16 master f1300), then the cave-in and VICTORY!
  [750, 824, 715], // TEAM CAT OR TEAM DOG? (S17; TEAM DOG? up from f775)
  [825, 899, 800], // the end card (S18)
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

/** The end card's first frame (the logo slam on the downbeat) per cut. */
export const END_AT = { 30: 1625, 15: 825 };

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
  // S01: CATS over the cat meadow, VS on the river, DOGS over the dog meadow (the crane's whole-map view)
  if (v) {
    add('L1a', c.L1a, 75, 118, 0.27, 0.42, 170, 'cat');
    add('L1b', c.L1b, 88, 118, 0.5, 0.5, 110, 'plain');
    add('L1c', c.L1c, 100, 118, 0.73, 0.58, 170, 'dog');
  } else {
    add('L1a', c.L1a, 75, 118, 0.32, 0.5, 150, 'cat');
    add('L1b', c.L1b, 88, 118, 0.5, 0.5, 100, 'plain');
    add('L1c', c.L1c, 100, 118, 0.68, 0.5, 150, 'dog');
  }
  // S02: 3V3 IN YOUR BROWSER (the top band, over open ground; six heroes and their plates below it)
  add('L2a', c.L2a, 155, 232, 0.5, v ? 0.1 : 0.13, v ? 170 : 150, 'gold');
  add('L2b', c.L2b, 175, 232, 0.5, v ? 0.17 : 0.25, v ? 80 : 84, 'plain');
  // S07-S10: INSPIRED BY REAL CATS. (the top band, held across the four champions)
  if (v) {
    add('M4a', c.M4v1, 460, 640, 0.5, 0.09, 84, 'plain');
    add('M4b', c.M4v2, 468, 640, 0.5, 0.15, 110, 'cat');
  } else {
    // 16:9: INSPIRED BY under Avietė (S07: a fight above her fills the top band), REAL CATS. over Bengas, Gabė, Lambo
    add('M4a', c.M4v1, 460, 494, 0.5, 0.88, 92, 'plain');
    add('M4b', c.M4v2, 505, 640, 0.5, 0.11, 110, 'cat');
  }
  // S11-S12: the mission, beat by beat
  add('M1', c.M1, 655, 692, 0.5, v ? 0.11 : 0.12, v ? 104 : 110, 'gold');
  // (16:9: the calming cats stand above Pudding, so the line sits in the bottom band)
  add('M2', c.M2, 708, 742, 0.5, v ? 0.11 : 0.86, v ? 104 : 110, 'gold');
  // S15: TAKE THEIR CORE. (two lines in 9:16, inside 80 % of the width)
  if (v) {
    add('M3a', c.M3v1, 1105, 1190, 0.5, 0.1, 110, 'gold');
    add('M3b', c.M3v2, 1112, 1190, 0.5, 0.17, 140, 'gold');
  } else add('M3', c.M3, 1105, 1190, 0.5, 0.12, 120, 'gold');
  // S16: VICTORY! once the core has burst
  add('M6', c.M6, 1345, 1442, 0.5, v ? 0.11 : 0.13, v ? 150 : 150, 'gold');
  // S17: TEAM CAT (over the cats) OR TEAM DOG? (over the dogs)
  if (v) {
    add('M5a', c.M5a, 1455, 1610, 0.5, 0.1, 140, 'cat');
    add('M5b', c.M5b, 1475, 1610, 0.5, 0.425, 70, 'plain');
    add('M5c', c.M5c, 1490, 1610, 0.5, 0.478, 110, 'dog');
  } else {
    add('M5a', c.M5a, 1455, 1610, 0.27, 0.15, 110, 'cat');
    add('M5b', c.M5b, 1475, 1610, 0.515, 0.15, 64, 'plain');
    add('M5c', c.M5c, 1490, 1610, 0.76, 0.15, 100, 'dog');
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
      const on = m >= f && m <= out + 3;
      if (on && r0 < 0) r0 = k;
      if (on && r0 >= 0) r1 = k;
      if (!on && r0 >= 0) break;
    }
    if (r0 < 0 || r1 - r0 < 20) continue;
    const natural = sourceFrame(15, r1) >= out + 3;
    w(id, text, r0, natural ? r1 - 3 : r1 - 6, x, y, size, style);
  }
  return els;
}

/** The end card: logo slam, CTA, URL, credit (cut frames); held sharp to the last frame. */
export function endCard(cut) {
  return String(cut) === '30' ? { logo: 1625, cta: 1650, url: 1675, credit: 1700, end: 1800 } : { logo: 825, cta: 840, url: 846, credit: 852, end: 900 };
}

/**
 * Picture accents for the edit (master frames; the 15 s cut keeps those it shows). `punch`: an exposure lift of
 * <= +15 % for one frame in place of any white flash; `shake`: { f, px, n } a decaying shake of n frames, <= 10 px.
 */
const POST30 = {
  // (no exposure punch on the core burst: the burst's own flash is the hit; a lift on top put 31 % of the frame at white)
  punch: [{ f: 25, k: 0.05 }],
  shake: [
    { f: 25, px: 8, n: 5 }, { f: 262, px: 5, n: 3 }, { f: 790, px: 4, n: 4 }, { f: 830, px: 7, n: 6 },
    { f: 866, px: 4, n: 3 }, { f: 992, px: 6, n: 4 }, { f: 1133, px: 7, n: 5 }, { f: 1300, px: 8, n: 6 }, { f: 1336, px: 6, n: 8 },
  ],
};
export function post(cut) {
  if (String(cut) === '30') return POST30;
  const keep = (l) => l.flatMap((x) => mapTo15(x.f).map((f) => ({ ...x, f })));
  return { punch: keep(POST30.punch), shake: keep(POST30.shake) };
}

/** Designed impacts (the music dips under each). */
export const IMPACTS = {
  30: [25, 262, 790, 830, 866, 992, 1133, 1300, 1336],
};
IMPACTS[15] = IMPACTS[30].flatMap((f) => mapTo15(f));

/** End-card plate: the line-up (S17) darkened 35 % and blurred 6 px from END_AT on. */
export const END_PLATE = { darken: 0.65, blur: 6 };
