// Grudge Tour edit plans, rev 2 (frames at 60 fps; 150 BPM = 24 frames a beat, 96 a bar).
// The thread: MEATBALL (cat) vs SIR BRUTUS (dog), named up front, carried map to map, paid off by the Hearthwood
// Lullaby teamfight right before an animated end card (the same two on the poster). No in-shot white flashes.
// A shot: { a, b (exclusive), kind: 'take'|'still'|'card', take, src (s into the take), still, route, text, tag }
export const FPS = 60;
export const BEAT = 24;
const T = (take, a, b, src, extra = {}) => ({ kind: 'take', take, a, b, src, ...extra });

// key-action time inside each take (s), from specs.mjs `ev`
export const EV = { 't01-hook': 0.15, 't02-brutus': 1.27, 't03-ridge-sage': 0.9, 't04-ridge-howler': 0.6, 't05-thicket-stilts': 1.13, 't07-quarry-nova': 0.6, 't08-crossing-lambo': 1.17, 't09-hearthwood': 1.47, 't10-hw-mochi': 1.0, 't11-ridge-pudding': 3.03, 't20-nugget': 0.4, 't09-hwlong': 1.47 };
export const SALVO = ['ziggy', 'duchess', 'chili', 'dusty', 'barkula', 'frankie', 'meatball', 'clem'].map((h) => `salvo-${h}-native`);

function salvo(list, a0, len = 48) {
  return list.map((t, i) => T(t, a0 + i * len, a0 + (i + 1) * len, 0.2, { wipe: i > 0 }));
}
const MEATBALL = (f, b) => ({ name: 'MEATBALL', sub: 'BOWLING ROLL', side: 'cat', por: 'meatball', f, b });
const BRUTUS = (f, b) => ({ name: 'SIR BRUTUS', sub: "CHAMPION'S CHALLENGE", side: 'dog', por: 'brutus', f, b });

export const CUT30 = {
  name: '30', frames: 1800,
  shots: [
    T('t01-hook', 0, 72, 0.08),
    T('t01-hook', 72, 144, 1.28, { tag: MEATBALL(76, 144) }),
    T('t02-brutus', 144, 240, 0.9, { tag: BRUTUS(150, 210), ballOut: [210, 240] }),
    { kind: 'still', still: 'atlas', a: 240, b: 288, route: ['pitch', 'ridge'], stamps: ['pitch'], text: { w: 'ONE GRUDGE', f: 240, side: 'bolt', small: true } },
    T('t03-ridge-sage', 288, 408, 0.5, { ballIn: [288, 306], text: { w: 'CATS', f: 312, side: 'cat' } }),
    T('t04-ridge-howler', 408, 504, 0.5, { text: { w: 'DOGS', f: 408, side: 'dog' } }),
    T('t05-thicket-stilts', 504, 600, 1.0),
    { kind: 'still', still: 'atlas', a: 600, b: 648, route: ['thicket', 'quarry'], stamps: ['pitch', 'ridge', 'thicket'], text: { w: 'SIX MAPS', f: 600, side: 'bolt', small: true } },
    T('t07-quarry-nova', 648, 768, 0.4, { ballIn: [648, 664] }),
    T('t08-crossing-lambo', 768, 888, 0.7),
    { kind: 'still', still: 'chase', a: 888, b: 936, parallax: true },
    ...salvo(SALVO, 936),
    { kind: 'still', still: 'atlas', a: 1320, b: 1368, route: ['crossing', 'hearthwood'], stamps: ['pitch', 'ridge', 'thicket', 'quarry', 'crossing'], text: { w: '5V5', f: 1320, side: 'bolt', small: true } },
    T('t09-hearthwood', 1368, 1644, 1.0, { climax: true }),
    { kind: 'card', still: 'endposter', a: 1644, b: 1800 },
  ],
};

export const CUT60 = {
  name: '60', frames: 3600,
  shots: [
    T('t01-hook', 0, 72, 0.08),
    T('t01-hook', 72, 240, 1.28, { tag: MEATBALL(84, 236) }),
    T('t02-brutus', 240, 432, 0.4, { tag: BRUTUS(252, 396), ballOut: [396, 432] }),
    { kind: 'still', still: 'atlas', a: 432, b: 504, route: ['pitch', 'ridge'], stamps: ['pitch'], text: { w: 'ONE GRUDGE', f: 432, side: 'bolt', small: true } },
    T('t03-ridge-sage', 504, 768, 0.3, { ballIn: [504, 522], text: { w: 'CATS', f: 540, side: 'cat' } }),
    T('t04-ridge-howler', 768, 960, 0.3, { text: { w: 'DOGS', f: 768, side: 'dog' } }),
    T('t05-thicket-stilts', 960, 1200, 0.3),
    { kind: 'still', still: 'atlas', a: 1200, b: 1260, route: ['thicket', 'quarry'], stamps: ['pitch', 'ridge', 'thicket'], text: { w: 'SIX MAPS', f: 1200, side: 'bolt', small: true } },
    T('t07-quarry-nova', 1260, 1500, 0.3, { ballIn: [1260, 1276] }),
    T('t08-crossing-lambo', 1500, 1740, 0.3),
    { kind: 'still', still: 'atlas', a: 1740, b: 1788, route: ['crossing', 'ridge'], stamps: ['pitch', 'ridge', 'thicket', 'quarry', 'crossing'], tangle: true },
    { kind: 'still', still: 'pudding', a: 1788, b: 1848, push: 1.08 },
    T('t11-ridge-pudding', 1848, 2040, 1.6),
    { kind: 'still', still: 'truce', a: 2040, b: 2088, parallax: true },
    // rev 3: the pastel Nugget walk (t20) is cut; its 4 s go to longer ult salvos and the Hearthwood finale
    { kind: 'still', still: 'chase', a: 2088, b: 2136, parallax: true },
    ...salvo(SALVO, 2136, 72),
    { kind: 'still', still: 'atlas', a: 2712, b: 2772, route: ['crossing', 'hearthwood'], stamps: ['pitch', 'ridge', 'thicket', 'quarry', 'crossing'], text: { w: '5V5', f: 2712, side: 'bolt', small: true } },
    // rev 3: only Mochi's 2 s skirmish; the finale is one long Lullaby teamfight (a 9.2 s capture of the same match)
    T('t10-hw-mochi', 2772, 2892, 3.0),
    T('t09-hwlong', 2892, 3420, 0.0, { climax: true }),
    { kind: 'card', still: 'endposter', a: 3420, b: 3600 },
  ],
};
