#!/usr/bin/env node
/**
 * Trailer 60 ("The Understudy", feat. Rocket) score: an original comedy cue at 120 BPM (a beat = 30 frames at 60 fps,
 * a bar = 120), cut to timeline.mjs. An oom-pah overture under the gags (tuba, pizzicato, music box), the band from
 * 26.0 s, and the comedy cues timed to the picture: record scratches, a wah-wah-waah, a slide whistle, a boxing bell, a
 * violin screech, ta-das, a choir, a rimshot. Our own synthesised instruments (../trailer/instruments.mjs and the
 * functions below), the game's own sounds (bravoSob, rocketSnore, sadTrombone, cheer, cannonBoom ...), the game's
 * announcer lines (public/voice) and the v6 brand sting; no samples or stock audio.
 *
 *   node tools/trailer60/score.mjs --out DIR [--sting path.wav]
 *
 * Writes DIR/score.wav (48 kHz stereo, -14 LUFS integrated, true peak <= -1 dBTP), DIR/stems/*.wav and DIR/cues.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { Bus, SR, biquad, brown, compress, dbToGain, decay, freeverb, hz, limit, mix, mul, noise, saw, sec, sine, sweep, writeWav, writeWavFloat } from '../trailer/dsp.mjs';
import { ACT2, ACT2_CAST, ACT2_LEN, BEAT, CREDIT_AT, CREDIT_SWAP, CREDITS, CUTS, FPS, HIT, N } from './timeline.mjs';

const I = await bundleImport('tools/trailer/instruments.mjs');
/** Bundle an entry with Vite (TypeScript, extensionless imports) into one ES module and import it. */
async function bundleImport(entry) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { build } = await import('vite');
  const r = await build({
    configFile: false, mode: 'production', root, logLevel: 'silent', define: { 'import.meta.env': '{}' },
    build: { write: false, emptyOutDir: false, minify: false, target: 'es2022', lib: { entry: resolve(root, entry), formats: ['es'], fileName: () => 'instruments.js' }, rolldownOptions: { output: { codeSplitting: false } } },
  });
  const chunk = (Array.isArray(r) ? r : [r]).flatMap((o) => o.output).find((o) => o.type === 'chunk');
  const file = join(tmpdir(), `pl-trailer60-instruments-${process.pid}.mjs`);
  writeFileSync(file, chunk.code);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    execFileSync('rm', ['-f', file]);
  }
}
const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
const OUT = resolve(argValue('--out') ?? 'out');
const STING = argValue('--sting');
mkdirSync(join(OUT, 'stems'), { recursive: true });

const smp = (f) => Math.max(0, Math.round((f * SR) / FPS));
const fs = (frames) => frames / FPS;
const music = new Bus(smp(N));
const sfx = new Bus(smp(N));
const vo = new Bus(smp(N));
const cues = [];
const cue = (f, name) => cues.push({ f, s: +(f / FPS).toFixed(3), cue: name });
const C = CUTS;

function decode(path, ch = 1) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
const game = (f, name, g = 0.6, pan = 0, rate = 1) => {
  sfx.add(smp(f), I.game(name, rate), g, pan);
  cue(f, `game ${name}`);
};
function voice(f, key, g = 1) {
  const p = join(PKG, 'public', 'voice', `${key}.mp3`);
  if (!existsSync(p)) throw new Error(`no voice line ${key}`);
  vo.add(smp(f), decode(p), g);
  cue(f, `vo ${key}`);
}
const env = (n, p = 2) => Float32Array.from({ length: n }, (_, i) => Math.sin((Math.PI * i) / n) ** p);

// ---------------------------------------------------------------- comedy instruments (ours)
/** Record scratch: a noisy band sweeping down then up fast, twice. */
function recordScratch(f, g = 0.7) {
  const n = sec(0.32);
  const fr = (i) => { const t = i / n; return t < 0.45 ? 2400 - 2000 * (t / 0.45) : 400 + 3000 * ((t - 0.45) / 0.55); };
  const body = mul(biquad(noise(n, 611), 'bp', 1400, 1.4), env(n, 1));
  const tone = mul(saw(n, (i) => fr(i) * 0.5), env(n, 1.5));
  sfx.add(smp(f), mix([body, 0.8], [biquad(tone, 'lp', 3000), 0.35]), g);
  cue(f, 'record scratch');
}
/** Slide whistle from a to b Hz with a wobble. */
function slideWhistle(f, a, b, len, g = 0.35) {
  const n = sec(len);
  const x = sine(n, (i) => (a * (b / a) ** (i / n)) * (1 + 0.012 * Math.sin((i / SR) * 2 * Math.PI * 6)));
  sfx.add(smp(f), mul(x, mul(env(n, 0.6), decay(n, len * 2, 0.01))), g, 0.15);
  cue(f, 'slide whistle');
}
/** Squeaky toy deflating: a squeak then a falling wheeze. */
function deflate(f, g = 0.4) {
  const n = sec(0.7);
  const x = sine(n, (i) => 1300 * (260 / 1300) ** (i / n) * (1 + 0.06 * Math.sin(i / 90)));
  const air = mul(biquad(noise(n, 612), 'bp', sweep(2500, 600, n), 2), env(n, 1));
  sfx.add(smp(f), mix([mul(x, env(n, 1)), 0.6], [air, 0.25]), g);
  cue(f, 'deflate');
}
/** A wah-wah-waah: three falling tuba notes, the last long with a wobble (plus the game's sad trombone). */
function wahwah(f, g = 0.6) {
  [[0, 63, 0.3], [18, 62, 0.3], [36, 61, 0.3], [54, 60, 0.9]].forEach(([d, m, len]) => music.add(smp(f + d), I.tuba(m - 12, len), g));
  cue(f, 'wah-wah-waah');
}
/** Boxing bell: inharmonic partials, a long ring. */
function bell(f, g = 0.5) {
  const n = sec(1.4);
  const x = mix([sine(n, 1180), 1], [sine(n, 1180 * 2.76), 0.5], [sine(n, 1180 * 5.4), 0.25], [sine(n, 1180 * 0.5), 0.3]);
  sfx.add(smp(f), mul(x, decay(n, 0.45, 0.001)), g);
  sfx.add(smp(f + 9), mul(x, decay(n, 0.35, 0.001)), g * 0.7);
  cue(f, 'boxing bell');
}
/** Violin screech: a high bowed saw with fast vibrato. */
function screech(f, len, g = 0.35) {
  const n = sec(len);
  const x = saw(n, (i) => 1760 * (1 + 0.025 * Math.sin((i / SR) * 2 * Math.PI * 9)));
  sfx.add(smp(f), mul(biquad(biquad(x, 'bp', 2600, 1.2), 'lp', 6000), env(n, 0.3)), g);
  cue(f, 'violin screech');
}
/** Megaphone squeal: feedback whine. */
function squeal(f, g = 0.25) {
  const n = sec(0.35);
  sfx.add(smp(f), mul(sine(n, (i) => 2900 + 300 * (i / n)), env(n, 0.5)), g);
  cue(f, 'megaphone squeal');
}
/** Tick-tock: alternating wood clicks on the 8ths. */
function tickTock(f, b, g = 0.4) {
  for (let k = 0, x = f; x < b; x += BEAT / 2, k++) sfx.add(smp(x), k % 2 ? I.rim(7) : I.snap(91), g, k % 2 ? 0.3 : -0.3);
  cue(f, 'tick-tock');
}
/** Stealth shhh. */
function shhh(f, g = 0.4) {
  const n = sec(0.6);
  sfx.add(smp(f), mul(biquad(noise(n, 613), 'hp', 3200), env(n, 1.2)), g);
  cue(f, 'shhh');
}
/** A bun squeak: a short rising rubber squeak. */
function squeak(f, g = 0.45) {
  const n = sec(0.16);
  sfx.add(smp(f), mul(sine(n, sweep(700, 1700, n)), env(n, 0.8)), g);
  sfx.add(smp(f + 9), mul(sine(n, sweep(900, 2000, n)), env(n, 0.8)), g * 0.8);
  cue(f, 'squeak');
}
/** Applause: many short filtered claps, swelling. */
function applause(f, len, g = 0.5) {
  const n = sec(len);
  const out = new Float32Array(n);
  const clap = mul(biquad(noise(sec(0.03), 614), 'bp', 1600, 0.9), decay(sec(0.03), 0.008, 0.0005));
  let seed = 1;
  for (let i = 0; i < n; ) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const gap = sec(0.004 + (seed / 2 ** 32) * 0.012);
    const amp = 0.4 + ((seed >>> 8) % 100) / 160;
    for (let k = 0; k < clap.length && i + k < n; k++) out[i + k] += clap[k] * amp;
    i += gap;
  }
  sfx.add(smp(f), mul(out, env(n, 0.4)), g);
  cue(f, 'applause');
}
/** Choir aah: stacked sines with a slow vibrato through a vowel band. */
function choir(f, midis, len, g = 0.3) {
  const n = sec(len);
  const voices = midis.flatMap((m, k) => [mul(saw(n, (i) => hz(m) * (1 + 0.006 * Math.sin(i / (SR / 5.2) * 6.28 + k))), env(n, 0.25)), mul(saw(n, (i) => hz(m) * 1.004 * (1 + 0.006 * Math.sin(i / (SR / 4.7) * 6.28 + k * 2))), env(n, 0.25))]);
  const x = mix(...voices.map((v) => [v, 0.2]));
  const vowel = mix([biquad(x, 'bp', 800, 3), 1], [biquad(x, 'bp', 1150, 4), 0.6], [biquad(x, 'bp', 2900, 6), 0.2]);
  music.add(smp(f), vowel, g);
  cue(f, 'choir');
}
/** Bowling strike: the roll thump, then a pin clatter. */
function strike(f, g = 0.7) {
  sfx.add(smp(f), I.thump(92), g);
  const n = sec(0.9);
  const out = new Float32Array(n);
  for (let k = 0; k < 10; k++) {
    const at = sec(0.01 + k * 0.035 + (k % 3) * 0.01);
    const p = mul(mix([biquad(noise(sec(0.12), 620 + k), 'bp', 1800 + k * 220, 5), 1], [sine(sec(0.12), 900 + k * 130), 0.5]), decay(sec(0.12), 0.03, 0.0005));
    for (let i = 0; i < p.length && at + i < n; i++) out[at + i] += p[i] * (1 - k / 14);
  }
  sfx.add(smp(f + 2), out, g * 0.8, 0.1);
  cue(f, 'bowling strike');
}
function rimshot(f, g = 0.8) {
  music.add(smp(f - 9), I.snare(2, 200), g * 0.5);
  music.add(smp(f - 5), I.tom(140, 6), g * 0.5);
  music.add(smp(f), mix([I.snare(3, 220), 1], [I.crash(5, 0.6), 0.6]), g);
  cue(f, 'rimshot');
}
function orchHit(f, chord, g = 0.75) {
  const [L, R] = I.stab(chord, 0.45, 1.2);
  music.addStereo(smp(f), L, R, g);
  music.add(smp(f), I.crash(5, 1.6), 0.5);
  sfx.add(smp(f), I.impact(97, { sub: 44, len: 0.8 }), 0.7);
  cue(f, 'orchestra hit');
}
function drumroll(f, b, g = 0.5) {
  const [x] = I.snareRoll(fs(b - f), 120, 40);
  music.add(smp(f), x, g);
  cue(f, 'drumroll');
}
const tada = (f, chord, g = 0.6, len = 0.35) => {
  const [L, R] = I.stab(chord, len, 1.1);
  music.addStereo(smp(f), L, R, g);
  music.add(smp(f), I.crash(5, len * 3), 0.25);
  cue(f, 'ta-da');
};

// ---------------------------------------------------------------- harmony (C major, comedy) and the band
const CH = { C: { root: 36, tri: [60, 64, 67] }, Am: { root: 33, tri: [57, 60, 64] }, F: { root: 41, tri: [57, 60, 65] }, G: { root: 31, tri: [55, 59, 62] }, D: { root: 38, tri: [57, 62, 66] }, E: { root: 40, tri: [56, 59, 64] } };
const PROG = ['C', 'Am', 'F', 'G'];
/** Oom-pah: tuba on 1 and 3 (root, fifth), light stab on 2 and 4, a pizzicato line on the 8ths. */
function oompah(a, b, { g = 1, pizz = true } = {}) {
  for (let f = a; f < b; f += BEAT) {
    const bi = Math.round((f - a) / BEAT);
    const chord = CH[PROG[Math.floor(bi / 4) % 4]];
    const inBar = bi % 4;
    if (inBar % 2 === 0) music.add(smp(f), I.tuba(chord.root + (inBar === 2 ? 7 : 0), fs(BEAT * 0.6)), 0.5 * g);
    else {
      const [L, R] = I.stab(chord.tri, 0.12, 0.6);
      music.addStereo(smp(f), L, R, 0.16 * g);
    }
    music.add(smp(f), I.hat(4, false), 0.06 * g, 0.3);
    if (pizz) for (let k = 0; k < 2; k++) {
      const m = chord.tri[(bi * 2 + k) % 3] + 12;
      if (f + (k * BEAT) / 2 < b) music.add(smp(f + (k * BEAT) / 2), I.pluck(m, 0.12, 50 + k), 0.16 * g, k ? 0.25 : -0.25);
    }
  }
}
/** The band: kick, clap, hats, bass, brass stabs; `hype` doubles the hats. */
function band(a, b, { g = 1, hype = false } = {}) {
  for (let f = a; f < b; f += BEAT) {
    const bi = Math.round((f - a) / BEAT);
    const chord = CH[PROG[Math.floor(bi / 4) % 4]];
    const inBar = bi % 4;
    music.add(smp(f), I.kick(1, { punch: 1.1 }), 0.9 * g);
    if (inBar % 2) {
      music.add(smp(f), I.clap(3), 0.45 * g, 0.05);
      music.add(smp(f), I.snare(2, 200), 0.3 * g);
    }
    const nh = hype ? 4 : 2;
    for (let k = 0; k < nh; k++) if (f + (k * BEAT) / nh < b) music.add(smp(f + (k * BEAT) / nh), I.hat(4 + k, false), (k % 2 ? 0.08 : 0.14) * g, k % 2 ? 0.3 : -0.3);
    music.add(smp(f), I.bass(chord.root + 12, fs(BEAT * 0.45)), 0.4 * g);
    music.add(smp(f + BEAT / 2), I.bass(chord.root + 24, fs(BEAT * 0.3)), 0.2 * g);
    if (inBar === 0) {
      const [L, R] = I.pad(chord.tri.map((m) => m - 12), fs(BEAT * 4), { cutoff: 1800 });
      music.addStereo(smp(f), L, R, 0.08 * g);
    }
    if (inBar === 3) {
      const [L, R] = I.stab(chord.tri, 0.18, 1);
      music.addStereo(smp(f + BEAT / 2), L, R, 0.22 * g);
    }
  }
}
const theme = (f, g = 0.4) => {
  // the Bravo theme: a pompous little fanfare (C E G A G E C)
  [[0, 72], [6, 76], [12, 79], [18, 81], [24, 79], [30, 76], [36, 84]].forEach(([d, m], i) => music.add(smp(f + d), I.musicBox(m, i === 6 ? 0.8 : 0.3), g));
};

// ---------------------------------------------------------------- the cue sheet (round 2 timing)
// S01 hook: an orchestra hit on frame 0, the hit, his sob as he flops, the record scratch on the iris freeze
orchHit(0, [60, 64, 67, 72]);
theme(4, 0.35);
// round 3: the jump cut on the impact (a white flash) carries the hit
game(HIT.hit, 'hitHeavy', 0.75);
sfx.add(smp(HIT.hit), I.impact(96, { sub: 48, len: 0.5 }), 0.5);
game(HIT.flop, 'bravoSob', 0.9);
recordScratch(C.iris, 0.8);
// S02 the title: drumroll into a cymbal on the cannon cut
drumroll(C.title, C.cannon - 2, 0.45);
game(C.title + 12, 'slam', 0.5);
music.add(smp(C.title + 16), I.tuba(36, 0.5), 0.6);
tada(C.title + 16, [60, 64, 67, 72], 0.5, 0.6);
tada(C.title + 32, [65, 69, 72, 77], 0.45, 0.8);
music.add(smp(C.cannon), I.crash(5, 2), 0.55);
// S03-S04 the race: the overture starts, a chase snare, Rocket's name card (his name call), the pick, a squeaky
// deflate on ROCKET: 0
oompah(C.cannon, C.cut);
game(C.cannon + 2, 'cannonClank', 0.6);
for (let f = C.cannon; f < HIT.missPick; f += BEAT / 2) music.add(smp(f), I.snare(2, 230), 0.12 + 0.18 * ((f - C.cannon) / (HIT.missPick - C.cannon)));
game(C.cannon + 8, 'cannonChunk', 0.5);
voice(C.cannon + 74, 'name_rocket', 0.95);
game(C.cannon + 76, 'rocketWhoosh', 0.45);
game(HIT.missPick, 'pickup', 0.7);
deflate(HIT.missPick + 6, 0.55);
game(HIT.missPick + 8, 'rocketSqueak', 0.6);
// S05 audition #1: his la-la (the theme) cut off by the whoosh; wah-wah-waah
theme(C.aud1 + 4, 0.45);
sfx.add(smp(HIT.steal1), I.whoosh(0.35, 84, 1), 0.6);
game(HIT.steal1, 'ult', 0.5);
wahwah(HIT.steal1 + 26, 0.55);
game(HIT.steal1 + 52, 'sadTrombone', 0.45);
// S06 ZOOM... ZZZ: whoosh, the snore, tick-tock
game(C.zzz + 38, 'rocketWhoosh', 0.8);
game(HIT.nap, 'rocketSnore', 0.9);
tickTock(HIT.nap + 6, C.aud2, 0.35);
// S07 audition #2: meteor booms on the beats, a slide whistle fall into the punch-in
for (let k = 0; k < 3; k++) game(C.aud2 + k * BEAT, 'boom', 0.55, k % 2 ? 0.2 : -0.2);
slideWhistle(C.cut - 40, 1600, 300, 0.45, 0.4);
sfx.add(smp(C.cut - 14), I.whoosh(0.22, 85, 1), 0.45);
// S08 CUT!: everything stops, a megaphone squeal and the shout (the game's bark under it)
squeal(C.cut, 0.3);
game(C.cut + 2, 'bravoGasp', 0.8);
sfx.add(smp(C.cut + 2), I.crackle(0.25, 93), 0.4);
// S09 the credits (round 3, review: the same ult-poof-ta-da five times): a brass stab and a name call on each card, and
// every coat swap its own sound, escalating; the last card's swap is refused (a record scratch and the game's deny)
oompah(C.credits, C.eye, { g: 0.45 });
music.add(smp(C.credits), I.crash(5, 1.6), 0.45);
const SWAP_SFX = [
  (f, ch) => { game(f, 'poof', 0.55); tada(f, ch, 0.35, 0.25); },
  (f, ch) => { game(f, 'kibbleBoing', 0.6); tada(f, ch, 0.4, 0.3); },
  (f, ch) => { game(f, 'poof', 0.5); slideWhistle(f, 500, 1500, 0.3, 0.3); },
  (f, ch) => { game(f, 'shieldChime', 0.55); tada(f, ch, 0.4, 0.3); },
  (f, ch) => { game(f, 'nuggetSqueak', 0.6); game(f + 6, 'horn', 0.45); tada(f, ch, 0.5, 0.5); },
  (f) => { recordScratch(f + 2, 0.75); game(f + 8, 'deny', 0.8); game(f + 30, 'pfft', 0.6); },
];
CREDITS.forEach((c, i) => {
  const f = CREDIT_AT[i];
  const chord = ['C', 'G', 'Am', 'F', 'G', 'D'][i];
  const [L, R] = I.stab(CH[chord].tri, 0.26, 1.1);
  music.addStereo(smp(f), L, R, 0.55);
  music.add(smp(f), I.tuba(CH[chord].root, 0.4), 0.5);
  voice(f + 4, `name_${c.take.split('-')[1]}`, 1.0);
  SWAP_SFX[i](f + CREDIT_SWAP, CH[chord].tri.map((m) => m + 12));
  game(f + 27, i % 2 ? 'slam' : 'ult', 0.4);
});
// S10 audition #3: the bell, the whoosh, the crash, a whoosh into the punch-in
bell(C.aud3 + 6, 0.45);
sfx.add(smp(C.aud3 + 48), I.whoosh(0.3, 86, 1), 0.6);
game(C.aud3 + 62, 'hitHeavy', 0.7);
game(C.aud3 + 64, 'kibbleClang', 0.5);
sfx.add(smp(C.eye - 12), I.whoosh(0.2, 87, 1), 0.4);
// S11 THAT'S IT.: a violin screech, then silence (the hole below)
screech(C.eye, 0.3, 0.4);
// S12 the costume change: ta-da x3 and a TA-DAAA
tada(C.costume, [60, 64, 67], 0.5);
tada(C.costume + 30, [62, 65, 69], 0.5);
tada(C.costume + 60, [64, 67, 71], 0.5);
tada(C.costume + 90, [65, 69, 72, 77], 0.75, 0.9);
for (let k = 0; k < 4; k++) game(C.costume + k * 30, 'poof', 0.5);
// round 3 (review: 1.5 s of near-silence before ACT II): the overture bed runs under the costume change and the bush
oompah(C.costume, C.act2, { g: 0.5 });
// S13 the bush: shhh, the squeak, a gasp
shhh(C.bush + 18, 0.45);
squeak(C.bush + 70, 0.5);
game(C.bush + 74, 'gasp', 0.5);
game(C.bush + 120, 'nuggetSqueak', 0.35);
// S14 ACT II: drumroll into the band
orchHit(C.act2, [57, 60, 64, 69], 0.7);
drumroll(C.act2 + 4, C.fight, 0.75);
game(C.act2, 'cannonClank', 0.5);
// S15 the fight: the band; each hero moment: a crash on the cut, the name call, the ultimate on its cast (take frame
// 48, a 0.8x ramp), impacts on the hits
music.add(smp(C.fight), I.crash(5, 2.4), 0.6);
music.add(smp(C.fight), I.kick(1, { punch: 1.5 }), 1);
band(C.fight, C.flop, { hype: true });
ACT2.forEach((u, i) => {
  const f = C.fight + i * ACT2_LEN;
  const cast = f + ACT2_CAST - u.in;
  if (i) music.add(smp(f), I.crash(5, 1.6), 0.45);
  voice(f + 4, `name_${u.hero}`, 0.95);
  game(cast + 2, 'ult', 0.6);
  sfx.add(smp(cast + 2), I.riser(0.3, 74 + i)[0], 0.25);
  for (let k = 0; k < 3; k++) {
    game(cast + 18 + k * 22, k % 2 ? 'hitHeavy' : 'slam', 0.45);
    sfx.add(smp(cast + 18 + k * 22), I.impact(90 + i * 3 + k, { sub: 50, len: 0.5 }), 0.4);
  }
});
// S16 the slow-mo flop: a choir aah, then the record scratch back to 1x
choir(C.flop + 6, [60, 64, 67, 72], 1.5, 0.35);
game(C.flop + 40, 'bravoSob', 0.8, 0, 0.8);
recordScratch(C.flop + 92, 0.7);
band(C.flop + 96, C.peek, { g: 0.6 });
// S17 one eye opens: a single pizzicato pluck
music.add(smp(C.peek + 10), I.pluck(79, 0.2, 51), 0.6);
// S18 the payoff: the windup, his bow, the fumble, the crowd, the bow chord; the button: a rose BONK! and a boing
band(C.payoff, C.victory, { g: 0.85 });
game(C.payoff + 20, 'windup', 0.5);
game(HIT.encoreFumble - 42, 'bravoBow', 0.9);
sfx.add(smp(HIT.encoreFumble - 40), I.riser(0.65, 73)[0], 0.3);
game(HIT.encoreFumble, 'cannonClatter', 0.8);
game(HIT.encoreFumble + 2, 'cheer', 0.8);
applause(HIT.encoreFumble, 2.4, 0.35);
tada(HIT.encoreFumble, [60, 64, 67, 72], 0.7, 1.0);
game(HIT.encoreFumble + 40, 'ooh', 0.5);
slideWhistle(HIT.bonk - 22, 1800, 700, 0.35, 0.3);
sfx.add(smp(HIT.bonk), mix([I.tom(160, 8), 0.8], [I.rim(9), 0.6]), 0.8);
game(HIT.bonk + 1, 'kibbleBoing', 0.7);
game(HIT.bonk + 8, 'bravoGasp', 0.6);
// S19 ROCKET: 1: the shot, KABOOM, a sports horn
voice(C.score + 6, 'name_rocket', 0.9);
game(HIT.rocketFire - 22, 'windup', 0.5);
game(HIT.rocketFire, 'cannonBoom', 0.85);
game(HIT.kaboom, 'boom', 0.9);
sfx.add(smp(HIT.kaboom), I.impact(95, { sub: 40, len: 1.4 }), 0.8);
game(HIT.kaboom + 6, 'horn', 0.8);
voice(HIT.kaboom + 24, 'enemySlain', 0.9);
// S20 the core: a boom and the fanfare cadence, VICTORY
game(HIT.coreBurst, 'boom', 0.9);
sfx.add(smp(HIT.coreBurst), I.subDrop(55, 28, 0.8, 0.9), 0.9);
music.add(smp(HIT.coreBurst), I.crash(5, 3), 0.7);
tada(HIT.coreBurst + 23, [60, 64, 67, 72], 0.7, 0.5);
tada(HIT.coreBurst + 53, [65, 69, 72], 0.6, 0.4);
tada(HIT.coreBurst + 68, [67, 71, 74], 0.6, 0.4);
tada(HIT.coreBurst + 83, [72, 76, 79, 84], 0.8, 1.2);
voice(HIT.coreBurst + 33, 'victory', 1.0);
// S20b he takes the bow for the win: his bow, his theme, a smug little pluck
band(C.victory, C.welcome, { g: 0.6 });
game(C.welcome + 4, 'bravoBow', 0.9);
theme(C.welcome + 10, 0.5);
music.add(smp(C.welcome + 50), I.pluck(84, 0.25, 54), 0.5);
// S21 the curtain call: applause, a pop per lineup, the overture reprise
applause(C.curtain, 2.5, 0.45);
oompah(C.curtain, C.end, { g: 0.9 });
theme(C.curtain + 20, 0.45);
for (let off = 0; off < C.end - C.curtain; off += 30) game(C.curtain + off, 'poof', 0.3);
// S22 the end card: the v6 sting, then (round 2: 2 s of dead air) a soft oompah bed under the logo and the line
if (STING) {
  sfx.add(smp(C.end), decode(STING, 1), 1.0);
  cue(C.end, 'brand sting');
} else orchHit(C.end, [60, 64, 67, 72]);
music.add(smp(C.end), I.crash(5, 3), 0.4);
oompah(C.end + 60, C.stinger, { g: 0.55 });
// S23 the stinger: his la-la, the bowling strike, his sob; under the freeze a tick-tock bed, a pluck on the line
// (Bravo will return.) and the rimshot on 59.5 s
oompah(C.stinger, C.returns, { g: 0.45, pizz: false });
theme(C.stinger + 20, 0.45);
strike(HIT.bowl, 0.8);
game(HIT.bowl + 2, 'bravoGasp', 0.7);
game(HIT.bowl + 40, 'bravoSob', 0.6);
tickTock(C.returns, 3555, 0.55);
{
  const [L, R] = I.pad([60, 64, 67], fs(3555 - C.returns), { cutoff: 1400 });
  music.addStereo(smp(C.returns), L, R, 0.12);
}
music.add(smp(HIT.returnsLine), I.pluck(72, 0.3, 52), 0.55);
music.add(smp(HIT.returnsLine + 8), I.pluck(76, 0.3, 53), 0.5);
// round 3: the logo lands on the freeze (the address follows)
tada(HIT.returnsLogo, [60, 64, 67, 72], 0.45, 0.5);
rimshot(3570, 0.85);

// ---------------------------------------------------------------- space, ducking, holes, master
function reverbSend(bus, amount, room = 0.78) {
  const [wl, wr] = freeverb(bus.L, bus.R, { room, damp: 0.4 });
  for (let i = 0; i < bus.n; i++) {
    bus.L[i] += wl[i] * amount;
    bus.R[i] += wr[i] * amount;
  }
}
reverbSend(music, 0.1);
reverbSend(sfx, 0.05);
reverbSend(vo, 0.06, 0.6);
function duck(bus, frames, db = -8, hold = 6, rel = 10) {
  const g = new Float32Array(bus.n).fill(1);
  const lo = dbToGain(db);
  for (const f of frames) {
    const a = smp(f - 2), h = smp(f + hold), r = smp(f + hold + rel);
    for (let i = Math.max(0, a); i < Math.min(bus.n, r); i++) {
      const v = i < smp(f) ? 1 - (1 - lo) * ((i - a) / Math.max(1, smp(f) - a)) : i < h ? lo : lo + (1 - lo) * ((i - h) / (r - h));
      g[i] = Math.min(g[i], v);
    }
  }
  bus.gainCurve((i) => g[i]);
}
duck(music, cues.filter((c) => c.cue.startsWith('vo ') || c.cue.startsWith('game bravo') || c.cue.startsWith('game rocket')).map((c) => c.f), -6, 30, 12);
/** Near-silent holes: the music stops for CUT! and for THAT'S IT.'s last 0.2 s (3 ms ramps: a hard step clicks). */
const HOLES = [[C.cut, C.credits, [music]], [C.eye + 18, C.costume, [music, sfx, vo]], [C.peek, C.peek + 8, [music]]];
for (const [a, b, buses] of HOLES) {
  const r = sec(0.003), A = smp(a), B = smp(b);
  const g = (i) => (i < A + r ? 1 - 0.98 * ((i - A) / r) : i >= B - r ? 0.02 + 0.98 * ((i - (B - r)) / r) : 0.02);
  for (const bus of buses) bus.gainCurve(g, A, B);
  cue(a, 'hole');
}

function measure(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(s)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}
function master() {
  const bus = new Bus(music.n);
  bus.mixIn(music, 0.85);
  bus.mixIn(sfx, 0.7);
  bus.mixIn(vo, 1.25);
  compress(bus, { threshDb: -16, ratio: 1.8, attack: 0.012, release: 0.2 });
  // the arc: the overture sits under the gags, the band lifts it, the payoff and the victory peak
  const ARC = [[0, 0], [C.cannon, -3], [C.credits, -1], [C.aud3, -3], [C.fight, 0], [C.flop, -3], [C.payoff, -1], [HIT.encoreFumble, 1], [C.victory, 1], [C.curtain, -2], [C.end, 0], [C.end + 60, -2], [C.stinger, -2], [C.returns, -2], [3568, 0]];
  const arcDb = (f) => {
    for (let k = ARC.length - 1; k >= 0; k--) if (f >= ARC[k][0]) {
      const t = Math.min(1, (f - ARC[k][0]) / 6);
      const prev = ARC[k - 1]?.[1] ?? ARC[k][1];
      return prev + (ARC[k][1] - prev) * t;
    }
    return 0;
  };
  bus.gainCurve((i) => dbToGain(arcDb((i * FPS) / SR)));
  const tmp = join(OUT, '.score.wav');
  let gain = 1;
  let r = null;
  for (let k = 0; k < 6; k++) {
    const b = bus.clone();
    b.gainCurve(() => gain);
    limit(b, -3.4, 0.002, 0.12);
    b.gainCurve((i) => Math.min(1, i / sec(0.004)), 0, sec(0.004));
    b.gainCurve((i) => Math.max(0, (b.n - i) / smp(6)), b.n - smp(6), b.n);
    writeWav(tmp, b.L, b.R);
    r = measure(tmp);
    writeWav(join(OUT, 'score.wav'), b.L, b.R);
    if (Math.abs(r.I + 14) <= 0.2 && r.TP <= -1.5) break;
    gain *= dbToGain(-14 - r.I);
  }
  execFileSync('rm', ['-f', tmp]);
  return measure(join(OUT, 'score.wav'));
}
writeWavFloat(join(OUT, 'stems', 'music.wav'), music.L, music.R);
writeWavFloat(join(OUT, 'stems', 'sfx.wav'), sfx.L, sfx.R);
writeWavFloat(join(OUT, 'stems', 'vo.wav'), vo.L, vo.R);
const loud = master();
console.log(`[score] ${JSON.stringify(loud)}`);
writeFileSync(join(OUT, 'cues.json'), `${JSON.stringify({ bpm: 120, beatFrames: BEAT, loudness: loud, cues: cues.sort((a, b) => a.f - b.f) }, null, 1)}\n`);
