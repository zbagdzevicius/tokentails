// Trailer "Wild Rivals": the two cuts as data. Seconds on the output clock (60 fps). A segment is a gameplay take
// (`take`: the specs.mjs shot id, `in`: seconds into the take) or a story frame (`gem`: the Gemini image, `move`).
// `card`: the lower-third field card (species glyphs and a season glyph). Words are only the six of the copy plus the
// end card. The score (score.mjs), the motion graphics (mg.js) and the edit (edit.mjs) all read this file.
export const FPS = 60;
export const BPM = 96;
export const BEAT = 60 / BPM; // 0.625 s; the drum line doubles to 192 BPM on the same grid

const S = (t0, t1, o) => ({ t0, t1, ...o });
// v2 (critique 6.3): the hook is the biggest clash (two ults, a dog ring then a cat ring, 0-1.6 s); no documentary
// matte (full frame gameplay); the only stills are the brand comic panels (M, L, C: one look, gemini.mjs --style C);
// the title is set over gameplay in the brand display face; the 60 s ends on the settled end card.
const ULTS30 = ['u-marsh', 'u-pixel', 'u-brutus', 'u-dusty', 'u-mochi', 'u-domino'];
const ULTS60 = ['u-marsh', 'u-pixel', 'u-brutus', 'u-dusty', 'u-mochi', 'u-domino', 'u-frankie', 'u-sage'];
const ULT_SPECIES = { 'u-marsh': 'dog', 'u-pixel': 'cat', 'u-brutus': 'dog', 'u-duchess': 'cat', 'u-ziggy': 'cat', 'u-dusty': 'cat', 'u-mochi': 'cat', 'u-domino': 'dog', 'u-frankie': 'dog', 'u-sage': 'cat' };
const salvo = (t0, ids, step) => ids.map((id, i) => S(+(t0 + i * step).toFixed(3), +(t0 + (i + 1) * step).toFixed(3), { take: id, in: 0.3, card: { sp: [ULT_SPECIES[id]], season: 'frost' }, wipe: i > 0 }));
const HOOK = [
  S(0, 0.8, { take: 'u-duchess', in: 0.0 }), // the dog's blue ring lands on the cats
  S(0.8, 1.6, { take: 'u-ziggy', in: 0.5, wipe: true }), // the cats answer: red ring, combo x8
];

export const CUTS = {
  30: {
    len: 30,
    hookHits: [0, 0.8],
    title: 1.6,
    double: 15.0, // the 192 BPM drum line
    hole: [14.8, 14.9],
    matteOpen: 19.8, // the big chord: the herds meet (still M)
    peak: 25.2, // the loudest hit: the dog core breaks
    end: 27.0,
    out: 29.8,
    segs: [
      ...HOOK,
      S(1.6, 4.4, { take: 'g03-loaf', in: 0.3, card: { sp: ['cat'], season: 'bloom' } }),
      S(4.4, 6.6, { take: 'g05-stalk', in: 0.6, card: { sp: ['cat'], season: 'sun' } }),
      S(6.6, 8.8, { take: 'g04-flop', in: 0.8, card: { sp: ['dog'], season: 'sun' } }),
      S(8.8, 11.2, { take: 'g06-groom', in: 0.4, card: { sp: ['dog', 'cat'], season: 'leaf' } }),
      S(11.2, 15.0, { take: 'g07-howl', in: 0.5, card: { sp: ['dog'], season: 'leaf', moon: true } }),
      ...salvo(15.0, ULTS30, 0.8),
      S(19.8, 21.0, { gem: 'M', move: 'parallax', snow: true }),
      S(21.0, 23.4, { take: 'h-chonk', in: 1.0, card: { sp: ['cat', 'dog'], season: 'frost' } }),
      S(23.4, 24.0, { take: 'h-clem', in: 0.6 }),
      S(24.0, 27.0, { take: 'h-core', in: 1.4 }),
      S(27.0, 30.0, { gem: 'C', move: 'push', end: true }),
    ],
    text: [
      { t0: 1.6, t1: 3.7, word: 'WILD RIVALS', style: 'title' },
      { t0: 4.5, t1: 6.1, word: 'CATS', style: 'cat' },
      { t0: 6.1, t1: 7.0, word: 'VS', style: 'vs' },
      { t0: 7.0, t1: 8.7, word: 'DOGS', style: 'dog' },
      { t0: 15.0, t1: 15.85, word: '3V3', style: 'big' },
    ],
    flashes: [{ t: 21.0, frames: 2 }],
  },
  60: {
    len: 60,
    hookHits: [0, 0.8],
    title: 1.6,
    double: 35.8,
    hole: [35.6, 35.7],
    matteOpen: 43.0,
    peak: 53.6,
    end: 55.6,
    out: 59.8,
    segs: [
      ...HOOK,
      S(1.6, 4.9, { take: 'g03-loaf', in: 0.3, card: { sp: ['cat'], season: 'bloom' } }),
      S(4.9, 7.0, { take: 'g01-purse', in: 1.5, card: { sp: ['dog'], season: 'bloom' } }),
      S(7.0, 10.5, { take: 'g08-nest', in: 0.2, card: { sp: ['cat', 'dog'], season: 'bloom' } }),
      S(10.5, 13.6, { take: 'g21-button', in: 0.2, card: { sp: ['dog'], season: 'bloom' } }),
      S(13.6, 16.9, { take: 'g05-stalk', in: 0.3, card: { sp: ['cat'], season: 'sun' } }),
      S(16.9, 20.3, { take: 'g04-flop', in: 0.3, card: { sp: ['dog'], season: 'sun' } }),
      S(20.3, 22.1, { take: 'g09-box', in: 0.6, card: { sp: ['cat'], season: 'sun' } }),
      S(22.1, 25.6, { take: 'g06-groom', in: 0.2, card: { sp: ['dog', 'cat'], season: 'leaf' } }),
      S(25.6, 28.0, { take: 'g12-shake', in: 0.8, card: { sp: ['dog'], season: 'leaf' } }),
      S(28.0, 29.4, { gem: 'L', move: 'push' }),
      S(29.4, 34.0, { take: 'g07-howl', in: 0.3, card: { sp: ['dog'], season: 'leaf', moon: true } }),
      S(34.0, 35.8, { take: 'g15-slide', in: 0.1, card: { sp: ['dog'], season: 'frost' } }),
      ...salvo(35.8, ULTS60, 0.9),
      S(43.0, 44.4, { gem: 'M', move: 'parallax', snow: true }),
      S(44.4, 49.1, { take: 'h-chonk', in: 0.05, card: { sp: ['cat', 'dog'], season: 'frost' } }),
      S(49.1, 51.0, { take: 'h-clem', in: 0.5 }),
      S(51.0, 55.6, { take: 'h-core', in: 0.0 }),
      S(55.6, 60.0, { gem: 'C', move: 'push', end: true }),
    ],
    text: [
      { t0: 1.6, t1: 3.9, word: 'WILD RIVALS', style: 'title' },
      { t0: 13.7, t1: 15.9, word: 'CATS', style: 'cat' },
      { t0: 15.9, t1: 17.0, word: 'VS', style: 'vs' },
      { t0: 17.0, t1: 19.4, word: 'DOGS', style: 'dog' },
      { t0: 35.8, t1: 36.65, word: '3V3', style: 'big' },
    ],
    flashes: [{ t: 44.4, frames: 2 }, { t: 49.1, frames: 2 }],
  },
};

/** Every take a cut uses, with the take seconds it needs (for the capture check). */
export function takesOf(cut) {
  const m = new Map();
  for (const s of CUTS[cut].segs) if (s.take) m.set(s.take, Math.max(m.get(s.take) ?? 0, s.in + (s.t1 - s.t0)));
  return m;
}
