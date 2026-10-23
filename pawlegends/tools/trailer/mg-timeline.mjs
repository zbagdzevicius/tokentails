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
 * v4: the hook as is; the roll call as eight eighth-note cuts round each hero's apex; 3V3; Moonshot and the charm;
 * Pack Hunt (TRIPLE TAKEDOWN.); the tower toppling (2 beats); the wide teamfight and the first triplet cuts; TAKE THEIR
 * CORE (1 beat) into the core burst (cut f703 = master f1528); the end card from f750 (2.5 s).
 */
export const CUT15_SEGMENTS = [
  [0, 99, 0],
  [100, 112, 106], [113, 124, 117], [125, 137, 131], [138, 149, 142], [150, 162, 156], [163, 174, 168], [175, 187, 180], [188, 199, 196],
  [200, 299, 200],
  [300, 349, 200],
  [350, 399, 275],
  [400, 499, 400],
  [500, 549, 500],
  [550, 599, 650],
  [600, 649, 700],
  [650, 674, 800],
  [675, 749, 825],
  [750, 899, 875],
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
    els.push({ id: 'L2a', kind: 'line', anim: 'slam', land: true, size: v ? 290 : 300, x: cx, y: v ? 400 : 175, maxW: v ? vw : 1400, lines: [c.L2a], in: f, out: out(f + 93), scrim: true, color: 'gold' });
    els.push({ id: 'L2b', kind: 'words', anim: 'slam', rows: v, size: v ? 150 : 140, x: cx, y: v ? 700 : 350, maxW: v ? vw : 1600, words: v ? [{ t: c.L2b1, in: f + 25 }, { t: c.L2b2, in: f + 28 }] : [{ t: c.L2b, in: f + 25 }], out: out(f + 93), scrim: true });
  };
  const big = (id, text, f, o) => els.push({ id, kind: 'line', anim: 'slam', land: true, size: v ? 230 : 280, x: cx, y: v ? 470 : 200, maxW: v ? vw : 1700, lines: [text], in: f, out: out(o), scrim: true, ...(id === 'L4' ? { color: 'gold' } : {}) });
  /** A game word (the barks, the announcer's COMEBACK!, the result Victory!) repeated large, as v1 did: never with the in-game copy on screen. */
  const caption = (id, text, f, o, opt = {}) => els.push({
    id, kind: 'words', anim: opt.anim ?? 'slam', land: true, size: v ? (opt.vsize ?? 230) : (opt.size ?? 170), x: cx, y: v ? (opt.vy ?? 470) : (opt.y ?? 190), maxW: v ? vw : 1500,
    words: [{ t: text, in: f, color: opt.color }], out: out(o), scrim: true,
  });
  // the line over the core sits in the top third (sky and trees); the core and the fight stay in the lower half
  const L5 = (f) => els.push({ id: 'L5', kind: 'line', anim: 'slam', land: true, size: v ? 210 : 250, x: cx, y: v ? 470 : 200, maxW: v ? vw : 1700, lines: v ? [c.L5v1, c.L5v2] : [c.L5], in: f, out: out(f + 33), scrim: true, scrimA: 0.4 });
  if (String(cut) === '30') {
    // v4: CATS (rose) on Clem's hit, VS on the clash, DOGS (blue) on Cacklejaw's pounce, one cut each, each word
    // slammed letter by letter on a dark plate; 9:16 stacked in the upper half
    els.push({
      id: 'L1', kind: 'words', anim: 'slam', land: true, rows: v, size: v ? 250 : 260, x: cx, y: v ? 600 : 210, maxW: v ? vw : 1640, gap: v ? 0 : 70,
      words: [{ t: c.L1a, in: 106, color: 'rose' }, { t: c.L1b, in: 128, color: 'gold' }, { t: c.L1c, in: 153, color: 'blue' }], out: out(193), scrim: true,
    });
    t3v3(400);
    big('L3', c.L3, 500, 523);
    big('L4', c.L4, 875, 896);
    caption('CB', c.CB, 1053, 1071, { color: 'gold', size: 250, vsize: 220 });
    L5(1450);
    caption('WIN', c.WIN, 1578, 1602, { color: 'gold', size: 260, vsize: 240, y: 200 });
    els.push({ id: 'end', kind: 'endcard', logo: 1625, cta: 1650, pulse: [1650, 1770], sub: 1662, url: [1675, 1687], credit: 1690, hops: 1650, stab: 1750, bump: 1750, fade: [1768, 1782], end: 1800 });
  } else {
    t3v3(200);
    big('L3', c.L3, 300, 322);
    big('L4', c.L4, 475, 496);
    L5(650);
    els.push({ id: 'end', kind: 'endcard', logo: 750, cta: 762, pulse: [762, 870], sub: 775, url: [787, 799], credit: 800, hops: 787, stab: 850, bump: 850, fade: [868, 882], end: 900 });
  }
  return els;
}

/**
 * Post moves for the edit (storyboard §3, §4 per-shot Post lines). Flashes are additive blooms (never a solid fill,
 * never on frame 0, at most one per beat, never on a telegraph's first frame): { f, a } = strength a on f, a/2 on f+1.
 * Shake tiers: T1 2 px, T2 5 px, T3 8 px, T4 12 px. rgb = rgbashift for `frames`. bump = the zoom-punch (104 %).
 */
const T = { 1: [2, 4], 2: [5, 7], 3: [8, 10], 4: [12, 18] };
/** The master frame the core bursts on (S31: held 3 frames after it). */
export const CORE_HIT = 1528;
const sh = (f, tier) => ({ f, px: T[tier][0], decay: T[tier][1] });

export function post(cut) {
  if (String(cut) === '30') {
    // flashes are capped (<= 0.45) so no hit bleaches a body white; the core burst and the logo slam alone are big.
    // v4: `white` = an additive white flash laid with the type (the hook contact and the core burst, 2-3 frames);
    // `wipe` = the white diagonal wipe between card looks
    return {
      flash: [
        { f: 53, a: 0.3 }, { f: 78, a: 0.35 }, { f: 106, a: 0.35 }, { f: 128, a: 0.3 }, { f: 153, a: 0.3 }, { f: 262, a: 0.3 },
        { f: 311, a: 0.3 }, { f: 336, a: 0.3 }, { f: 390, a: 0.3 }, { f: 541, a: 0.4 }, { f: 593, a: 0.3 }, { f: 647, a: 0.3 }, { f: 703, a: 0.3 }, { f: 752, a: 0.3 },
        { f: 764, a: 0.3 }, { f: 825, a: 0.3 }, { f: 850, a: 0.3 }, { f: 875, a: 0.35 }, { f: 931, a: 0.3 }, { f: 978, a: 0.3 }, { f: 1028, a: 0.4 },
        { f: 1053, a: 0.35 }, { f: 1103, a: 0.3 }, { f: 1128, a: 0.3 }, { f: 1203, a: 0.3 }, { f: 1262, a: 0.3 },
        { f: 1302, a: 0.3 }, { f: 1319, a: 0.3 }, { f: 1336, a: 0.3 }, { f: 1352, a: 0.3 }, { f: 1369, a: 0.3 }, { f: 1386, a: 0.3 }, { f: 1403, a: 0.35 },
        { f: 1750, a: 0.4 },
      ],
      white: [{ f: 25, a: 0.85 }, { f: 26, a: 0.55 }, { f: 27, a: 0.25 }, { f: CORE_HIT, a: 0.9 }, { f: CORE_HIT + 1, a: 0.55 }, { f: CORE_HIT + 2, a: 0.25 }, { f: 1625, a: 0.6 }, { f: 1626, a: 0.25 }],
      wipe: [{ f: 1183 }, { f: 1191 }],
      shake: [
        sh(25, 4), sh(53, 2), sh(78, 2), sh(106, 2), sh(128, 1), sh(153, 2), sh(262, 2), sh(311, 2), sh(336, 1), sh(390, 2), sh(541, 3), sh(593, 2), sh(647, 2),
        sh(703, 2), sh(764, 3), sh(825, 2), sh(850, 2), sh(875, 3), sh(931, 2), sh(978, 2), sh(1028, 3), sh(1053, 2), sh(1103, 2), sh(1128, 2),
        sh(1200, 1), sh(1262, 2), sh(1302, 1), sh(1336, 1), sh(1369, 1), sh(1403, 2), sh(CORE_HIT, 4), sh(1625, 2), sh(1750, 2),
      ],
      rgb: [{ f: 25, frames: 2 }, { f: 875, frames: 2 }, { f: 1028, frames: 2 }, { f: CORE_HIT, frames: 3 }],
      bump: [{ f: 25 }, { f: 153 }, { f: 541 }, { f: 875 }, { f: 931 }, { f: 1028 }, { f: 1053 }, { f: CORE_HIT }, { f: 1625 }],
      push: [],
    };
  }
  // the 15 s cut: the 30 s accents whose frames it keeps, at its own frames, plus its own end card
  const map = (list, key = 'f') => list.flatMap((x) => CUT15_SEGMENTS.filter(([a, b, d]) => x[key] >= a + d && x[key] <= b + d).map(([, , d]) => ({ ...x, [key]: x[key] - d })));
  const p = post('30');
  const keep = (l) => map(l).filter((x) => x.f < 750);
  return {
    flash: [...keep(p.flash), { f: 850, a: 0.4 }],
    white: [...keep(p.white), { f: 750, a: 0.6 }, { f: 751, a: 0.25 }],
    wipe: keep(p.wipe),
    shake: [...keep(p.shake), sh(750, 2), sh(850, 2)],
    rgb: keep(p.rgb),
    bump: [...keep(p.bump), { f: 750 }],
    push: [],
  };
}

/**
 * v3 mix: the designed impacts of the 30 s master. The edit dips the music 9 dB under each (a 2-frame suck-out before
 * the contact, held 5 frames, released over 8) so every hit's transient stands clear of the band; the 15 s cut keeps
 * those whose frames it uses, at its own frames.
 */
const IMPACTS30 = [25, 53, 78, 106, 128, 153, 262, 311, 336, 390, 541, 593, 647, 703, 729, 764, 825, 850, 875, 906, 931, 978, 1028, 1053, 1103, 1128, 1203, 1262, 1302, 1319, 1336, 1352, 1369, 1386, 1403, CORE_HIT];
export function impacts(cut) {
  if (String(cut) === '30') return IMPACTS30;
  const out = IMPACTS30.flatMap((f) => CUT15_SEGMENTS.filter(([a, b, d]) => f >= a + d && f <= b + d).map(([, , d]) => f - d));
  return out.filter((f) => f < 750);
}

/** Frames (inclusive ranges) where the overlay has anything to draw, for a cut. */
export function overlayRanges(cut, aspect, copy) {
  const r = [];
  const p = post(cut);
  for (const w of p.white ?? []) r.push([w.f, w.f]);
  for (const w of p.wipe ?? []) r.push([w.f - 2, w.f + 2]);
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
  return String(cut) === '30' ? { endbg: [1625, 1799] } : { endbg: [750, 899] };
}
/**
 * v4: the end card's plate is the last gameplay frame (the winners over the rubble), blurred and darkened, with the
 * eight-hero line-up (S40, captured on a key colour, the cut's own frame) laid over its lower part.
 */
export const END_PLATE_SOURCE = 1624;
/** The line-up shot's master frame for an end-card frame of a cut (the 15 s card runs the same loop from its start). */
export const lineupFrame = (cut, f) => (String(cut) === '30' ? f : 1625 + (f - 750));

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
