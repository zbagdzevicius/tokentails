#!/usr/bin/env node
/**
 * Paw Legends theme soundtrack (brand v6 Lightning Rivalry): the menu loops and stingers, rendered offline from the
 * shared motif (src/audio/themeMotif.js) with our own synthesised instruments (tools/trailer/instruments.mjs). No
 * samples, no stock audio, nothing licensed.
 *
 *   node tools/music/compose.mjs [--out ../pawlegends-web/public/pawlegends-art/music] [--wav]
 *
 * After a re-render, bump THEME_REV in src/audio/themeMotif.js (the files are cached for a day under ?v=).
 *
 * Cues: home (16-bar theme loop), select (8-bar tense build for champion select), lock (pick/lock sting), victory,
 * defeat. Loops are rendered three times over with every tail (reverb, release) and the middle pass is kept, so the
 * cycle is exactly periodic; each loop file carries LOOP_PAD_S of the cycle before and after it, so the game loops
 * [pad, pad + cycle] seamlessly whatever the decoder's priming offset. AAC (m4a) 96 kbps stereo, -16 LUFS.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { Bus, SR, compress, dbToGain, freeverb, limit, sec, writeWav } from '../trailer/dsp.mjs';
import { registerHooks } from 'node:module';
import { CATS_MOTIF, DOGS_MOTIF, LOOP_PAD_S, MENU_LOOPS, THEME_BARS, THEME_BPM } from '../../src/audio/themeMotif.js';

// instruments.mjs imports the game's sfx.ts for its own game() sounds, which the music never uses: stub it
registerHooks({
  load(url, ctx, next) {
    if (url.endsWith('/src/audio/sfx.ts')) return { format: 'module', source: 'export const PL_SFX = {};', shortCircuit: true };
    return next(url, ctx);
  },
});
const I = await import('../trailer/instruments.mjs');

const HERE = dirname(fileURLToPath(import.meta.url));
// served by pawlegends.app beside the skin art, outside the game's 10 MB bundle (audio/theme.ts streams it)
const OUT = resolve(argValue('--out') ?? join(HERE, '..', '..', '..', 'pawlegends-web', 'public', 'pawlegends-art', 'music'));
const KEEP_WAV = process.argv.includes('--wav');
mkdirSync(OUT, { recursive: true });

const BEAT = 60 / THEME_BPM;
const S16 = BEAT / 4;
const BAR = BEAT * 4;
const at = (t) => sec(t);

/** Champion select: Am – F – C – G (the same chords turned minor: tension). */
const SELECT_BARS = [
  { root: 45, chord: [57, 60, 64] },
  { root: 41, chord: [57, 60, 65] },
  { root: 48, chord: [55, 60, 64] },
  { root: 43, chord: [55, 59, 62] },
];

/** Two buses: dry and a reverb send. */
function buses(n) {
  return { dry: new Bus(n), wet: new Bus(n) };
}

function catsMotif(b, t, { gain = 0.5, transpose = 0, notes = 6, inst = 'pluck', send = 0.35 } = {}) {
  for (const [s, m] of CATS_MOTIF.slice(0, notes)) {
    const x = inst === 'box' ? I.musicBox(m + transpose, 1.2) : I.pluck(m + transpose, 0.16, 50 + s);
    b.dry.add(at(t + s * S16), x, gain, 0.25);
    b.wet.add(at(t + s * S16), x, gain * send, 0.25);
  }
}
function dogsMotif(b, t, { gain = 0.5, transpose = 0, send = 0.2 } = {}) {
  for (const [s, m] of DOGS_MOTIF) {
    const x = I.tuba(m + transpose, S16 * (s === 12 ? 6 : 2.2));
    b.dry.add(at(t + s * S16), x, gain, -0.25);
    b.wet.add(at(t + s * S16), x, gain * send, -0.25);
  }
}
function padBar(b, t, chord, len, gain, cutoff) {
  const [L, R] = I.pad(chord.map((m) => m - 12), len, { cutoff, attack: 0.18, release: 0.6 });
  b.dry.addStereo(at(t), L, R, gain);
  b.wet.addStereo(at(t), L, R, gain * 0.5);
}

/** The groove over one bar. energy 0: no drums; 1 light (kick 1+3, hats); 2 full (clap, ghost kick, 16th hats). */
function drums(b, t, energy, bar) {
  if (energy <= 0) return;
  for (let k = 0; k < 4; k++) {
    const bt = t + k * BEAT;
    if (energy >= 2 || k % 2 === 0) b.dry.add(at(bt), I.kick(1, { punch: 0.8 }), 0.7);
    if (energy >= 2 && (k === 1 || k === 3)) {
      b.dry.add(at(bt), I.clap(3 + k), 0.38, 0.05);
      b.wet.add(at(bt), I.clap(3 + k), 0.12);
    }
    const hats = energy >= 2 ? 4 : 2;
    for (let h = 0; h < hats; h++) b.dry.add(at(bt + (h * BEAT) / hats), I.hat(4 + h + bar, false), h % 2 ? 0.09 : 0.14, h % 2 ? 0.3 : -0.3);
  }
  if (energy >= 2 && bar % 2 === 1) b.dry.add(at(t + 3.5 * BEAT), I.kick(2, { punch: 0.6 }), 0.42);
}

/** Bass over one bar: root on the beat, octave on the off-beat (bouncy); `staccato` 8ths for the select pulse. */
function bassBar(b, t, root, { gain = 0.34, staccato = false } = {}) {
  for (let e = 0; e < 8; e++) {
    const up = !staccato && e % 2 === 1;
    b.dry.add(at(t + e * (BEAT / 2)), I.bass(root + (up ? 12 : 0), BEAT * (staccato ? 0.22 : 0.4), { cutoff: staccato ? 1200 : 1800 }), gain * (up ? 0.6 : 1));
  }
}

/** A 16th arpeggio of the chord, an octave up (quiet sparkle). */
function arp(b, t, chord, gain = 0.12) {
  const order = [0, 1, 2, 1];
  for (let s = 0; s < 16; s++) {
    const m = chord[order[s % 4]] + 12 + (s >= 8 && s % 4 === 2 ? 12 : 0);
    b.dry.add(at(t + s * S16), I.pluck(m, 0.08, 90 + s), gain, s % 2 ? 0.4 : -0.4);
  }
}

// ---------------------------------------------------------------- cues

/** Home: the full theme, 16 bars (C – G – Am – F × 4). */
function home(b, t0) {
  for (let bar = 0; bar < 16; bar++) {
    const t = t0 + bar * BAR;
    const { root, chord } = THEME_BARS[bar % 4];
    const sec4 = Math.floor(bar / 4);
    padBar(b, t, chord, BAR, sec4 === 3 ? 0.14 : 0.1, sec4 === 3 ? 1100 : 1700);
    bassBar(b, t, root, { gain: sec4 === 3 ? 0.22 : 0.32 });
    drums(b, t, sec4 === 0 ? 1 : sec4 === 3 ? 1 : 2, bar);
    if (sec4 === 0 || sec4 === 2) arp(b, t, chord, sec4 === 2 ? 0.1 : 0.12);
    // A: the CATS motif calls, the DOGS motif answers (bars 4–7); B: the call doubled on the music box, stabs on the answer
    if (sec4 === 1 || sec4 === 2) {
      if (bar % 2 === 0) catsMotif(b, t, { gain: 0.42, inst: 'pluck' });
      else dogsMotif(b, t, { gain: 0.36 });
    }
    if (sec4 === 2 && bar % 2 === 0) catsMotif(b, t, { gain: 0.3, inst: 'box', transpose: 12, send: 0.5 });
    if (sec4 === 2 && bar % 2 === 1) {
      const [L, R] = I.stab(chord.map((m) => m + 12), 0.2, 0.9);
      b.dry.addStereo(at(t), L, R, 0.16);
    }
    // C: breathing room, the motif on the music box alone, a tom fill back into the top
    if (sec4 === 3 && bar % 2 === 0) catsMotif(b, t, { gain: 0.34, inst: 'box', send: 0.6 });
    if (bar === 15) [150, 125, 100, 80].forEach((f, k) => b.dry.add(at(t + 3 * BEAT + k * S16), I.tom(f, 6 + k), 0.36, k % 2 ? 0.2 : -0.2));
  }
}

/** Champion select: a tense 8-bar build (minor turn, pulsing bass, ticking rims, a swell into the loop point). */
function select(b, t0) {
  for (let bar = 0; bar < 8; bar++) {
    const t = t0 + bar * BAR;
    const { root, chord } = SELECT_BARS[bar % 4];
    const half = bar >= 4;
    padBar(b, t, chord, BAR, 0.1, half ? 1400 : 900);
    bassBar(b, t, root, { gain: 0.3, staccato: true });
    for (let s = 0; s < 16; s++) b.dry.add(at(t + s * S16), I.rim(7 + s), s % 4 === 0 ? 0.16 : 0.07, s % 2 ? 0.35 : -0.35);
    for (let k = 0; k < 4; k++) if (half || k === 0 || k === 2) b.dry.add(at(t + k * BEAT), I.kick(1, { punch: 0.6 }), half ? 0.6 : 0.5);
    if (bar % 4 === 1) dogsMotif(b, t, { gain: 0.32 });
    if (bar % 4 === 3) catsMotif(b, t, { gain: 0.34, notes: 4 });
    if (bar === 7) [140, 118, 98, 82].forEach((f, k) => b.dry.add(at(t + 2 * BEAT + k * (BEAT / 2)), I.tom(f, 9 + k), 0.4));
  }
  const [L, R] = I.riser(BAR * 2 - 0.05, 71);
  b.dry.addStereo(at(t0 + BAR * 6), L, R, 0.08);
}

function lock(b) {
  CATS_MOTIF.slice(0, 4).forEach(([, m], k) => {
    const x = I.pluck(m, 0.1, 50 + k);
    b.dry.add(at(k * 0.065), x, 0.5, 0.25);
    b.wet.add(at(k * 0.065), x, 0.25, 0.25);
  });
  const t = 0.27;
  const [L, R] = I.stab([60, 64, 67, 72], 0.34, 1);
  b.dry.addStereo(at(t), L, R, 0.42);
  b.wet.addStereo(at(t), L, R, 0.25);
  b.dry.add(at(t), I.kick(1, { punch: 1.1 }), 0.8);
  b.dry.add(at(t), I.crash(5, 1.4), 0.12);
  const [sL, sR] = I.shimmer(84);
  b.dry.addStereo(at(t), sL, sR, 0.12);
  b.wet.addStereo(at(t), sL, sR, 0.12);
}

function victory(b) {
  padBar(b, 0, [60, 64, 67], BAR, 0.12, 1800);
  drums(b, 0, 2, 0);
  bassBar(b, 0, 48, { gain: 0.3 });
  catsMotif(b, 0, { gain: 0.46 });
  catsMotif(b, 0, { gain: 0.26, inst: 'box', transpose: 12, send: 0.5 });
  const t = BAR;
  const [L, R] = I.stab([60, 64, 67, 72, 76], 0.6, 1.1);
  b.dry.addStereo(at(t), L, R, 0.45);
  b.wet.addStereo(at(t), L, R, 0.3);
  b.dry.add(at(t), I.kick(1, { punch: 1.2 }), 0.85);
  b.dry.add(at(t), I.crash(5, 2.4), 0.2);
  const [sL, sR] = I.shimmer(84);
  b.dry.addStereo(at(t), sL, sR, 0.18);
  b.wet.addStereo(at(t), sL, sR, 0.2);
}

function defeat(b) {
  padBar(b, 0, [57, 60, 64], BAR * 1.5, 0.11, 900);
  // the DOGS motif, half speed: "not so fast" (playful, never grim)
  for (const [s, m] of DOGS_MOTIF) {
    const x = I.tuba(m + 12, S16 * (s === 12 ? 8 : 3.5));
    b.dry.add(at(s * S16 * 1.5), x, 0.42, -0.1);
    b.wet.add(at(s * S16 * 1.5), x, 0.12);
  }
  const t = BAR * 1.5;
  b.dry.add(at(t - 0.2), I.womp(), 0.3);
  const [mL, mR] = I.pad([45, 52, 57, 60], 1.6, { cutoff: 800, attack: 0.05, release: 1.2 });
  b.dry.addStereo(at(t), mL, mR, 0.12);
  b.wet.addStereo(at(t), mL, mR, 0.12);
  b.dry.add(at(t), I.kick(1, { punch: 0.4 }), 0.4);
}

// ---------------------------------------------------------------- render, master, encode

function mixdown(b) {
  const [rL, rR] = freeverb(b.wet.L, b.wet.R, { room: 0.78, damp: 0.4, predelay: 0.02 });
  const out = new Bus(b.dry.n);
  out.mixIn(b.dry, 1);
  for (let i = 0; i < out.n; i++) {
    out.L[i] += rL[i] * 0.9;
    out.R[i] += rR[i] * 0.9;
  }
  compress(out, { threshDb: -16, ratio: 1.8, attack: 0.012, release: 0.2 });
  return out;
}

function lufs(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  return { I: Number(/I:\s+(-?[\d.]+) LUFS/.exec(s)?.[1]), TP: Number(/Peak:\s+(-?[\d.inf]+) dBFS/.exec(s)?.[1]) };
}

/** Loudness to -16 LUFS (iterated, the limiter lowers it), true peak limited, then AAC. */
function master(bus, name, fadeOut = 0) {
  const wav = join(OUT, `${name}.wav`);
  let gain = 1;
  let r = null;
  let b = bus;
  for (let k = 0; k < 4; k++) {
    b = bus.clone();
    b.gainCurve(() => gain);
    limit(b, -2, 0.002, 0.08);
    if (fadeOut) b.gainCurve((i) => Math.min(1, (b.n - i) / sec(fadeOut)), b.n - sec(fadeOut));
    writeWav(wav, b.L, b.R);
    r = lufs(wav);
    if (Math.abs(r.I + 16) <= 0.3) break;
    gain *= dbToGain(-16 - r.I);
  }
  const m4a = join(OUT, `${name}.m4a`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-c:a', 'aac_at', '-b:a', '96k', '-movflags', '+faststart', m4a]);
  if (!KEEP_WAV) rmSync(wav);
  console.log(`[music] ${name}.m4a ${(statSync(m4a).size / 1024).toFixed(0)} KB, ${(b.n / SR).toFixed(2)} s, ${r.I} LUFS, TP ${r.TP} dBFS`);
}

/** A loop: three cycles with every tail, keep [cycle - pad, 2·cycle + pad) (the middle cycle is the steady state). */
function renderLoop(name, write) {
  // a whole number of samples per cycle, so every note sits on the same sample in each pass
  const n = at(MENU_LOOPS[name].bars * BAR);
  const one = buses(n + at(3));
  write(one, 0);
  const b = buses(n * 3 + at(3));
  for (let k = 0; k < 3; k++)
    for (const ch of ['dry', 'wet']) {
      b[ch].L.set(one[ch].L.subarray(0, Math.min(one[ch].n, b[ch].n - k * n)).map((v, i) => v + b[ch].L[k * n + i]), k * n);
      b[ch].R.set(one[ch].R.subarray(0, Math.min(one[ch].n, b[ch].n - k * n)).map((v, i) => v + b[ch].R[k * n + i]), k * n);
    }
  const full = mixdown(b);
  const a = n - at(LOOP_PAD_S);
  const out = new Bus(n + 2 * at(LOOP_PAD_S));
  out.L.set(full.L.subarray(a, a + out.n));
  out.R.set(full.R.subarray(a, a + out.n));
  master(out, name);
}

function renderSting(name, len, write) {
  const b = buses(at(len));
  write(b);
  master(mixdown(b), name, 0.3);
}

renderLoop('home', home);
renderLoop('select', select);
renderSting('lock', 2.2, lock);
renderSting('victory', BAR + 2.6, victory);
renderSting('defeat', BAR * 1.5 + 2.2, defeat);
