#!/usr/bin/env node
/**
 * Trailer 30 ("The Rivalry") score: an original cue at 150 BPM (one beat = 24 frames at 60 fps, a bar = 96), cut to
 * the shot list in timeline.mjs. Our own synthesised instruments (../trailer/instruments.mjs), the game's own zzfx
 * sounds, the game's announcer lines (public/voice) and the v6 brand sting; no samples or stock audio.
 *
 *   node tools/trailer30/score.mjs --out DIR [--sting path.wav]
 *
 * Writes DIR/score.wav (48 kHz 24-bit stereo, -14 LUFS integrated, true peak <= -1 dBTP), DIR/stems/*.wav and
 * DIR/cues.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { Bus, SR, biquad, compress, dbToGain, decay, freeverb, limit, mul, noise, sec, sine, sweep, writeWav, writeWavFloat } from '../trailer/dsp.mjs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { BEAT, CUTS, FPS, HIT, N, SILENCE, VO } from './timeline.mjs';

// the instruments import the game's TypeScript sound banks: bundled like the sim tools are
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
  const file = join(tmpdir(), `pl-trailer30-instruments-${process.pid}.mjs`);
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

const smp = (f) => Math.round((f * SR) / FPS);
const fs = (frames) => frames / FPS;
const music = new Bus(smp(N));
const sfx = new Bus(smp(N));
const vo = new Bus(smp(N));
const cues = [];
const cue = (f, name) => cues.push({ f, s: +(f / FPS).toFixed(3), cue: name });

/** Decode any audio file to mono float at SR (ffmpeg). */
function decode(path, ch = 1) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

// ---------------------------------------------------------------- harmony and motifs (A minor, rivalry)
const CH = {
  Am: { root: 33, tri: [57, 60, 64] },
  F: { root: 29, tri: [57, 60, 65] },
  C: { root: 36, tri: [55, 60, 64] },
  G: { root: 31, tri: [55, 59, 62] },
  E: { root: 28, tri: [56, 59, 64] },
  D: { root: 38, tri: [57, 62, 66] },
};
const PROG = ['Am', 'F', 'C', 'G'];
const CAT = [[0, 76], [3, 79], [6, 81], [9, 84], [12, 83], [15, 81]];
const DOG = [[0, 45], [4, 45], [6, 43], [8, 41], [12, 40]];
const s16 = BEAT / 4;
const catMotif = (f, g = 0.55, tr = 0) => {
  for (const [s, m] of CAT) music.add(smp(f + s * s16), I.pluck(m + tr, 0.16, 50 + s), g, 0.25);
};
const dogMotif = (f, g = 0.6, tr = 0) => {
  for (const [s, m] of DOG) music.add(smp(f + s * s16), I.tuba(m + tr, fs(s16 * (s === 12 ? 6 : 2.2))), g, -0.25);
};
const stabAt = (f, chord, g = 0.5, len = 0.3, oct = 0) => {
  const [L, R] = I.stab(CH[chord].tri.map((m) => m + oct), len, 1);
  music.addStereo(smp(f), L, R, g);
};
const padAt = (f, chord, len, g = 0.18, cutoff = 1400, oct = -12) => {
  const [L, R] = I.pad(CH[chord].tri.map((m) => m + oct), len, { cutoff });
  music.addStereo(smp(f), L, R, g);
};
const taiko = (f, g = 0.7) => {
  music.add(smp(f), I.tom(82, 6), g, -0.1);
  music.add(smp(f), I.kick(2, { punch: 1.2 }), g * 0.6);
};

/** The groove over [a, b): kick, clap, hats, bass. `dbl`: double-time hats and a 16th kick pickup. */
function groove(a, b, { half = false, dbl = false, energy = 1, tai = false } = {}) {
  for (let f = a; f < b; f += BEAT) {
    const bi = Math.round((f - a) / BEAT);
    const inBar = bi % 4;
    const chord = PROG[Math.floor(bi / 4) % 4];
    if (!half || inBar === 0 || inBar === 2) music.add(smp(f), I.kick(1, { punch: 1.1 }), 0.95 * energy);
    if (!half && (inBar === 1 || inBar === 3)) {
      music.add(smp(f), I.clap(3), 0.5 * energy, 0.05);
      music.add(smp(f), I.snare(2, 200), 0.35 * energy);
    }
    if (dbl && inBar === 3) music.add(smp(f + BEAT * 0.75), I.kick(2, { punch: 0.8 }), 0.6 * energy);
    if (tai && inBar === 0) taiko(f, 0.55 * energy);
    const nh = half ? 2 : dbl ? 4 : 2;
    for (let k = 0; k < nh; k++) {
      const hf = f + (k * BEAT) / nh;
      if (hf < b) music.add(smp(hf), I.hat(4 + k, k === nh / 2 && !half), (k % 2 ? 0.1 : 0.17) * energy, k % 2 ? 0.3 : -0.3);
    }
    const r = CH[chord].root + 12;
    music.add(smp(f), I.bass(r, fs(BEAT * 0.45)), 0.42 * energy);
    if (!half) music.add(smp(f + BEAT / 2), I.bass(r + 12, fs(BEAT * 0.3)), 0.22 * energy);
    if (inBar === 0) padAt(f, chord, fs(BEAT * 4), 0.1 * energy, half ? 800 : 1600);
  }
}

/** A designed hit: the game's own sound plus a short impact. */
function hit(f, name = 'hit', g = 0.6, big = false) {
  sfx.add(smp(f), I.game(name), g);
  sfx.add(smp(f), I.impact(90 + (f % 7), { sub: big ? 40 : 52, len: big ? 1.4 : 0.5 }), big ? 0.9 : 0.45);
}
function heartbeat(f, g = 0.8) {
  const n = sec(0.35);
  const thump = (at, k) => sfx.add(smp(at), mul(sine(n, sweep(70, 38, sec(0.08))), decay(n, 0.09, 0.002)), g * k);
  thump(f, 1);
  thump(f + 9, 0.7);
}
function airWhistle(f, len) {
  const n = sec(fs(len));
  const x = biquad(noise(n, 401), 'bp', 1800, 6);
  const env = (p) => Float32Array.from({ length: n }, (_, i) => Math.sin((Math.PI * i) / n) ** p);
  sfx.add(smp(f), mul(x, env(2)), 0.5, 0.2);
  sfx.add(smp(f), mul(sine(n, sweep(900, 2600, n)), env(3)), 0.06, -0.2);
}
function rumble(f, len, g = 0.7) {
  const n = sec(len);
  sfx.add(smp(f), mul(biquad(noise(n, 77), 'lp', 140, 0.8), decay(n, len / 2.5, 0.02)), g);
}
function matchStrike(f) {
  const n = sec(0.45);
  sfx.add(smp(f), mul(biquad(noise(n, 501), 'hp', 2200), decay(n, 0.05, 0.001)), 0.7, 0.1);
  sfx.add(smp(f + 3), mul(biquad(noise(n, 502), 'bp', 900, 1.2), decay(n, 0.25, 0.01)), 0.35);
}
function voice(f, key, g = 1) {
  const p = join(PKG, 'public', 'voice', `${key}.mp3`);
  if (!existsSync(p)) throw new Error(`no voice line ${key}`);
  vo.add(smp(f), decode(p), g);
  cue(f, `vo ${key}`);
}

// ---------------------------------------------------------------- cue sheet (timeline.mjs)
const [cHook, cVs, cCharge, cMont, cWar, cLow, cEyes, cFight, cKey, cCore, cGlory, cEnd] = ['hook', 'vs', 'charge', 'montage', 'war', 'low', 'eyes', 'fight', 'key', 'core', 'glory', 'end'].map((k) => CUTS[k]);

// cold open: heartbeat x2, an air whistle, the game's whoosh, the sub thud on the ink frame
heartbeat(0, 0.9);
heartbeat(26, 0.8);
airWhistle(12, 40);
sfx.add(smp(36), I.whoosh(0.3, 80, 1), 0.5);
sfx.add(smp(HIT.hookInk), I.subDrop(60, 30, 0.5, 0.6), 0.9);
hit(HIT.hookInk, 'slam', 0.8, true);
cue(HIT.hookInk, 'ink impact');
sfx.add(smp(HIT.hookInk + 6), I.game('hit'), 0.4);

// VS: thunder crack, CATS (cat motif) / DOGS (dog motif)
sfx.add(smp(cVs), I.crackle(0.5, 93), 0.8);
sfx.add(smp(cVs), I.impact(91, { sub: 44, len: 1.2 }), 0.8);
stabAt(cVs, 'Am', 0.45, 0.3, 12);
catMotif(cVs, 0.6);
sfx.add(smp(cVs), I.thump(92), 0.6);
dogMotif(cVs + 12, 0.75);
sfx.add(smp(cVs + 12), I.thump(92), 0.6);
music.add(smp(cVs + 12), I.kick(1, { punch: 1.1 }), 0.7);
{
  const [L, R] = I.riser(fs(24), 70);
  music.addStereo(smp(cVs), L, R, 0.25);
}
cue(cVs, 'CATS');
cue(cVs + 12, 'DOGS');

// the drop on the charge: full groove with taiko
music.add(smp(cCharge), I.crash(5, 2.4), 0.5);
taiko(cCharge, 0.9);
groove(cCharge, cWar, { energy: 1, tai: true });
cue(cCharge, 'drop');

// the montage: a brass stab and a name call on every cut, the game's hit on every freeze
for (let i = 0; i < 8; i++) {
  const f = cMont + i * 48;
  const chord = ['Am', 'E', 'F', 'G', 'Am', 'E', 'F', 'D'][i];
  const loud = i === 7;
  stabAt(f, chord, loud ? 0.75 : 0.5, 0.28, i % 2 ? -12 : 0);
  if (loud) stabAt(f, chord, 0.4, 0.4, 12);
  if (VO.names[i]) voice(f + 3, VO.names[i], 1.0);
  hit(f + 14, ['hit', 'slam', 'hit', 'slam', 'hit', 'slam', 'hit', 'slam'][i], loud ? 0.75 : 0.55);
  sfx.add(Math.max(0, smp(f) - sec(0.12)), I.whoosh(0.12, 80 + i, 1), 0.3);
  if (i % 2 === 0) catMotif(f + 24, 0.25);
  else dogMotif(f + 24, 0.3);
}

// PICK A SIDE: half-time, low choir (dark pads), the body ~3 LU under the climax
groove(cWar, cLow, { half: true, energy: 0.75 });
padAt(cWar, 'Am', fs(72), 0.22, 700, -24);
padAt(cWar, 'E', fs(72), 0.16, 600, -12);
stabAt(cWar + 18, 'Am', 0.4, 0.4, -12);
sfx.add(smp(cWar + 18), I.thump(92), 0.55);
cue(cWar + 18, 'PICK A SIDE');

// the low point: a 6-frame hole, the tower crack and fall rumble, "our turret"
cue(SILENCE[0][0], 'silence hole 1');
hit(HIT.towerCrack, 'slam', 0.7, true);
rumble(HIT.towerCrack, 1.4, 0.9);
padAt(cLow + 6, 'Am', fs(66), 0.12, 500, -24);
voice(cLow + 8, 'ourTurret', 0.95);

// NOT OUT: match strike and a riser into the fight
matchStrike(cEyes);
{
  const [L, R] = I.riser(fs(cFight - cEyes), 71);
  music.addStereo(smp(cEyes), L, R, 0.35);
}
music.add(smp(cEyes + 6), I.snare(2, 190), 0.4);
cue(cEyes + 6, 'NOT OUT');

// the fight: double-time drums, a game hit on every cut
music.add(smp(cFight), I.crash(5, 2), 0.5);
groove(cFight, cKey, { dbl: true, energy: 1.1, tai: true });
for (const f of HIT.fightCuts) hit(f, f % 2 ? 'hit' : 'slam', 0.5);
for (let f = cFight; f < cKey; f += 96) {
  catMotif(f + 48, 0.3);
}
voice(HIT.triple + 4, 'triple', 1.0);
voice(HIT.comeback, 'comebackUs', 0.95);
voice(HIT.coreFalling, 'theirCoreFalling', 0.95);

// the key art: a reverse cymbal into the burst, a pad, then the 4-frame hole
padAt(cKey, 'F', fs(cCore - cKey), 0.2, 2000, 0);
{
  const rc = I.reverseCymbal(fs(cCore - cKey - 4), 83);
  sfx.add(smp(cCore - 4) - rc.length, rc, 0.7);
}
cue(SILENCE[1][0], 'silence hole 2');

// the core burst on the downbeat: the loudest hit of the film
music.add(smp(cCore), I.crash(5, 3), 0.8);
music.add(smp(cCore), I.kick(1, { punch: 1.5 }), 1);
taiko(cCore, 1);
stabAt(cCore, 'Am', 0.8, 0.5, 0);
stabAt(cCore, 'Am', 0.5, 0.5, 12);
sfx.add(smp(cCore), I.subDrop(55, 28, 0.8, 0.9), 1);
hit(cCore, 'slam', 1, true);
sfx.add(smp(cCore), I.impact(95, { sub: 38, len: 2.0 }), 1);
cue(cCore, 'CORE BURST');
groove(cCore + 48, cGlory, { energy: 1, tai: true });
voice(HIT.victory, 'victory', 1.1);
catMotif(HIT.victory, 0.5);
music.add(smp(cCore + 144), I.musicBox(84, 1.1), 0.35);

// glory: a brass swell, both motifs together
padAt(cGlory, 'C', fs(cEnd - cGlory), 0.28, 2600, 0);
padAt(cGlory, 'C', fs(cEnd - cGlory), 0.2, 1200, -12);
for (let f = cGlory; f < cEnd; f += BEAT * 2) music.add(smp(f), I.tuba(36, fs(BEAT * 1.6)), 0.35);
catMotif(cGlory + 24, 0.45);
dogMotif(cGlory + 48, 0.5);
music.add(smp(cGlory), I.crash(5, 2.4), 0.45);
for (let f = cGlory; f < cEnd; f += BEAT) music.add(smp(f), I.kick(1, { punch: 0.9 }), 0.6);
{
  const [L, R] = I.riser(fs(cEnd - cGlory), 72);
  music.addStereo(smp(cGlory), L, R, 0.25);
}

// end card: the v6 brand sting, ring-out
if (STING) {
  const L = decode(STING, 1);
  sfx.add(smp(cEnd), L, 1.0);
  cue(cEnd, 'brand sting');
} else {
  sfx.add(smp(cEnd), I.crackle(0.6, 94), 0.8);
  stabAt(cEnd, 'Am', 0.7, 1.2, 0);
}
music.add(smp(cEnd), I.crash(5, 3), 0.45);
sfx.add(smp(cEnd + 72), I.thump(92), 0.4);

// ---------------------------------------------------------------- space, ducking, holes, master
function reverbSend(bus, amount, room = 0.78) {
  const [wl, wr] = freeverb(bus.L, bus.R, { room, damp: 0.4 });
  for (let i = 0; i < bus.n; i++) {
    bus.L[i] += wl[i] * amount;
    bus.R[i] += wr[i] * amount;
  }
}
reverbSend(music, 0.12);
reverbSend(sfx, 0.05);
reverbSend(vo, 0.08, 0.6);

/** Music dips 9 dB under every designed hit (2-frame suck-out, held 5, released over 8), 6 dB under VO. */
function duck(bus, frames, db = -9, hold = 5, rel = 8) {
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
duck(music, [...HIT.fightCuts, ...Array.from({ length: 8 }, (_, i) => cMont + i * 48 + 14), HIT.towerCrack]);
duck(music, cues.filter((c) => c.cue.startsWith('vo ')).map((c) => c.f), -5, 40, 12);
// the silence holes: every bus near silent
for (const [a, b] of SILENCE) {
  // 3 ms ramps at both edges: a hard gain step clicks
  const r = sec(0.003), A = smp(a), B = smp(b);
  const g = (i) => (i < A + r ? 1 - 0.98 * ((i - A) / r) : i >= B - r ? 0.02 + 0.98 * ((i - (B - r)) / r) : 0.02);
  for (const bus of [music, sfx, vo]) bus.gainCurve(g, A, B);
}
// a low-pass breath under the war room (the body 3 LU under the climax)
music.region(smp(cWar), smp(cLow), (x) => biquad(x, 'lp', 2400, 0.7));

function measure(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(s)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}

function master() {
  const bus = new Bus(music.n);
  bus.mixIn(music, 0.9);
  bus.mixIn(sfx, 0.55);
  bus.mixIn(vo, 1.25);
  compress(bus, { threshDb: -16, ratio: 1.8, attack: 0.012, release: 0.2 });
  // the arc: section levels set before the limiter so the quiet parts stay quiet (LRA) and the two climaxes peak
  const ARC = [[0, -12], [46, -12], [48, 0], [70, -2], [96, -2], [cMont, -5.5], [cWar, -9], [cLow, -10], [cEyes, -8], [cFight, -5], [cKey, -7], [cCore, 3], [cCore + 60, 0], [cCore + 144, -4], [cGlory, -6], [cEnd, -2], [N, -3]];
  const arcDb = (f) => {
    for (let k = ARC.length - 1; k >= 0; k--) if (f >= ARC[k][0]) {
      const [f0, d0] = ARC[k], [f1, d1] = ARC[k + 1] ?? [N, d0];
      // a step on the cut, eased over 3 frames
      const t = Math.min(1, (f - f0) / 3);
      const prev = ARC[k - 1]?.[1] ?? d0;
      return prev + (d0 - prev) * t + 0 * (d1 - f1);
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
    limit(b, -2.4, 0.002, 0.12);
    b.gainCurve((i) => Math.min(1, i / sec(0.004)), 0, sec(0.004));
    // the ring-out fades over the last 10 frames
    b.gainCurve((i) => Math.max(0, (b.n - i) / smp(10)), b.n - smp(10), b.n);
    writeWav(tmp, b.L, b.R);
    r = measure(tmp);
    writeWav(join(OUT, 'score.wav'), b.L, b.R);
    if (Math.abs(r.I + 14) <= 0.2 && r.TP <= -1.9) break;
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
writeFileSync(join(OUT, 'cues.json'), `${JSON.stringify({ bpm: 150, beatFrames: BEAT, loudness: loud, cues: cues.sort((a, b) => a.f - b.f) }, null, 1)}\n`);
