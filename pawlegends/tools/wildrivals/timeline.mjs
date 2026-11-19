// Trailer "Wild Rivals": the two cuts as data. Seconds on the output clock (60 fps). A segment is a gameplay take
// (`take`: the specs.mjs shot id, `in`: seconds into the take) or a story frame (`gem`: the Gemini image, `move`).
// `card`: the lower-third field card (species glyphs and a season glyph). Words are only the six of the copy plus the
// end card. The score (score.mjs), the motion graphics (mg.js) and the edit (edit.mjs) all read this file.
export const FPS = 60;
export const BPM = 96;
export const BEAT = 60 / BPM; // 0.625 s; the drum line doubles to 192 BPM on the same grid

const S = (t0, t1, o) => ({ t0, t1, ...o });
const ULTS30 = ['u-marsh', 'u-pixel', 'u-brutus', 'u-duchess', 'u-ziggy', 'u-dusty', 'u-mochi', 'u-domino'];
const ULTS60 = ['u-marsh', 'u-pixel', 'u-brutus', 'u-duchess', 'u-ziggy', 'u-dusty', 'u-mochi', 'u-domino', 'u-frankie', 'u-sage'];
const ULT_SPECIES = { 'u-marsh': 'dog', 'u-pixel': 'cat', 'u-brutus': 'dog', 'u-duchess': 'cat', 'u-ziggy': 'cat', 'u-dusty': 'cat', 'u-mochi': 'cat', 'u-domino': 'dog', 'u-frankie': 'dog', 'u-sage': 'cat' };
const salvo = (t0, ids, step = 0.78) => ids.map((id, i) => S(+(t0 + i * step).toFixed(3), +(t0 + (i + 1) * step).toFixed(3), { take: id, in: 0.3, card: { sp: [ULT_SPECIES[id]], season: 'frost' }, wipe: i > 0 }));

export const CUTS = {
  30: {
    len: 30,
    double: 15.0, // the 192 BPM drum line
    hole: [14.8, 14.9], // a 6-frame silent hole before it
    matteOpen: 21.2, // the documentary breaks (the matte opens) on the migration painting
    peak: 24.4, // the loudest hit: the dog core breaks
    end: 25.0,
    out: 29.8,
    segs: [
      S(0, 1.4, { take: 'g01-purse', in: 1.0, card: { sp: ['dog'], season: 'bloom' } }),
      S(1.4, 3.2, { gem: 'A', move: 'pan', reveal: true }),
      S(3.2, 5.6, { take: 'g03-loaf', in: 0.6, card: { sp: ['cat'], season: 'bloom' } }),
      S(5.6, 7.5, { take: 'g04-flop', in: 0.85, card: { sp: ['dog'], season: 'sun' } }),
      S(7.5, 9.4, { take: 'g05-stalk', in: 0.8, card: { sp: ['cat'], season: 'sun' } }),
      S(9.4, 11.9, { take: 'g06-groom', in: 0.5, card: { sp: ['dog', 'cat'], season: 'leaf' } }),
      S(11.9, 15.0, { take: 'g07-howl', in: 0.5, card: { sp: ['dog'], season: 'leaf', moon: true } }),
      ...salvo(15.0, ULTS30),
      S(21.24, 22.4, { gem: 'B', move: 'parallax', snow: true }),
      S(22.4, 23.6, { take: 'h-chonk', in: 1.0, card: { sp: ['cat', 'dog'], season: 'frost' } }),
      S(23.6, 24.2, { take: 'h-clem', in: 0.6 }),
      S(24.2, 25.0, { take: 'h-core', in: 2.4 }),
      S(25.0, 30.0, { gem: 'C', move: 'push', end: true }),
    ],
    text: [
      { t0: 1.6, t1: 3.2, word: 'WILD RIVALS', style: 'title' },
      { t0: 3.8, t1: 5.6, word: 'CATS', style: 'cat' },
      { t0: 5.6, t1: 7.5, word: 'VS', style: 'vs' },
      { t0: 7.5, t1: 9.4, word: 'DOGS', style: 'dog' },
      { t0: 15.0, t1: 16.6, word: '3V3', style: 'big' },
    ],
    flashes: [{ t: 22.4, frames: 2 }],
  },
  60: {
    len: 60,
    double: 36.0,
    hole: [35.8, 35.9],
    matteOpen: 43.8,
    matteBack: 57.0,
    peak: 51.2,
    end: 53.0,
    out: 59.8,
    segs: [
      S(0, 1.4, { take: 'g01-purse', in: 1.0, card: { sp: ['dog'], season: 'bloom' } }),
      S(1.4, 4.0, { gem: 'A', move: 'pan', reveal: true }),
      S(4.0, 5.2, { gem: 'D', wheel: 'bloom' }),
      S(5.2, 8.4, { take: 'g03-loaf', in: 0.3, card: { sp: ['cat'], season: 'bloom' } }),
      S(8.4, 12.0, { take: 'g08-nest', in: 0.2, card: { sp: ['cat', 'dog'], season: 'bloom' } }),
      S(12.0, 12.8, { gem: 'D', wheel: 'sun' }),
      S(12.8, 16.0, { take: 'g04-flop', in: 0.4, card: { sp: ['dog'], season: 'sun' } }),
      S(16.0, 19.2, { take: 'g05-stalk', in: 0.3, card: { sp: ['cat'], season: 'sun' } }),
      S(19.2, 20.0, { gem: 'E', move: 'push' }),
      S(20.0, 22.0, { take: 'g09-box', in: 0.4, card: { sp: ['cat'], season: 'sun' } }),
      S(22.0, 22.8, { gem: 'D', wheel: 'leaf' }),
      S(22.8, 26.0, { take: 'g06-groom', in: 0.3, card: { sp: ['dog', 'cat'], season: 'leaf' } }),
      S(26.0, 29.2, { take: 'g12-shake', in: 0.3, card: { sp: ['dog'], season: 'leaf' } }),
      S(29.2, 33.6, { take: 'g07-howl', in: 0.4, card: { sp: ['dog'], season: 'leaf', moon: true } }),
      S(33.6, 34.4, { gem: 'D', wheel: 'frost' }),
      S(34.4, 36.0, { take: 'g15-slide', in: 0.3, card: { sp: ['dog'], season: 'frost' } }),
      ...salvo(36.0, ULTS60),
      S(43.8, 45.4, { gem: 'B', move: 'parallax', snow: true }),
      S(45.4, 50.0, { take: 'h-chonk', in: 0.1, card: { sp: ['cat', 'dog'], season: 'frost' } }),
      S(50.0, 50.8, { take: 'h-clem', in: 0.55 }),
      S(50.8, 53.0, { take: 'h-core', in: 2.2 }),
      S(53.0, 57.0, { gem: 'C', move: 'push', end: true }),
      S(57.0, 60.0, { take: 'g21-button', in: 0.3, card: { sp: ['dog'], season: 'bloom' } }),
    ],
    text: [
      { t0: 1.6, t1: 4.0, word: 'WILD RIVALS', style: 'title' },
      { t0: 5.6, t1: 8.4, word: 'CATS', style: 'cat' },
      { t0: 12.8, t1: 16.0, word: 'VS', style: 'vs' },
      { t0: 16.0, t1: 19.2, word: 'DOGS', style: 'dog' },
      { t0: 36.0, t1: 37.6, word: '3V3', style: 'big' },
    ],
    flashes: [{ t: 45.4, frames: 2 }, { t: 50.0, frames: 2 }],
  },
};

/** Every take a cut uses, with the take seconds it needs (for the capture check). */
export function takesOf(cut) {
  const m = new Map();
  for (const s of CUTS[cut].segs) if (s.take) m.set(s.take, Math.max(m.get(s.take) ?? 0, s.in + (s.t1 - s.t0)));
  return m;
}
