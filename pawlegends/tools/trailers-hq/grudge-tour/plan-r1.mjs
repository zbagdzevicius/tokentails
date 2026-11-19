// Grudge Tour edit plans (frames at 60 fps; 150 BPM = 24 frames a beat, 96 a bar).
// A shot: { a, b (exclusive), kind: 'take'|'still'|'card', take, src (s into the take), ev (frame of the key hit, abs),
//          still, route, text, flash }
export const FPS = 60;
export const BEAT = 24;
const T = (take, a, b, src, extra = {}) => ({ kind: 'take', take, a, b, src, ...extra });

// key-action time inside each take (s), from specs.mjs `ev`
export const EV = { 't01-hook': 0.15, 't03-ridge-sage': 0.9, 't04-ridge-howler': 0.6, 't05-thicket-stilts': 1.13, 't07-quarry-nova': 0.6, 't08-crossing-lambo': 1.17, 't09-hearthwood': 1.47, 't11-ridge-pudding': 3.03, 't14-ridge-calmed': 1.8, 't20-nugget': 0.4, 't12-goal-native': 1.73, 't18-goal-frost': 3.13 };
export const SALVO30 = ['ziggy', 'brutus', 'duchess', 'chili', 'dusty', 'barkula', 'frankie', 'clem'].map((h) => `salvo-${h}-native`);
export const SALVO60 = ['ziggy', 'brutus', 'duchess', 'chili', 'dusty', 'barkula', 'frankie', 'meatball', 'brutus2', 'clem'].map((h) => `salvo-${h}-frost`);

function salvo(list, a0) {
  return list.map((t, i) => T(t, a0 + i * 48, a0 + (i + 1) * 48, 0.2, { wipe: i > 0, pips: [i + 1, i + 1, list.length] }));
}

export const CUT30 = {
  name: '30', frames: 1800,
  shots: [
    T('t01-hook', 0, 72, 0.08, { flash: 2, flashAt: 4, ballOut: [50, 72] }),
    { kind: 'still', still: 'atlas', a: 72, b: 120, route: ['pitch', 'ridge'], stamps: ['pitch'] },
    T('t03-ridge-sage', 120, 264, 0.5, { ballIn: [120, 138], text: { w: 'CATS', f: 168, side: 'cat' } }),
    T('t04-ridge-howler', 264, 336, 0.5, { text: { w: 'VS', f: 264, side: 'bolt' } }),
    T('t05-thicket-stilts', 336, 456, 1.0, { text: { w: 'DOGS', f: 336, side: 'dog' } }),
    { kind: 'still', still: 'atlas', a: 456, b: 504, route: ['thicket', 'quarry'], stamps: ['pitch', 'ridge', 'thicket'] },
    T('t07-quarry-nova', 504, 648, 0.4, { ballIn: [504, 520], text: { w: '3V3', f: 504, side: 'bolt' } }),
    T('t08-crossing-lambo', 648, 768, 0.7),
    T('t09-hearthwood', 768, 936, 0.9),
    { kind: 'still', still: 'chase', a: 936, b: 984, parallax: true },
    ...salvo(SALVO30, 984),
    T('t12-goal-native', 1368, 1512, 0.6, { flash: 2, pips: [8, 8, 8], goalF: 1368 + Math.round((1.85 - 0.6) * 60) }),
    { kind: 'card', still: 'endposter', a: 1512, b: 1800 },
  ],
  hits: [0, 168, 264, 336, 504, 528, 552, 576, 768, 984, 1032, 1080, 1128, 1176, 1224, 1272, 1320, 1436, 1512],
};

export const CUT60 = {
  name: '60', frames: 3600,
  shots: [
    T('t01-hook', 0, 72, 0.08, { flash: 2, flashAt: 4 }),
    T('t01-hook', 72, 192, 1.28, { ballOut: [72, 110] }),
    { kind: 'still', still: 'atlas', a: 192, b: 240, route: ['pitch', 'ridge'], stamps: ['pitch'], text: { w: 'EVERY MAP', f: 192, side: 'bolt' } },
    T('t03-ridge-sage', 240, 432, 0.3, { ballIn: [240, 258], text: { w: 'CATS', f: 288, side: 'cat' } }),
    T('t04-ridge-howler', 432, 528, 0.3, { text: { w: 'VS', f: 432, side: 'bolt' } }),
    T('t05-thicket-stilts', 528, 720, 0.3, { text: { w: 'DOGS', f: 528, side: 'dog' } }),
    T('t07-quarry-nova', 720, 912, 0.3, { ballIn: [720, 736], text: { w: '3V3', f: 720, side: 'bolt' } }),
    T('t08-crossing-lambo', 912, 1104, 0.3),
    { kind: 'still', still: 'atlas', a: 1104, b: 1152, route: ['crossing', 'ridge'], stamps: ['pitch', 'ridge', 'thicket', 'quarry', 'crossing'], tangle: true },
    { kind: 'still', still: 'pudding', a: 1152, b: 1296, push: 1.05 },
    T('t11-ridge-pudding', 1296, 1536, 1.0),
    { kind: 'still', still: 'truce', a: 1536, b: 1584, parallax: true },
    T('t11-ridge-pudding', 1584, 1668, 5.4),
    T('t11-ridge-pudding', 1668, 1752, 7.2),
    T('t11-ridge-pudding', 1752, 1836, 9.0),
    T('t11-ridge-pudding', 1836, 1920, 10.8),
    T('t14-ridge-calmed', 1920, 2064, 0.9, { flash: 2, flashAt: 66 }),
    T('t09-hearthwood', 2064, 2304, 0.4),
    { kind: 'still', still: 'chase', a: 2304, b: 2352, parallax: true },
    ...salvo(SALVO60, 2352),
    T('t18-goal-frost', 2832, 3024, 1.2, { flash: 2, pips: [10, 10, 10], goalF: 2832 + Math.round((3.25 - 1.2) * 60) }),
    { kind: 'card', still: 'endposter', a: 3024, b: 3360 },
    T('t20-nugget', 3360, 3600, 0.2, { logoSmall: true, vac: [3360 + 150, 3360 + 190] }),
  ],
};
