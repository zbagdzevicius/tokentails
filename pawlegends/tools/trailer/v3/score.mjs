#!/usr/bin/env node
/**
 * Trailer v3 score ("Settle It on the Crossing"): an original, beat-locked cue at 144 BPM (25 frames per beat, 100 per
 * bar, 18 bars = 30.000 s), written against the cue sheet of the v3 storyboard (§6). Two motifs carry the rivalry: the
 * CATS motif is a bright high pluck (rising), the DOGS motif a low brass figure (falling); they trade bars in the
 * teamfight and answer each other under TEAM CAT OR TEAM DOG?. Our own synthesised instruments (instruments.mjs) and
 * the game's own zzfx sounds rendered offline; no samples, no stock audio.
 *
 *   node tools/trailer/v3/score.mjs --out DIR
 *
 * Writes DIR/score-30.wav and DIR/score-15.wav (48 kHz, 24-bit stereo, -14 LUFS integrated, true peak <= -1 dBTP),
 * DIR/stems/{music,sfx}-30.wav and DIR/cues.json. The 15 s cut is spliced from the 30 s stems on the beat grid
 * (timeline.mjs CUT15), then mastered on its own, so every hit lands on the same picture frame in both cuts.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../../lib/args.mjs';
import { Bus, SR, biquad, compress, dbToGain, freeverb, limit, sec, writeWav, writeWavFloat } from '../dsp.mjs';
import * as I from '../instruments.mjs';
import { CUT15, IMPACTS } from './timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(argValue('--out') ?? join(HERE, '..', 'out', 'v3', 'audio'));
mkdirSync(join(OUT, 'stems'), { recursive: true });

const FPS = 60;
const BEAT = 25;
const BAR = 100;
const N30 = 1800;
/** Frame -> sample (800 samples per frame). */
const smp = (f) => Math.round((f * SR) / FPS);
const fs = (frames) => frames / FPS;

const music = new Bus(smp(N30));
const sfx = new Bus(smp(N30));
const cues = [];
const cue = (f, name) => cues.push({ f, s: +(f / FPS).toFixed(3), cue: name });

// ---------------------------------------------------------------- harmony

const CH = {
  Am: { root: 33, tri: [57, 60, 64] },
  F: { root: 29, tri: [57, 60, 65] },
  C: { root: 36, tri: [55, 60, 64] },
  G: { root: 31, tri: [55, 59, 62] },
  Dm: { root: 38, tri: [57, 62, 65] },
  E: { root: 28, tri: [56, 59, 64] },
};
/** One chord per bar from bar 2 (f150 is mid-bar 2: the groove's bars start on f150 + 100k). */
const PROG = ['Am', 'F', 'C', 'G'];
/** The CATS motif (high pluck, rising: "here we come") and the DOGS motif (low brass, falling: "not so fast"). */
const CAT = [[0, 76], [3, 79], [6, 81], [9, 84], [12, 83], [15, 81]]; // [16th step, midi]
const DOG = [[0, 45], [4, 45], [6, 43], [8, 41], [12, 40]];

const step16 = BEAT / 4;

function catMotif(f, gain = 0.55, transpose = 0) {
  for (const [s, m] of CAT) music.add(smp(f + s * step16), I.pluck(m + transpose, 0.16, 50 + s), gain, 0.25);
  cue(f, 'cat motif');
}
function dogMotif(f, gain = 0.6, transpose = 0) {
  for (const [s, m] of DOG) music.add(smp(f + s * step16), I.tuba(m + transpose, fs(step16 * (s === 12 ? 6 : 2.2))), gain, -0.25);
  cue(f, 'dog motif');
}
function stabAt(f, chord, gain = 0.5, len = 0.3, oct = 0) {
  const [L, R] = I.stab(CH[chord].tri.map((m) => m + oct), len, 1);
  music.addStereo(smp(f), L, R, gain);
}
function padBar(f, chord, len, gain = 0.18, cutoff = 1400) {
  const [L, R] = I.pad(CH[chord].tri.map((m) => m - 12), len, { cutoff });
  music.addStereo(smp(f), L, R, gain);
}

// ---------------------------------------------------------------- drums and bass

/**
 * The groove over [a, b): kick, clap, hats, bass on the chord roots. `half`: the half-time breath (kick on 1 and 3,
 * no clap, hats quiet). Bars count from `a`.
 */
function groove(a, b, { half = false, energy = 1, bassOn = true, hats = true } = {}) {
  for (let f = a; f < b; f += BEAT) {
    const beatIdx = Math.round((f - a) / BEAT);
    const inBar = beatIdx % 4;
    const bar = Math.floor(beatIdx / 4);
    const chord = PROG[bar % PROG.length];
    if (!half || inBar === 0 || inBar === 2) music.add(smp(f), I.kick(1, { punch: 1 }), 0.9 * energy);
    if (!half && (inBar === 1 || inBar === 3)) music.add(smp(f), I.clap(3), 0.5 * energy, 0.05);
    if (!half && inBar === 3 && bar % 2 === 1) music.add(smp(f + BEAT / 2), I.kick(2, { punch: 0.7 }), 0.55 * energy);
    if (hats) for (let k = 0; k < (half ? 2 : 4); k++) {
      const hf = f + (k * BEAT) / (half ? 2 : 4);
      if (hf < b) music.add(smp(hf), I.hat(4 + k, k === 2 && !half), (k % 2 ? 0.12 : 0.2) * energy, k % 2 ? 0.3 : -0.3);
    }
    if (bassOn) {
      const r = CH[chord].root + 12;
      // root on the beat, the octave on the off-beat eighth
      music.add(smp(f), I.bass(r, fs(BEAT * 0.45)), 0.42 * energy);
      if (!half) music.add(smp(f + BEAT / 2), I.bass(r + 12, fs(BEAT * 0.3)), 0.22 * energy);
    }
  }
}

// ---------------------------------------------------------------- the cue sheet (storyboard §6)

// f0-25: drum pickup (two toms into the hop) and a rising whoosh into the flop
music.add(smp(0), I.tom(150, 6), 0.45, -0.2);
music.add(smp(6), I.tom(120, 7), 0.45, 0.2);
music.add(smp(12), I.tom(95, 8), 0.5);
sfx.add(smp(25) - sec(0.25), I.riseWhoosh(0.25, 81), 0.45);
cue(0, 'pickup');
// f25 hit 1: the flop (the game's slam + our impact and sub)
sfx.add(smp(25), I.game('slam'), 0.9);
sfx.add(smp(25), I.impact(90, { sub: 44, len: 1.2 }), 0.8);
music.add(smp(25), I.kick(1, { punch: 1.3 }), 0.9);
cue(25, 'flop impact');
// f45-149: the crane: a riser with the filter opening, a pad on Am; CATS / VS / DOGS stabs
{
  const [L, R] = I.riser(fs(100), 70);
  music.addStereo(smp(46), L, R, 0.22);
  padBar(45, 'Am', fs(100), 0.16, 900);
}
// v3.2: CATS on f70, VS on f80, DOGS on f90 (the type's slams)
catMotif(70, 0.6);
stabAt(70, 'Am', 0.25, 0.25, 12);
music.add(smp(80), I.snare(2, 200), 0.75);
music.add(smp(80), I.clap(3), 0.4);
cue(80, 'VS snare');
dogMotif(90, 0.7);
music.add(smp(90), I.kick(1, { punch: 1.1 }), 0.7);
music.add(smp(150) - sec(0.5), I.reverseCymbal(0.5, 83), 0.35);

// f150-650: the groove (bars 2.5-6.5)
groove(150, 650);
cue(150, 'drop');
music.add(smp(150), I.crash(5, 2.0), 0.35, 0.2);
stabAt(150, 'Am', 0.4);
sfx.add(smp(155), I.thump(92), 0.45);
sfx.add(smp(175), I.thump(93), 0.4);
// v3.2 rivalry: f274 Clem's Tumble at Sir Brutus (a whoosh, the game's hit), the music sucked out under it
sfx.add(smp(274) - sec(0.2), I.whoosh(0.3, 80, 1.2), 0.35);
sfx.add(smp(274), I.game('hit'), 0.7);
cue(274, 'Clem at Sir Brutus');
// f324 the dogs answer: Cacklejaw's Pack Hunt (the dog motif, his laugh)
dogMotif(324, 0.55);
sfx.add(smp(324) - sec(0.15), I.whoosh(0.35, 86, 1.1), 0.4);
sfx.add(smp(326), I.game('hyenaLaugh'), 0.35);
// f374 Sage's Moonshot
sfx.add(smp(374), I.game('arrow'), 0.7);
sfx.add(smp(374), I.whoosh(0.4, 84, 1.6), 0.35, 0.3);
catMotif(375, 0.42, 12);
// f420 Sir Brutus's Champion's Challenge: the dog brass and the game's horn
dogMotif(420, 0.6);
sfx.add(smp(420), I.game('horn'), 0.4);
sfx.add(smp(420), I.game('shieldUp'), 0.5);
// f450-649 the four champions: the cat motif as a melody over a warm pad
for (let k = 0; k < 4; k++) {
  const f = 450 + k * BAR;
  padBar(f, PROG[(k + 3) % 4], fs(BAR), 0.14, 1800);
  if (k < 2) catMotif(f + 50, 0.42);
}
sfx.add(smp(474), I.crackle(0.35, 93), 0.35);
sfx.add(smp(524), I.game('ult'), 0.4);
sfx.add(smp(574), I.game('magic'), 0.45);
sfx.add(smp(628), I.game('dash'), 0.45);
// f650-749 half-time breath: kick on 1 and 3, lane ambience, minion steps from the game (blip)
groove(650, 750, { half: true, energy: 0.8 });
{
  const amb = I.ambience(fs(100), 95);
  sfx.add(smp(650), amb, 0.18);
}
for (let k = 0; k < 8; k++) sfx.add(smp(660 + k * 10), I.game('squeak', 1.3 + (k % 3) * 0.1), 0.08, k % 2 ? 0.4 : -0.4);
cue(650, 'half-time');
// f724 Pudding calmed: the game's chime
sfx.add(smp(724), I.game('shieldChime'), 0.6);
sfx.add(smp(724), I.musicBox(84, 1.0), 0.25);
cue(724, 'Pudding chime');
// f750-800 build: snare roll; f800 the tower crashes
{
  const roll = I.snareRoll(fs(40), 144, 40);
  music.add(smp(750), roll, 0.5);
  groove(750, 790, { energy: 0.7, hats: false });
}
// the tower cracks on f790 (the game's boom) and hits the ground on f824 (the impact, the crash, the sub)
sfx.add(smp(790), I.game('boom'), 0.7);
sfx.add(smp(824), I.impact(92, { sub: 38, len: 1.6 }), 0.75);
sfx.add(smp(824), I.crash(9, 2.0), 0.35);
music.add(smp(824), I.subDrop(55, 32, 0.5, 0.4), 0.5);
cue(790, 'tower cracks');
cue(824, 'tower hits the ground (measured on the capture)');
groove(825, 850, { energy: 0.6, hats: false });
// f850-1099 full energy: the motifs answer each other bar by bar
groove(850, 1100, { energy: 1.05 });
music.add(smp(850), I.crash(5, 2.0), 0.35, -0.2);
catMotif(850, 0.42);
dogMotif(950, 0.5);
catMotif(1050, 0.42, 12);
// v3.2: five teamfight beats (one per half bar); the big hits on 882 and 974
for (const f of [924, 1019, 1056]) sfx.add(smp(f), I.game('magic'), 0.35);
for (const f of [882, 974]) {
  sfx.add(smp(f), I.game('hit'), 0.7);
  sfx.add(smp(f), I.impact(93, { sub: 48, len: 0.7 }), 0.55);
  cue(f, 'teamfight hit');
}
// f1100-1249: riser, TAKE THEIR CORE. on a stab, the flop impact
groove(1100, 1250, { energy: 1 });
stabAt(1105, 'Dm', 0.45);
{
  const [L, R] = I.riser(fs(30), 71);
  music.addStereo(smp(1075), L, R, 0.16);
}
// f1100-1249 the cats walk onto the doghouse: the game's hits on the core on the beat
for (const f of [1150, 1175, 1200, 1225]) sfx.add(smp(f), I.game('hit'), 0.35);
// f1250-1293 tension: filtered loop, rising pitch; f1294-1299 a near-silent hole; f1300 THE CORE BURST
{
  const [L, R] = I.riser(fs(44), 72);
  music.addStereo(smp(1250), L, R, 0.3);
  for (let f = 1250; f < 1294; f += BEAT / 2) music.add(smp(f), I.hat(11, false), 0.18);
  for (let f = 1250; f < 1294; f += BEAT) music.add(smp(f), I.bass(CH.E.root + 12 + Math.round((f - 1250) / BEAT), fs(BEAT * 0.4)), 0.3);
}
sfx.add(smp(1300), I.game('boom'), 1.0);
sfx.add(smp(1300), I.impact(95, { sub: 36, len: 2.0 }), 0.95);
sfx.add(smp(1300), I.crash(7, 2.6), 0.5);
music.add(smp(1300), I.subDrop(60, 28, 0.8, 0.6), 0.75);
cue(1300, 'CORE BURST');
// v3.2 f1310-1355: the doghouse shudders and breaks up under the game's victory slow motion: rubble crackle, no second
// boom (the cave-in itself is past the cut)
sfx.add(smp(1312), I.crackle(0.6, 97), 0.35);
// f1325 victory fanfare (the cat motif in C major, brass stabs) under VICTORY!, carried into the pick screen
stabAt(1325, 'C', 0.4);
catMotif(1325, 0.5);
stabAt(1350, 'G', 0.32);
stabAt(1375, 'F', 0.32);
stabAt(1400, 'C', 0.4, 0.5);
groove(1350, 1450, { energy: 0.8 });
sfx.add(smp(1330), I.game('victory'), 0.45);
cue(1325, 'victory fanfare');
// f1356-1449 the pick screen: the game's own click on each tile tapped (Avietė, Bengas, Gabė)
for (const f of [1375, 1400, 1425]) sfx.add(smp(f), I.game('click'), 0.35);
cue(1356, 'pick screen');
// f1450-1624: call and response: TEAM CAT (cat motif), OR (a rest), TEAM DOG? (dog motif)
padBar(1450, 'Am', fs(175), 0.13, 1200);
groove(1450, 1625, { half: true, energy: 0.7, bassOn: false });
catMotif(1455, 0.55);
sfx.add(smp(1475), I.thump(94), 0.35);
dogMotif(1490, 0.65);
catMotif(1550, 0.4, 12);
dogMotif(1575, 0.5);
music.add(smp(1625) - sec(0.4), I.reverseCymbal(0.4, 84), 0.3);
// f1625 end card stab with the logo slam; f1700 the final stab; ring out to f1799
stabAt(1625, 'C', 0.55, 0.5);
music.add(smp(1625), I.kick(1, { punch: 1.2 }), 0.8);
music.add(smp(1625), I.crash(5, 2.4), 0.4);
padBar(1625, 'C', fs(170), 0.14, 1600);
sfx.add(smp(1650), I.thump(95), 0.35);
sfx.add(smp(1675), I.thump(96), 0.3);
stabAt(1700, 'C', 0.5, 0.9, 12);
music.add(smp(1700), I.kick(1, { punch: 1 }), 0.7);
music.add(smp(1700), I.crash(6, 2.2), 0.3);
cue(1625, 'end card stab');
cue(1700, 'final stab');

// ---------------------------------------------------------------- space, ducking, master

function reverbSend(bus, amount) {
  const [wl, wr] = freeverb(bus.L, bus.R, { room: 0.78, damp: 0.4 });
  for (let i = 0; i < bus.n; i++) {
    bus.L[i] += wl[i] * amount;
    bus.R[i] += wr[i] * amount;
  }
}
reverbSend(music, 0.12);
reverbSend(sfx, 0.06);

/** The music dips 9 dB under every designed impact: a 2-frame suck-out, held 5 frames, released over 8. */
function duck(bus, frames) {
  const g = new Float32Array(bus.n).fill(1);
  const lo = dbToGain(-9);
  for (const f of frames) {
    const a = smp(f - 2), h = smp(f + 5), r = smp(f + 13);
    for (let i = Math.max(0, a); i < Math.min(bus.n, r); i++) {
      const v = i < smp(f) ? 1 - (1 - lo) * ((i - a) / (smp(f) - a)) : i < h ? lo : lo + (1 - lo) * ((i - h) / (r - h));
      g[i] = Math.min(g[i], v);
    }
  }
  // the hole before the core burst
  for (let i = smp(1294); i < smp(1300); i++) g[i] = Math.min(g[i], 0.05);
  // the slow-motion low-pass after it is applied below
  bus.gainCurve((i) => g[i]);
}
duck(music, IMPACTS[30]);
music.region(smp(1300), smp(1332), (x) => biquad(x, 'lp', 700, 0.7));

/** Integrated loudness (LUFS) and true peak (dBTP) of a WAV, measured by ffmpeg ebur128. */
function measure(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(s)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}

/** Sum the stems, glue, set -14 LUFS, true-peak limit at -1.9 dB (ffmpeg reads inter-sample peaks higher) (iterated: the limiter lowers the loudness). */
function master(m, x, name) {
  const bus = new Bus(m.n);
  bus.mixIn(m, 1);
  bus.mixIn(x, 1);
  compress(bus, { threshDb: -14, ratio: 1.6, attack: 0.015, release: 0.2 });
  const tmp = join(OUT, `.${name}.wav`);
  let gain = 1;
  let r = null;
  for (let k = 0; k < 5; k++) {
    const b = bus.clone();
    b.gainCurve(() => gain);
    limit(b, -1.9, 0.002, 0.08);
    // a short fade-in on the first frame only (no click); the last frame rings out (no fade to silence)
    b.gainCurve((i) => Math.min(1, i / sec(0.004)), 0, sec(0.004));
    writeWav(tmp, b.L, b.R);
    r = measure(tmp);
    if (Math.abs(r.I + 14) <= 0.15 && r.TP <= -1) {
      writeWav(join(OUT, `${name}.wav`), b.L, b.R);
      break;
    }
    gain *= dbToGain(-14 - r.I);
    if (k === 4) writeWav(join(OUT, `${name}.wav`), b.L, b.R);
  }
  execFileSync('rm', ['-f', tmp]);
  return measure(join(OUT, `${name}.wav`));
}

writeWavFloat(join(OUT, 'stems', 'music-30.wav'), music.L, music.R);
writeWavFloat(join(OUT, 'stems', 'sfx-30.wav'), sfx.L, sfx.R);
const loud30 = master(music, sfx, 'score-30');
console.log(`[score] 30 s: ${JSON.stringify(loud30)}`);

/** The 15 s stems: segments of the 30 s stems on the beat grid, with 3 ms crossfades at each splice. */
function splice(src, segs, n) {
  const out = new Bus(smp(n));
  const xf = sec(0.003);
  for (const [a, b, off] of segs) {
    const s0 = smp(a), s1 = smp(b + 1);
    for (let i = s0; i < s1; i++) {
      const w = Math.min(1, (i - s0 + 1) / xf, (s1 - i) / xf);
      out.L[i] += src.L[i + smp(off)] * w;
      out.R[i] += src.R[i + smp(off)] * w;
    }
  }
  return out;
}
const loud15 = master(splice(music, CUT15, 900), splice(sfx, CUT15, 900), 'score-15');
console.log(`[score] 15 s: ${JSON.stringify(loud15)}`);
writeFileSync(join(OUT, 'cues.json'), `${JSON.stringify({ bpm: 144, beatFrames: BEAT, loudness: { 30: loud30, 15: loud15 }, cues: cues.sort((a, b) => a.f - b.f) }, null, 1)}\n`);
