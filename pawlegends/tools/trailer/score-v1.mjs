#!/usr/bin/env node
/**
 * Trailer score (storyboard §1 and §5): an original, beat-locked score at 120 BPM (1 beat = 30 frames at 60 fps),
 * re-voicing the game's own C-G-Am-F loop and lead motif from src/audio/music.ts, with our synthesised risers,
 * whooshes, impacts, tape-stop and comedy cues, and the game's own sound effects (src/audio/sfx.ts and sfxDefs.js,
 * rendered offline through the same zzfx sample builder the game uses). No samples, no stock audio.
 *
 *   node tools/trailer/score.mjs [--out DIR] [--only 30|15] [--no-sfx-files] [--report]
 *
 * Writes (48 kHz, 24-bit, stereo):
 *   DIR/score.wav, DIR/score-15.wav                 masters: -14 LUFS integrated, true peak <= -1 dBTP
 *   DIR/stems/{music,sfx,game}-{30,15}.wav          pre-master stems (same gain staging, no limiter; 32-bit float, so they keep headroom above 0 dBFS)
 *   DIR/sfx/*.wav                                   every designed one-shot and every game sound used, one file each
 *   DIR/cues.json                                   the hit points (frame, seconds, cue) of both cuts, and loudness
 *
 * Timing contract: every cue starts on its exact sample (frame f -> f * 800 samples); the limiter is
 * latency-compensated, so nothing drifts. The last 12 frames of each cut are digital silence.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from '../lib/args.mjs';
import { Bus, SR, biquad, compress, dbToGain, freeverb, limit, pingpong, pumpCurve, sec, tapeStop, writeWav, writeWavFloat } from './dsp.mjs';
import * as I from './instruments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(argValue('--out') ?? join(HERE, 'out', 'audio'));
const ONLY = argValue('--only');
const FPS = 60;
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
  D: { bass: 38, tri: [62, 66, 69] },
  A: { bass: 33, tri: [61, 64, 69] },
  Bm: { bass: 35, tri: [62, 66, 71] },
  GD: { bass: 31, tri: [62, 67, 71] },
};
/** The game's lead motif (music.ts LEAD): 16 steps per bar, semitones above the chord's top note, -1 = rest. */
const LEAD = [0, -1, 2, 4, -1, 4, 2, 0, 5, -1, 4, 2, 0, -1, 2, -1];

// ---------------------------------------------------------------- the song container

/**
 * One render pass. Buses: drums, synth (pumped by the kick in the drops), hits (stabs and leads, unpumped), sfx (our
 * design), game (the game's own sounds). Each group has its own reverb send.
 */
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
    /** Mix automation: [f0, f1, dbStart, dbEnd, stems] (linear in dB across the window). */
    this.auto = [];
  }

  /** Place mono or [L, R] audio at frame f (fractional frames allowed for 16ths: audio only). */
  at(f, bus, x, { gain = 1, pan = 0, rev = 0, delay = 0 } = {}) {
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

  /** A game sound (name, rate) on the game bus. */
  g(f, name, { rate = 1, gain = 1, pan = 0, rev = 0.15 } = {}) {
    this.at(f, 'game', I.game(name, rate), { gain, pan, rev });
    used.add(`${name}@${rate}`);
  }

  cue(f, text) {
    this.cues.push({ f, t: +(f / FPS).toFixed(3), cue: text });
  }

  kick(f, gain = 1) {
    this.at(f, 'drums', I.kick(1 + (Math.round(f) % 7)), { gain });
    this.kicks.push(smp(f));
  }
}

const used = new Set();

// ---------------------------------------------------------------- band parts

function drums(S, f0, f1, style, level = 1) {
  for (let f = f0; f < f1; f += 7.5) {
    const s16 = Math.round((f - f0) / 7.5);
    const inBeat = s16 % 4;
    const beat = Math.floor(s16 / 4);
    if (style === 'four') {
      if (inBeat === 0) S.kick(f, 0.95 * level);
      if (inBeat === 0 && beat % 2 === 1) {
        S.at(f, 'drums', I.snare(beat + 3), { gain: 0.55 * level, rev: 0.18 });
        S.at(f, 'drums', I.clap(beat + 5), { gain: 0.45 * level, rev: 0.2 });
      }
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16, true), { gain: 0.16 * level, pan: 0.15 });
      if (inBeat === 1 || inBeat === 3) S.at(f, 'drums', I.hat(s16), { gain: 0.1 * level, pan: -0.2 });
    } else if (style === 'half') {
      if (s16 === 0) S.kick(f, 0.95 * level);
      if (s16 === 8) S.at(f, 'drums', I.snare(9), { gain: 0.6 * level, rev: 0.35 });
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16), { gain: 0.12 * level, pan: 0.2 });
    } else if (style === 'double') {
      if (inBeat === 0 || (inBeat === 2 && beat % 2 === 1)) S.kick(f, 0.9 * level);
      if (inBeat === 2 && beat % 2 === 0) S.at(f, 'drums', I.snare(s16), { gain: 0.5 * level, rev: 0.15 });
      if (inBeat === 0 && beat > 0) S.at(f, 'drums', I.clap(s16), { gain: 0.35 * level, rev: 0.15 });
      S.at(f, 'drums', I.hat(s16, inBeat === 2), { gain: (inBeat === 2 ? 0.14 : 0.09) * level, pan: inBeat % 2 ? -0.25 : 0.25 });
    } else if (style === 'sparse') {
      if (s16 % 8 === 0) S.kick(f, 0.8 * level);
      if (s16 % 8 === 4) S.at(f, 'drums', I.rim(s16), { gain: 0.35 * level, rev: 0.4, pan: 0.1 });
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16), { gain: 0.06 * level, pan: -0.3 });
    } else if (style === 'hats') {
      S.at(f, 'drums', I.hat(s16, inBeat === 2), { gain: (inBeat === 2 ? 0.1 : 0.05) * level, pan: inBeat % 2 ? -0.3 : 0.3 });
    } else if (style === 'beats') {
      if (inBeat === 0) S.kick(f, 0.85 * level);
      if (inBeat === 2) S.at(f, 'drums', I.hat(s16, true), { gain: 0.12 * level, pan: 0.2 });
    }
  }
}

/** Bass: `pattern` 'eighths' (driving), 'whole', 'sixteenths' or 'beats'. */
function bassLine(S, f0, f1, chord, pattern = 'eighths', level = 1) {
  const step = pattern === 'sixteenths' ? 7.5 : pattern === 'beats' ? 30 : pattern === 'whole' ? f1 - f0 : 15;
  for (let f = f0, k = 0; f < f1 - 0.01; f += step, k++) {
    const oct = pattern === 'eighths' && k % 2 === 1 ? 12 : 0;
    const len = (Math.min(step, f1 - f) / FPS) * (pattern === 'whole' ? 1 : 0.85);
    S.at(f, 'synth', I.bass(chord.bass + oct, len, { cutoff: pattern === 'whole' ? 900 : 2200 }), { gain: 0.42 * level });
  }
}

function leadMotif(S, f0, chord, { octave = 0, level = 1, steps = 16, box = false } = {}) {
  const top = chord.tri[2] + octave;
  for (let s = 0; s < steps; s++) {
    const d = LEAD[s % 16];
    if (d < 0) continue;
    const f = f0 + s * 7.5;
    if (box) S.at(f, 'hits', I.musicBox(top + 12 + d), { gain: 0.3 * level, rev: 0.45, delay: 0.25, pan: s % 2 ? 0.2 : -0.2 });
    else {
      S.at(f, 'hits', I.pluck(top + d), { gain: 0.16 * level, rev: 0.2, delay: 0.3, pan: -0.1 });
      S.at(f, 'hits', I.pluck(top + 12 + d), { gain: 0.06 * level, pan: 0.25 });
    }
  }
}

function padChord(S, f0, f1, chord, { level = 1, cutoff = 1500, attack = 0.2, low = false } = {}) {
  const notes = low ? chord.tri.map((m) => m - 12) : chord.tri;
  S.at(f0, 'synth', I.pad(notes, (f1 - f0) / FPS, { cutoff, attack }), { gain: 0.32 * level, rev: 0.35 });
}

function stab(S, f, chord, level = 1, up = 0) {
  S.at(f, 'hits', I.stab(chord.tri.map((m) => m + up).concat([chord.tri[0] + 12 + up]), 0.28), { gain: 0.42 * level, rev: 0.25 });
}

/** A full DROP bar: drums, driving bass, lead, pad (the pump comes from the kicks). */
function dropBar(S, f0, chord, { lead = true, level = 1 } = {}) {
  drums(S, f0, f0 + 120, 'four', level);
  bassLine(S, f0, f0 + 120, chord, 'eighths', level);
  if (lead) leadMotif(S, f0, chord, { level });
  padChord(S, f0, f0 + 120, chord, { level: 0.7 * level, cutoff: 2400, attack: 0.02 });
  S.pumpWindows.push([smp(f0), smp(f0 + 120)]);
}

// ---------------------------------------------------------------- sections (shared by both cuts)

/** Bar 1: f0 full-band stab and sub-drop, the band through a 400 Hz low-pass, hard stop at +108, reverse whoosh. */
function coldOpen(S, f0) {
  S.cue(f0, 'IMPACT: full-band stab + sub-drop 55->30 Hz + the game CLANK (heroHit + shieldChime); white flash');
  stab(S, f0, CH.C, 1.5);
  S.at(f0, 'hits', I.stab([48, 55, 60, 64, 67, 72], 0.5, 1.2, 99), { gain: 0.5, rev: 0.3 });
  S.at(f0, 'sfx', I.subDrop(), { gain: 0.95 });
  S.at(f0, 'drums', I.crash(5, 2.2), { gain: 0.55, rev: 0.2 });
  S.kick(f0, 1.1);
  S.g(f0, 'heroHit', { gain: 0.9 });
  S.g(f0, 'shieldChime', { rate: 0.9, gain: 0.55 });
  S.at(f0, 'sfx', I.impact(90, { sub: 48, len: 0.9 }), { gain: 0.6 });
  // the band carries on, muffled
  for (let b = 1; b < 4; b++) S.kick(f0 + b * 30, 0.9);
  bassLine(S, f0, f0 + 108, CH.C, 'eighths', 0.9);
  leadMotif(S, f0, CH.C, { level: 0.9, steps: 14 });
  padChord(S, f0, f0 + 108, CH.C, { level: 0.8, cutoff: 2000, attack: 0.01 });
  // muffled, but not buried: the bed under the hook holds about -15 LUFS-S to the stop (a 900 Hz low-pass)
  S.lowpass = [smp(f0 + 3), smp(f0 + 108)];
  S.hardStop = [smp(f0 + 108), smp(f0 + 120)];
  S.cue(f0 + 30, 'CUT ACCENT + bow draw: a stab, a kick and a snap on the cut, the game arrow (-5 st, stretched) + windup');
  // on the sfx bus: the cut accent is not under the bar's low-pass
  S.at(f0 + 30, 'sfx', I.stab([72, 76, 79, 84], 0.28), { gain: 0.55, rev: 0.2 });
  S.kick(f0 + 30, 1.0);
  S.at(f0 + 30, 'sfx', I.snap(93), { gain: 0.7, rev: 0.15 });
  S.g(f0 + 30, 'arrow', { rate: 0.749, gain: 0.8 });
  S.g(f0 + 30, 'windup', { rate: 0.6, gain: 0.85 });
  S.at(f0 + 34, 'sfx', I.riseWhoosh(0.3, 89), { gain: 0.45 });
  S.cue(f0 + 52, 'Arrow release (the game arrow) + a loud whoosh left to right');
  S.g(f0 + 52, 'arrow', { rate: 0.85, gain: 1.0 });
  S.sfxPanned = S.sfxPanned ?? [];
  S.sfxPanned.push([f0 + 52, I.whoosh(0.42, 80, 1.3), 1.25, (i) => -0.9 + 1.8 * Math.min(1, i / sec(0.42))]);
  S.at(f0 + 52, 'sfx', I.snap(94), { gain: 0.5 });
  S.cue(f0 + 90, 'BULLSEYE (beat 3): the game hit + heroHit + our snap + an impact under the hit-stop');
  S.g(f0 + 90, 'hit', { gain: 1.0 });
  S.g(f0 + 90, 'heroHit', { gain: 0.8 });
  S.at(f0 + 90, 'sfx', I.snap(), { gain: 0.9, rev: 0.2 });
  S.at(f0 + 90, 'sfx', I.impact(95, { sub: 46, len: 0.6 }), { gain: 0.6 });
  S.cue(f0 + 108, 'HARD STOP (12 frames of silence) + reverse whoosh into the next bar');
  S.at(f0 + 108, 'sfx', I.reverseWhoosh(0.2), { gain: 0.55 });
}

/** Bar 2: the lead motif as a music box over F -> G, no drums; L1 ticks; swell; snare roll; reverse cymbal. */
function meetGabe(S, f0) {
  S.cue(f0, 'MEET GABE: music-box motif, no drums (about -20 LUFS-S)');
  S.auto.push([f0, f0 + 60, -5, -5], [f0 + 60, f0 + 120, -5, 0]);
  leadMotif(S, f0, CH.F, { box: true, steps: 8, level: 1 });
  leadMotif(S, f0 + 60, CH.G, { box: true, steps: 8, level: 1 });
  // LEAD steps 8-15 on G read from the motif's second half
  padChord(S, f0, f0 + 60, CH.F, { level: 0.55, cutoff: 1100, attack: 0.15 });
  padChord(S, f0 + 60, f0 + 120, CH.G, { level: 0.65, cutoff: 1400, attack: 0.1 });
  S.at(f0, 'synth', I.bass(29, 1.0, { cutoff: 500 }), { gain: 0.25 });
  S.at(f0 + 60, 'synth', I.bass(31, 1.0, { cutoff: 600 }), { gain: 0.3 });
  S.cue(f0 + 6, 'L1 "Meet": soft tick (the game click)');
  S.g(f0 + 6, 'click', { rate: 1.2, gain: 0.35 });
  S.cue(f0 + 21, 'L1 "Gabe.": soft tick');
  S.g(f0 + 21, 'click', { rate: 1.35, gain: 0.35 });
  S.cue(f0 + 60, 'Swell + whip-zoom whoosh (pitched up, f180-186)');
  S.at(f0 + 50, 'sfx', I.riseWhoosh(0.17, 84), { gain: 1.3 });
  S.at(f0 + 60, 'sfx', I.whoosh(0.3, 85, 2.4), { gain: 1.9, rev: 0.2 });
  S.at(f0 + 60, 'synth', I.pad([55, 62, 67, 71], 1.0, { cutoff: 2400, attack: 0.08 }), { gain: 0.3, rev: 0.4 });
  S.cue(f0 + 72, 'L2 slam (f192): a thump and a low stab');
  S.at(f0 + 72, 'sfx', I.thump(), { gain: 1.0 });
  S.kick(f0 + 72, 0.8);
  S.cue(f0 + 90, 'Snare roll crescendo to about -10 dB + reverse cymbal peaking on f238, then 2 frames at -40 dB before the drop');
  S.at(f0 + 90, 'drums', I.snareRoll(0.47), { gain: 0.95, rev: 0.25 });
  S.at(f0 + 88, 'drums', I.reverseCymbal(0.5), { gain: 0.85 });
  // two frames held at -40 dB (never digital zero) so the drop lands on contrast
  S.dips = [...(S.dips ?? []), [smp(f0 + 118), smp(f0 + 120), 0.01]];
}

/** DROP downbeat accents. `big`: the first drop (sub + kick + crash well over the bar before it). */
function dropHit(S, f, big = false) {
  S.at(f, 'drums', I.crash(6, 2.4), { gain: big ? 0.75 : 0.5, rev: 0.2 });
  S.at(f, 'sfx', I.impact(97, { sub: 44, len: 0.7 }), { gain: big ? 0.8 : 0.45 });
  if (big) {
    S.at(f, 'sfx', I.subDrop(60, 34, 0.7, 0.5), { gain: 0.8 });
    S.kick(f, 1.25);
  }
}

function pingsBar(S, f0) {
  S.cue(f0 - 6, 'PINGS: the game ping-wheel click as the wheel opens (f594); half-time groove from f600');
  S.g(f0 - 6, 'click', { gain: 0.7 });
  S.at(f0 - 6, 'sfx', I.snap(96), { gain: 0.4 });
  drums(S, f0, f0 + 60, 'half');
  bassLine(S, f0, f0 + 60, CH.F, 'whole');
  padChord(S, f0, f0 + 60, CH.F, { level: 0.7, cutoff: 1600, attack: 0.02 });
  S.at(f0, 'drums', I.crash(7, 1.4), { gain: 0.25, rev: 0.2 });
  S.cue(f0 + 11, 'Ping "group" chime (the game click) + soft bell; the cut to the allies on f612');
  S.g(f0 + 11, 'click', { gain: 0.7, rate: 1.0 });
  S.at(f0 + 11, 'hits', I.musicBox(84, 0.6), { gain: 0.25, rev: 0.3 });
  S.at(f0 + 12, 'sfx', I.whoosh(0.2, 97, 1.6), { gain: 0.5 });
  // the gag: music, sfx and game sounds (and every reverb tail) cut to digital silence; only quiet ambience (about
  // -30 dBFS), the refusal blip and the womp play in the hole, laid in after the cut (finishPass)
  S.cue(f0 + 60, 'HARD DROPOUT: everything to silence; quiet ambience (about -30 dBFS); the game deny blip');
  S.musicMute = [smp(f0 + 60), smp(f0 + 120)];
  S.gagMute = [smp(f0 + 60), smp(f0 + 105)];
  S.gag = [
    [f0 + 60, 'game', I.ambience(0.75), dbToGain(-20)],
    [f0 + 62, 'game', I.game('deny', 1), 0.55],
    [f0 + 90, 'sfx', I.womp(), 0.62],
  ];
  used.add('deny@1');
  S.cue(f0 + 90, '"Womp" (E -> C#, descending minor third), alone in the silence');
  S.cue(f0 + 105, 'Rising whoosh into the slam');
  S.at(f0 + 105, 'sfx', I.riseWhoosh(0.25), { gain: 0.5 });
}

function puddingBars(S, f0) {
  S.cue(f0, 'SLAM back in: crash, the band, Pudding bounce (our sub boing + the game hop slam)');
  dropBar(S, f0, CH.C, { lead: false });
  dropHit(S, f0);
  S.at(f0, 'sfx', I.boing(), { gain: 0.75 });
  S.g(f0, 'slam', { rate: 0.7, gain: 0.8 });
  // Pudding's tuba motif (oom-pah), from beat 2
  const T = [[60, 36, 15], [75, 43, 15], [90, 36, 7.5], [97.5, 40, 7.5], [105, 43, 15]];
  for (const [df, m, len] of T) S.at(f0 + df, 'synth', I.tuba(m, (len / FPS) * 0.9), { gain: 0.5, rev: 0.12 });
  S.cue(f0 + 64, 'Calm chime (the game shieldChime) + Pudding tuba motif');
  S.g(f0 + 64, 'shieldChime', { gain: 0.6, rev: 0.3 });
  // bar 8: TOWER
  const b = f0 + 120;
  S.cue(b, 'Riser (noise + saw sweep 200 Hz -> 4 kHz) into the tower: a crescendo from about -24 dB to its peak on f899');
  S.at(b, 'sfx', I.riser(1.0), { gain: 2.0 });
  // the band builds under it (it starts at about -14 and swells into the hit), then one frame of silence
  S.auto.push([b, b + 59, -4, 0, ['music']]);
  S.gaps = [...(S.gaps ?? []), [smp(b + 59), smp(b + 60)]];
  drums(S, b, b + 30, 'four');
  for (let f = b + 30; f < b + 60; f += 7.5) S.at(f, 'drums', I.snare(Math.round(f)), { gain: 0.25 + ((f - b - 30) / 30) * 0.3, rev: 0.15 });
  bassLine(S, b, b + 60, CH.G, 'eighths');
  S.pumpWindows.push([smp(b), smp(b + 30)]);
  padChord(S, b, b + 60, CH.G, { level: 0.6, cutoff: 1200, attack: 0.5 });
  S.cue(b + 60, 'TOWER IMPACT (beat 30): the game boom + roar + crash + sub; one of the two loudest hits; half-time');
  S.g(b + 60, 'boom', { gain: 1.3 });
  S.g(b + 60, 'roar', { gain: 0.9 });
  S.at(b + 60, 'sfx', I.impact(98, { sub: 40, len: 1.6 }), { gain: 1.3, rev: 0.25 });
  S.at(b + 60, 'sfx', I.subDrop(52, 30, 0.8, 0.5), { gain: 0.9 });
  S.at(b + 60, 'drums', I.crash(8, 2.6), { gain: 0.8, rev: 0.25 });
  S.kick(b + 60, 1.3);
  stab(S, b + 60, CH.G, 1.4);
  drums(S, b + 60, b + 120, 'half');
  bassLine(S, b + 60, b + 120, CH.G, 'whole');
  padChord(S, b + 60, b + 120, CH.G, { level: 0.6, cutoff: 1800, attack: 0.02 });
}

function downBar(S, f0) {
  S.cue(f0, 'MINOR TURN Am-F-Dm-E, sparse drums; the cat tower falls (the game boom, muffled at 1.2 kHz)');
  const seq = [CH.Am, CH.F, CH.Dm, CH.E];
  drums(S, f0, f0 + 120, 'sparse');
  seq.forEach((c, i) => {
    S.at(f0 + i * 30, 'synth', I.pad(c.tri.map((m) => m - 12), 0.5, { cutoff: 900, attack: 0.03, release: 0.25 }), { gain: 0.36, rev: 0.4 });
    S.at(f0 + i * 30, 'synth', I.bass(c.bass, 0.45, { cutoff: 700 }), { gain: 0.38 });
  });
  S.at(f0 + 4, 'game', biquad(I.game('boom'), 'lp', 1200), { gain: 1.0, rev: 0.3 });
  S.cue(f0 + 30, 'The HUD shot (f990): the game click');
  S.g(f0 + 30, 'click', { gain: 0.5 });
  S.cue(f0 + 68, 'Stun hit (the game heroHit)');
  S.g(f0 + 68, 'heroHit', { gain: 0.8 });
  S.cue(f0 + 92, 'Purr-ify (the game shieldUp, rate 1.2)');
  S.g(f0 + 92, 'shieldUp', { rate: 1.2, gain: 0.8, rev: 0.3 });
  S.at(f0 + 90, 'sfx', I.riseWhoosh(0.5, 86), { gain: 0.35 });
  S.at(f0 + 90, 'drums', I.snareRoll(0.5, 120, 60), { gain: 0.25, rev: 0.2 });
}

function comebackBar(S, f0) {
  S.cue(f0, 'KEY LIFT TO D: COMEBACK banner (the game click + sting) and crowd roar');
  dropBar(S, f0, CH.D);
  dropHit(S, f0);
  stab(S, f0, CH.D, 1.2);
  S.g(f0, 'roar', { gain: 0.85 });
  S.g(f0, 'click', { rate: 0.6, gain: 0.5 });
  S.g(f0, 'sting', { gain: 0.7, rev: 0.2 });
  S.cue(f0 + 66, 'Knockout 1 (the game heroHit + death)');
  S.g(f0 + 66, 'heroHit', { gain: 0.8 });
  S.g(f0 + 66, 'death', { gain: 0.6 });
  S.cue(f0 + 96, 'Knockout 2 + "Shut down!" banner (the game click + roar) + impact');
  S.g(f0 + 96, 'heroHit', { gain: 0.9 });
  S.g(f0 + 96, 'death', { gain: 0.6 });
  S.g(f0 + 96, 'click', { rate: 0.6, gain: 0.5 });
  S.g(f0 + 96, 'roar', { gain: 0.6 });
  S.at(f0 + 96, 'sfx', I.impact(99, { sub: 50, len: 0.6 }), { gain: 0.45 });
}

function skinsBar(S, f0) {
  S.cue(f0, 'SKINS: held pad, hi-hats only; shimmer stab D');
  S.auto.push([f0, f0 + 90, -3, -3], [f0 + 90, f0 + 120, -3, 0]);
  drums(S, f0, f0 + 120, 'hats');
  S.at(f0, 'synth', I.pad([62, 66, 69, 76], 2.0, { cutoff: 2200, attack: 0.05 }), { gain: 0.3, rev: 0.4 });
  S.at(f0, 'synth', I.bass(38, 1.9, { cutoff: 500 }), { gain: 0.3 });
  [74, 76, 78, 81].forEach((m, i) => {
    if (i) S.cue(f0 + i * 30, `Shimmer stab ${['D', 'E', 'F#', 'A'][i]}`);
    // up 7 dB over the pad: each flip is heard, with the same attack on every one (a stab, a kick and a clap)
    S.at(f0 + i * 30, 'hits', I.shimmer(m, 60 + i), { gain: 1.1, rev: 0.45, delay: 0.2 });
    stab(S, f0 + i * 30, CH.D, 0.7, 12 + [0, 2, 4, 7][i]);
    S.kick(f0 + i * 30, 0.8);
    S.at(f0 + i * 30, 'drums', I.clap(70 + i), { gain: 0.35, rev: 0.2 });
  });
  S.at(f0 + 90, 'sfx', I.riseWhoosh(0.5, 87), { gain: 0.4 });
}

/** Bar 12 (BRAWL): double-time drums with the game's ult sound on every eighth, then the tape-stop hang. */
function brawlBar(S, f0, { tape = true } = {}) {
  S.cue(f0, 'BRAWL: double-time drums; the game ult sound on every eighth (6 casts)');
  dropHit(S, f0);
  drums(S, f0, f0 + 90, 'double', 0.8);
  [[CH.Bm, 0, 30], [CH.GD, 30, 30], [CH.A, 60, 30]].forEach(([c, o, l]) => {
    bassLine(S, f0 + o, f0 + o + l, c, 'sixteenths');
    padChord(S, f0 + o, f0 + o + l + 15, c, { level: 0.7, cutoff: 2600, attack: 0.01 });
  });
  leadMotif(S, f0, CH.Bm, { steps: 12, level: 1 });
  S.pumpWindows.push([smp(f0), smp(f0 + 90)]);
  const rates = [1, 1.06, 0.94, 1.03, 0.97, 1.1];
  // every cut has its own transient, about 4 dB over the bed: the game's ult sound, a snap and a short impact
  for (let k = 0; k < 6; k++) {
    S.g(f0 + k * 15, 'ult', { rate: rates[k], gain: 1.05, pan: k % 2 ? 0.35 : -0.35 });
    S.at(f0 + k * 15, 'sfx', I.snap(110 + k), { gain: 0.75, pan: k % 2 ? 0.3 : -0.3 });
    S.at(f0 + k * 15, 'sfx', I.impact(120 + k, { sub: 50, len: 0.35 }), { gain: 0.45 });
    if (k === 3) S.at(f0 + k * 15, 'sfx', I.crackle(0.3, 101), { gain: 0.4, pan: 0.3 });
    if (k === 5) S.at(f0 + k * 15, 'sfx', I.fire(0.4, 102), { gain: 0.5 });
  }
  if (tape) {
    S.cue(f0 + 90, 'TAPE-STOP on the full mix (pitch down to -24 st) over 15 frames, then silence');
    S.tape = [smp(f0 + 90), smp(f0 + 106), smp(f0 + 120)];
  }
}

/** Bar 13: core impact, heartbeat, victory sting re-voiced in D. */
function fallBar(S, f0) {
  // one stack on the downbeat: the core breaks on this frame (the picture shows it whole for the three frames before)
  const h = f0;
  S.cue(h, 'CORE IMPACT (the break, on the beat): sub + crash + the game boom/roar; drums out; heartbeat every 30 frames');
  S.g(h, 'boom', { gain: 1 });
  S.g(h, 'roar', { gain: 0.9 });
  S.at(h, 'sfx', I.impact(103, { sub: 36, len: 2.2 }), { gain: 0.95, rev: 0.4 });
  S.at(h, 'sfx', I.subDrop(48, 26, 1.0, 0.6), { gain: 0.6 });
  S.at(h, 'drums', I.crash(9, 3.0), { gain: 0.6, rev: 0.45 });
  stab(S, h, CH.GD, 1.2, -12);
  S.at(f0, 'synth', I.pad([55, 62, 67, 71], 1.0, { cutoff: 900, attack: 0.4 }), { gain: 0.32, rev: 0.6 });
  for (const df of [0, 30]) S.at(f0 + df, 'sfx', I.heartbeat(), { gain: 0.9, rev: 0.35 });
  S.cue(f0 + 60, 'Victory sting (the game victory, re-voiced in D: rate 1.498)');
  S.g(f0 + 60, 'victory', { rate: 1.498, gain: 0.85, rev: 0.4 });
  S.at(f0 + 60, 'synth', I.pad([57, 61, 64, 69], 1.0, { cutoff: 1800, attack: 0.3 }), { gain: 0.32, rev: 0.5 });
  S.at(f0 + 60, 'drums', I.reverseCymbal(1.0, 104), { gain: 0.45 });
  S.at(f0 + 90, 'sfx', I.riseWhoosh(0.5, 88), { gain: 0.35 });
}

/**
 * End card: logo slam resolving on D major, stabs on PLAY FREE / No download / URL, typewriter ticks, final stab,
 * ring-out, digital silence for the last 12 frames.
 */
function endCard(S, f0, f1, { stabs, typeAt, finalAt }) {
  S.cue(f0, 'LOGO SLAM: resolve on D major, crash, sub');
  stab(S, f0, CH.D, 1.6);
  S.at(f0, 'hits', I.stab([50, 57, 62, 66, 69, 74], 0.6, 1.2, 105), { gain: 0.55, rev: 0.35 });
  S.at(f0, 'drums', I.crash(10, 2.8), { gain: 0.6, rev: 0.3 });
  S.at(f0, 'sfx', I.impact(106, { sub: 44, len: 1.2 }), { gain: 0.7 });
  S.kick(f0, 1.1);
  const grooveEnd = finalAt;
  drums(S, f0 + 30, grooveEnd, 'beats', 0.8);
  S.pumpWindows.push([smp(f0), smp(grooveEnd)]);
  for (let f = f0; f < grooveEnd; f += 120) {
    const c = (f - f0) / 120 % 2 === 0 ? CH.D : CH.GD;
    bassLine(S, f, Math.min(f + 120, grooveEnd), c, 'eighths', 0.8);
    padChord(S, f, Math.min(f + 120, grooveEnd), c, { level: 0.6, cutoff: 2000, attack: 0.05 });
  }
  leadMotif(S, f0 + 30, CH.D, { level: 0.6, steps: 12 });
  for (const [f, label] of stabs) {
    S.cue(f, `Stab: ${label}`);
    stab(S, f, CH.D, 1.3, 12);
    S.kick(f, 0.9);
    S.at(f, 'drums', I.clap(f), { gain: 0.45, rev: 0.2 });
  }
  S.cue(typeAt, 'Typewriter ticks (the game click, soft) as the URL types on');
  for (let k = 0; k < 9; k++) S.g(typeAt + k * 2, 'click', { rate: 1.5 + (k % 3) * 0.08, gain: 0.3, pan: -0.4 + k * 0.1 });
  S.cue(finalAt, 'FINAL STAB (logo bump), ring-out');
  stab(S, finalAt, CH.D, 1.5);
  S.at(finalAt, 'hits', I.stab([38, 50, 57, 62, 66, 69, 74], 0.9, 1.1, 107), { gain: 0.55, rev: 0.6 });
  S.at(finalAt, 'drums', I.crash(11, 2.0), { gain: 0.5, rev: 0.4 });
  S.kick(finalAt, 1);
  S.silenceFrom = smp(f1 - 12);
  S.fadeFrom = smp(f1 - 24);
  S.cue(f1 - 12, 'Digital silence to the end');
}

// ---------------------------------------------------------------- the two cuts

function cut30(S) {
  coldOpen(S, 0);
  meetGabe(S, 120);
  S.cue(240, 'DROP A: full band (drums, saw bass, pluck lead), crash, the game crowd cheer; stabs CATS / VS / DOGS');
  dropBar(S, 240, CH.C);
  dropHit(S, 240, true);
  S.g(240, 'cheer', { gain: 0.7 });
  for (const f of [240, 270, 300]) stab(S, f, CH.C, 0.9);
  S.cue(270, 'Stab: VS');
  S.cue(300, 'Stab: DOGS');
  dropBar(S, 360, CH.G);
  S.cue(360, 'Hero cuts: a stab on every beat (360, 390, 420, 450)');
  for (const f of [360, 390, 420, 450]) stab(S, f, CH.G, 0.8);
  S.cue(372, 'Pug Charge impact (the game dash + heroHit)');
  S.g(366, 'dash', { gain: 0.6 });
  S.g(372, 'heroHit', { gain: 0.9 });
  S.at(372, 'sfx', I.thump(93), { gain: 0.5 });
  S.cue(398, 'Short Circuit lightning (the game magic + our crackle)');
  S.g(398, 'magic', { gain: 0.7 });
  S.at(398, 'sfx', I.crackle(0.35, 110), { gain: 0.6 });
  S.cue(420, 'Curtains Up! stage ignites (the game ult + fire whoosh)');
  S.g(420, 'ult', { gain: 0.5 });
  S.at(420, 'sfx', I.fire(0.6, 111), { gain: 0.55 });
  S.cue(462, 'Pack Hunt leap (the game dash, rate 1.3)');
  S.g(462, 'dash', { rate: 1.3, gain: 0.8 });
  dropBar(S, 480, CH.Am);
  S.cue(480, 'Tangled Lights pull (the game magic)');
  S.g(480, 'magic', { gain: 0.55, rate: 0.9 });
  S.cue(486, 'L4 slam "3V3 IN YOUR BROWSER": stab');
  stab(S, 486, CH.Am, 0.6, 12);
  S.cue(512, 'Belly Flop sub-thump (the game slam + our sub)');
  S.g(512, 'slam', { gain: 0.9 });
  S.at(512, 'sfx', I.subDrop(70, 38, 0.25, 0.3), { gain: 0.8 });
  S.cue(570, 'Drum fill (snare 16ths + toms)');
  for (let f = 570, k = 0; f < 600; f += 3.75, k++) {
    if (k % 2 === 0) S.at(f, 'drums', I.tom(180 - k * 6, k), { gain: 0.35, pan: 0.5 - k * 0.07 });
    else S.at(f, 'drums', I.snare(k + 20), { gain: 0.18 + k * 0.02 });
  }
  S.cue(580, 'Heart Balloon pop (the game poof + our pop)');
  S.g(580, 'poof', { gain: 0.7 });
  S.at(580, 'sfx', I.pop(), { gain: 0.6 });
  pingsBar(S, 600);
  puddingBars(S, 720);
  downBar(S, 960);
  comebackBar(S, 1080);
  skinsBar(S, 1200);
  brawlBar(S, 1320);
  // pass 2 (after the tape stop): heartbeat, the fall, the end card
  return (P) => {
    P.cue(1416, 'The hang: a reverse swell (cymbal + whoosh) sucking into the core impact, a heartbeat at f1432');
    P.at(1416, 'drums', I.reverseCymbal(0.4, 108), { gain: 0.55 });
    P.at(1425, 'sfx', I.reverseWhoosh(0.25, 109), { gain: 0.5 });
    P.at(1432, 'sfx', I.heartbeat(), { gain: 0.9, rev: 0.3 });
    fallBar(P, 1440);
    endCard(P, 1560, 1800, { stabs: [[1590, 'PLAY FREE'], [1620, 'No download'], [1650, 'URL']], typeAt: 1650, finalAt: 1740 });
  };
}

function cut15(S) {
  coldOpen(S, 0);
  // the drop lands at 2.0 s (bar 2)
  S.cue(118, 'Reverse cymbal into the drop');
  S.at(90, 'drums', I.reverseCymbal(0.5, 120), { gain: 0.35 });
  S.cue(120, 'DROP: full band; stabs CATS / VS / DOGS');
  dropBar(S, 120, CH.C);
  dropHit(S, 120, true);
  S.gaps = [...(S.gaps ?? []), [smp(111), smp(120)]];
  S.g(120, 'cheer', { gain: 0.7 });
  for (const f of [120, 150, 180]) stab(S, f, CH.C, 0.9);
  dropBar(S, 240, CH.G);
  S.cue(240, 'Hero cuts: a stab on every beat; L4 slam at 246');
  for (const f of [240, 270, 300, 330]) stab(S, f, CH.G, 0.8);
  S.g(246, 'dash', { gain: 0.6 });
  S.g(252, 'heroHit', { gain: 0.9 });
  S.g(278, 'magic', { gain: 0.7 });
  S.at(278, 'sfx', I.crackle(0.35, 110), { gain: 0.6 });
  S.g(300, 'ult', { gain: 0.5 });
  S.at(300, 'sfx', I.fire(0.6, 111), { gain: 0.55 });
  S.g(342, 'dash', { rate: 1.3, gain: 0.8 });
  // bar 4: riser into the tower at 420
  const b = 360;
  S.cue(b, 'Riser into the tower: a crescendo to its peak on f419, one frame of silence, the hit');
  S.at(b, 'sfx', I.riser(1.0), { gain: 0.85 });
  S.auto.push([b, b + 59, -16, 0, ['music']]);
  S.gaps = [...(S.gaps ?? []), [smp(b + 59), smp(b + 60)]];
  drums(S, b, b + 30, 'four');
  for (let f = b + 30; f < b + 60; f += 7.5) S.at(f, 'drums', I.snare(Math.round(f)), { gain: 0.25 + ((f - b - 30) / 30) * 0.3, rev: 0.15 });
  bassLine(S, b, b + 60, CH.Am, 'eighths');
  S.pumpWindows.push([smp(b), smp(b + 30)]);
  padChord(S, b, b + 60, CH.Am, { level: 0.6, cutoff: 1200, attack: 0.5 });
  S.cue(420, 'TOWER IMPACT; half-time');
  S.g(420, 'boom', { gain: 1 });
  S.g(420, 'roar', { gain: 0.8 });
  S.at(420, 'sfx', I.impact(98, { sub: 40, len: 1.6 }), { gain: 0.8, rev: 0.25 });
  S.at(420, 'drums', I.crash(8, 2.6), { gain: 0.55, rev: 0.25 });
  stab(S, 420, CH.F, 1.1);
  drums(S, 420, 480, 'half');
  bassLine(S, 420, 480, CH.F, 'whole');
  padChord(S, 420, 480, CH.F, { level: 0.6, cutoff: 1800, attack: 0.02 });
  S.at(450, 'drums', I.snareRoll(0.5, 120, 70), { gain: 0.3, rev: 0.2 });
  // bar 5: BRAWL (key lift to D) with the tape stop at 570
  brawlBar(S, 480);
  S.cue(486, 'L6 "QUICK MATCHES." slam; "BIG PLAYS." at 516');
  return (P) => {
    P.cue(576, 'The hang: reverse swell into the core, heartbeat');
    P.at(576, 'drums', I.reverseCymbal(0.4, 108), { gain: 0.55 });
    P.at(585, 'sfx', I.reverseWhoosh(0.25, 109), { gain: 0.5 });
    P.at(592, 'sfx', I.heartbeat(), { gain: 0.9, rev: 0.3 });
    fallBar(P, 600);
    endCard(P, 720, 900, { stabs: [[735, 'PLAY FREE'], [748, 'No download'], [758, 'URL']], typeAt: 758, finalAt: 840 });
  };
}

// ---------------------------------------------------------------- render, mix, master

/** Bus mix levels (pre-master). */
const LEVEL = { drums: 0.9, synth: 0.85, hits: 0.8, sfx: 0.85, game: 0.8, rev: { music: 0.5, sfx: 0.45, game: 0.4 }, delay: 0.3 };

function finishPass(S) {
  // muffled band (bar 1)
  if (S.lowpass) for (const b of ['drums', 'synth', 'hits']) S[b].region(S.lowpass[0], S.lowpass[1], (x) => biquad(biquad(x, 'lp', 900, 0.8), 'lp', 900, 0.6), sec(0.03));
  for (const [f, x, g, pan] of S.sfxPanned ?? []) S.sfx.addPanned(smp(f), x, g, pan);
  // kick pump on the synth bus inside the drop windows
  const pump = pumpCurve(S.kicks, 0.5, 0.1);
  for (const [a, b] of S.pumpWindows) S.synth.gainCurve(pump, a, b);
  const music = new Bus(S.n);
  music.mixIn(S.drums, LEVEL.drums);
  music.mixIn(S.synth, LEVEL.synth);
  music.mixIn(S.hits, LEVEL.hits);
  const [rl, rr] = freeverb(S.send.music.L, S.send.music.R, { room: 0.8, damp: 0.4 });
  music.addStereo(0, rl, rr, LEVEL.rev.music);
  const [dl, dr] = pingpong(S.delaySend.L, S.delaySend.R, 0.375, 0.32, 3500);
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
  // hard stops: the band only (the sfx and game sounds that live in the gap survive)
  if (S.hardStop) music.mute(S.hardStop[0], S.hardStop[1], sec(0.002));
  if (S.musicMute) music.mute(S.musicMute[0], S.musicMute[1], sec(0.004));
  if (S.gagMute) {
    sfx.mute(S.gagMute[0], S.gagMute[1], sec(0.004));
    gameB.mute(S.gagMute[0], S.gagMute[1], sec(0.004));
    for (const [f, k, x, g] of S.gag) {
      const st = k === 'sfx' ? sfx : gameB;
      if (Array.isArray(x)) st.addStereo(smp(f), x[0], x[1], g);
      else st.add(smp(f), x, g, 0);
    }
  }
  // one frame of silence before an impact (the riser's held breath)
  for (const [a, b] of S.gaps ?? []) for (const st of [music, sfx, gameB]) st.mute(a, b, sec(0.002));
  // held dips (a breath before a drop, never digital zero)
  for (const [a, b, g] of S.dips ?? []) for (const st of [music, sfx, gameB]) st.gainCurve(() => g, a, b);
  return { music, sfx, game: gameB };
}

function render(frames, arrange) {
  const A = new Song(frames);
  const pass2 = arrange(A);
  const a = finishPass(A);
  if (A.tape) {
    // the tape stop reads the whole mix as it would have carried on, then silence until pass 2 takes over
    for (const k of ['music', 'sfx', 'game']) tapeStop(a[k], A.tape[0], A.tape[1] - A.tape[0], A.tape[2] ?? A.tape[1], 0.25);
  }
  const B = new Song(frames);
  pass2(B);
  const b = finishPass(B);
  for (const k of ['music', 'sfx', 'game']) a[k].mixIn(b[k]);
  const end = { silenceFrom: B.silenceFrom, fadeFrom: B.fadeFrom };
  return { stems: a, cues: [...A.cues, ...B.cues].sort((x, y) => x.f - y.f), end };
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

/** Per-bar loudness: the energy mean of ebur128's momentary (400 ms) values inside each bar (LUFS). */
function barLoudness(path, bars) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128 -f null - 2>&1`], { encoding: 'utf8' });
  const rows = [];
  for (const m of out.matchAll(/t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.inf]+)/g)) rows.push([Number(m[1]), Number(m[2])]);
  return Array.from({ length: bars }, (_, i) => {
    const inBar = rows.filter(([t, M]) => t > i * 2 + 0.4 && t <= i * 2 + 2 && Number.isFinite(M) && M > -70);
    const e = inBar.reduce((a, [, M]) => a + 10 ** (M / 10), 0) / Math.max(1, inBar.length);
    return { bar: i + 1, M: inBar.length ? +(10 * Math.log10(e)).toFixed(1) : null };
  });
}

function master(stems, end, tag) {
  const n = stems.music.n;
  const sum = () => {
    const m = new Bus(n);
    m.mixIn(stems.music);
    m.mixIn(stems.sfx);
    m.mixIn(stems.game);
    return m;
  };
  // glue: a gentle bus compressor keeps the loudness range inside 8 LU
  const pre = sum();
  compress(pre, { threshDb: -16, ratio: 1.8, attack: 0.012, release: 0.2 });
  const tmp = join(OUT, `.tmp-${tag}.wav`);
  let gainDb = 0;
  let out = null;
  let lm = null;
  for (let it = 0; it < 4; it++) {
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

function applyEnd(bus, { silenceFrom, fadeFrom }) {
  if (fadeFrom != null) bus.gainCurve((i) => Math.max(0, 1 - (i - fadeFrom) / (silenceFrom - fadeFrom)) ** 2, fadeFrom, silenceFrom);
  if (silenceFrom != null) for (let i = silenceFrom; i < bus.n; i++) bus.L[i] = bus.R[i] = 0;
}

// ---------------------------------------------------------------- sfx one-shots (for the edit and later versions)

function writeSfxFiles(dir) {
  mkdirSync(dir, { recursive: true });
  const st = (name, x) => (Array.isArray(x) ? writeWav(join(dir, `${name}.wav`), x[0], x[1]) : writeWav(join(dir, `${name}.wav`), x));
  const files = {
    'sub-drop-55-30': I.subDrop(), 'impact-tower': I.impact(98, { sub: 40, len: 1.6 }), 'impact-core': I.impact(103, { sub: 36, len: 2.2 }),
    'impact-small': I.impact(97, { sub: 44, len: 0.7 }), riser: I.riser(1.0), 'whoosh-lr': I.whoosh(0.42, 80, 1.3), 'whoosh-up': I.whoosh(0.3, 85, 2),
    'rise-whoosh': I.riseWhoosh(0.25), 'reverse-whoosh': I.reverseWhoosh(0.2), 'reverse-cymbal': I.reverseCymbal(0.5), crash: I.crash(5, 2.4),
    heartbeat: I.heartbeat(), womp: I.womp(), boing: I.boing(), crackle: I.crackle(0.35, 110), fire: I.fire(0.6, 111), pop: I.pop(), snap: I.snap(),
    thump: I.thump(), 'snare-roll': I.snareRoll(0.5), ambience: I.ambience(1.0), kick: I.kick(1), snare: I.snare(2), clap: I.clap(3),
    'shimmer-D': I.shimmer(74, 60), 'shimmer-E': I.shimmer(76, 61), 'shimmer-Fs': I.shimmer(78, 62), 'shimmer-A': I.shimmer(81, 63),
    'stab-C': I.stab([60, 64, 67, 72], 0.28), 'stab-D': I.stab([62, 66, 69, 74], 0.28), 'tuba-C2': I.tuba(36, 0.25), 'music-box-A5': I.musicBox(81),
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
const report = { bpm: 120, fps: 60, beatFrames: 30, barFrames: 120, sampleRate: SR, bitDepth: 24, cuts: {} };
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
  if (hasFlag('--report')) {
    entry.bars = barLoudness(path, Math.ceil(frames / 120));
  }
  report.cuts[tag] = entry;
  execFileSync('rm', ['-f', m.tmp]);
  console.log(`[score] ${file}: I ${loud.I} LUFS, LRA ${loud.LRA} LU, TP ${loud.TP} dBTP (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
if (!hasFlag('--no-sfx-files')) console.log(`[score] sfx one-shots: ${writeSfxFiles(join(OUT, 'sfx'))}`);
writeFileSync(join(OUT, 'cues.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`[score] ${join(OUT, 'cues.json')}`);
