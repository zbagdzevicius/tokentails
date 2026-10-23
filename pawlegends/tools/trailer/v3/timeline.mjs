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
  [0, 149, 0], // the hook and CATS VS DOGS
  [150, 199, 25], // 3V3 IN YOUR BROWSER (S02 master 175-224, the real HUD)
  [200, 249, 50], // Clem at Sir Brutus (S03)
  [250, 299, 100], // Sage's Moonshot (S05)
  [300, 349, 150], // Avietė's Short Circuit (S07)
  [350, 399, 200], // Gabė's Under Her Spell (S09)
  [400, 499, 350], // the dog tower falls (S13)
  [500, 599, 600], // TAKE THEIR CORE. (S15 master 1100-1199)
  [600, 774, 650], // the core falls and VICTORY! (S16 master 1250-1355), INSPIRED BY REAL CATS. (S18, the pick screen)
  [775, 824, 725], // TEAM CAT OR TEAM DOG? (S17 master 1500-1549)
  [825, 899, 800], // the end card (S17 master 1625-1699)
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
  // S01: CATS over the cat meadow, VS on the river, DOGS over the dog meadow (the crane's whole-map view); v3.2: the
  // whole line holds 42 frames (f90-132) and is gone 10 frames before the cut
  if (v) {
    add('L1a', c.L1a, 70, 132, 0.27, 0.42, 170, 'cat');
    add('L1b', c.L1b, 80, 132, 0.5, 0.5, 110, 'plain');
    add('L1c', c.L1c, 90, 132, 0.73, 0.58, 170, 'dog');
  } else {
    add('L1a', c.L1a, 70, 132, 0.335, 0.5, 140, 'cat');
    add('L1b', c.L1b, 80, 132, 0.5, 0.5, 100, 'plain');
    add('L1c', c.L1c, 90, 132, 0.655, 0.5, 136, 'dog');
  }
  // S02: 3V3 IN YOUR BROWSER over the open river right of the six heroes (16:9: placed by the free-space search over
  // every frame's hero, plate and pop boxes; 9:16: the band's dark top margin)
  if (v) {
    add('L2a', c.L2a, 155, 236, 0.5, 0.17, 170, 'gold');
    add('L2b', c.L2b, 175, 236, 0.5, 0.245, 80, 'plain');
  } else {
    add('L2a', c.L2a, 155, 236, 0.75, 0.41, 120, 'gold');
    add('L2b', c.L2b, 175, 236, 0.75, 0.52, 60, 'plain');
  }
  // S11-S12: the mission, beat by beat (CALM PUDDING. in the top band, clear of Pudding and the game's banner)
  add('M1', c.M1, 655, 688, 0.5, v ? 0.575 : 0.625, v ? 96 : 104, 'gold');
  add('M2', c.M2, 704, 741, v ? 0.5 : 0.8, v ? 0.43 : 0.42, v ? 84 : 62, 'gold');
  // S15: TAKE THEIR CORE. (two lines in 9:16)
  if (v) {
    add('M3a', c.M3v1, 1105, 1190, 0.5, 0.11, 110, 'gold');
    add('M3b', c.M3v2, 1112, 1190, 0.5, 0.18, 140, 'gold');
  } else {
    // 16:9: two lines in the open plaza left of the doghouse (clear of the core, its bar and the cats)
    add('M3a', c.M3v1, 1105, 1190, 0.165, 0.8, 66, 'gold');
    add('M3b', c.M3v2, 1112, 1190, 0.165, 0.885, 96, 'gold');
  }
  // S16: VICTORY! from the killing blow to the cut (a full second, in the 15 s cut too), below the burst
  add('M6', c.M6, 1296, 1347, 0.5, 0.8, 150, 'gold');
  // S18: INSPIRED BY REAL CATS. as one lockup over the game's pick screen (its footer row hidden), never over gameplay
  if (v) {
    add('M4a', c.M4v1, 1362, 1441, 0.5, 0.79, 84, 'plain');
    add('M4b', c.M4v2, 1368, 1441, 0.5, 0.85, 110, 'cat');
  } else {
    // 16:9: one two-line lockup in the pick screen's own column, under the detail panel (its footer row is hidden)
    add('M4a', c.M4v1, 1362, 1441, 0.235, 0.84, 72, 'plain');
    add('M4b', c.M4v2, 1368, 1441, 0.235, 0.92, 96, 'cat');
  }
  // S17: TEAM CAT (over the cats) OR TEAM DOG? (over the dogs)
  if (v) {
    add('M5a', c.M5a, 1455, 1610, 0.5, 0.1, 140, 'cat');
    add('M5b', c.M5b, 1475, 1610, 0.5, 0.455, 64, 'plain');
    add('M5c', c.M5c, 1490, 1610, 0.5, 0.5, 100, 'dog');
  } else {
    add('M5a', c.M5a, 1455, 1610, 0.27, 0.22, 110, 'cat');
    add('M5b', c.M5b, 1475, 1610, 0.48, 0.22, 64, 'plain');
    add('M5c', c.M5c, 1490, 1610, 0.69, 0.22, 100, 'dog');
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
    // v3.2: the 8-frame exit ends with the run (a line cut by the splice leaves on its own, never half-drawn)
    const natural = sourceFrame(15, r1) >= out + 8;
    w(id, text, r0, natural ? r1 - 8 : r1 - 9, x, y, size, style);
  }
  return els;
}

/** The end card: logo slam, CTA, URL, credit (cut frames); held sharp to the last frame. */
export function endCard(cut) {
  return String(cut) === '30' ? { logo: 1625, cta: 1650, url: 1675, credit: 1700, end: 1800 } : { logo: 825, cta: 850, url: 862, credit: 875, end: 900 };
}

/**
 * Picture accents for the edit (master frames; the 15 s cut keeps those it shows). `punch`: an exposure lift of
 * <= +15 % for one frame in place of any white flash; `shake`: { f, px, n } a decaying shake of n frames, <= 10 px.
 */
const POST30 = {
  // (no exposure punch on the core burst: the burst's own flash is the hit)
  punch: [{ f: 25, k: 0.05 }],
  shake: [
    { f: 25, px: 8, n: 5 }, { f: 274, px: 4, n: 3 }, { f: 790, px: 4, n: 4 }, { f: 830, px: 7, n: 6 },
    { f: 882, px: 4, n: 3 }, { f: 974, px: 5, n: 4 }, { f: 1300, px: 8, n: 6 },
  ],
};
export function post(cut) {
  if (String(cut) === '30') return POST30;
  const keep = (l) => l.flatMap((x) => mapTo15(x.f).map((f) => ({ ...x, f })));
  return { punch: keep(POST30.punch), shake: keep(POST30.shake) };
}

/** Designed impacts (the music dips under each). */
export const IMPACTS = {
  30: [25, 274, 324, 374, 420, 790, 824, 882, 974, 1300],
};
IMPACTS[15] = IMPACTS[30].flatMap((f) => mapTo15(f));

/** End-card plate: the line-up (S17) darkened 35 % and blurred 6 px from END_AT on. */
export const END_PLATE = { darken: 0.65, blur: 6 };
