// The Geode Job (trailers-hq): both cuts as data. 120 BPM (a beat 0.5 s = 30 frames at 60 fps, a bar 2 s); every
// cut sits on the beat grid. Segment kinds: take (gameplay, `take` id + `in` seconds into the take), gem (a Gemini
// story frame with a push), freeze (four crew takes, each ending in a polaroid freeze), split (PLAN vs REALITY: the
// board left / top, gameplay right / bottom), end (the end card). `fx`: overlays on top (flash, strobe, alarm).
// Words: THE GEODE JOB / CATS / VS / DOGS / 3V3 / VICTORY! (8 words) plus the logo, PLAY FREE and pawlegends.app.
export const FPS = 60;
export const BPM = 120;
export const BEAT = 0.5;

// rev 2: the hook is a clean cats-win beat (no flash); the getaway stays in the Quarry; the core burst cuts away before
// its smoke, under a heavy VICTORY! in the title style; the trailer ends on the end card (no gameplay after it). `hit`:
// the on-screen impact time (cut seconds) the score lands on. Words cut off hard (no fade, no ghost over the next shot).
const C30 = [
  { a: 0.0, b: 1.4, kind: 'take', take: 't01-hook', in: 0.75 },
  { a: 1.4, b: 3.0, kind: 'gem', gem: 'A', push: [1.0, 1.05], yarn: true, title: 1.5 },
  { a: 3.0, b: 5.0, kind: 'freeze', crew: [['t02-crew-duchess', 0.85, 'crown'], ['t03-crew-pixel', 1.1, 'wrench'], ['t04-crew-stilts', 0.5, 'ear'], ['t05-crew-meatball', 0.65, 'fist']] },
  { a: 5.0, b: 6.0, kind: 'gem', gem: 'B', push: [1.0, 1.04], coins: true },
  { a: 6.0, b: 8.0, kind: 'split', take: 't07-bowl', in: 0.6 },
  { a: 8.0, b: 10.0, kind: 'take', take: 't08-duchess-q', in: 0.8 },
  { a: 10.0, b: 11.0, kind: 'take', take: 't10-scream', in: 3.1, fx: [{ alarm: [10.45, 11.0] }] },
  { a: 11.0, b: 13.0, kind: 'take', take: 't11-brutus', in: 1.0 },
  { a: 13.0, b: 14.0, kind: 'take', take: 't12-loaf', in: 0.5 },
  { a: 14.0, b: 16.0, kind: 'take', take: 't13-getaway', in: 0.9 },
  { a: 16.0, b: 18.0, kind: 'take', take: 't14-bowl-out', in: 0.3, hit: 16.5 },
  { a: 18.0, b: 19.0, kind: 'gem', gem: 'C', push: [1.06, 1.0], sparkle: true },
  { a: 19.0, b: 21.5, kind: 'take', take: 't18-dig', in: 0.6, fx: [{ flash: 20.1 }] },
  { a: 21.5, b: 22.2, kind: 'take', take: 't19a-clem', in: 0.3 },
  { a: 22.2, b: 22.9, kind: 'take', take: 't19b-nova', in: 0.4 },
  { a: 22.9, b: 23.6, kind: 'take', take: 't19d-megameal', in: 0.3 },
  { a: 23.6, b: 24.3, kind: 'take', take: 't20a-surge', in: 1.4 },
  { a: 24.3, b: 25.3, kind: 'take', take: 't20b-victory', in: 1.3, fx: [{ flash: 24.8 }], victory: 24.78 },
  { a: 25.3, b: 30.0, kind: 'end', gem: 'D', logoAt: 0.7 },
];
const W30 = [
  { at: 1.5, to: 3.0, word: 'THE GEODE JOB', style: 'title' },
  { at: 8.0, to: 9.4, word: 'CATS', style: 'cat' },
  { at: 10.0, to: 11.0, word: 'VS', style: 'vs' },
  { at: 11.0, to: 12.4, word: 'DOGS', style: 'dog' },
  { at: 14.0, to: 15.4, word: '3V3', style: 'vs' },
  { at: 24.78, to: 25.3, word: 'VICTORY!', style: 'win' },
];

const C60 = [
  { a: 0.0, b: 1.4, kind: 'take', take: 't01-hook', in: 0.75 },
  { a: 1.4, b: 4.0, kind: 'gem', gem: 'A', push: [1.0, 1.06], yarn: true, title: 1.5 },
  { a: 4.0, b: 8.0, kind: 'freeze', crew: [['t02-crew-duchess', 0.55, 'crown'], ['t03-crew-pixel', 0.8, 'wrench'], ['t04-crew-stilts', 0.2, 'ear'], ['t05-crew-meatball', 0.35, 'fist']] },
  { a: 8.0, b: 10.0, kind: 'gem', gem: 'B', push: [1.0, 1.05], coins: true },
  { a: 10.0, b: 12.0, kind: 'gem', gem: 'E', push: [1.0, 1.04], zzz: true },
  { a: 12.0, b: 14.0, kind: 'take', take: 't06-ranger', in: 0.3 },
  { a: 14.0, b: 18.0, kind: 'split', take: 't07-bowl', in: 0.0 },
  { a: 18.0, b: 22.0, kind: 'take', take: 't08-duchess-q', in: 0.1 },
  { a: 22.0, b: 26.0, kind: 'take', take: 't09-stilts-gems', in: 0.1 },
  { a: 26.0, b: 30.0, kind: 'take', take: 't10-scream', in: 0.1, fx: [{ alarm: [29.45, 30.0] }] },
  { a: 30.0, b: 33.0, kind: 'take', take: 't11-brutus', in: 0.1 },
  { a: 33.0, b: 35.0, kind: 'take', take: 't12-loaf', in: 0.1 },
  { a: 35.0, b: 38.0, kind: 'take', take: 't13-getaway', in: 0.1 },
  { a: 38.0, b: 41.0, kind: 'take', take: 't14-bowl-out', in: 0.2, hit: 38.6 },
  { a: 41.0, b: 42.0, kind: 'gem', gem: 'C', push: [1.06, 1.0], sparkle: true },
  { a: 42.0, b: 44.0, kind: 'take', take: 't16-bowl-out2', in: 0.3, hit: 42.4 },
  { a: 44.0, b: 45.0, kind: 'gem', gem: 'F', push: [1.0, 1.04], tunnel: true },
  { a: 45.0, b: 48.0, kind: 'take', take: 't18-dig', in: 0.3, fx: [{ flash: 46.4 }] },
  { a: 48.0, b: 49.2, kind: 'take', take: 't19a-clem', in: 0.2 },
  { a: 49.2, b: 50.4, kind: 'take', take: 't19b-nova', in: 0.3 },
  { a: 50.4, b: 51.4, kind: 'take', take: 't19c-duchess', in: 0.2 },
  { a: 51.4, b: 52.4, kind: 'take', take: 't19d-megameal', in: 0.2 },
  { a: 52.4, b: 53.6, kind: 'take', take: 't20a-surge', in: 1.2 },
  { a: 53.6, b: 54.6, kind: 'take', take: 't20b-victory', in: 1.3, fx: [{ flash: 54.1 }], victory: 54.08 },
  { a: 54.6, b: 60.0, kind: 'end', gem: 'D', logoAt: 1.0 },
];
const W60 = [
  { at: 1.5, to: 4.0, word: 'THE GEODE JOB', style: 'title' },
  { at: 18.0, to: 19.6, word: 'CATS', style: 'cat' },
  { at: 28.0, to: 29.4, word: 'VS', style: 'vs' },
  { at: 30.0, to: 31.6, word: 'DOGS', style: 'dog' },
  { at: 35.0, to: 36.6, word: '3V3', style: 'vs' },
  { at: 54.08, to: 54.6, word: 'VICTORY!', style: 'win' },
];

export const CUTS = {
  '30s': { dur: 30, segs: C30, words: W30 },
  '60s': { dur: 60, segs: C60, words: W60 },
};

/** Frame index of a time (s). */
export const fr = (s) => Math.round(s * FPS);

/** Sanity: contiguous, on the grid ends, inside the take lengths. */
export function check(cut, takeDur = {}) {
  const { dur, segs } = CUTS[cut];
  const errs = [];
  let t = 0;
  for (const s of segs) {
    if (Math.abs(s.a - t) > 1e-6) errs.push(`${cut}: gap at ${t} -> ${s.a}`);
    t = s.b;
    if (s.kind === 'take' || s.kind === 'split') {
      const d = takeDur[s.take];
      if (d !== undefined && s.in + (s.b - s.a) > d + 1e-6) errs.push(`${cut}: ${s.take} needs ${s.in + s.b - s.a}s of ${d}s`);
    }
  }
  if (Math.abs(t - dur) > 1e-6) errs.push(`${cut}: ends at ${t}`);
  return errs;
}
