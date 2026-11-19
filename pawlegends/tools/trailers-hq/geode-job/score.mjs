#!/usr/bin/env node
/**
 * The Geode Job score: an original 120 BPM spy groove (swung upright bass, muted surf guitar, finger snaps, brushed
 * kit), a double-time break from the alarm, dog brass for the villain, a tuba for the comedy beats, the v6 sting on
 * the end card and a board-meeting gong as the last sound. Our own synthesised instruments (../../trailer/instruments
 * .mjs) plus the game's SFX from each take (its own audio track, music off), placed under the cut.
 *
 *   node tools/trailers-hq/geode-job/score.mjs --cut 30s|60s --takes DIR --out DIR [--sting wav]
 * Writes DIR/score-<cut>.wav (48 kHz 24-bit, -14 LUFS integrated, true peak <= -1 dBTP) and cues-<cut>.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue } from '../../lib/args.mjs';
import { Bus, SR, biquad, compress, dbToGain, decay, hz, limit, mix, mul, noise, sec, sine, sweep, tanhSat, triangle, writeWav } from '../../trailer/dsp.mjs';
import { CUTS } from './timeline.mjs';

const CUT = argValue('--cut');
const TAKES = resolve(argValue('--takes'));
const OUT = resolve(argValue('--out'));
const STING = argValue('--sting');
mkdirSync(OUT, { recursive: true });
const I = await bundleImport('tools/trailer/instruments.mjs');
async function bundleImport(entry) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const { build } = await import('vite');
  const r = await build({
    configFile: false, mode: 'production', root, logLevel: 'silent', define: { 'import.meta.env': '{}' },
    build: { write: false, emptyOutDir: false, minify: false, target: 'es2022', lib: { entry: resolve(root, entry), formats: ['es'], fileName: () => 'instruments.js' }, rolldownOptions: { output: { codeSplitting: false } } },
  });
  const chunk = (Array.isArray(r) ? r : [r]).flatMap((o) => o.output).find((o) => o.type === 'chunk');
  const file = join(tmpdir(), `pl-geode-instruments-${process.pid}.mjs`);
  writeFileSync(file, chunk.code);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    execFileSync('rm', ['-f', file]);
  }
}
function decode(path, ss, dur) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(ss), '-t', String(dur), '-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const L = new Float32Array(all.length / 2), R = new Float32Array(all.length / 2);
  for (let i = 0; i < L.length; i++) (L[i] = all[2 * i]), (R[i] = all[2 * i + 1]);
  return [L, R];
}

const { dur: DUR, segs } = CUTS[CUT];
const N = sec(DUR);
const music = new Bus(N), sfx = new Bus(N), game = new Bus(N);
const cues = [];
const cue = (t, name) => cues.push({ t: +t.toFixed(3), cue: name });
const S = (t) => sec(t);
const B = 0.5; // a beat
const SW = 0.333; // swung 8th offset (triplet feel)

// ---------------------------------------------------------------- our instruments for this cue
/** Upright bass: a plucked sine/triangle body with a thumpy attack and a short ring. */
function upright(midi, len = 0.42, g = 1) {
  const n = sec(len + 0.12);
  const f = hz(midi);
  const body = mix([sine(n, f), 0.9], [triangle(n, f * 2), 0.18], [sine(n, f * 3), 0.06]);
  const env = decay(n, len * 0.55, 0.004);
  const thump = mul(biquad(noise(sec(0.03), midi), 'lp', 600, 0.7), decay(sec(0.03), 0.01, 0.001));
  const out = tanhSat(mul(body, env), 1.3);
  for (let i = 0; i < thump.length; i++) out[i] += thump[i] * 0.4;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}
/** Muted surf guitar: a short bright pluck through a spring-ish comb. */
function surf(midi, len = 0.11) {
  const x = I.pluck(midi, len, 50 + midi);
  const y = new Float32Array(x.length + sec(0.09));
  const d1 = sec(0.031), d2 = sec(0.047);
  for (let i = 0; i < y.length; i++) {
    const v = i < x.length ? x[i] : 0;
    y[i] = v + (i >= d1 ? y[i - d1] * 0.32 : 0) + (i >= d2 ? y[i - d2] * 0.22 : 0);
  }
  return biquad(y, 'hp', 220, 0.7);
}
function brush(seed) {
  const n = sec(0.16);
  return mul(biquad(noise(n, seed), 'bp', 5200, 0.8), decay(n, 0.05, 0.004));
}
/** The board-meeting gong: inharmonic partials, a mallet thud, a long shimmer. */
function gong(len = 2.2) {
  const n = sec(len);
  const parts = [[1, 1], [1.483, 0.6], [1.932, 0.45], [2.546, 0.3], [3.11, 0.22], [4.05, 0.12]];
  const out = new Float32Array(n);
  for (const [k, a] of parts) {
    const s = sine(n, (i) => 98 * k * (1 + 0.004 * Math.sin(i / 2400)));
    const e = decay(n, len * (0.5 / k + 0.15), 0.006);
    for (let i = 0; i < n; i++) out[i] += s[i] * e[i] * a;
  }
  const th = mul(biquad(noise(sec(0.08), 9), 'lp', 300), decay(sec(0.08), 0.03, 0.001));
  for (let i = 0; i < th.length; i++) out[i] += th[i] * 0.8;
  return tanhSat(out, 1.2);
}
/** A tape stop: a held chord pitched down to nothing over `len`. */
function tapeStop(len = 0.35) {
  const n = sec(len);
  const f = (i) => hz(57) * (1 - i / n) ** 1.6;
  const s = mix([sine(n, f), 0.6], [triangle(n, (i) => f(i) * 1.5), 0.3]);
  return mul(s, decay(n, len, 0.001));
}
function scratch(len = 0.28, seed = 61) {
  const n = sec(len);
  return mul(biquad(noise(n, seed), 'bp', sweep(2600, 500, n), 3), decay(n, len * 0.6, 0.002));
}
function siren(len, seed = 64) {
  const n = sec(len);
  const f = (i) => 700 + 380 * Math.sin((i / SR) * Math.PI * 2 * 1.6);
  return mul(biquad(mix([sine(n, f), 0.6], [triangle(n, (i) => f(i) * 1.01), 0.4]), 'lp', 2400), decay(n, len * 1.2, 0.02));
}

// harmony: A minor spy (Am - Am - F - E7), walking line per chord
const BAR = { Am: [45, 48, 50, 52], F: [41, 45, 48, 47], E: [40, 44, 47, 46] };
const PROG = ['Am', 'Am', 'F', 'E'];
const RIFF = [[0, 64], [0.5, 65], [1, 66], [1.5, 65], [2, 64], [2.75, 67], [3, 69], [3.5, 67]];
const TRIAD = { Am: [57, 60, 64], F: [57, 60, 65], E: [56, 59, 64] };

function groove(a, b, { dbl = false, riff = true, energy = 1, bassOnly = false } = {}) {
  for (let t = a; t < b - 1e-6; t += B) {
    const bi = Math.round((t - a) / B);
    const chord = PROG[Math.floor(bi / 4) % 4];
    const beat = bi % 4;
    music.add(S(t), upright(BAR[chord][beat] - 12, 0.42), 0.75 * energy, -0.1);
    if (beat === 3) music.add(S(t + SW), upright(BAR[chord][0] - 11, 0.14), 0.35 * energy, -0.1);
    if (bassOnly) continue;
    // snaps on 2 and 4, a brushed ride on the swung 8ths
    if (beat % 2) music.add(S(t), I.snap(91 + beat), 0.55 * energy, 0.25);
    music.add(S(t), brush(10 + bi), 0.22 * energy, -0.35);
    music.add(S(t + SW), brush(30 + bi), 0.13 * energy, -0.35);
    if (dbl) {
      // the double-time break on the same grid: kick on every beat, snare on the off-beats, 16th hats
      music.add(S(t), I.kick(1, { punch: 1.1 }), 0.85 * energy);
      music.add(S(t + B / 2), I.snare(2, 210), 0.42 * energy);
      for (let k = 0; k < 4; k++) music.add(S(t + (k * B) / 4), I.hat(4 + k), (k % 2 ? 0.08 : 0.13) * energy, 0.3);
    } else if (beat === 0 || beat === 2) music.add(S(t), I.kick(2, { punch: 0.8, len: 0.3 }), 0.55 * energy);
    if (riff && beat === 0 && Math.floor(bi / 4) % 2 === 0) for (const [o, m] of RIFF) if (t + o < b) music.add(S(t + o), surf(m), 0.36 * energy, 0.3);
    if (beat === 0) {
      const [L, R] = I.pad(TRIAD[chord].map((m) => m - 12), 2.0, { cutoff: 900 });
      music.addStereo(S(t), L, R, 0.05 * energy);
    }
  }
}
const villain = (t, g = 0.6) => {
  const [L, R] = I.stab([45, 48, 51], 0.6, 0.6);
  music.addStereo(S(t), L, R, g * 0.7);
  music.add(S(t), I.tuba(33, 0.9), g, -0.2);
  music.add(S(t + 0.25), I.tuba(32, 0.5), g * 0.8, -0.2);
};
const tubaBump = (t) => {
  music.add(S(t), I.tuba(40, 0.18), 0.7);
  music.add(S(t + 0.25), I.tuba(35, 0.35), 0.75);
};
const dogMotif = (t) => {
  for (const [o, m] of [[0, 45], [0.25, 45], [0.5, 43], [0.75, 41], [1.0, 40]]) music.add(S(t + o), I.tuba(m, o === 1 ? 0.6 : 0.2), 0.6, -0.2);
};
const horns = (t, len) => {
  for (let k = 0; k < 4; k++) {
    const [L, R] = I.stab([57 + k * 2, 60 + k * 2, 64 + k * 2], 0.22, 0.8, 12 + k);
    music.addStereo(S(t + (k * len) / 4), L, R, 0.35 + k * 0.08);
  }
};
const hit = (t, g = 0.7, big = false) => {
  sfx.add(S(t), I.impact(90 + Math.round(t * 7) % 9, { sub: big ? 40 : 50, len: big ? 1.4 : 0.6 }), big ? 0.95 : g);
};
const shutter = (t) => {
  sfx.add(S(t), I.snap(95), 0.7, 0.1);
  sfx.add(S(t + 0.03), mul(biquad(noise(sec(0.06), 12), 'hp', 3000), decay(sec(0.06), 0.02, 0.001)), 0.5, -0.1);
};

// ---------------------------------------------------------------- the game's own sounds from the takes
for (const s of segs) {
  const parts = s.kind === 'freeze' ? s.crew.map(([take, tin], k) => ({ take, tin, a: s.a + k * ((s.b - s.a) / 4), d: ((s.b - s.a) / 4) * 0.6 })) : s.kind === 'take' || s.kind === 'split' ? [{ take: s.take, tin: s.in, a: s.a, d: s.b - s.a }] : [];
  for (const p of parts) {
    const f = join(TAKES, `${p.take}-h.mp4`);
    if (!existsSync(f)) continue;
    const [L, R] = decode(f, p.tin, p.d);
    // 4 ms fades at both edges (a cut in the middle of a sound clicks)
    const r = sec(0.004);
    for (let i = 0; i < r && i < L.length; i++) {
      const g = i / r;
      L[i] *= g; R[i] *= g;
      L[L.length - 1 - i] *= g; R[R.length - 1 - i] *= g;
    }
    game.addStereo(S(p.a), L, R, 1);
  }
}

// ---------------------------------------------------------------- the cue sheet
const T = (name) => segs.find((s) => s.take === name || s.gem === name || s.kind === name);
const is30 = CUT === '30s';
// cold open: a snap and a bass hit on frame 0, the landing hit
music.add(0, I.snap(91), 0.9, 0.2);
music.add(0, upright(33, 0.8), 1.0);
sfx.add(0, I.subDrop(58, 34, 0.35, 0.3), 0.6);
hit(0.85, 0.7);
for (const t of [0.5, 1.0]) music.add(S(t), upright(t === 0.5 ? 40 : 43, 0.3), 0.6, -0.1);
music.add(S(1.0), I.snap(92), 0.5, 0.25);
cue(0, 'snap + bass');
const A = T('A');
groove(A.a, T('split').a, { energy: 0.9 });
cue(A.a, 'spy riff');
sfx.add(S(A.a), I.whoosh(0.25, 80, 1), 0.35);
// the crew freezes: a shutter snap on each
const F = T('freeze');
for (let k = 0; k < 4; k++) shutter(F.a + ((F.b - F.a) / 4) * (k + 0.6));
const Bv = T('B');
villain(Bv.a, 0.65);
cue(Bv.a, 'villain chord');
if (!is30) {
  const Ez = T('E');
  sfx.add(S(Ez.a + 0.2), mul(biquad(noise(sec(1.4), 5), 'lp', 400), decay(sec(1.4), 0.6, 0.3)), 0.25);
  music.add(S(Ez.a), upright(33, 1.2), 0.6);
  music.add(S(Ez.a + 1.0), upright(31, 1.0), 0.5);
  cue(Ez.a, 'snore');
  const Rg = T('t06-ranger');
  music.add(S(Rg.a + 1.4), I.stab([69, 72], 0.2, 1), 0.4);
  music.add(S(Rg.a + 1.7), I.stab([70, 74], 0.25, 1), 0.45);
}
// PLAN vs REALITY: the record stops on beat 1, the bass rolls back in with Meatball
const Sp = T('split');
music.add(S(Sp.a), tapeStop(0.35), 0.55);
sfx.add(S(Sp.a), scratch(0.3), 0.5);
const roll = Sp.a + (is30 ? 0.8 : 1.4);
cue(Sp.a, 'record stop');
for (let k = 0; k < 6; k++) music.add(S(roll - 0.3 + k * 0.05), upright(28 + k * 2, 0.12), 0.4);
const scream = T('t10-scream');
groove(roll, scream.a + (is30 ? 0 : 2.0), { energy: 1 });
hit(roll + 0.1, 0.55);
// the alarm: a siren built over the scream, the double-time break from here
const alarmAt = is30 ? scream.a : scream.a + 2.0;
sfx.add(S(alarmAt + 0.4), siren(is30 ? 0.9 : 1.8), 0.4, 0.15);
const Dg = T('t11-brutus');
groove(alarmAt, T('C').a, { dbl: true, energy: 1.05 });
cue(alarmAt, 'double-time break');
villain(Dg.a, 0.7);
cue(Dg.a, 'villain brass');
tubaBump(T('t12-loaf').a + 0.05);
cue(T('t12-loaf').a, 'tuba bump');
const can = T('t14-cannon');
hit(can.a + (is30 ? 1.03 : 0.93), 0.85, true);
cue(can.a + 1.0, 'cannon boom');
// the getaway panel: rising horns
const Cp = T('C');
horns(Cp.a, Cp.b - Cp.a);
if (!is30) {
  const fo = T('t16-fountain');
  for (const [o, m] of [[0, 69], [0.25, 72], [0.5, 76], [0.75, 81]]) music.add(S(fo.a + o), I.stab([m, m + 4], 0.2, 1), 0.4);
  // the fanfare is cut short by the needle
  groove(fo.a, fo.b, { energy: 0.95 });
  const Fm = T('F');
  groove(Fm.a + 0.3, Fm.b, { bassOnly: true, energy: 0.7 });
  sfx.add(S(Fm.a + 0.3), siren(0.7, 66), 0.15);
  sfx.add(S(Fm.a), scratch(0.35, 77), 0.65);
  cue(Fm.a, 'needle scratch');
}
// the double-cross: needle scratch, the dog motif in the bass
const dig = T('t18-dig');
if (is30) sfx.add(S(dig.a), scratch(0.35, 77), 0.65);
dogMotif(dig.a + 0.2);
groove(dig.a, dig.b, { bassOnly: true, energy: 0.9 });
hit(dig.fx[0].flash, 0.8);
// the full drop: the ult salvo and the Surge
const drop = dig.b;
const vic = T('t20b-victory');
const endc = T('end');
const nap = T('t22-brutus-nap');
music.add(S(drop), I.crash(5, 2.4), 0.5);
groove(drop, endc.a, { dbl: true, energy: 1.15 });
for (const s of segs) if (s.a >= drop && s.a < vic.a) hit(s.a, 0.55);
const burst = vic.fx[0].flash;
hit(burst, 1, true);
sfx.add(S(burst), I.subDrop(60, 28, 0.6, 0.6), 0.9);
music.add(S(burst), I.crash(6, 2.4), 0.7);
cue(burst, 'core burst (loudest)');
// the end card: a brass button and the v6 sting on the logo landing
const [bl, br] = I.stab([57, 61, 64, 69], 0.5, 1);
music.addStereo(S(endc.a + 0.1), bl, br, 0.6);
if (STING) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', STING, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 26 });
  sfx.add(S(endc.a + 0.1), new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), 0.8);
  cue(endc.a + 0.1, 'v6 sting');
}
music.add(S(endc.a + 0.1), upright(33, 1.4), 0.7);
groove(endc.a + 1.0, nap.a + 0.5, { bassOnly: true, energy: 0.6 });
{
  const [L, R] = I.pad([45, 52, 57, 60], nap.b - endc.a - 1.0, { cutoff: 1100, attack: 0.6 });
  music.addStereo(S(endc.a + 1.0), L, R, 0.09);
}
// the button: the board-meeting gong is the last sound
sfx.add(S(nap.a + 0.6), gong(1.6), 0.9);
cue(nap.a + 0.6, 'gong');

// ---------------------------------------------------------------- mix and master
function measure(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(s)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}
const bus = new Bus(N);
bus.mixIn(music, 0.85);
bus.mixIn(sfx, 0.6);
bus.mixIn(game, dbToGain(-9));
compress(bus, { threshDb: -16, ratio: 1.8, attack: 0.012, release: 0.2 });
// arc: the end card a touch under the climax, silence after the gong rings out
const endFade = DUR - 0.2;
const tmp = join(OUT, `.score-${CUT}.wav`);
let gain = 1, r = null;
for (let k = 0; k < 7; k++) {
  const b = bus.clone();
  b.gainCurve(() => gain);
  limit(b, -2.6, 0.002, 0.12);
  b.gainCurve((i) => Math.min(1, i / sec(0.003)), 0, sec(0.003));
  b.gainCurve((i) => Math.max(0, 1 - (i - sec(endFade)) / sec(0.2)), sec(endFade), N);
  writeWav(tmp, b.L, b.R);
  r = measure(tmp);
  writeWav(join(OUT, `score-${CUT}.wav`), b.L, b.R);
  if (Math.abs(r.I + 14) <= 0.2 && r.TP <= -1.6) break;
  gain *= dbToGain(-14 - r.I);
}
execFileSync('rm', ['-f', tmp]);
const loud = measure(join(OUT, `score-${CUT}.wav`));
console.log(`[score ${CUT}] ${JSON.stringify(loud)}`);
writeFileSync(join(OUT, `cues-${CUT}.json`), `${JSON.stringify({ bpm: 120, loudness: loud, cues: cues.sort((a, b) => a.t - b.t) }, null, 1)}\n`);
