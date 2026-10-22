/**
 * Motion-graphics timeline (storyboard §2 kinetic type, §3 shot list, §4 text, §6 9:16, §7 15 s cut) as data.
 * Pure module: the browser compositor (mg.js) renders it, Node (type.mjs, the edit) reads its frame ranges and the
 * post list (flashes, shakes, rgbashift) without a browser. Frame numbers are each cut's own (60 fps).
 */

export const ASPECTS = { '16x9': { W: 1920, H: 1080 }, '9x16': { W: 1080, H: 1920 } };
export const CUTS = { 30: 1800, 15: 900 };

/**
 * The 15 s cut as segments of the 30 s master (storyboard §7): [cutFrom, cutTo, offset], so master = cut + offset.
 * Bar 1 as is, S06 with L3, S07-S10, S17 (tower at cut f420), then S23 + the S24 hang, S25-S26 and the end card.
 */
export const CUT15_SEGMENTS = [[0, 119, 0], [120, 359, 120], [360, 479, 480], [480, 899, 840]];

/** Cut frame -> 30 s master frame (the footage's frame numbers). */
export function sourceFrame(cut, f) {
  if (String(cut) === '30') return f;
  for (const [a, b, d] of CUT15_SEGMENTS) if (f >= a && f <= b) return f + d;
  return f;
}

/** UI colour tokens (src/ui/ppk-ui.css). */
export const COLORS = {
  cream: '#FFF8EE',
  cocoa: '#5A3B2E',
  pink: '#F2A2B8',
  pinkDeep: '#E07396',
  pinkDark: '#B8557A',
  gold: '#FFD86B',
  sky: '#8FD3FF',
};

/**
 * Gabė's eyes: in the photo (336x448 px) and on screen in the first S05 turntable frame (the whip lands the
 * card's eyes there, then the cut). Midpoint between the eyes, measured on gabe-photo.webp and the captured S05 f0186.
 */
export const GABE = {
  photo: { w: 336, h: 448, eyes: { x: 117, y: 307 }, spacing: 90 },
  // pupils measured on the S05 capture's f186 (16:9 853/1135 x 606/602; 9:16 423/736 x 1207/1200)
  screenEyes: { '16x9': { x: 994, y: 604 }, '9x16': { x: 580, y: 1204 } },
  /** The model's pupil spacing on screen (px): the whip-zoom ends with the photo's eyes at the same spacing. */
  screenSpacing: { '16x9': 282, '9x16': 313 },
};

/**
 * Elements. kind: 'line' (one or more lines that animate together), 'words' (each word has its own in-frame; `flow`
 * re-centres the words shown so far, so a building line always sits centred), 'photo' (S04/S05 card), 'endcard'.
 * anim: 'slam' | 'pop'. out: { at, hard } (hard = cut with the shot, otherwise the 4-frame OUT). `size` is the font
 * size before fitting; `maxW` the widest a line may be (9:16 type fills 80-90 % of the width, cap height ≤ 160 px);
 * `scrim` lays a soft dark band behind busy footage. CAP* lines repeat the game's own words (barks, announcer
 * banners) word for word, so they read on a phone.
 */
export function timeline(cut, aspect, copy) {
  const v = aspect === '9x16';
  const { W } = ASPECTS[aspect];
  // 9:16: every line inside x 80-940 (clear of the right-side action rail of TikTok, Reels and Shorts), max 860 px
  const cx = v ? 510 : W / 2;
  const c = copy;
  /** 9:16: cap height 160 px (Fredoka 700 cap ≈ 0.7 em), fitted to the 860 px column. */
  const V = 228;
  const vw = 860;
  const els = [];
  const caption = (id, text, f, out, o = {}) => ({
    id, kind: 'words', anim: o.anim ?? 'pop', size: v ? (o.vsize ?? V) : (o.size ?? 120), x: cx, y: v ? (o.vy ?? 700) : (o.y ?? 300), maxW: v ? vw : 1500,
    words: [{ t: text, in: f, color: o.color }], out: { at: out, hard: !!o.hard }, scrim: true,
  });
  if (String(cut) === '30') {
    // frame 0 is already the landed CLANK! (thumbnails and autoplay show the contact, never a blank card)
    els.push({ id: 'CLK', kind: 'words', anim: 'slam', size: v ? 260 : 200, x: cx, y: v ? 640 : 230, maxW: v ? vw : 1500, words: [{ t: c.CLK, in: -12, color: 'gold' }], out: { at: 26 } });
    els.push({ id: 'photo', kind: 'photo', in: 120, zoomAt: 180, out: 240 });
    els.push({
      id: 'L1', kind: 'words', anim: 'pop', size: v ? V : 137, y: v ? 560 : 540, x: v ? cx : 430, maxW: v ? vw : 720, rows: v,
      words: [{ t: c.L1a, in: 126 }, { t: c.L1b, in: 141 }], out: { at: 180, hard: true },
    });
    els.push({ id: 'L2', kind: 'line', anim: 'slam', size: v ? V : 157, x: cx, y: v ? 540 : 930, maxW: v ? vw : 1700, lines: v ? [c.L2v1, c.L2v2] : [c.L2], in: 192, out: { at: 232 }, scrim: true });
    els.push({
      id: 'L3', kind: 'words', anim: 'pop', flow: true, rows: v, size: v ? V : 150, x: cx, y: v ? 760 : 170, maxW: v ? vw : 1600,
      words: [{ t: c.L3a, in: 240 }, { t: c.L3b, in: 270, color: 'gold' }, { t: c.L3c, in: 300 }], out: { at: 350 }, scrim: true,
    });
    // the main value line holds over S11 and S12 (f486-593, storyboard), on a stronger backing plate over the busy grass
    els.push({ id: 'L4', kind: 'line', anim: 'slam', size: v ? 175 : 112, x: cx, y: v ? 820 : 170, maxW: v ? vw : 1700, lines: v ? [c.L4v1, c.L4v2a, c.L4v2b] : [c.L4], in: 486, out: { at: 590 }, scrim: true, scrimA: 0.5 });
    // up the moment both allies are in frame (the cut after the wheel), 0.8 s, over the ally who answers
    els.push(caption('CAP1', c.CAP1, 612, 659, { hard: true, y: 250, vy: 440 }));
    els.push(caption('CAP', c.CAP, 668, 716, { y: 260, vy: 440 }));
    els.push({ id: 'CB', kind: 'line', anim: 'slam', size: v ? V : 170, x: cx, y: v ? 660 : 250, maxW: v ? vw : 1600, lines: [c.CB], in: 1081, out: { at: 1136 }, scrim: true, color: 'gold' });
    els.push({ id: 'CBs', kind: 'words', anim: 'pop', size: v ? 96 : 64, x: cx, y: v ? 820 : 370, maxW: v ? vw : 1500, words: [{ t: c.CBs, in: 1090 }], out: { at: 1136 } });
    els.push(caption('SD', c.SD, 1150, 1199, { anim: 'slam', hard: true, color: 'gold', size: 150, y: 250 }));
    els.push({ id: 'L5', kind: 'line', anim: 'slam', size: v ? 180 : 100, x: cx, y: v ? 420 : 930, maxW: v ? vw : 1700, lines: v ? [c.L5v1, c.L5v2] : [c.L5], in: 1206, out: { at: 1310 }, scrim: true });
    els.push({ id: 'L6', kind: 'words', anim: 'slam', size: v ? 190 : 110, x: cx, y: v ? 700 : 170, rows: v, maxW: v ? vw : 1700, words: [{ t: c.L6a, in: 1326 }, { t: c.L6b, in: 1356 }], out: { at: 1410, hard: true }, scrim: true });
    // 9:16: in the y 700-1100 band, clear of the bottom 420 px the platforms' captions cover
    els.push(caption('WIN', c.WIN, 1500, 1559, { anim: 'slam', hard: true, color: 'gold', size: 230, y: 860, vsize: 270, vy: 1000 }));
    els.push({ id: 'end', kind: 'endcard', logo: 1560, cta: 1590, pulse: [1620, 1770], sub: 1620, url: [1650, 1665], credit: 1650, bump: 1740, fade: [1764, 1787], end: 1800 });
  } else {
    els.push({ id: 'CLK', kind: 'words', anim: 'slam', size: v ? 260 : 200, x: cx, y: v ? 640 : 230, maxW: v ? vw : 1500, words: [{ t: c.CLK, in: -12, color: 'gold' }], out: { at: 26 } });
    els.push({
      id: 'L3', kind: 'words', anim: 'pop', flow: true, rows: v, size: v ? V : 150, x: cx, y: v ? 760 : 170, maxW: v ? vw : 1600,
      words: [{ t: c.L3a, in: 120 }, { t: c.L3b, in: 150, color: 'gold' }, { t: c.L3c, in: 180 }], out: { at: 230 }, scrim: true,
    });
    els.push({ id: 'L4', kind: 'line', anim: 'slam', size: v ? 175 : 112, x: cx, y: v ? 820 : 170, maxW: v ? vw : 1700, lines: v ? [c.L4v1, c.L4v2a, c.L4v2b] : [c.L4], in: 246, out: { at: 350 }, scrim: true });
    els.push({ id: 'L6', kind: 'words', anim: 'slam', size: v ? 190 : 110, x: cx, y: v ? 700 : 170, rows: v, maxW: v ? vw : 1700, words: [{ t: c.L6a, in: 486 }, { t: c.L6b, in: 516 }], out: { at: 570, hard: true }, scrim: true });
    els.push(caption('WIN', c.WIN, 660, 719, { anim: 'slam', hard: true, color: 'gold', size: 230, y: 860, vsize: 270, vy: 1000 }));
    // the URL is up from f762 and holds to the fade at f884 (2 s readable)
    els.push({ id: 'end', kind: 'endcard', logo: 720, cta: 735, pulse: [750, 880], sub: 748, url: [758, 773], credit: 758, bump: 840, fade: [880, 895], end: 900 });
  }
  return els;
}

/**
 * Post accents for the edit (storyboard §2 Flashes, per-shot Post lines). Flashes are additive blooms the edit lays
 * over the picture (never a solid fill, never on frame 0, never two within 4 frames): { f, a } = a bloom of strength
 * a (0.4-0.6) on f and half of it on f + 1. Shakes, rgbashift and digital pushes move the footage underneath.
 *   flash: { f, a }   shake: { f, px, decay }  rgb: { f, frames }  push: { f0, f1, from, to, ease, area }
 */
export function post(cut) {
  if (String(cut) === '30') {
    return {
      flash: [
        { f: 1, a: 0.5 }, { f: 90, a: 0.55 }, { f: 186, a: 0.6 }, { f: 240, a: 0.5 }, { f: 372, a: 0.45 }, { f: 594, a: 0.4 }, { f: 720, a: 0.5 }, { f: 900, a: 0.65 },
        { f: 1080, a: 0.45 }, { f: 1150, a: 0.4 }, { f: 1230, a: 0.4 }, { f: 1260, a: 0.4 }, { f: 1290, a: 0.4 },
        { f: 1440, a: 0.7 }, { f: 1500, a: 0.45 }, { f: 1560, a: 0.55 },
      ],
      shake: [
        { f: 0, px: 6, decay: 10 }, { f: 90, px: 6, decay: 9 }, { f: 197, px: 2, decay: 3 }, { f: 240, px: 4, decay: 8 }, { f: 491, px: 2, decay: 3 }, { f: 720, px: 8, decay: 12 },
        { f: 900, px: 10, decay: 14 }, { f: 1086, px: 3, decay: 5 }, { f: 1155, px: 2, decay: 3 }, { f: 1211, px: 2, decay: 3 }, { f: 1331, px: 2, decay: 3 }, { f: 1361, px: 2, decay: 3 },
        { f: 1440, px: 10, decay: 18 }, { f: 1505, px: 3, decay: 5 }, { f: 1565, px: 6, decay: 10 },
      ],
      rgb: [{ f: 0, frames: 2 }, { f: 90, frames: 2 }, { f: 900, frames: 2 }, { f: 1440, frames: 2 }],
      bump: [{ f: 1230, frames: 4 }, { f: 1260, frames: 4 }, { f: 1290, frames: 4 }],
      push: [],
    };
  }
  return {
    flash: [{ f: 1, a: 0.5 }, { f: 90, a: 0.55 }, { f: 120, a: 0.5 }, { f: 252, a: 0.45 }, { f: 420, a: 0.65 }, { f: 600, a: 0.7 }, { f: 660, a: 0.45 }, { f: 720, a: 0.55 }],
    shake: [
      { f: 0, px: 6, decay: 10 }, { f: 90, px: 6, decay: 9 }, { f: 120, px: 4, decay: 8 }, { f: 251, px: 2, decay: 3 }, { f: 420, px: 10, decay: 14 }, { f: 491, px: 2, decay: 3 },
      { f: 521, px: 2, decay: 3 }, { f: 600, px: 10, decay: 18 }, { f: 665, px: 3, decay: 5 }, { f: 725, px: 6, decay: 10 },
    ],
    rgb: [{ f: 0, frames: 2 }, { f: 90, frames: 2 }, { f: 420, frames: 2 }, { f: 600, frames: 2 }],
    bump: [],
    push: [],
  };
}

/** Frames (inclusive ranges) where the overlay has anything to draw, for a cut. */
export function overlayRanges(cut, aspect, copy) {
  const r = [];
  for (const e of timeline(cut, aspect, copy)) {
    if (e.kind === 'photo') continue;
    else if (e.kind === 'black') for (const f of e.at) r.push([f, f]);
    else if (e.kind === 'endcard') r.push([e.logo, e.end - 1]);
    else {
      const first = Math.max(0, e.kind === 'words' ? Math.min(...e.words.map((w) => w.in)) : e.in);
      r.push([first, e.out.hard ? e.out.at - 1 : e.out.at + 3]);
    }
  }
  // the skin flips' sparkle bursts
  if (String(cut) === '30') for (const f of [1230, 1260, 1290]) r.push([f, f + 14]);
  return mergeRanges(r);
}

/** Frames where the compositor writes an opaque plate (the S04 photo card; the end-card background). */
export function plateRanges(cut) {
  return String(cut) === '30' ? { photo: [120, 239], endbg: [1560, 1799] } : { endbg: [720, 899] };
}

export function mergeRanges(r) {
  const s = [...r].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
