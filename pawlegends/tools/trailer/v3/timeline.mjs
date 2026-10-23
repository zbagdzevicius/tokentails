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
  [150, 224, 25], // 3V3 IN YOUR BROWSER (S02 master 175-249, the real HUD)
  [225, 274, 75], // Clem's Tumble at Sir Brutus (S03)
  [275, 324, 75], // Cacklejaw's Pack Hunt (S04)
  [325, 374, 125], // Avietė's Short Circuit (S07)
  [375, 424, 175], // Gabė's Under Her Spell (S09)
  [425, 524, 375], // the dog tower falls, TOPPLE THEIR TOWERS. (S13 master 800-899)
  [525, 664, 725], // TAKE THEIR CORE., the core falls, VICTORY! (S15 master 1250-1389)
  [665, 739, 725], // INSPIRED BY REAL CATS. (S18 master 1390-1464, the pick screen)
  [740, 774, 775], // TEAM CAT OR TEAM DOG? (S17 master 1515-1549)
  [775, 899, 825], // the end card (its own timing: endCard(15)), over the line-up (master 1600-1724)
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
export const END_AT = { 30: 1600, 15: 775 };

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
  // S01 (v3.3): CATS VS DOGS in the open meadow right of the takedown at 1.3x the gameplay height (placed by a
  // free-space search over every frame's hero, plate and pop boxes); the whole line holds 42 frames and is gone 10 frames before the cut
  if (v) {
    add('L1a', c.L1a, 70, 132, 0.66, 0.62, 150, 'cat');
    add('L1b', c.L1b, 80, 132, 0.66, 0.71, 100, 'plain');
    add('L1c', c.L1c, 90, 132, 0.66, 0.8, 150, 'dog');
  } else {
    add('L1a', c.L1a, 70, 132, 0.52, 0.74, 130, 'cat');
    add('L1b', c.L1b, 80, 132, 0.655, 0.74, 96, 'plain');
    add('L1c', c.L1c, 90, 132, 0.8, 0.74, 130, 'dog');
  }
  // S02: 3V3 IN YOUR BROWSER over the open meadow right of the fight (the HUD's top bar and ability bar clear)
  if (v) {
    add('L2a', c.L2a, 155, 285, 0.5, 0.2, 170, 'gold');
    add('L2b', c.L2b, 175, 285, 0.5, 0.28, 80, 'plain');
  } else {
    add('L2a', c.L2a, 155, 285, 0.75, 0.2, 120, 'gold');
    add('L2b', c.L2b, 175, 285, 0.74, 0.3, 56, 'plain');
  }
  // the mission, one line per beat, each held over a second (S11 push, S13 tower, S15 core)
  add('M1', c.M1, 665, 785, 0.5, v ? 0.8 : 0.82, v ? 96 : 100, 'gold');
  add('M2', c.M2, 822, 935, 0.5, v ? 0.84 : 0.86, v ? 80 : 84, 'gold');
  if (v) {
    add('M3a', c.M3v1, 1165, 1300, 0.5, 0.11, 110, 'gold');
    add('M3b', c.M3v2, 1172, 1300, 0.5, 0.18, 140, 'gold');
  } else {
    add('M3a', c.M3v1, 1165, 1300, 0.84, 0.16, 66, 'gold');
    add('M3b', c.M3v2, 1172, 1300, 0.84, 0.245, 96, 'gold');
  }
  // S15: VICTORY! after the doghouse breaks (the burst on CORE_HIT), below it
  add('M6', c.M6, CORE_HIT + 1, 1382, 0.5, v ? 0.86 : 0.84, v ? 140 : 150, 'gold');
  // S18: INSPIRED BY REAL CATS. over the game's pick screen, under the detail panel (16:9) / under the panel (9:16)
  if (v) {
    add('M4a', c.M4v1, 1395, 1490, 0.5, 0.86, 84, 'plain');
    add('M4b', c.M4v2, 1401, 1490, 0.5, 0.92, 110, 'cat');
  } else {
    add('M4a', c.M4v1, 1395, 1490, 0.235, 0.84, 72, 'plain');
    // (the landing variant's longer line, REAL SHELTER CATS., smaller so it stays left of the pedestal)
    add('M4b', c.M4v2, 1401, 1490, 0.235, 0.92, c.M4v2.length > 12 ? 70 : 96, 'cat');
  }
  // S17: TEAM CAT under the cats, OR between, TEAM DOG? under the dogs (16:9); 9:16 TEAM CAT above the cat row,
  // OR between the rows, TEAM DOG? below the dog row
  if (v) {
    add('M5a', c.M5a, 1505, 1590, 0.5, 0.08, 130, 'cat');
    add('M5b', c.M5b, 1512, 1590, 0.5, 0.5, 64, 'plain');
    add('M5c', c.M5c, 1518, 1590, 0.5, 0.94, 110, 'dog');
  } else {
    add('M5a', c.M5a, 1505, 1590, 0.2, 0.83, 110, 'cat');
    add('M5b', c.M5b, 1512, 1590, 0.5, 0.83, 64, 'plain');
    add('M5c', c.M5c, 1518, 1590, 0.8, 0.83, 100, 'dog');
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
  // v3.3: the 15 s end card is its own 125-frame timeline (the URL up from 805: 1.6 s on screen)
  return String(cut) === '30' ? { logo: 1600, cta: 1625, url: 1650, credit: 1675, end: 1800 } : { logo: 775, cta: 790, url: 805, credit: 820, end: 900 };
}

/**
 * Picture accents for the edit (master frames; the 15 s cut keeps those it shows). `punch`: an exposure lift of
 * <= +15 % for one frame in place of any white flash; `shake`: { f, px, n } a decaying shake of n frames, <= 10 px.
 */
const POST30 = {
  punch: [],
  shake: [
    { f: 11, px: 6, n: 4 }, { f: 324, px: 4, n: 3 }, { f: 862, px: 4, n: 4 }, { f: 897, px: 7, n: 6 },
    { f: 1015, px: 4, n: 3 }, { f: CORE_HIT, px: 8, n: 6 },
  ],
};
export function post(cut) {
  if (String(cut) === '30') return POST30;
  const keep = (l) => l.flatMap((x) => mapTo15(x.f).map((f) => ({ ...x, f })));
  return { punch: keep(POST30.punch), shake: keep(POST30.shake) };
}

/** Designed impacts (the music dips under each). */
export const IMPACTS = {
  30: [11, 232, 324, 366, 420, 451, 524, 577, 645, 862, 897, 1015, CORE_HIT],
};
IMPACTS[15] = IMPACTS[30].flatMap((f) => mapTo15(f));

/** End-card plate: the line-up (S17) darkened 35 % and blurred 6 px from END_AT on. */
export const END_PLATE = { darken: 0.65, blur: 6 };
