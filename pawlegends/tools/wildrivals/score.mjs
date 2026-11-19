#!/usr/bin/env node
/**
 * Trailer "Wild Rivals" sound: an original documentary bed at 96 BPM (solo cello, kalimba, synthesised field-recording
 * birds, pizzicato), doubling to a 192 BPM drum line on the same grid at the first ultimate, a 6-frame silent hole
 * before it, the big chord when the documentary breaks, the loudest hit on the dog core, the cello's last note and the
 * v6 brand sting on the end card. Under it the game's own SFX from the takes (captured with the picture, no match
 * music), up front. All instruments are ours (../trailer/instruments.mjs, ../trailer/dsp.mjs); no samples.
 *
 *   node tools/wildrivals/score.mjs --cut 30 --takes DIR --out DIR [--sting kit.wav]
 *
 * Writes DIR/wild-rivals-<cut>.wav (48 kHz stereo, -14 LUFS integrated, true peak <= -1 dBTP) and cues.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { Bus, SR, adsr, biquad, compress, dbToGain, decay, hz, limit, mix, mul, noise, saw, sec, sine, sweep, triangle, writeWav } from '../trailer/dsp.mjs';
import { BEAT, CUTS } from './timeline.mjs';

const I = await bundleImport('tools/trailer/instruments.mjs');
async function bundleImport(entry) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { build } = await import('vite');
  const r = await build({
    configFile: false, mode: 'production', root, logLevel: 'silent', define: { 'import.meta.env': '{}' },
    build: { write: false, emptyOutDir: false, minify: false, target: 'es2022', lib: { entry: resolve(root, entry), formats: ['es'], fileName: () => 'instruments.js' }, rolldownOptions: { output: { codeSplitting: false } } },
  });
  const chunk = (Array.isArray(r) ? r : [r]).flatMap((o) => o.output).find((o) => o.type === 'chunk');
  const file = join(tmpdir(), `pl-wildrivals-instruments-${process.pid}.mjs`);
  writeFileSync(file, chunk.code);
  try { return await import(pathToFileURL(file).href); } finally { execFileSync('rm', ['-f', file]); }
}

const CUT = +(argValue('--cut') ?? 30);
const K = CUTS[CUT];
const TAKES = argValue('--takes');
const OUT = resolve(argValue('--out') ?? 'out');
const STING = argValue('--sting');
mkdirSync(OUT, { recursive: true });
const N = sec(K.len);
const music = new Bus(N), sfx = new Bus(N);
const at = (s) => sec(s);
const cues = [];
const cue = (s, c) => cues.push({ s: +s.toFixed(3), c });

// ------------------------------------------------------------------ our instruments
/** Bowed cello: three detuned saws through a body formant, slow bow attack, vibrato after 0.18 s. */
function cello(midi, len, { g = 1, att = 0.09, vib = 1, bright = 1 } = {}) {
  const n = sec(len + 0.25);
  const f0 = hz(midi);
  const fr = (i) => f0 * (1 + vib * 0.004 * Math.sin((2 * Math.PI * 5.4 * i) / SR) * Math.min(1, Math.max(0, (i / SR - 0.18) / 0.3)));
  const s = mix([saw(n, fr), 0.5], [saw(n, (i) => fr(i) * 1.003, 0.3), 0.3], [saw(n, (i) => fr(i) * 0.997, 0.6), 0.3]);
  let b = biquad(s, 'lp', 2600 * bright, 0.7);
  b = mix([b, 0.7], [biquad(b, 'bp', 280, 1.4), 0.6], [biquad(b, 'bp', 1150, 2), 0.35]);
  const bow = mul(biquad(noise(n, midi * 7), 'bp', f0 * 4, 3), adsr(n, 0.01, 0.12, 0.08, 0.2));
  return mul(mix([b, 1], [bow, 0.12 * bright]), adsr(n, att, 0.2, 0.85, 0.22)).map((v) => v * g);
}
/** Pizzicato: a plucked string, fast decay, warm. */
function pizz(midi, g = 1) {
  const n = sec(0.9);
  const f = hz(midi);
  const s = mix([triangle(n, f), 0.8], [saw(n, f), 0.25], [sine(n, f * 2), 0.2]);
  return mul(biquad(s, 'lp', sweep(3200, 500, sec(0.3)), 0.9), decay(n, 0.22, 0.002)).map((v) => v * g);
}
/** Kalimba: a short FM tine. */
function kalimba(midi, g = 1) {
  const n = sec(0.7);
  const f = hz(midi);
  const out = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = Math.sin(pc + Math.sin(pm) * (1.4 * Math.exp(-t / 0.03) + 0.15)) * Math.exp(-t / 0.22) * g;
    pc += (2 * Math.PI * f) / SR;
    pm += (2 * Math.PI * f * 5.95) / SR;
  }
  for (let i = 0; i < 96; i++) out[i] *= i / 96;
  return out;
}
/** A synthesised bird: two to four fast chirps (sine sweeps 2.4-5.5 kHz with a warble). */
function bird(seed, g = 1) {
  const r = (k) => { const s = Math.sin(seed * 91.7 + k * 13.3) * 43758.5453; return s - Math.floor(s); };
  const count = 2 + Math.floor(r(1) * 3);
  const out = new Float32Array(sec(0.12 * count + 0.2));
  for (let c = 0; c < count; c++) {
    const n = sec(0.06 + r(c + 2) * 0.05);
    const f0 = 2400 + r(c + 5) * 2200, f1 = f0 * (0.7 + r(c + 9) * 0.8);
    let ph = 0;
    const o = Math.round(c * sec(0.11));
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const f = f0 + (f1 - f0) * p + 180 * Math.sin(2 * Math.PI * 38 * (i / SR));
      ph += (2 * Math.PI * f) / SR;
      out[o + i] += Math.sin(ph) * Math.sin(Math.PI * p) ** 1.5 * g;
    }
  }
  return out;
}

// ------------------------------------------------------------------ the bed (96 BPM), cello theme
const CH = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]; // Dm, Bb, F, C
const bar = BEAT * 4;
const chordAt = (s) => CH[Math.floor(s / bar) % 4];
const D = K.double;
// hook: frame-0 pizzicato (with the meteors from the take)
music.add(0, pizz(38, 0.9), 0.9, -0.1);
music.add(0, pizz(50, 0.7), 0.7, 0.1);
cue(0, 'pizz hook');
// cello theme from the title on
const THEME = [[57, 2], [53, 1], [55, 1], [57, 1.5], [58, 0.5], [57, 1], [53, 1], [60, 2], [57, 1], [53, 1], [55, 3], [52, 1], [50, 2], [53, 1], [57, 1], [58, 2], [57, 1], [55, 1], [53, 3], [57, 1]];
{
  let s = 1.4;
  for (let rep = 0; s < D - 0.4; rep++) {
    for (const [m, b] of THEME) {
      if (s >= D - 0.4) break;
      const len = Math.min(b * BEAT, D - 0.2 - s);
      music.add(at(s), cello(m - 12 + (rep % 2 ? 0 : 0), len * 0.98, { g: 0.55 }), 0.55, -0.15);
      s += b * BEAT;
    }
  }
  cue(1.4, 'cello theme');
}
// pizzicato bass on beats 1 and 3, kalimba 8ths from the first gag on
for (let s = 1.4; s < D - 0.3; s += BEAT * 2) music.add(at(s), pizz(chordAt(s)[0] - 12, 0.6), 0.6, 0);
for (let s = 3.2, k = 0; s < D - 0.35; s += BEAT / 2, k++) {
  const c = chordAt(s);
  const m = [c[0], c[1], c[2], c[1] + 12][k % 4] + 24;
  music.add(at(s), kalimba(m, 0.35), 0.35, (k % 2 ? 0.4 : -0.4));
}
// birds through the documentary
for (let s = 0.6, k = 0; s < D - 0.5; s += 1.1 + ((k * 0.37) % 0.9), k++) music.add(at(s), biquad(bird(k + 1, 0.18), 'hp', 1800), 0.18, ((k * 0.61) % 1.6) - 0.8);
// story cues: the two-note cello gasp on the possum, the tension on the stalk, the rising call
const segAt = (take) => K.segs.find((x) => x.take === take);
const flop = segAt('g04-flop');
if (flop) { music.add(at(flop.t0 + 0.05), cello(55, 0.18, { g: 0.7, att: 0.01 }), 0.7, 0.2); music.add(at(flop.t0 + 0.3), cello(61, 0.5, { g: 0.7, att: 0.01 }), 0.7, 0.2); cue(flop.t0, 'cello gasp'); }
const stalk = segAt('g05-stalk');
if (stalk) { music.add(at(stalk.t0), cello(38, stalk.t1 - stalk.t0, { g: 0.6, vib: 3, att: 0.3, bright: 0.7 }), 0.6, -0.2); cue(stalk.t0, 'tension'); }
const howl = segAt('g07-howl');
if (howl) { const [L, R] = I.pad([50, 57, 62, 65], howl.t1 - howl.t0 - 0.2, { cutoff: 1100, attack: 1.4, release: 0.2 }); music.addStereo(at(howl.t0), L, R, 0.3); music.add(at(howl.t0 + 0.5), I.riser(howl.t1 - howl.t0 - 0.7), 0.25); cue(howl.t0, 'the call'); }
const shake = segAt('g12-shake');
if (shake) { music.add(at(shake.t0 + 0.9), cello(43, 0.35, { g: 0.7, att: 0.02 }), 0.7); music.add(at(shake.t0 + 1.3), cello(41, 0.6, { g: 0.7, att: 0.02 }), 0.7); cue(shake.t0, 'harrumph'); }
const box = K.segs.find((x) => x.gem === 'E');
if (box) { music.add(at(box.t0 + 0.05), pizz(62, 0.8), 0.8, 0.3); music.add(at(box.t0 + 0.4), pizz(55, 0.8), 0.8, -0.3); cue(box.t0, 'comic sting'); }
// the season wheel turns: a kalimba glissando
for (const s of K.segs.filter((x) => x.wheel)) for (let k = 0; k < 5; k++) music.add(at(s.t0 + k * 0.06), kalimba(62 + [0, 3, 7, 10, 12][k], 0.4), 0.4, k / 5 - 0.4);

// ------------------------------------------------------------------ the drum line (192 BPM = BEAT / 2)
const b2 = BEAT / 2;
const endDrums = K.end;
for (let s = D, k = 0; s < endDrums - 1e-6; s += b2, k++) {
  const inBar = k % 4;
  if (inBar === 0 || inBar === 2) music.add(at(s), I.kick(1, { punch: 1.1 }), 0.9);
  if (inBar === 1 || inBar === 3) music.add(at(s), I.snare(2), 0.55, 0.05);
  music.add(at(s), I.hat(4), 0.18, 0.3);
  music.add(at(s + b2 / 2), I.hat(5), 0.12, 0.35);
  // cello ostinato: spiccato eighths on the chord root and fifth
  const c = chordAt((s - D) * 2);
  music.add(at(s), cello(c[0] - 12, b2 * 0.42, { g: 0.6, att: 0.008, vib: 0 }), 0.6, -0.2);
  music.add(at(s + b2 / 2), cello(c[2] - 12, b2 * 0.4, { g: 0.5, att: 0.008, vib: 0 }), 0.5, -0.2);
  if (inBar === 0) music.add(at(s), I.bass(c[0] - 24, b2 * 3.6), 0.4);
}
music.add(at(D), I.crash(5), 0.5);
music.add(at(D), I.impact(90), 0.6);
cue(D, 'drum line');
// a short tom fill into the migration painting
for (let k = 0; k < 4; k++) music.add(at(K.matteOpen - b2 * (4 - k) / 2), I.tom(140 - k * 18, 6 + k), 0.5);
// the big chord when the documentary breaks
{
  const [L, R] = I.stab([50, 57, 62, 65, 69], 0.9, 1.0);
  music.addStereo(at(K.matteOpen), L, R, 0.6);
  const [pl, pr] = I.pad([38, 50, 57, 62, 65], 1.4, { cutoff: 2200, attack: 0.05 });
  music.addStereo(at(K.matteOpen), pl, pr, 0.35);
  music.add(at(K.matteOpen), I.crash(6), 0.55);
  cue(K.matteOpen, 'big chord');
}
// the loudest hit: the dog core
music.add(at(K.peak), I.impact(91, { sub: 38, len: 1.8 }), 1.0);
music.add(at(K.peak), I.crash(7, 3), 0.7);
music.add(at(K.peak), I.subDrop(), 0.8);
cue(K.peak, 'peak hit');
// end card: the cello's last note, the brand sting
music.add(at(K.end), cello(38, Math.min(3.2, K.out - K.end - 0.6), { g: 0.8, att: 0.05 }), 0.8, -0.1);
music.add(at(K.end), cello(50, Math.min(3.2, K.out - K.end - 0.6), { g: 0.5, att: 0.2 }), 0.5, 0.1);
if (STING && existsSync(STING)) { music.add(at(K.end + 0.35), decode(STING), 0.85); cue(K.end + 0.35, 'v6 sting'); }
if (K.matteBack) { music.add(at(K.matteBack), pizz(50, 0.9), 0.9); cue(K.matteBack, 'button pizz'); }

// ------------------------------------------------------------------ the game's own sounds (the takes' audio)
function decode(path) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
function decodeSt(path) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 29 });
  const a = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const L = new Float32Array(a.length / 2), R = new Float32Array(a.length / 2);
  for (let i = 0; i < L.length; i++) { L[i] = a[2 * i]; R[i] = a[2 * i + 1]; }
  return [L, R];
}
const cache = new Map();
for (const s of K.segs) {
  if (!s.take || !TAKES) continue;
  const f = join(TAKES, `${s.take}-h.mp4`);
  if (!existsSync(f)) { console.error(`[score] no take ${f}`); continue; }
  if (!cache.has(f)) cache.set(f, decodeSt(f));
  const [L, R] = cache.get(f);
  const a = sec(s.in), n = sec(s.t1 - s.t0);
  const fade = sec(0.006);
  const l = L.slice(a, a + n), r = R.slice(a, a + n);
  for (let i = 0; i < fade && i < l.length; i++) { const k = i / fade; l[i] *= k; r[i] *= k; l[l.length - 1 - i] *= k; r[r.length - 1 - i] *= k; }
  // the hook and the gags keep the game up front; the salvo and the herd sit with the drums
  sfx.addStereo(at(s.t0), l, r, s.t0 >= K.double ? 0.75 : 0.95);
}
// the silent hole (6 frames), then the drum line
const [h0, h1] = K.hole;
for (const b of [music, sfx]) b.gainCurve((i) => { const t = i / SR; return t >= h0 && t < h1 ? 0.0 : t >= h0 - 0.004 && t < h0 ? (h0 - t) / 0.004 : 1; }, sec(h0 - 0.01), sec(h1));
// the end: out by K.out
for (const b of [music, sfx]) b.gainCurve((i) => { const t = i / SR; return t >= K.out ? 0 : t > K.out - 0.6 ? (K.out - t) / 0.6 : 1; }, sec(K.out - 0.6), N);

// ------------------------------------------------------------------ master: -14 LUFS, true peak <= -1 dBTP
function measure(path) {
  const o = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = o.slice(o.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(s)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}
// the documentary bed sits 4 dB up against the drum line (the drums carry their own weight)
music.gainCurve((i) => (i / SR < K.double ? 1.6 : 1));
const bus = new Bus(N);
bus.mixIn(music, 0.62);
bus.mixIn(sfx, 1.0);
compress(bus, { threshDb: -16, ratio: 1.8, attack: 0.012, release: 0.2 });
const outWav = join(OUT, `wild-rivals-${CUT}.wav`);
const tmp = join(OUT, `.tmp-${CUT}.wav`);
let gain = 1, r = null;
for (let k = 0; k < 8; k++) {
  const b = bus.clone();
  b.gainCurve(() => gain);
  limit(b, -2.8, 0.002, 0.12);
  b.gainCurve((i) => Math.min(1, i / sec(0.002)), 0, sec(0.002));
  writeWav(tmp, b.L, b.R);
  r = measure(tmp);
  if (Math.abs(r.I + 14) <= 0.2 && r.TP <= -1.0) break;
  gain *= dbToGain(-14 - r.I);
}
execFileSync('mv', [tmp, outWav]);
writeFileSync(join(OUT, `cues-${CUT}.json`), JSON.stringify({ cut: CUT, bpm: 96, loudness: r, cues: cues.sort((a, b) => a.s - b.s) }, null, 1) + '\n');
console.log(`[score ${CUT}] ${JSON.stringify(r)} -> ${outWav}`);
