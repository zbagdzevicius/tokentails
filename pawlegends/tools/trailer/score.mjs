#!/usr/bin/env node
/**
 * Trailer v2 score ("Big Plays", storyboard §1 and §6): an original, beat-locked score at `--bpm` (default 144: one
 * beat = 25 frames, one bar = 100 frames at 60 fps, 18 bars = 30.000 s). It re-voices the game's own C-G-Am-F loop and
 * lead motif (src/audio/music.ts) as a festival-trap / brass hybrid (synth taiko, saw-stack brass stabs, an 808-style
 * sub on the roots, claps on 2 and 4), with our synthesised risers, whooshes, impacts and tape-stop, and the game's own
 * sound effects (src/audio/sfx.ts, sfxDefs.js and the move cues of render/anim/fxctx.ts CUE_SFX), rendered offline
 * through the same zzfx builder the game uses. No samples, no stock audio. The v1 score (120 BPM) is score-v1.mjs.
 *
 *   node tools/trailer/score.mjs [--out DIR] [--only 30|15] [--bpm 144] [--no-sfx-files] [--report]
 *
 * Writes (48 kHz, 24-bit, stereo):
 *   DIR/score.wav, DIR/score-15.wav                 masters: -14 LUFS integrated, true peak <= -1 dBTP
 *   DIR/stems/{music,sfx,game}-{30,15}.wav          pre-master stems (32-bit float)
 *   DIR/sfx/*.wav                                   every designed one-shot and every game sound used
 *   DIR/cues.json                                   the hit points (frame, seconds, cue) of both cuts, and loudness
 *
 * The sound design is written once against the 30 s master's frames (`DESIGN`): the 15 s cut re-uses each event whose
 * picture is in the cut, at the cut's own frame (mg-timeline.mjs CUT15_SEGMENTS), so both cuts hit the same contacts.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from '../lib/args.mjs';
import { Bus, SR, biquad, compress, dbToGain, freeverb, limit, pingpong, pumpCurve, sec, tapeStop, writeWav, writeWavFloat } from './dsp.mjs';
import * as I from './instruments.mjs';
import { CUT15_SEGMENTS } from './mg-timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(argValue('--out') ?? join(HERE, 'out', 'audio'));
const ONLY = argValue('--only');
const FPS = 60;
const BPM = Number(argValue('--bpm') ?? 144);
/** Frames per beat / bar / 16th at this tempo (144 BPM: 25 / 100 / 6.25). */
export const BEAT = (60 * FPS) / BPM;
const BAR = BEAT * 4;
const S16 = BEAT / 4;
/** Frame -> sample (exact: 800 samples per frame at 48 kHz / 60 fps). */
const smp = (f) => Math.round((f * SR) / FPS);

// ---------------------------------------------------------------- harmony (MIDI)

const CH = {
  C: { bass: 36, tri: [60, 64, 67] },
  G: { bass: 31, tri: [59, 62, 67] },
  Am: { bass: 33, tri: [60, 64, 69] },
  F: { bass: 29, tri: [60, 65, 69] },
  Dm: { bass: 38, tri: [62, 65, 69] },
  E: { bass: 28, tri: [59, 64, 68] },
  Bb: { bass: 34, tri: [58, 62, 65] },
  D: { bass: 38, tri: [62, 66, 69] },
  A: { bass: 33, tri: [61, 64, 69] },
  Bm: { bass: 35, tri: [62, 66, 71] },
  G2: { bass: 31, tri: [62, 67, 71] },
};
/** The game's lead motif (music.ts LEAD): 16 steps per bar, semitones above the chord's top note, -1 = rest. */
const LEAD = [0, -1, 2, 4, -1, 4, 2, 0, 5, -1, 4, 2, 0, -1, 2, -1];
/** render/anim/fxctx.ts CUE_SFX: a move cue -> [game sound, rate, volume] (the game's own move sounds). */
const CUE = {
  whooshS: ['dash', 1.45, 0.35], whooshM: ['dash', 1.1, 0.45], whooshL: ['dash', 0.8, 0.55], flip: ['dash', 1.25, 0.45], land: ['slam', 1.5, 0.35],
  bodyThud: ['slam', 0.9, 0.55], clang: ['hit', 1.7, 0.6], crackle: ['magic', 1.7, 0.45], zap: ['towerShot', 0.8, 0.5], fwoomp: ['ult', 1.4, 0.45],
  pop: ['poof', 1.1, 0.55], lightsJingle: ['coin', 1.2, 0.5], flutter: ['swipe', 1.6, 0.35], kiss: ['pickup', 1.6, 0.45], drum: ['slam', 1.2, 0.5],
  curtain: ['swipe', 0.6, 0.45], gong: ['horn', 1.6, 0.5], chain: ['hit', 2.1, 0.4],
};

// ---------------------------------------------------------------- the song container

class Song {
  constructor(frames) {
    this.frames = frames;
    this.n = smp(frames);
    for (const b of ['drums', 'synth', 'hits', 'sfx', 'game']) this[b] = new Bus(this.n);
    this.send = { music: new Bus(this.n), sfx: new Bus(this.n), game: new Bus(this.n) };
    this.delaySend = new Bus(this.n);
    this.kicks = [];
    this.pumpWindows = [];
    this.cues = [];
    this.auto = [];
    this.lowpass = [];
    this.sfxPanned = [];
  }

  at(f, bus, x, { gain = 1, pan = 0, rev = 0, delay = 0 } = {}) {
    if (f < 0 || f >= this.frames) return;
    const s = smp(f);
    const target = this[bus];
    const group = bus === 'sfx' ? 'sfx' : bus === 'game' ? 'game' : 'music';
    if (Array.isArray(x)) {
      target.addStereo(s, x[0], x[1], gain);
      if (rev) this.send[group].addStereo(s, x[0], x[1], gain * rev);
      if (delay) this.delaySend.addStereo(s, x[0], x[1], gain * delay);
    } else {
      target.add(s, x, gain, pan);
      if (rev) this.send[group].add(s, x, gain * rev, pan);
      if (delay) this.delaySend.add(s, x, gain * delay, pan);
    }
  }

  g(f, name, { rate = 1, gain = 1, pan = 0, rev = 0.15 } = {}) {
    if (f < 0 || f >= this.frames) return;
    this.at(f, 'game', I.game(name, rate), { gain, pan, rev });
    used.add(`${name}@${rate}`);
  }

  /** A move cue the way the game plays it (fxctx CUE_SFX), louder by `boost` (trailer close-ups). */
  mv(f, cue, { boost = 1.8, pan = 0, rev = 0.15 } = {}) {
    const [name, rate, vol] = CUE[cue];
    this.g(f, name, { rate, gain: vol * boost, pan, rev });
  }

  cue(f, text) {
    if (f >= 0 && f < this.frames) this.cues.push({ f, t: +(f / FPS).toFixed(3), cue: text });
  }

  kick(f, gain = 1) {
    if (f < 0 || f >= this.frames) return;
    this.at(f, 'drums', I.kick(1 + (Math.round(f) % 7)), { gain });
    this.kicks.push(smp(f));
  }
}

const used = new Set();

// ---------------------------------------------------------------- band parts (tempo-relative)

/** Synth taiko: a low tom with a noise skin, for the half-time and the hook. */
function taiko(S, f, gain = 1, pitch = 90) {
  S.at(f, 'drums', I.tom(pitch, Math.round(f)), { gain: 0.6 * gain, rev: 0.3 });
  S.at(f, 'drums', I.impact(200 + (Math.round(f) % 13), { sub: pitch * 0.5, len: 0.35 }), { gain: 0.25 * gain });
}

function drums(S, f0, f1, style, level = 1) {
  for (let f = f0, s16 = 0; f < f1 - 0.01; f += S16, s16++) {
    const inBeat = s16 % 4;
    const beat = Math.floor(s16 / 4);
    if (style === 'four') {
      if (inBeat === 0) S.kick(f, 0.95 * level);
      if (inBeat === 0 && beat % 2 === 1) {
        S.at(f, 'drums', I.snare(beat + 3), { gain: 0.5 * level, rev: 0.18 });
        S.at(f, 'drums', I.clap(beat + 5), { gain: 0.5 * level, rev: 0.2 });
      }
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16, true), { gain: 0.15 * level, pan: 0.15 });
      if (inBeat === 1 || inBeat === 3) S.at(f, 'drums', I.hat(s16), { gain: 0.1 * level, pan: -0.2 });
    } else if (style === 'trap') {
      // half-time trap: kick on 1 and the "and" of 3, clap on 3, rolling hats with a 32nd flam every other beat
      if (s16 % 16 === 0 || s16 % 16 === 10) S.kick(f, 0.95 * level);
      if (s16 % 16 === 8) {
        S.at(f, 'drums', I.clap(s16), { gain: 0.6 * level, rev: 0.25 });
        S.at(f, 'drums', I.snare(s16), { gain: 0.35 * level, rev: 0.25 });
      }
      S.at(f, 'drums', I.hat(s16, false), { gain: (inBeat === 0 ? 0.12 : 0.08) * level, pan: inBeat % 2 ? -0.25 : 0.25 });
      if (beat % 2 === 1 && inBeat === 3) S.at(f + S16 / 2, 'drums', I.hat(s16 + 99), { gain: 0.07 * level, pan: 0.3 });
    } else if (style === 'half') {
      if (s16 % 16 === 0) {
        S.kick(f, 0.95 * level);
        taiko(S, f, level);
      }
      if (s16 % 16 === 8) S.at(f, 'drums', I.snare(9), { gain: 0.6 * level, rev: 0.35 });
      if (s16 % 16 === 12) taiko(S, f, 0.6 * level, 120);
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16), { gain: 0.1 * level, pan: 0.2 });
    } else if (style === 'double') {
      if (inBeat === 0 || inBeat === 2) S.kick(f, (inBeat === 0 ? 0.95 : 0.7) * level);
      if (inBeat === 2) S.at(f, 'drums', I.snare(s16), { gain: 0.45 * level, rev: 0.15 });
      if (inBeat === 0 && beat % 2 === 1) S.at(f, 'drums', I.clap(s16), { gain: 0.4 * level, rev: 0.15 });
      S.at(f, 'drums', I.hat(s16, inBeat === 2), { gain: (inBeat === 2 ? 0.13 : 0.09) * level, pan: inBeat % 2 ? -0.25 : 0.25 });
    } else if (style === 'pulse') {
      // tension: a sub kick on every eighth, a rim on 2 and 4
      if (inBeat % 2 === 0) S.kick(f, (inBeat === 0 ? 0.8 : 0.5) * level);
      if (inBeat === 0 && beat % 2 === 1) S.at(f, 'drums', I.rim(s16), { gain: 0.35 * level, rev: 0.3 });
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16), { gain: 0.07 * level, pan: -0.3 });
    } else if (style === 'sparse') {
      if (s16 % 8 === 0) S.kick(f, 0.75 * level);
      if (s16 % 8 === 4) S.at(f, 'drums', I.clap(s16), { gain: 0.4 * level, rev: 0.35 });
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16), { gain: 0.06 * level, pan: -0.3 });
    } else if (style === 'hats') {
      S.at(f, 'drums', I.hat(s16, inBeat === 2), { gain: (inBeat === 2 ? 0.1 : 0.05) * level, pan: inBeat % 2 ? -0.3 : 0.3 });
    } else if (style === 'beats') {
      if (inBeat === 0) S.kick(f, 0.85 * level);
      if (inBeat === 0 && beat % 2 === 1) S.at(f, 'drums', I.clap(s16), { gain: 0.35 * level, rev: 0.2 });
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16, true), { gain: 0.11 * level, pan: 0.2 });
    }
  }
}

/** Bass / 808 sub: 'eighths' (driving), 'whole', 'sixteenths', 'beats', '808' (long sub notes on 1 and the and-of-3). */
function bassLine(S, f0, f1, chord, pattern = 'eighths', level = 1) {
  if (pattern === '808') {
    for (let f = f0; f < f1 - 0.01; f += BAR) {
      S.at(f, 'synth', I.bass(chord.bass - 12, (BEAT * 2.4) / FPS, { cutoff: 380 }), { gain: 0.75 * level });
      if (f + BEAT * 2.5 < f1) S.at(f + BEAT * 2.5, 'synth', I.bass(chord.bass - 12, (BEAT * 1.4) / FPS, { cutoff: 380 }), { gain: 0.6 * level });
    }
    return;
  }
  const step = pattern === 'sixteenths' ? S16 : pattern === 'beats' ? BEAT : pattern === 'whole' ? f1 - f0 : BEAT / 2;
  for (let f = f0, k = 0; f < f1 - 0.01; f += step, k++) {
    const oct = pattern === 'eighths' && k % 2 === 1 ? 12 : 0;
    const len = (Math.min(step, f1 - f) / FPS) * (pattern === 'whole' ? 1 : 0.85);
    S.at(f, 'synth', I.bass(chord.bass + oct, len, { cutoff: pattern === 'whole' ? 900 : 2200 }), { gain: 0.42 * level });
  }
}

function leadMotif(S, f0, chord, { octave = 0, level = 1, steps = 16, box = false, brass = false } = {}) {
  const top = chord.tri[2] + octave;
  for (let s = 0; s < steps; s++) {
    const d = LEAD[s % 16];
    if (d < 0) continue;
    const f = f0 + s * S16;
    if (box) S.at(f, 'hits', I.musicBox(top + 12 + d), { gain: 0.28 * level, rev: 0.45, delay: 0.25, pan: s % 2 ? 0.2 : -0.2 });
    else if (brass) {
      // brass: a short saw-stack stab per note, an octave doubled underneath
      S.at(f, 'hits', I.stab([top + d, top + d - 12], 0.16, 0.8, 300 + s), { gain: 0.3 * level, rev: 0.2, delay: 0.12 });
    } else {
      S.at(f, 'hits', I.pluck(top + d), { gain: 0.16 * level, rev: 0.2, delay: 0.3, pan: -0.1 });
      S.at(f, 'hits', I.pluck(top + 12 + d), { gain: 0.06 * level, pan: 0.25 });
    }
  }
}

function padChord(S, f0, f1, chord, { level = 1, cutoff = 1500, attack = 0.2, low = false } = {}) {
  const notes = low ? chord.tri.map((m) => m - 12) : chord.tri;
  S.at(f0, 'synth', I.pad(notes, (f1 - f0) / FPS, { cutoff, attack }), { gain: 0.3 * level, rev: 0.35 });
}

function stab(S, f, chord, level = 1, up = 0) {
  S.at(f, 'hits', I.stab(chord.tri.map((m) => m + up).concat([chord.tri[0] + 12 + up]), 0.26), { gain: 0.42 * level, rev: 0.25 });
}

/** One bar of the full band: drums, driving bass, motif (pluck or brass), pad; pumped by the kick. */
function bandBar(S, f0, chord, { style = 'four', lead = 'pluck', level = 1, bass = 'eighths' } = {}) {
  drums(S, f0, f0 + BAR, style, level);
  bassLine(S, f0, f0 + BAR, chord, bass, level);
  if (lead === 'pluck') leadMotif(S, f0, chord, { level });
  else if (lead === 'brass') leadMotif(S, f0, chord, { level, brass: true });
  padChord(S, f0, f0 + BAR, chord, { level: 0.65 * level, cutoff: 2400, attack: 0.02 });
  S.pumpWindows.push([smp(f0), smp(f0 + BAR)]);
}

/** Downbeat accent: crash + impact; `big` adds a sub-drop and a heavy kick. */
function dropHit(S, f, big = false) {
  S.at(f, 'drums', I.crash(6, 2.4), { gain: big ? 0.7 : 0.45, rev: 0.2 });
  S.at(f, 'sfx', I.impact(97, { sub: 44, len: 0.7 }), { gain: big ? 0.75 : 0.4 });
  if (big) {
    S.at(f, 'sfx', I.subDrop(60, 34, 0.7, 0.5), { gain: 0.75 });
    S.kick(f, 1.2);
  }
}

// ---------------------------------------------------------------- the sound design (30 s master frames)

/**
 * Every designed hit on the picture, by 30 s master frame: [frame, label, fn(S, f)]. Both cuts place these (the 15 s cut
 * at its own frames, when the frame is in one of its segments).
 */
const DESIGN = [
  [0, 'HOOK: band hit + sub-drop 55->30 Hz', (S, f) => {
    S.at(f, 'sfx', I.subDrop(), { gain: 0.9 });
    S.at(f, 'drums', I.crash(5, 2.2), { gain: 0.5, rev: 0.2 });
    S.at(f, 'sfx', I.impact(90, { sub: 48, len: 0.7 }), { gain: 0.5 });
  }],
  [12, 'Whoosh L (Lambo in flight)', (S, f) => S.sfxPanned.push([f, I.whoosh(0.22, 80, 1.4), 0.9, (i) => -0.7 + 1.4 * Math.min(1, i / sec(0.22))])],
  [25, 'BELLY FLOP impact: game slam + 45 Hz boom + star chimes', (S, f) => {
    S.g(f, 'slam', { gain: 1.1 });
    S.g(f, 'heroHit', { gain: 0.6 });
    S.at(f, 'sfx', I.impact(91, { sub: 45, len: 1.0 }), { gain: 0.95 });
    S.at(f, 'sfx', I.subDrop(70, 40, 0.3, 0.3), { gain: 0.6 });
    [88, 91, 95].forEach((m, i) => S.at(f + 3 + i * 3, 'hits', I.musicBox(m, 0.6), { gain: 0.22, rev: 0.4, pan: i - 1 }));
  }],
  [52, 'Shield Slam: slam + sand crack', (S, f) => {
    S.g(f, 'slam', { rate: 0.85, gain: 1.0 });
    S.at(f, 'sfx', I.impact(92, { sub: 50, len: 0.5 }), { gain: 0.6 });
    S.at(f, 'sfx', I.crackle(0.25, 120), { gain: 0.35 });
  }],
  [56, 'Debris patter', (S, f) => S.at(f, 'sfx', I.crackle(0.3, 121), { gain: 0.18, pan: 0.3 })],
  [78, 'Clem Q3: clang + blade ring', (S, f) => {
    S.mv(f, 'clang', { boost: 2 });
    S.g(f, 'heroHit', { gain: 0.7 });
    S.at(f, 'sfx', I.snap(93), { gain: 0.6, rev: 0.2 });
    S.at(f, 'hits', I.musicBox(96, 0.5), { gain: 0.15, rev: 0.3 });
  }],
  [82, 'flip whoosh', (S, f) => S.mv(f, 'flip')],
  [95, 'Whip whoosh into the title', (S, f) => S.at(f, 'sfx', I.whoosh(0.18, 84, 2.2), { gain: 0.9 })],
  [100, 'CATS stab', (S, f) => stab(S, f, CH.C, 1.2)],
  [125, 'VS stab', (S, f) => stab(S, f, CH.C, 1.2, 4)],
  [150, 'DOGS stab', (S, f) => stab(S, f, CH.C, 1.3, 7)],
  [175, 'Riser + snare roll into the roll call', (S, f) => {
    S.at(f, 'sfx', I.riser(0.42), { gain: 0.9 });
    S.at(f, 'drums', I.snareRoll(0.41, BPM, 60), { gain: 0.6, rev: 0.2 });
  }],
  [194, 'Whip whoosh', (S, f) => S.at(f, 'sfx', I.whoosh(0.12, 85, 2.4), { gain: 0.9 })],
  [203, 'Clem Tumble: whooshM', (S, f) => S.mv(f, 'whooshM')],
  [215, 'land', (S, f) => S.mv(f, 'land')],
  [229, 'Sage Hop Back: flip', (S, f) => S.mv(f, 'flip')],
  [246, 'land', (S, f) => S.mv(f, 'land')],
  [262, 'Pug Charge: bodyThud + heroHit', (S, f) => {
    S.mv(f, 'bodyThud', { boost: 2 });
    S.g(f, 'heroHit', { gain: 0.8 });
    S.at(f, 'sfx', I.thump(93), { gain: 0.5 });
  }],
  [278, 'Jeer Slash: whooshL', (S, f) => S.mv(f, 'whooshL', { boost: 2 })],
  [286, 'scratch + takedown', (S, f) => {
    S.g(f, 'swipe', { gain: 0.8 });
    S.g(f, 'heroHit', { gain: 0.7 });
  }],
  [303, 'Short Circuit: zap + thunder', (S, f) => {
    S.mv(f, 'zap', { boost: 2 });
    S.at(f, 'sfx', I.crackle(0.35, 110), { gain: 0.55 });
    S.at(f, 'sfx', I.impact(94, { sub: 40, len: 0.8 }), { gain: 0.5 });
  }],
  [342, 'Striking Pose: shutter + fwoomp', (S, f) => {
    S.at(f, 'sfx', I.snap(95), { gain: 0.9 });
    S.mv(f, 'fwoomp', { boost: 2 });
  }],
  [353, 'Chase the Wind: flutter + wind', (S, f) => {
    S.mv(f, 'flutter', { boost: 2.2 });
    S.at(f, 'sfx', I.whoosh(0.3, 86, 0.8), { gain: 0.6 });
  }],
  [375, 'Tangled Lights: lightsJingle', (S, f) => S.mv(f, 'lightsJingle', { boost: 2 })],
  [392, 'haul thud', (S, f) => {
    S.mv(f, 'bodyThud', { boost: 2 });
    S.at(f, 'sfx', I.impact(96, { sub: 46, len: 0.5 }), { gain: 0.45 });
  }],
  [425, 'IN YOUR BROWSER stab', (S, f) => S.mv(f, 'zap', { boost: 1.6 })],
  [525, 'Moonshot release: snap + whoosh L->R', (S, f) => {
    S.g(f, 'arrow', { rate: 0.85, gain: 1.0 });
    S.at(f, 'sfx', I.snap(94), { gain: 0.6 });
    S.sfxPanned.push([f, I.whoosh(0.27, 80, 1.3), 1.2, (i) => -0.9 + 1.8 * Math.min(1, i / sec(0.27))]);
  }],
  [500, 'Bow draw: windup', (S, f) => S.g(f, 'windup', { rate: 0.7, gain: 0.8 })],
  [541, 'BULLSEYE: hit + moon shard burst', (S, f) => {
    S.g(f, 'hit', { gain: 1.0 });
    S.g(f, 'heroHit', { gain: 0.8 });
    S.at(f, 'sfx', I.impact(95, { sub: 46, len: 0.8 }), { gain: 0.8 });
    S.at(f, 'sfx', I.snap(), { gain: 0.8, rev: 0.25 });
  }],
  [553, 'Curtains Up!: curtain + gong', (S, f) => {
    S.mv(f, 'curtain', { boost: 2.2 });
    S.mv(f, 'gong', { boost: 1.6 });
  }],
  [575, 'stage ignites: fwoomp + fire', (S, f) => {
    S.mv(f, 'fwoomp', { boost: 2 });
    S.at(f, 'sfx', I.fire(0.6, 111), { gain: 0.55 });
  }],
  [598, 'drum', (S, f) => S.mv(f, 'drum', { boost: 1.6 })],
  [600, 'harp gliss (the twirl)', (S, f) => [72, 76, 79, 84, 88, 91].forEach((m, i) => S.at(f + i * 2, 'hits', I.musicBox(m, 0.7), { gain: 0.2, rev: 0.4, pan: -0.5 + i * 0.2 }))],
  [622, 'Under Her Spell: kiss + heart burst', (S, f) => {
    S.mv(f, 'kiss', { boost: 2.2 });
    S.at(f, 'sfx', I.pop(), { gain: 0.6 });
    S.g(f, 'shieldChime', { rate: 1.2, gain: 0.5, rev: 0.3 });
  }],
  [655, "Champion's Challenge: roar", (S, f) => {
    S.g(f, 'roar', { gain: 0.9 });
    S.at(f, 'sfx', I.impact(97, { sub: 42, len: 0.9 }), { gain: 0.6 });
    for (let k = 0; k < 12; k++) S.at(f + 1 + k * 1.5, 'sfx', I.thump(130 + k), { gain: 0.32, pan: (k % 2 ? 0.5 : -0.5) * (k / 12) });
  }],
  [703, 'Short Circuit: thunder', (S, f) => {
    S.at(f, 'sfx', I.impact(98, { sub: 38, len: 1.0 }), { gain: 0.7 });
    S.at(f, 'sfx', I.crackle(0.5, 112), { gain: 0.6 });
    S.mv(f, 'zap', { boost: 2 });
  }],
  [717, 'Live Wire blink: zap x2', (S, f) => {
    S.mv(f, 'zap', { boost: 1.6, pan: -0.3 });
    S.mv(f + 4, 'zap', { boost: 1.6, pan: 0.3 });
  }],
  [729, 'Spark Swipe + KO sting', (S, f) => {
    S.g(f, 'swipe', { gain: 0.9 });
    S.mv(f, 'crackle', { boost: 2 });
    S.g(f, 'heroHit', { gain: 0.8 });
    S.g(f + 2, 'sting', { gain: 0.5, rev: 0.2 });
  }],
  [752, 'Golden Hour: choir pad + gong', (S, f) => {
    S.at(f, 'synth', I.pad([67, 72, 76, 79], 0.9, { cutoff: 3000, attack: 0.05 }), { gain: 0.35, rev: 0.5 });
    S.mv(f, 'gong', { boost: 2 });
  }],
  [764, 'Double takedown sting', (S, f) => {
    S.g(f, 'hit', { gain: 0.9 });
    S.g(f, 'heroHit', { gain: 0.8 });
    S.g(f + 1, 'death', { gain: 0.5 });
    S.at(f, 'sfx', I.impact(99, { sub: 44, len: 0.7 }), { gain: 0.7 });
  }],
  [803, 'Pack Hunt: the howl (cackle low)', (S, f) => S.g(f, 'hyenaLaugh', { rate: 0.7, gain: 0.7, rev: 0.35 })],
  ...[825, 850, 875].map((at, i) => [at, `Pack Hunt maul ${i + 1} + rising stab`, (S, f) => {
    S.g(f, 'heroHit', { gain: 1.0 });
    S.g(f, 'swipe', { rate: 0.9, gain: 0.7 });
    S.at(f, 'sfx', I.impact(100 + i, { sub: 44, len: 0.7 }), { gain: 0.85 });
    S.at(f, 'sfx', I.stab([62 + i * 2, 65 + i * 2, 69 + i * 2, 74 + i * 2], 0.3), { gain: 0.4, rev: 0.25 });
  }]),
  [880, 'Cackle (game hyenaLaugh)', (S, f) => S.g(f, 'hyenaLaugh', { gain: 0.8 })],
  [900, 'Ping wheel open click', (S, f) => S.g(f, 'click', { gain: 0.7 })],
  [912, 'Ping chime + bark blip', (S, f) => {
    S.g(f, 'blip', { gain: 0.7 });
    S.at(f, 'hits', I.musicBox(84, 0.6), { gain: 0.25, rev: 0.3 });
    S.g(f + 8, 'click', { rate: 1.3, gain: 0.4 });
  }],
  [962, 'Pudding: sub boing + squash + tuba', (S, f) => {
    S.at(f, 'sfx', I.boing(), { gain: 0.8 });
    S.g(f, 'slam', { rate: 0.7, gain: 0.8 });
    [[0, 36, 12], [12.5, 43, 12], [25, 36, 6], [31.25, 40, 6], [37.5, 43, 12]].forEach(([df, m, len]) => S.at(f + 12 + df, 'synth', I.tuba(m, (len / FPS) * 0.9), { gain: 0.45, rev: 0.12 }));
  }],
  ...[1004, 1016, 1028, 1040].map((at) => [at, 'tower shot', (S, f) => S.g(f, 'towerShot', { gain: 0.55, pan: 0.2 })]),
  [1050, 'Tower dive KO sting + bell', (S, f) => {
    S.g(f, 'heroHit', { gain: 0.9 });
    S.g(f, 'death', { gain: 0.6 });
    S.at(f, 'hits', I.musicBox(81, 1.0), { gain: 0.3, rev: 0.4 });
    S.at(f, 'sfx', I.impact(102, { sub: 46, len: 0.6 }), { gain: 0.6 });
  }],
  [1075, 'Escape whoosh', (S, f) => S.mv(f, 'whooshL', { boost: 1.8 })],
  [1125, 'TOWER CRASH: boom + sub + debris', (S, f) => {
    S.g(f, 'boom', { gain: 1.2 });
    S.at(f, 'sfx', I.impact(103, { sub: 40, len: 1.6 }), { gain: 1.1, rev: 0.25 });
    S.at(f, 'sfx', I.subDrop(52, 30, 0.8, 0.5), { gain: 0.8 });
    S.at(f + 6, 'sfx', I.crackle(0.5, 113), { gain: 0.3 });
  }],
  [1150, 'COMEBACK: crowd roar + sting', (S, f) => {
    S.g(f, 'roar', { gain: 0.8 });
    S.g(f, 'cheer', { gain: 0.6 });
    S.g(f, 'sting', { gain: 0.6, rev: 0.2 });
  }],
  ...[1200, 1206, 1212, 1218].map((at, i) => [at, `Shimmer stab ${i + 1} (card look)`, (S, f) => {
    S.at(f, 'hits', I.shimmer([74, 76, 78, 81][i], 60 + i), { gain: 1.0, rev: 0.45, delay: 0.2 });
    S.g(f, 'pickup', { rate: 1 + i * 0.12, gain: 0.35 });
  }]),
  [1212, 'axe-kick contact (under the third look)', (S, f) => S.mv(f, 'zap', { boost: 1.4 })],
  ...[
    [1302, 'Belly Flop', (S, f) => { S.g(f, 'slam', { gain: 0.9 }); S.at(f, 'sfx', I.impact(140, { sub: 45, len: 0.5 }), { gain: 0.6 }); }],
    [1315, 'Curtains Up!', (S, f) => { S.mv(f, 'fwoomp', { boost: 2 }); S.at(f, 'sfx', I.fire(0.3, 141), { gain: 0.4 }); }],
    [1327, 'Golden Hour', (S, f) => S.mv(f, 'gong', { boost: 2 })],
    [1340, 'Tangled Lights', (S, f) => { S.mv(f, 'lightsJingle', { boost: 2 }); S.mv(f + 2, 'bodyThud', { boost: 1.6 }); }],
    [1352, "Champion's Challenge", (S, f) => S.g(f, 'roar', { gain: 0.8 })],
    [1365, 'Striking Pose', (S, f) => { S.at(f, 'sfx', I.snap(96), { gain: 0.8 }); S.mv(f, 'fwoomp', { boost: 1.8 }); }],
    [1377, 'Clem Q', (S, f) => S.mv(f, 'clang', { boost: 2 })],
    [1390, 'Pack Hunt pounce', (S, f) => { S.g(f, 'hyenaLaugh', { rate: 1.1, gain: 0.5 }); S.g(f, 'heroHit', { gain: 0.8 }); }],
  ].map(([at, label, fn], k) => [at, `TEAMFIGHT cut ${k + 1}: ${label}`, (S, f) => {
    fn(S, f);
    S.at(f, 'sfx', I.snap(150 + k), { gain: 0.5, pan: k % 2 ? 0.3 : -0.3 });
  }]),
  [1406, 'KO + level-up chime', (S, f) => {
    S.g(f, 'heroHit', { gain: 0.9 });
    S.g(f, 'death', { gain: 0.6 });
    S.g(f, 'levelup', { gain: 0.9, rev: 0.25 });
    S.at(f, 'sfx', I.impact(104, { sub: 46, len: 0.6 }), { gain: 0.6 });
  }],
  [1442, 'Cat tower crash', (S, f) => {
    S.g(f, 'boom', { gain: 1.1 });
    S.at(f, 'sfx', I.impact(105, { sub: 40, len: 1.2 }), { gain: 0.9, rev: 0.25 });
  }],
  [1450, 'Riser into the core (noise + saw sweep)', (S, f) => S.at(f, 'sfx', I.riser((1487 - 1450) / FPS), { gain: 1.4 })],
];

/** After the tape stop (pass 2), by 30 s master frame. */
const DESIGN_AFTER = [
  [1495, 'One heartbeat', (S, f) => S.at(f, 'sfx', I.heartbeat(), { gain: 0.9, rev: 0.3 })],
  [1500, 'Hit back in: whooshL', (S, f) => {
    S.mv(f, 'whooshL', { boost: 2.2 });
    S.at(f, 'sfx', I.reverseWhoosh(0.4, 109), { gain: 0.5 });
  }],
  [1513, 'Reverse cymbal sucking into the core impact', (S, f) => S.at(f, 'drums', I.reverseCymbal(0.2, 108), { gain: 0.6 })],
  [1525, 'CORE IMPACT: sub + crash + the game boom/roar, 2 s tail', (S, f) => {
    S.g(f, 'boom', { gain: 1.2 });
    S.g(f, 'roar', { gain: 0.9 });
    S.at(f, 'sfx', I.impact(106, { sub: 36, len: 2.2 }), { gain: 1.0, rev: 0.45 });
    S.at(f, 'sfx', I.subDrop(48, 26, 1.0, 0.6), { gain: 0.65 });
    S.at(f, 'drums', I.crash(9, 3.0), { gain: 0.6, rev: 0.45 });
  }],
  [1550, 'Victory sting (game, re-voiced in D) + crowd', (S, f) => {
    S.g(f, 'victory', { rate: 1.498, gain: 0.85, rev: 0.4 });
    S.g(f, 'cheer', { gain: 0.6 });
  }],
];

/** Place the design events of `list` on a cut: 30 s frames as they are, 15 s through its segment map. */
function placeDesign(S, cut, list) {
  for (const [f30, label, fn] of list) {
    const fs = cut === '30' ? [f30] : CUT15_SEGMENTS.filter(([a, b, d]) => f30 >= a + d && f30 <= b + d).map(([, , d]) => f30 - d);
    for (const f of fs) {
      S.cue(f, label);
      fn(S, f);
    }
  }
}

// ---------------------------------------------------------------- music sections

/** Bar HOOK: the full band from frame 0 (C), a band hit on the downbeat. */
function hookBar(S, f0) {
  S.cue(f0, 'HOOK: full band (four-on-the-floor, brass motif) from frame 0');
  stab(S, f0, CH.C, 1.5);
  S.at(f0, 'hits', I.stab([48, 55, 60, 64, 67, 72], 0.5, 1.2, 99), { gain: 0.5, rev: 0.3 });
  S.kick(f0, 1.1);
  bandBar(S, f0, CH.C, { lead: 'brass', level: 0.95 });
}

/** TITLE: half-time taiko, held C with stabs from the design, a riser. */
function titleBar(S, f0) {
  S.cue(f0, 'TITLE: half-time taiko + 808, stabs CATS / VS / DOGS');
  drums(S, f0, f0 + BAR, 'half');
  bassLine(S, f0, f0 + BAR, CH.C, '808');
  padChord(S, f0, f0 + BAR, CH.C, { level: 0.7, cutoff: 1400, attack: 0.05 });
  // two frames held quiet before the roll call drops in
  S.dips = [...(S.dips ?? []), [smp(f0 + BAR - 2), smp(f0 + BAR), 0.05]];
}

/** ROLL CALL: two bars of four-on-the-floor, C-G | Am-F, a crash per bar. */
function rollCall(S, f0) {
  S.cue(f0, 'ROLL CALL: four-on-the-floor 144, C G | Am F');
  dropHit(S, f0, true);
  const seq = [[CH.C, CH.G], [CH.Am, CH.F]];
  seq.forEach(([a, b], i) => {
    const f = f0 + i * BAR;
    drums(S, f, f + BAR, 'four');
    bassLine(S, f, f + BAR / 2, a, 'eighths');
    bassLine(S, f + BAR / 2, f + BAR, b, 'eighths');
    padChord(S, f, f + BAR / 2, a, { level: 0.6, cutoff: 2200, attack: 0.02 });
    padChord(S, f + BAR / 2, f + BAR, b, { level: 0.6, cutoff: 2200, attack: 0.02 });
    leadMotif(S, f, a, { level: 0.8 });
    S.pumpWindows.push([smp(f), smp(f + BAR)]);
    // a stab on every beat (the hero cuts)
    for (let k = 0; k < 4; k++) stab(S, f + k * BEAT, k < 2 ? a : b, 0.45, 12);
  });
}

/** 3V3: filtered drop (LPF 600 Hz) with the sub, a snare build that opens into the chorus. */
function dropBuild(S, f0) {
  S.cue(f0, '3V3: filtered drop (low-passed band + sub), snare build from the third beat');
  S.kick(f0, 1.2);
  S.at(f0, 'sfx', I.subDrop(58, 32, 0.8, 0.5), { gain: 0.85 });
  S.at(f0, 'drums', I.crash(7, 2.0), { gain: 0.35, rev: 0.3 });
  stab(S, f0, CH.F, 1.1);
  drums(S, f0, f0 + BEAT * 2, 'four', 0.9);
  bassLine(S, f0, f0 + BAR, CH.F, 'eighths');
  leadMotif(S, f0, CH.F, { level: 0.8, steps: 8 });
  padChord(S, f0, f0 + BAR, CH.F, { level: 0.6, cutoff: 900, attack: 0.3 });
  S.lowpass.push([smp(f0 + 2), smp(f0 + BAR - 2), 600]);
  for (let f = f0 + BEAT * 2, k = 0; f < f0 + BAR - 0.01; f += S16 / 2, k++) S.at(f, 'drums', I.snare(k + 30, 190 + k * 6), { gain: 0.15 + (k / 16) * 0.45, rev: 0.15 });
  S.at(f0 + BEAT * 2, 'sfx', I.riser((BEAT * 2) / FPS, 71), { gain: 1.0 });
  S.gaps = [...(S.gaps ?? []), [smp(f0 + BAR - 1), smp(f0 + BAR)]];
}

/** CHORUS: the full band with the brass motif, `chords` one per bar. */
function chorus(S, f0, chords) {
  S.cue(f0, `CHORUS: full band, brass motif (${chords.length} bars)`);
  dropHit(S, f0, true);
  chords.forEach((c, i) => {
    bandBar(S, f0 + i * BAR, c, { lead: 'brass', level: 1 });
    leadMotif(S, f0 + i * BAR, c, { level: 0.5, octave: 12 });
    if (i) S.at(f0 + i * BAR, 'drums', I.crash(8 + i, 1.6), { gain: 0.3, rev: 0.2 });
  });
}

/** PACK HUNT: half-time, tape-slow (a whole step down, low-passed at 1.2 kHz), a heartbeat kick on every beat. */
function packHunt(S, f0) {
  S.cue(f0, 'PACK HUNT: half-time, tape-slow (-2 st, LPF 1.2 kHz), heartbeat kick on the beats');
  for (let k = 0; k < 4; k++) S.at(f0 + k * BEAT, 'sfx', I.heartbeat(), { gain: 0.55, rev: 0.25 });
  drums(S, f0, f0 + BAR, 'half', 0.9);
  bassLine(S, f0, f0 + BAR, CH.Bb, '808');
  padChord(S, f0, f0 + BAR, CH.Bb, { level: 0.75, cutoff: 900, attack: 0.1, low: true });
  S.lowpass.push([smp(f0 + 2), smp(f0 + BEAT * 3 + 2), 1200]);
}

/** BREAKDOWN (ping + Pudding): plucks and claps, the motif on the music box. */
function breakdown(S, f0) {
  S.cue(f0, 'BREAKDOWN: plucks + claps, the motif on the music box');
  drums(S, f0, f0 + BAR, 'sparse');
  leadMotif(S, f0, CH.F, { box: true, steps: 16, level: 0.9 });
  bassLine(S, f0, f0 + BAR / 2, CH.F, 'beats', 0.7);
  bassLine(S, f0 + BAR / 2, f0 + BAR, CH.G, 'beats', 0.7);
  padChord(S, f0, f0 + BAR, CH.F, { level: 0.5, cutoff: 1500, attack: 0.1 });
}

/** TOWER DIVE: the tension pulse in Am, sub on the eighths. */
function tension(S, f0) {
  S.cue(f0, 'TOWER DIVE: tension pulse (sub on the eighths), Am');
  drums(S, f0, f0 + BAR, 'pulse');
  bassLine(S, f0, f0 + BAR, CH.Am, 'eighths', 0.8);
  padChord(S, f0, f0 + BAR, CH.Am, { level: 0.6, cutoff: 1100, attack: 0.2, low: true });
  S.at(f0 + BEAT * 2, 'sfx', I.riser((BEAT * 2) / FPS, 72), { gain: 0.7 });
}

/** TOWER FALLS + COMEBACK: the crash bar in G (half), then the key lift to D at its third beat. */
function towerComeback(S, f0) {
  S.cue(f0, 'TOWER FALLS: G, half-time; key lift to D on the third beat (COMEBACK)');
  drums(S, f0, f0 + BEAT * 2, 'half');
  bassLine(S, f0, f0 + BEAT * 2, CH.G, 'whole');
  padChord(S, f0, f0 + BEAT * 2, CH.G, { level: 0.6, cutoff: 1600, attack: 0.05 });
  stab(S, f0 + BEAT, CH.G, 1.3);
  const b = f0 + BEAT * 2;
  dropHit(S, b, true);
  stab(S, b, CH.D, 1.3);
  drums(S, b, b + BEAT * 2, 'four');
  bassLine(S, b, b + BEAT * 2, CH.D, 'eighths');
  leadMotif(S, b, CH.D, { brass: true, steps: 8 });
  padChord(S, b, b + BEAT * 2, CH.D, { level: 0.65, cutoff: 2400, attack: 0.02 });
  S.pumpWindows.push([smp(b), smp(b + BEAT * 2)]);
}

/** SKINS + HUD: one beat of shimmer over a held pad, then the trap groove in D. */
function skinsHud(S, f0) {
  S.cue(f0, 'SKINS: held D pad, hats; then the trap groove under the real HUD');
  S.at(f0, 'synth', I.pad([62, 66, 69, 76], BAR / FPS, { cutoff: 2200, attack: 0.03 }), { gain: 0.3, rev: 0.4 });
  drums(S, f0, f0 + BEAT, 'hats');
  drums(S, f0 + BEAT, f0 + BAR, 'trap', 0.9);
  bassLine(S, f0 + BEAT, f0 + BAR, CH.D, '808', 0.9);
  leadMotif(S, f0 + BEAT, CH.D, { level: 0.6, steps: 12 });
}

/** FINAL TEAMFIGHT: double-time drums, Bm G D A at two beats each... one bar, 16th bass. */
function teamfight(S, f0) {
  S.cue(f0, 'FINAL TEAMFIGHT: double-time drums, 16th bass, Bm-G-D-A');
  dropHit(S, f0, true);
  drums(S, f0, f0 + BAR, 'double');
  [CH.Bm, CH.G2, CH.D, CH.A].forEach((c, i) => {
    const f = f0 + i * BEAT;
    bassLine(S, f, f + BEAT, c, 'sixteenths');
    padChord(S, f, f + BEAT + S16 * 2, c, { level: 0.65, cutoff: 2600, attack: 0.01 });
  });
  leadMotif(S, f0, CH.Bm, { brass: true, level: 1 });
  S.pumpWindows.push([smp(f0), smp(f0 + BAR)]);
}

/** KILL + LEVEL 10, TAKE THEIR CORE: one more bar of the band in Bm-A, then the tape stop (pass 1 ends). */
function climax(S, f0, tapeAt) {
  S.cue(f0, 'KILL + LEVEL 10: the band in G-A; riser; TAPE-STOP on the full mix');
  bandBar(S, f0, CH.G2, { lead: 'brass', level: 0.95 });
  S.tape = [smp(tapeAt), smp(f0 + BAR), smp(f0 + BAR)];
}

/** CORE FALLS + Victory (pass 2): a held pad, the core impact with drums out, the victory resolve. */
function coreBar(S, f0) {
  S.cue(f0, 'CORE: the hit back in, a held D pad; drums out after the impact');
  S.at(f0, 'synth', I.pad([50, 57, 62, 66], (BEAT * 2) / FPS, { cutoff: 1400, attack: 0.02 }), { gain: 0.32, rev: 0.4 });
  S.at(f0, 'synth', I.bass(38, (BEAT * 1.8) / FPS, { cutoff: 600 }), { gain: 0.5 });
  drums(S, f0, f0 + BEAT, 'four', 0.8);
  S.at(f0 + BEAT * 2, 'synth', I.pad([55, 62, 67, 71], (BEAT * 2) / FPS, { cutoff: 900, attack: 0.3 }), { gain: 0.3, rev: 0.6 });
}

/** End card: logo slam resolving on D, stabs, typing ticks, the final stab, ring-out and the silent tail. */
function endCard(S, f0, f1, { stabs, typeAt, finalAt }) {
  S.cue(f0, 'LOGO SLAM: resolve on D major, crash, sub');
  stab(S, f0, CH.D, 1.6);
  S.at(f0, 'hits', I.stab([50, 57, 62, 66, 69, 74], 0.6, 1.2, 105), { gain: 0.55, rev: 0.35 });
  S.at(f0, 'drums', I.crash(10, 2.8), { gain: 0.6, rev: 0.3 });
  S.at(f0, 'sfx', I.impact(106, { sub: 44, len: 1.2 }), { gain: 0.7 });
  S.kick(f0, 1.1);
  drums(S, f0 + BEAT, finalAt, 'beats', 0.8);
  S.pumpWindows.push([smp(f0), smp(finalAt)]);
  for (let f = f0, k = 0; f < finalAt - 0.01; f += BAR, k++) {
    const c = k % 2 === 0 ? CH.D : CH.G2;
    bassLine(S, f, Math.min(f + BAR, finalAt), c, 'eighths', 0.8);
    padChord(S, f, Math.min(f + BAR, finalAt), c, { level: 0.55, cutoff: 2000, attack: 0.05 });
  }
  leadMotif(S, f0 + BEAT, CH.D, { level: 0.55, steps: 12 });
  for (const [f, label] of stabs) {
    S.cue(f, `Stab: ${label}`);
    stab(S, f, CH.D, 1.3, 12);
    S.kick(f, 0.9);
    S.at(f, 'drums', I.clap(f), { gain: 0.45, rev: 0.2 });
  }
  S.cue(typeAt, 'UI ticks (the game click) as the URL types on');
  for (let k = 0; k < 9; k++) S.g(typeAt + k * 2, 'click', { rate: 1.5 + (k % 3) * 0.08, gain: 0.3, pan: -0.4 + k * 0.1 });
  S.cue(finalAt, 'FINAL STAB, ring-out');
  stab(S, finalAt, CH.D, 1.5);
  S.at(finalAt, 'hits', I.stab([38, 50, 57, 62, 66, 69, 74], 0.9, 1.1, 107), { gain: 0.55, rev: 0.6 });
  S.at(finalAt, 'drums', I.crash(11, 2.0), { gain: 0.5, rev: 0.4 });
  S.kick(finalAt, 1);
  S.silenceFrom = smp(f1 - 12);
  S.fadeFrom = smp(f1 - 30);
  S.cue(f1 - 12, 'Digital silence to the end');
}

// ---------------------------------------------------------------- the two cuts

function cut30(S) {
  hookBar(S, 0);
  titleBar(S, 100);
  rollCall(S, 200);
  dropBuild(S, 400);
  chorus(S, 500, [CH.C, CH.G, CH.Am]);
  packHunt(S, 800);
  breakdown(S, 900);
  tension(S, 1000);
  towerComeback(S, 1100);
  skinsHud(S, 1200);
  teamfight(S, 1300);
  climax(S, 1400, 1487);
  placeDesign(S, '30', DESIGN);
  return (P) => {
    coreBar(P, 1500);
    placeDesign(P, '30', DESIGN_AFTER);
    endCard(P, 1600, 1800, { stabs: [[1650, 'PLAY FREE'], [1675, 'No download'], [1700, 'URL']], typeAt: 1700, finalAt: 1750 });
  };
}

/** 15 s: hook, double-time roll call, filtered drop, chorus, half-time, pulse, double-time, stop, impact, resolve. */
function cut15(S) {
  hookBar(S, 0);
  S.cue(100, 'ROLL CALL (eighth cuts): double-time');
  dropHit(S, 100, true);
  drums(S, 100, 200, 'double');
  bassLine(S, 100, 200, CH.G, 'sixteenths');
  padChord(S, 100, 200, CH.G, { level: 0.6, cutoff: 2400, attack: 0.02 });
  leadMotif(S, 100, CH.G, { brass: true });
  S.pumpWindows.push([smp(100), smp(200)]);
  dropBuild(S, 200);
  chorus(S, 300, [CH.C]);
  packHunt(S, 400);
  tension(S, 500);
  teamfight(S, 600);
  climax(S, 700, 737);
  placeDesign(S, '15', DESIGN);
  return (P) => {
    coreBar(P, 750);
    placeDesign(P, '15', DESIGN_AFTER);
    endCard(P, 800, 900, { stabs: [[825, 'PLAY FREE'], [838, 'No download'], [850, 'URL']], typeAt: 850, finalAt: 875 });
  };
}

// ---------------------------------------------------------------- render, mix, master

const LEVEL = { drums: 0.9, synth: 0.85, hits: 0.8, sfx: 0.85, game: 0.8, rev: { music: 0.5, sfx: 0.45, game: 0.4 }, delay: 0.28 };

function finishPass(S) {
  for (const [a, b, fc] of S.lowpass) for (const k of ['drums', 'synth', 'hits']) S[k].region(a, b, (x) => biquad(biquad(x, 'lp', fc, 0.8), 'lp', fc, 0.6), sec(0.03));
  for (const [f, x, g, pan] of S.sfxPanned) S.sfx.addPanned(smp(f), x, g, pan);
  const pump = pumpCurve(S.kicks, 0.5, 0.1);
  for (const [a, b] of S.pumpWindows) S.synth.gainCurve(pump, a, b);
  const music = new Bus(S.n);
  music.mixIn(S.drums, LEVEL.drums);
  music.mixIn(S.synth, LEVEL.synth);
  music.mixIn(S.hits, LEVEL.hits);
  const [rl, rr] = freeverb(S.send.music.L, S.send.music.R, { room: 0.8, damp: 0.4 });
  music.addStereo(0, rl, rr, LEVEL.rev.music);
  // a dotted-eighth ping-pong at the song's tempo
  const [dl, dr] = pingpong(S.delaySend.L, S.delaySend.R, (60 / BPM) * 0.75, 0.32, 3500);
  music.addStereo(0, dl, dr, LEVEL.delay);
  const sfx = new Bus(S.n);
  sfx.mixIn(S.sfx, LEVEL.sfx);
  const [sl, sr] = freeverb(S.send.sfx.L, S.send.sfx.R, { room: 0.86, damp: 0.3 });
  sfx.addStereo(0, sl, sr, LEVEL.rev.sfx);
  const gameB = new Bus(S.n);
  gameB.mixIn(S.game, LEVEL.game);
  const [gl, gr] = freeverb(S.send.game.L, S.send.game.R, { room: 0.8, damp: 0.35 });
  gameB.addStereo(0, gl, gr, LEVEL.rev.game);
  for (const [f0, f1, d0, d1, which = ['music', 'sfx', 'game']] of S.auto) {
    const a = smp(f0);
    const b = smp(f1);
    const stems = { music, sfx, game: gameB };
    for (const k of which) stems[k].gainCurve((i) => dbToGain(d0 + ((d1 - d0) * (i - a)) / Math.max(1, b - a)), a, b);
  }
  for (const [a, b] of S.gaps ?? []) for (const st of [music, sfx, gameB]) st.mute(a, b, sec(0.002));
  for (const [a, b, g] of S.dips ?? []) for (const st of [music]) st.gainCurve(() => g, a, b);
  return { music, sfx, game: gameB };
}

function render(frames, arrange) {
  const A = new Song(frames);
  const pass2 = arrange(A);
  const a = finishPass(A);
  if (A.tape) for (const k of ['music', 'sfx', 'game']) tapeStop(a[k], A.tape[0], A.tape[1] - A.tape[0], A.tape[2] ?? A.tape[1], 0.25);
  const B = new Song(frames);
  pass2(B);
  const b = finishPass(B);
  for (const k of ['music', 'sfx', 'game']) a[k].mixIn(b[k]);
  return { stems: a, cues: [...A.cues, ...B.cues].sort((x, y) => x.f - y.f), end: { silenceFrom: B.silenceFrom, fadeFrom: B.fadeFrom } };
}

function loudness(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const summary = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = re.exec(summary);
    return m ? Number(m[1]) : NaN;
  };
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/True peak:\s+Peak:\s+(-?[\d.inf]+) dBFS/) };
}

/** Per-bar loudness: the energy mean of ebur128's momentary values inside each bar (LUFS). */
function barLoudness(path, bars) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128 -f null - 2>&1`], { encoding: 'utf8' });
  const rows = [];
  for (const m of out.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.inf]+)/g)) rows.push([Number(m[1]), Number(m[2])]);
  const bs = BAR / FPS;
  return Array.from({ length: bars }, (_, i) => {
    const inBar = rows.filter(([t, M]) => t > i * bs + 0.4 && t <= (i + 1) * bs && Number.isFinite(M) && M > -70);
    const e = inBar.reduce((acc, [, M]) => acc + 10 ** (M / 10), 0) / Math.max(1, inBar.length);
    return { bar: i + 1, M: inBar.length ? +(10 * Math.log10(e)).toFixed(1) : null };
  });
}

function applyEnd(bus, { silenceFrom, fadeFrom }) {
  if (fadeFrom != null) bus.gainCurve((i) => Math.max(0, 1 - (i - fadeFrom) / (silenceFrom - fadeFrom)) ** 2, fadeFrom, silenceFrom);
  if (silenceFrom != null) for (let i = silenceFrom; i < bus.n; i++) bus.L[i] = bus.R[i] = 0;
}

function master(stems, end, tag) {
  const n = stems.music.n;
  const pre = new Bus(n);
  pre.mixIn(stems.music);
  pre.mixIn(stems.sfx);
  pre.mixIn(stems.game);
  compress(pre, { threshDb: -16, ratio: 1.8, attack: 0.012, release: 0.2 });
  const tmp = join(OUT, `.tmp-${tag}.wav`);
  let gainDb = 0;
  let out = null;
  let lm = null;
  for (let it = 0; it < 6; it++) {
    out = pre.clone();
    out.gainCurve(() => dbToGain(gainDb));
    limit(out, -1.9, 0.0015, 0.09);
    applyEnd(out, end);
    writeWav(tmp, out.L, out.R);
    lm = loudness(tmp);
    if (Math.abs(lm.I + 14) < 0.15 && lm.TP <= -1.0) break;
    gainDb += -14 - lm.I;
  }
  return { bus: out, loud: lm, tmp, gainDb };
}

function writeSfxFiles(dir) {
  mkdirSync(dir, { recursive: true });
  const st = (name, x) => (Array.isArray(x) ? writeWav(join(dir, `${name}.wav`), x[0], x[1]) : writeWav(join(dir, `${name}.wav`), x));
  const files = {
    'sub-drop-55-30': I.subDrop(), 'impact-flop': I.impact(91, { sub: 45, len: 1.0 }), 'impact-tower': I.impact(103, { sub: 40, len: 1.6 }), 'impact-core': I.impact(106, { sub: 36, len: 2.2 }),
    riser: I.riser(0.62), 'whoosh-lr': I.whoosh(0.27, 80, 1.3), heartbeat: I.heartbeat(), boing: I.boing(), crackle: I.crackle(0.35, 110), fire: I.fire(0.6, 111),
    pop: I.pop(), snap: I.snap(), thump: I.thump(), 'snare-roll-144': I.snareRoll(0.41, BPM, 60), kick: I.kick(1), snare: I.snare(2), clap: I.clap(3),
    'stab-C': I.stab([60, 64, 67, 72], 0.26), 'stab-D': I.stab([62, 66, 69, 74], 0.26), 'tuba-C2': I.tuba(36, 0.2), 'music-box-A5': I.musicBox(81),
  };
  for (const [k, v] of Object.entries(files)) st(k, v);
  for (const key of used) {
    const [name, rate] = key.split('@');
    st(`game-${name}${rate === '1' ? '' : `-r${rate}`}`, I.game(name, Number(rate)));
  }
  return Object.keys(files).length + used.size;
}

// ---------------------------------------------------------------- main

mkdirSync(join(OUT, 'stems'), { recursive: true });
const report = { bpm: BPM, fps: FPS, beatFrames: BEAT, barFrames: BAR, sampleRate: SR, bitDepth: 24, cuts: {} };
for (const [tag, frames, arrange, file] of [['30', 1800, cut30, 'score.wav'], ['15', 900, cut15, 'score-15.wav']]) {
  if (ONLY && ONLY !== tag) continue;
  const t0 = Date.now();
  const { stems, cues, end } = render(frames, arrange);
  for (const k of ['music', 'sfx', 'game']) writeWavFloat(join(OUT, 'stems', `${k}-${tag}.wav`), stems[k].L, stems[k].R);
  const m = master(stems, end, tag);
  const path = join(OUT, file);
  writeWav(path, m.bus.L, m.bus.R);
  const loud = loudness(path);
  const entry = { file: path, frames, seconds: frames / FPS, loudness: loud, masterGainDb: +m.gainDb.toFixed(2), cues };
  if (hasFlag('--report')) entry.bars = barLoudness(path, Math.ceil(frames / BAR));
  report.cuts[tag] = entry;
  execFileSync('rm', ['-f', m.tmp]);
  console.log(`[score] ${file}: I ${loud.I} LUFS, LRA ${loud.LRA} LU, TP ${loud.TP} dBTP (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
if (!hasFlag('--no-sfx-files')) console.log(`[score] sfx one-shots: ${writeSfxFiles(join(OUT, 'sfx'))}`);
writeFileSync(join(OUT, 'cues.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`[score] ${join(OUT, 'cues.json')}`);
