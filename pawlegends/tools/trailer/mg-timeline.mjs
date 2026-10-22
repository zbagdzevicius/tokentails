/**
 * Motion-graphics timeline, trailer v2 ("Big Plays", storyboard §3 kinetic type, §4 post moves, §5 text, §7 9:16 and
 * 15 s cut) as data. Pure module: the browser compositor (mg.js) renders it; Node (type.mjs, score.mjs, the edit)
 * reads its frame ranges, the 15 s segment map and the post list without a browser. Frame numbers are each cut's own
 * (60 fps, 144 BPM: 25 frames per beat). The v1 timeline is mg-timeline-v1.mjs.
 */

export const ASPECTS = { '16x9': { W: 1920, H: 1080 }, '9x16': { W: 1080, H: 1920 } };
export const CUTS = { 30: 1800, 15: 900 };
export const BPM = 144;
export const BEAT_FRAMES = (60 * 60) / BPM;

/**
 * The 15 s cut as segments of the 30 s master (storyboard §7): [cutFrom, cutTo, offset], so master = cut + offset.
 * The hook as is; the roll call as eight eighth-note cuts round each hero's contact; 3V3; four ults (Moonshot, the
 * charm, Aviete with BIG PLAYS., Golden Hour); Pack Hunt; the tower falling (2 beats); the final teamfight; TAKE THEIR
 * CORE (1 beat) into the core impact (cut f700); the end card (a plate: no footage) from f750, 2.5 s.
 */
export const CUT15_SEGMENTS = [
  [0, 99, 0],
  [100, 112, 100], [113, 124, 112], [125, 137, 129], [138, 149, 137], [150, 162, 150], [163, 174, 170], [175, 187, 175], [188, 199, 200],
  [200, 299, 200],
  [300, 324, 216], [325, 349, 292], [350, 374, 350], [375, 399, 377],
  [400, 499, 400],
  [500, 549, 500],
  [550, 649, 750],
  [650, 674, 812],
  [675, 749, 825],
  [750, 899, 900],
];

/** Cut frame -> 30 s master frame (the footage's frame numbers). */
export function sourceFrame(cut, f) {
  if (String(cut) === '30') return f;
  for (const [a, b, d] of CUT15_SEGMENTS) if (f >= a && f <= b) return f + d;
  return f;
}

/** UI colour tokens (src/ui/ppk-ui.css), plus the team colours of the title. */
export const COLORS = {
  cream: '#FFF8EE',
  cocoa: '#5A3B2E',
  pink: '#F2A2B8',
  pinkDeep: '#E07396',
  pinkDark: '#B8557A',
  gold: '#FFD86B',
  sky: '#8FD3FF',
  rose: '#FF7FA8',
  blue: '#7FC4FF',
};

/** Kept for mg.js (the v1 photo card; v2 draws no photo). */
export const GABE = { photo: { w: 336, h: 448, eyes: { x: 117, y: 307 }, spacing: 90 }, screenEyes: { '16x9': { x: 994, y: 604 }, '9x16': { x: 580, y: 1204 } }, screenSpacing: { '16x9': 282, '9x16': 313 } };

/**
 * Elements. kind: 'line' (lines that animate together), 'words' (each word its own in-frame; `rows` stacks them),
 * 'endcard'. anim: 'slam' | 'pop'. out: { at, wipe } (wipe = the 4-frame mask wipe on a 12° diagonal; hard = cut).
 * `land`: the slam's shake-on-land (2 px at +5). `size` before fitting; `maxW` the widest a line may be. 9:16 type
 * stays in x 80-940 and out of the top 14 % and bottom 20 % (platform UI).
 */
export function timeline(cut, aspect, copy) {
  const v = aspect === '9x16';
  const { W } = ASPECTS[aspect];
  const cx = v ? 510 : W / 2;
  const c = copy;
  const vw = 860;
  const els = [];
  const out = (at) => ({ at, wipe: true });
  const t3v3 = (f) => {
    els.push({ id: 'L2a', kind: 'line', anim: 'slam', land: true, size: v ? 260 : 190, x: cx, y: v ? 440 : 150, maxW: v ? vw : 1400, lines: [c.L2a], in: f, out: out(f + 90), scrim: true, color: 'gold' });
    els.push({ id: 'L2b', kind: 'words', anim: 'pop', rows: v, size: v ? 140 : 96, x: cx, y: v ? 640 : 275, maxW: v ? vw : 1500, words: v ? [{ t: c.L2b1, in: f + 25 }, { t: c.L2b2, in: f + 28 }] : [{ t: c.L2b, in: f + 25 }], out: out(f + 90), scrim: true });
  };
  const big = (id, text, f, o) => els.push({ id, kind: 'line', anim: 'slam', land: true, size: v ? 230 : 170, x: cx, y: v ? 470 : 170, maxW: v ? vw : 1500, lines: [text], in: f, out: out(o), scrim: true, ...(id === 'L4' ? { color: 'gold' } : {}) });
  /** A game word (the barks, the announcer's COMEBACK!, the result Victory!) repeated large, as v1 did: never with the in-game copy on screen. */
  const caption = (id, text, f, o, opt = {}) => els.push({
    id, kind: 'words', anim: opt.anim ?? 'slam', land: true, size: v ? (opt.vsize ?? 230) : (opt.size ?? 170), x: cx, y: v ? (opt.vy ?? 470) : (opt.y ?? 190), maxW: v ? vw : 1500,
    words: [{ t: text, in: f, color: opt.color }], out: out(o), scrim: true,
  });
  // the line over the core sits in the top third (sky and trees); the core and the fight stay in the lower half
  const L5 = (f) => els.push({ id: 'L5', kind: 'line', anim: 'slam', land: true, size: v ? 190 : 160, x: cx, y: v ? 470 : 170, maxW: v ? vw : 1500, lines: v ? [c.L5v1, c.L5v2] : [c.L5], in: f, out: out(f + 34), scrim: true, scrimA: 0.4 });
  if (String(cut) === '30') {
    // CATS (rose, left) / VS (centre) / DOGS (blue, right) on the sky band above the clash; 9:16 stacked in the upper half
    els.push({
      id: 'L1', kind: 'words', anim: 'slam', land: true, rows: v, size: v ? 200 : 190, x: cx, y: v ? 600 : 200, maxW: v ? vw : 1700, gap: v ? 0 : 60,
      words: [{ t: c.L1a, in: 100, color: 'rose' }, { t: c.L1b, in: 125, anim: 'pop', color: 'gold' }, { t: c.L1c, in: 150, color: 'blue' }], out: out(190), scrim: true,
    });
    t3v3(400);
    big('L3', c.L3, 500, 519);
    big('L4', c.L4, 700, 722);
    caption('CAP1', c.CAP1, 912, 921, { anim: 'pop', size: 120, vsize: 150, color: 'cream' });
    caption('CB', c.CB, 1056, 1092, { color: 'gold', size: 190, vsize: 230 });
    L5(1450);
    caption('WIN', c.WIN, 1580, 1642, { color: 'gold', size: 220, vsize: 250 });
    els.push({ id: 'end', kind: 'endcard', logo: 1650, cta: 1662, pulse: [1662, 1788], sub: 1672, url: [1680, 1692], credit: 1680, bump: 1750, fade: [1800, 1800], end: 1800 });
  } else {
    t3v3(200);
    big('L4', c.L4, 350, 372);
    L5(650);
    els.push({ id: 'end', kind: 'endcard', logo: 750, cta: 762, pulse: [762, 888], sub: 772, url: [780, 792], credit: 780, bump: 850, fade: [900, 900], end: 900 });
  }
  return els;
}

/**
 * Post moves for the edit (storyboard §3, §4 per-shot Post lines). Flashes are additive blooms (never a solid fill,
 * never on frame 0, at most one per beat, never on a telegraph's first frame): { f, a } = strength a on f, a/2 on f+1.
 * Shake tiers: T1 2 px, T2 5 px, T3 8 px, T4 12 px. rgb = rgbashift for `frames`. bump = the zoom-punch (104 %).
 */
const T = { 1: [2, 4], 2: [5, 7], 3: [8, 10], 4: [12, 18] };
const sh = (f, tier) => ({ f, px: T[tier][0], decay: T[tier][1] });

export function post(cut) {
  if (String(cut) === '30') {
    // flashes are capped (≤ 0.45) so no hit bleaches a body white; the core impact alone is a big bloom held 3 frames
    return {
      flash: [
        { f: 25, a: 0.45 }, { f: 52, a: 0.35 }, { f: 78, a: 0.4 }, { f: 262, a: 0.3 }, { f: 303, a: 0.35 }, { f: 541, a: 0.4 }, { f: 575, a: 0.3 },
        { f: 622, a: 0.3 }, { f: 752, a: 0.3 }, { f: 764, a: 0.35 }, { f: 825, a: 0.3 }, { f: 850, a: 0.3 }, { f: 875, a: 0.35 }, { f: 940, a: 0.3 },
        { f: 991, a: 0.35 }, { f: 1006, a: 0.45 }, { f: 1125, a: 0.35 }, { f: 1203, a: 0.3 }, { f: 1275, a: 0.3 }, { f: 1406, a: 0.35 }, { f: 1428, a: 0.4 },
        { f: 1525, a: 0.75 }, { f: 1650, a: 0.5 },
      ],
      shake: [
        sh(25, 3), sh(52, 2), sh(78, 2), sh(262, 2), sh(303, 2), sh(392, 2), sh(400, 1), sh(541, 3), sh(655, 2), sh(764, 3), sh(825, 2), sh(850, 2), sh(875, 3),
        sh(940, 2), sh(991, 2), sh(1006, 3), sh(1056, 1), sh(1125, 3), sh(1203, 2), sh(1275, 2), sh(1300, 1), sh(1406, 2), sh(1428, 3), sh(1525, 4), sh(1650, 2),
      ],
      rgb: [{ f: 25, frames: 2 }, { f: 78, frames: 2 }, { f: 541, frames: 2 }, { f: 875, frames: 2 }, { f: 1006, frames: 2 }, { f: 1525, frames: 3 }],
      bump: [{ f: 25 }, { f: 541 }, { f: 1006 }, { f: 1525 }],
      push: [],
    };
  }
  // the 15 s cut: the 30 s accents whose frames it keeps, at its own frames, plus its own end card
  const map = (list, key = 'f') => list.flatMap((x) => CUT15_SEGMENTS.filter(([a, b, d]) => x[key] >= a + d && x[key] <= b + d).map(([, , d]) => ({ ...x, [key]: x[key] - d })));
  const p = post('30');
  const keep = (l) => map(l).filter((x) => x.f < 750);
  return {
    flash: [...keep(p.flash), { f: 750, a: 0.5 }],
    shake: [...keep(p.shake), sh(750, 2)],
    rgb: keep(p.rgb),
    bump: keep(p.bump),
    push: [],
  };
}

/** Frames (inclusive ranges) where the overlay has anything to draw, for a cut. */
export function overlayRanges(cut, aspect, copy) {
  const r = [];
  for (const e of timeline(cut, aspect, copy)) {
    if (e.kind === 'endcard') r.push([e.logo, e.end - 1]);
    else {
      const first = Math.max(0, e.kind === 'words' ? Math.min(...e.words.map((w) => w.in)) : e.in);
      r.push([first, e.out.hard ? e.out.at - 1 : e.out.at + 3]);
    }
  }
  return mergeRanges(r);
}

/** Frames where the compositor writes an opaque plate (the end-card background), and the footage frame it blurs. */
export function plateRanges(cut) {
  return String(cut) === '30' ? { endbg: [1650, 1799] } : { endbg: [750, 899] };
}
/** v2 redo: the end card is a clean branded plate (no blurred footage under it). */
export const END_PLATE_SOURCE = null;

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
