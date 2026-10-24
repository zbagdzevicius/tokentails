/**
 * Trailer v3 timeline as data (pure: the browser compositor mg.js, the score and the edit all read it). Frames are each
 * cut's own (60 fps, 144 BPM: 25 frames per beat).
 *
 * Type rules (storyboard §5): every word slams in whole at 118 % and settles in 6 frames (no ghost glyphs, no stacked
 * copies), exits with a 12° mask wipe that has fully cleared 3 frames before the next cut, and sits over open ground,
 * never over the fight. Five lines in all, every string from v3/copy.json (copy gate: lint-copy.mjs).
 */

import { TAGS } from './tags.mjs';

export const ASPECTS = { '16x9': { W: 1920, H: 1080 }, '9x16': { W: 1080, H: 1920 } };
export const CUTS = { 30: 1800, 15: 900 };
export const BEAT_FRAMES = 25;

/**
 * The 15 s cut as segments of the 30 s master: [cutFrom, cutTo, offset] (master = cut + offset). v3.2: every offset is
 * a multiple of 25 frames (one beat at 144 BPM), so the spliced score never jumps off the beat grid.
 */
export const CUT15 = [
  // v3.9: the crane is 200 frames (an eased rise, a settled descent), S02 75 frames of the fight from its first frame
  [0, 199, 0], // the exchange and the crane to the whole Crossing, CATS VS DOGS
  [200, 274, 0], // 3V3 IN YOUR BROWSER (S02 master 200-274, the real HUD)
  [275, 324, 75], // Cacklejaw's Pack Hunt on Gabė (S04 master 350-399)
  [325, 374, 225], // Gabė's Under Her Spell (S09 master 550-599)
  [375, 474, 375], // TOPPLE THEIR TOWERS. over Clem's hits, the cut-in on the crack and the fall (master 750-849)
  [475, 639, 500], // TAKE THEIR CORE., the core falls, VICTORY! (S15 master 975-1139)
  [640, 689, 500], // INSPIRED BY REAL CATS. (S18 master 1140-1189: Lambo, 50 frames)
  [690, 899, 750], // TEAM CAT OR TEAM DOG? (S17 master 1440-1514, 75 frames), then the end card (master 1515-1649)
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
// v3.7 (review: the name tags sat in a fixed lower-left corner, far from heroes 5 % of the frame tall, so a name could
// not be matched to its hero): every tag is anchored right next to its hero, at the free spot nearest the hero's
// projected box over the tag's frames (the capture QC's hero, plate, pop and structure boxes, and the HUD)
// v3.8 (review: CACKLEJAW still sat under Gabė, GABĖ beside Sir Brutus): each tag is placed by place-tags.mjs from the
// captured shots' QC, under its own hero's ground ring (tags.mjs); POS / POS_V are the fallbacks before a first capture
export const POS = { L2: [0.75, 0.62], M1: [0.5, 0.82], M2: [0.5, 0.88], N3: [0.33, 0.6], N4: [0.42, 0.6], N6: [0.56, 0.59], N7: [0.43, 0.6], N8: [0.48, 0.56], N9: [0.62, 0.49], N10: [0.54, 0.59], ...(TAGS['16x9'] ?? {}) };
export const POS_V = { N3: [0.22, 0.61], N4: [0.35, 0.63], N6: [0.66, 0.62], N7: [0.33, 0.62], N8: [0.48, 0.74], N9: [0.74, 0.55], N10: [0.74, 0.62], ...(TAGS['9x16'] ?? {}) };
/** v3.8: each roll-call tag's hero (the QC's hero id) and the tags' type size per aspect (16:9 84 px: read on a phone). */
export const TAG_SUBJECTS = { N3: 'clem', N4: 'cacklejaw', N6: 'brutus', N7: 'aviete', N8: 'bengas', N9: 'gabe', N10: 'lambo' };
export const TAG_SIZE = { '16x9': 84, '9x16': 90 };

/** v3.8: TAKE THEIR (centre) in 16:9; CORE. sits 0.1 below it. */
export const M3_POS = [0.24, 0.74];

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
// v3.9: S15 is 190 frames at 1x; the crack on f1067 (its anchor), the shockwave ring and the boom on f1075 (the audio
// review: the boom came 13 frames after the visible break)
export const CORE_HIT = 1075;
/** v3.9: the frame the doghouse visibly cracks (S15's anchor): its own crack transient in the score. */
export const CORE_CRACK = 1067;

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
  // v3.6: the 9:16 crane keeps yaw 0 (no quarter orbit), so CATS sits over the cat side (left) and DOGS over the dog
  // side (right) in 9:16 too, mirroring the landscape offsets
  // v3.7: the 9:16 crane turns a quarter (the Crossing down the tall frame): CATS on the cat half (between the cat base and the
  // river), VS on the river, DOGS on the dog half, read top to bottom; out on f97 as the crane starts down
  // v3.8 (review: in 9:16 all three words were up 0.4 s, over a crane still turning): the crane is up and still by f54;
  // CATS f55, VS f62, DOGS f69, all three held to f135 (1.1 s) in both aspects; the descent starts as they wipe
  // v3.9: the rise eases to f70 (the 9:16 quarter turn to f72): CATS f72, VS f77, DOGS f83, all held to f143 (DOGS a
  // second), wiped before the descent (16:9 from f147, 9:16 turning back from f146); 9:16 VS on the open water west of
  // the fight on the centre sandbar (the review: VS covered Clem and Sir Brutus)
  if (v) {
    add('L1a', c.L1a, 72, 143, 0.5, 0.36, 130, 'cat');
    add('L1b', c.L1b, 77, 143, 0.3, 0.5, 80, 'plain');
    add('L1c', c.L1c, 83, 143, 0.5, 0.74, 130, 'dog');
  } else {
    add('L1a', c.L1a, 72, 143, 0.335, 0.47, 120, 'cat');
    add('L1b', c.L1b, 77, 143, 0.5, 0.5, 80, 'plain');
    add('L1c', c.L1c, 83, 143, 0.665, 0.53, 120, 'dog');
  }
  // S02: 3V3 IN YOUR BROWSER on the beats (f175, f200) in open meadow, clear of the six and the HUD
  // v3.6 (take V10): 16:9 right of the six, clear of the score bar and its portraits; 9:16 above them
  // v3.8: S02 opens on f175 (3V3 slams two frames after the cut); 16:9 IN YOUR BROWSER at 80 px (56 px read at ~10 px
  // in a vertical feed)
  // v3.9: S02 opens on f200 (take W9: the six round Pudding's pad); 3V3 on f202, IN YOUR BROWSER on the f225 beat
  // (both placed by place-tags.mjs in the free space round the six and Pudding)
  const l2 = TAGS[aspect]?.L2 ?? (v ? [0.5, 0.205] : [0.75, 0.45]);
  if (v) {
    add('L2a', c.L2a, 202, 285, l2[0], l2[1], 150, 'gold');
    add('L2b', c.L2b, 225, 285, l2[0], l2[1] + 0.085, 70, 'plain');
  } else {
    // v3.9: IN YOUR / BROWSER in two lines (one 840 px line found no free band round the six, Pudding and the HUD)
    add('L2a', c.L2a, 202, 285, l2[0], l2[1], 120, 'gold');
    add('L2b', c.L2b1, 225, 285, l2[0], l2[1] + 0.095, 80, 'plain');
    add('L2c', c.L2b2, 227, 285, l2[0], l2[1] + 0.17, 80, 'plain');
  }
  // v3.4 name tags: who each rivalry and champion shot is (cats in rose, dogs in navy), in at the shot's second
  // beat-eighth, out 10 frames before its cut
  for (const [id, key, f0, style] of [['N3', 'N_CLEM', 300, 'cat'], ['N4', 'N_CACK', 350, 'dog'], ['N6', 'N_BRUTUS', 400, 'dog'], ['N7', 'N_AVIETE', 450, 'cat'], ['N8', 'N_BENGAS', 500, 'cat'], ['N9', 'N_GABE', 550, 'cat'], ['N10', 'N_LAMBO', 600, 'cat']]) {
    const [x, y] = (v ? POS_V : POS)[id] ?? (v ? [0.5, 0.74] : [0.2, 0.84]);
    add(id, c[key], f0 + 4, f0 + 39, x, y, TAG_SIZE[aspect], style);
  }
  // the mission, one line per beat (S11 push, S13 tower, S16 Pudding, S15 core)
  // v3.8: S11 is 75 frames (650-724), so PUSH YOUR LANE. holds 655-715; v3.9: TOPPLE THEIR TOWERS. over Clem's hits
  // on the tower (S13, 727-795), wiped before the cut-in on its crack (S13B, f800)
  add('M1', c.M1, 655, 715, 0.5, v ? 0.74 : POS.M1[1], v ? 96 : 100, 'gold');
  // (TOPPLE THEIR TOWERS. at the free spot nearest the lower centre: place-tags.mjs)
  // (v3.8: 9:16 in two lines, TOPPLE THEIR / TOWERS., in the open band above the fight between the jungle camps and
  // the dog core; on the lower band it lay over Bengas and the falling tower, and one line does not fit the band)
  const m2 = TAGS[aspect]?.M2 ?? [0.5, v ? 0.2 : POS.M2[1]];
  if (v) {
    add('M2a', c.M2v1, 727, 795, m2[0], m2[1], 72, 'gold');
    add('M2b', c.M2v2, 731, 795, m2[0], m2[1] + 0.058, 100, 'gold');
  } else add('M2', c.M2, 727, 795, m2[0], m2[1], 96, 'gold');
  // (v3.7: CALM PUDDING. is cut with its shot; the mission is the three beats lane, towers, core)
  // v3.9: S15 is f950-1139: TAKE THEIR on f960, CORE. on f967, wiped on f1055 (before the crack on f1067)
  if (v) {
    const m3v = TAGS['9x16']?.M3 ?? [0.5, 0.14];
    add('M3a', c.M3v1, 960, 1055, m3v[0], m3v[1], 96, 'gold');
    add('M3b', c.M3v2, 967, 1055, m3v[0], m3v[1] + 0.06, 124, 'gold');
  } else {
    // v3.8 (review: 66 px, top right over busy trees): 80 / 120 px in the clear lower left over the dog plaza (S15 now
    // frames the fight in the middle with the doghouse below it)
    const m3 = TAGS['16x9']?.M3 ?? M3_POS;
    add('M3a', c.M3v1, 960, 1055, m3[0], m3[1], 80, 'gold');
    add('M3b', c.M3v2, 967, 1055, m3[0], m3[1] + 0.1, 120, 'gold');
  }
  // S15: VICTORY! as the doghouse caves in (CORE_HIT); v3.7: beside the break, never on it (the review: laid on the
  // core's break and dust it hid the payoff): 16:9 over the pond right of the core, 9:16 over the trees above the fight
  // v3.8: 16:9 at the free spot nearest the top left (place-tags.mjs; S15 is reframed on the fight, the break below
  // it), 124 px
  const m6 = v ? (TAGS['9x16']?.M6 ?? [0.5, 0.22]) : (TAGS['16x9']?.M6 ?? [0.745, 0.5]);
  // v3.9: held to f1130 (S15 cuts on f1139)
  add('M6', c.M6, CORE_HIT + 1, 1130, m6[0], m6[1], v ? 140 : 124, 'gold');
  // S18: INSPIRED BY REAL CATS. over the game's pick screen, under the detail panel (16:9) / under the panel (9:16)
  // v3.9: the pick screen is f1140-1424 (four champions, ~71 frames each); the card's own "Inspired by" line is hidden
  if (v) {
    add('M4a', c.M4v1, 1145, 1415, 0.5, 0.715, 84, 'plain');
    add('M4b', c.M4v2, 1151, 1415, 0.5, 0.775, 110, 'cat');
  } else {
    add('M4a', c.M4v1, 1145, 1415, 0.235, 0.83, 84, 'plain');
    // (the landing variant's longer line, REAL SHELTER CATS., smaller so it stays left of the pedestal)
    add('M4b', c.M4v2, 1151, 1415, 0.235, 0.92, c.M4v2.length > 12 ? 70 : 96, 'cat');
  }
  // S17: TEAM CAT under the cats, OR between, TEAM DOG? under the dogs (16:9); 9:16 TEAM CAT above the cat row,
  // OR between the rows, TEAM DOG? below the dog row, all inside the platforms' safe band (y 0.12-0.78)
  if (v) {
    add('M5a', c.M5a, 1430, 1590, 0.5, 0.14, 130, 'cat');
    // v3.6: the line-up raised and pulled back: OR in the gap between the rows, TEAM DOG? in its own band under the
    // dog pedestals (v3.5 printed it across them)
    add('M5b', c.M5b, 1437, 1590, 0.5, 0.45, 64, 'plain');
    add('M5c', c.M5c, 1443, 1590, 0.5, 0.75, 110, 'dog');
  } else {
    add('M5a', c.M5a, 1430, 1590, 0.25, 0.83, 110, 'cat');
    add('M5b', c.M5b, 1437, 1590, 0.5, 0.83, 84, 'plain');
    add('M5c', c.M5c, 1443, 1590, 0.75, 0.83, 100, 'dog');
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
    // v3.7: 3V3 slams after the cut (not whole on its first frame) and IN YOUR BROWSER gets a second; TAKE THEIR CORE.
    // staggers in after its cut and holds 68 frames, gone before VICTORY! (557)
    // v3.8: the crane's landing holds to f174, so 3V3 slams on f177 and IN YOUR BROWSER on f181 (1 s)
    // v3.9: 3V3 on f202, IN YOUR BROWSER on f205 (held to f265); TAKE THEIR CORE. f477-559 (wiped by the crack, f567)
    const own = { M5a: [692, 757], M5b: [699, 757], M5c: [705, 757], L2a: [202, 265], L2b: [205, 265], L2c: [207, 265], M3a: [477, 559], M3b: [480, 559] }[id];
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
    { f: 22, px: 5, n: 4 }, { f: 324, px: 4, n: 3 }, { f: 360, px: 4, n: 3 }, { f: 805, px: 4, n: 4 }, { f: 845, px: 7, n: 6 },
    { f: 906, px: 4, n: 3 }, { f: CORE_CRACK, px: 3, n: 3 }, { f: CORE_HIT, px: 8, n: 6 },
  ],
};
export function post(cut) {
  if (String(cut) === '30') return POST30;
  const keep = (l) => l.flatMap((x) => mapTo15(x.f).map((f) => ({ ...x, f })));
  return { punch: keep(POST30.punch), shake: keep(POST30.shake) };
}

/** Designed impacts (the music dips under each). */
export const IMPACTS = {
  30: [22, 324, 360, 420, 452, 524, 649, 805, 845, 906, CORE_CRACK, CORE_HIT],
};
IMPACTS[15] = IMPACTS[30].flatMap((f) => mapTo15(f));

/** End-card plate: the line-up (S17) darkened 35 % and blurred 6 px from END_AT on. */
export const END_PLATE = { darken: 0.65, blur: 6 };
