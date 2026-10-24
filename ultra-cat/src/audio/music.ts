// Procedural music: a lookahead WebAudio step sequencer driven by each level's MusicSpec. Owned by the META-UI lane.
// No audio files. Patterns are precomputed into flat arrays when a track starts; the scheduler (setInterval,
// not the frame loop) only reads them and creates the WebAudio nodes for each note.
//
// Chain: voices -> trackGain (switch fades) -> pauseLP (low-pass while paused) -> duck -> audio().music
//        lead/arp also -> echo send -> delay (feedback) -> pauseLP
import { events } from '../core/events';
import { game } from '../core/state';
import type { MusicSpec } from '../core/types';
import { audio, onAudioInit, type AudioHandles } from './synth';

export type MusicVariant = 'menu' | 'level' | 'boss';

const SCALES: Record<MusicSpec['scale'], number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

/** Chord roots (scale degrees) for the 4-bar loop of each style. */
const PROG: Record<MusicSpec['style'], number[]> = {
  swing: [0, 3, 6, 4],
  surf: [0, 0, 3, 4],
  suburb: [0, 4, 5, 3],
  synthwave: [0, 5, 2, 6],
  march: [0, 1, 0, 6],
  boss: [0, 0, 1, 0],
};

const STEPS = 64; // 4 bars of 16ths
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** A track: everything the scheduler needs, in flat arrays indexed by step. */
interface Track {
  bpm: number;
  vol: number;
  swing: number; // delay of the off-beat 8th, in 16ths
  kick: Float32Array;
  snare: Float32Array;
  hat: Float32Array;
  hatOpen: Uint8Array;
  bass: Float32Array; // Hz, 0 = rest
  bassDur: Float32Array; // in 16ths
  bassType: OscillatorType;
  bassVol: number;
  bassCut: number;
  lead: Float32Array;
  leadDur: Float32Array;
  leadType: OscillatorType;
  leadVol: number;
  leadCut: number;
  leadTrem: boolean; // surf tremolo: re-strike every 16th for the note's length
  chord: Float32Array; // STEPS * 4 Hz (0 = none): strum or stab at this step
  chordDur: Float32Array;
  chordType: OscillatorType;
  chordVol: number;
  chordStrum: number; // seconds between strummed notes
  chordCut: number;
  alarm: Float32Array; // boss stab, Hz
  echo: number; // send level 0..1
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function buildTrack(spec: MusicSpec, variant: MusicVariant): Track {
  const style = variant === 'boss' ? 'boss' : spec.style;
  const calm = variant === 'menu';
  const scale = SCALES[spec.scale] ?? SCALES.major;
  const L = scale.length;
  const root = spec.root;
  const note = (deg: number, oct = 0) => {
    const o = Math.floor(deg / L);
    const i = ((deg % L) + L) % L;
    return mtof(root + scale[i] + 12 * (o + oct));
  };
  const prog = PROG[style];
  const R = rng(spec.root * 7919 + spec.bpm * 131 + style.length * 17);
  const t: Track = {
    bpm: variant === 'boss' ? Math.min(172, spec.bpm * 1.15) : calm ? Math.round(spec.bpm * 0.78) : spec.bpm,
    vol: calm ? 0.5 : 0.8,
    swing: 0,
    kick: new Float32Array(STEPS),
    snare: new Float32Array(STEPS),
    hat: new Float32Array(STEPS),
    hatOpen: new Uint8Array(STEPS),
    bass: new Float32Array(STEPS),
    bassDur: new Float32Array(STEPS),
    bassType: 'triangle',
    bassVol: 0.5,
    bassCut: 900,
    lead: new Float32Array(STEPS),
    leadDur: new Float32Array(STEPS),
    leadType: 'square',
    leadVol: 0.12,
    leadCut: 3000,
    leadTrem: false,
    chord: new Float32Array(STEPS * 4),
    chordDur: new Float32Array(STEPS),
    chordType: 'triangle',
    chordVol: 0.08,
    chordStrum: 0,
    chordCut: 2400,
    alarm: new Float32Array(STEPS),
    echo: 0.15,
  };
  const setChord = (s: number, deg: number, dur: number, oct = 0, four = false) => {
    t.chord[s * 4] = note(deg, oct);
    t.chord[s * 4 + 1] = note(deg + 2, oct);
    t.chord[s * 4 + 2] = note(deg + 4, oct);
    t.chord[s * 4 + 3] = four ? note(deg + 7, oct) : 0;
    t.chordDur[s] = dur;
  };
  // a 2-bar lead motif (chord-tone offsets), reused with a variation in bars 3-4
  const motif: number[] = [];
  for (let i = 0; i < 16; i++) motif.push(R() < 0.35 ? -99 : [0, 2, 4, 7, 4, 2][Math.floor(R() * 6)]);

  for (let s = 0; s < STEPS; s++) {
    const bar = s >> 4;
    const b = s & 15;
    const deg = prog[bar];
    const beat = b % 4 === 0;
    switch (style) {
      case 'swing': {
        t.swing = 0.66;
        t.echo = 0.12;
        if (b === 0 || b === 8) t.kick[s] = 0.8;
        if (b === 10 && bar % 2 === 1) t.kick[s] = 0.4;
        if (b === 4 || b === 12) t.snare[s] = 0.35;
        if (beat || b % 4 === 2) t.hat[s] = beat ? 0.18 : 0.12;
        if (b === 14 && bar === 3) t.hatOpen[s] = 1;
        // walking bass: root, third, fifth, approach note
        if (beat) {
          const walk = [0, 2, 4, 6][b >> 2];
          t.bass[s] = note(deg + walk, -2);
          t.bassDur[s] = 3.5;
        }
        // piano stabs on the and of 2 and 4
        if (b === 6 || b === 14) setChord(s, deg, 1.5, 0, true);
        t.chordType = 'square';
        t.chordVol = 0.05;
        t.chordCut = 1800;
        // lead: call (bars 1, 3) and answer
        if (b % 2 === 0) {
          const m = motif[(b >> 1) + (bar % 2) * 8];
          if (m > -99 && (bar % 2 === 0 || b < 8)) {
            t.lead[s] = note(deg + m + (bar === 2 ? 1 : 0), 1);
            t.leadDur[s] = 1.6;
          }
        }
        t.leadType = 'triangle';
        t.leadVol = 0.16;
        break;
      }
      case 'surf': {
        t.echo = 0.3;
        if (b === 0 || b === 6 || b === 8 || (b === 14 && bar === 3)) t.kick[s] = 0.85;
        if (b === 4 || b === 12) t.snare[s] = 0.5;
        if (b % 2 === 0) t.hat[s] = b % 4 === 2 ? 0.16 : 0.1;
        if (b % 2 === 0) {
          const pat = [0, 0, 4, 0, 7, 0, 4, 2];
          t.bass[s] = note(deg + pat[b >> 1], -2);
          t.bassDur[s] = 1.6;
        }
        t.bassType = 'sawtooth';
        t.bassCut = 700;
        t.bassVol = 0.38;
        // tremolo lead: one melody note every 4 steps, re-struck every 16th
        if (b % 4 === 0) {
          const m = motif[(b >> 2) + bar * 4] ?? 0;
          t.lead[s] = note(deg + (m > -99 ? m : 4), 1);
          t.leadDur[s] = 4;
        }
        t.leadTrem = true;
        t.leadType = 'sawtooth';
        t.leadVol = 0.07;
        t.leadCut = 2600;
        break;
      }
      case 'suburb': {
        t.echo = 0.14;
        if (b === 0 || b === 8) t.kick[s] = 0.6;
        if (b === 4 || b === 12) t.snare[s] = 0.22;
        t.hat[s] = b % 2 === 0 ? 0.07 : 0.04; // shaker
        if (b === 0 || b === 6 || b === 8 || b === 14) {
          t.bass[s] = note(deg + (b === 6 || b === 14 ? 4 : 0), -2);
          t.bassDur[s] = 2;
        }
        // ukulele strums
        if (b === 0 || b === 3 || b === 6 || b === 8 || b === 10 || b === 12 || b === 14) setChord(s, deg, 1.2, 0, true);
        t.chordType = 'triangle';
        t.chordVol = 0.09;
        t.chordStrum = 0.014;
        t.chordCut = 3200;
        // whistle melody in long notes
        if (b === 0 || b === 8) {
          const m = motif[bar * 2 + (b >> 3)];
          t.lead[s] = note(deg + (m > -99 ? m : 2), 2);
          t.leadDur[s] = 6;
        }
        t.leadType = 'sine';
        t.leadVol = 0.11;
        break;
      }
      case 'synthwave': {
        t.echo = 0.32;
        if (beat) t.kick[s] = 0.95;
        if (b === 4 || b === 12) t.snare[s] = 0.6;
        if (b % 4 === 2) {
          t.hat[s] = 0.14;
          t.hatOpen[s] = 1;
        }
        if (b % 2 === 0) {
          t.bass[s] = note(deg, b % 4 === 0 ? -2 : -1);
          t.bassDur[s] = 1.5;
        }
        t.bassType = 'sawtooth';
        t.bassCut = 520;
        t.bassVol = 0.42;
        if (b === 0) setChord(s, deg, 15, 0, true); // sustained pad
        t.chordType = 'sawtooth';
        t.chordVol = 0.035;
        t.chordCut = 1200;
        // 16th arpeggio up the chord
        {
          const arp = [0, 2, 4, 7];
          t.lead[s] = note(deg + arp[b % 4], 1);
          t.leadDur[s] = 0.8;
        }
        t.leadType = 'square';
        t.leadVol = 0.045;
        t.leadCut = 2200;
        break;
      }
      case 'march': {
        t.echo = 0.1;
        if (b === 0 || b === 8) t.kick[s] = 0.9;
        if (b === 4 || b === 12) t.snare[s] = 0.5;
        if (bar === 3 && b >= 12) t.snare[s] = 0.18 + (b - 12) * 0.08; // roll into the loop
        if (b === 15 || b === 7) t.snare[s] = Math.max(t.snare[s], 0.2); // ruff
        if (b % 2 === 0) t.hat[s] = 0.06;
        // oom-pah: root on the beat, chord on the off-beat
        if (b === 0 || b === 8) {
          t.bass[s] = note(deg, -2);
          t.bassDur[s] = 2;
        }
        if (b === 4 || b === 12) {
          t.bass[s] = note(deg + 4, -2);
          t.bassDur[s] = 2;
        }
        if (b === 2 || b === 6 || b === 10 || b === 14) setChord(s, deg, 1, 0);
        t.chordType = 'square';
        t.chordVol = 0.04;
        t.chordCut = 1400;
        // brass fanfare
        if (b % 4 === 0 || (b % 4 === 3 && R() < 0.5)) {
          const m = motif[(b >> 1) + (bar % 2) * 8];
          t.lead[s] = note(deg + (m > -99 ? m : 4), 1);
          t.leadDur[s] = b % 4 === 0 ? 2.5 : 0.8;
        }
        t.leadType = 'sawtooth';
        t.leadVol = 0.07;
        t.leadCut = 1500;
        break;
      }
      case 'boss': {
        t.echo = 0.18;
        if (beat || b === 14 || b === 7) t.kick[s] = 1;
        if (b === 4 || b === 12) t.snare[s] = 0.7;
        t.hat[s] = b % 2 === 0 ? 0.14 : 0.08;
        t.bass[s] = note(deg + (b === 14 ? 1 : 0), -2);
        t.bassDur[s] = 0.9;
        t.bassType = 'sawtooth';
        t.bassCut = 800;
        t.bassVol = 0.36;
        if (b === 0) {
          t.alarm[s] = note(0, 2);
          t.alarm[s + 4] = note(1, 2);
        }
        if (b === 8 || b === 10) {
          t.lead[s] = note(deg + (b === 8 ? 4 : 5), 1);
          t.leadDur[s] = 2;
        }
        t.leadType = 'square';
        t.leadVol = 0.07;
        t.leadCut = 2000;
        break;
      }
    }
  }
  if (calm) {
    // the title/menu variant: drop the drums, half-time bass, keep the chords and a sparse lead
    for (let s = 0; s < STEPS; s++) {
      t.kick[s] = (s & 15) === 0 ? 0.25 : 0;
      t.snare[s] = 0;
      t.hat[s] *= (s & 3) === 0 ? 0.5 : 0;
      t.hatOpen[s] = 0;
      if ((s & 7) !== 0) t.bass[s] = 0;
      else t.bassDur[s] = 7;
      if ((s & 1) === 1 || R() < 0.4) t.lead[s] = 0;
    }
    t.leadTrem = false;
    t.leadCut = Math.min(t.leadCut, 1600);
    t.bassType = 'triangle';
    t.bassCut = 600;
    t.echo = Math.max(t.echo, 0.28);
  }
  return t;
}

// ---------- the audio graph ----------
interface Graph {
  a: AudioHandles;
  track: GainNode;
  lp: BiquadFilterNode;
  duck: GainNode;
  echoIn: GainNode;
  hatHP: BiquadFilterNode;
  snareBP: BiquadFilterNode;
}
let gr: Graph | null = null;
let cur: Track | null = null;
let wanted: { spec: MusicSpec; variant: MusicVariant } | null = null;
let curKey = '';
let step = 0;
let nextT = 0;
let timer = 0;
let energy = 0; // final frenzy: double hats, octave lead
const LOOKAHEAD = 0.14;

function buildGraph(a: AudioHandles): Graph {
  const c = a.ctx;
  const track = c.createGain();
  track.gain.value = 0;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 18000;
  lp.Q.value = 0.7;
  const duck = c.createGain();
  track.connect(lp).connect(duck).connect(a.music);
  const echoIn = c.createGain();
  echoIn.gain.value = 0.15;
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.21;
  const fb = c.createGain();
  fb.gain.value = 0.32;
  const echoLP = c.createBiquadFilter();
  echoLP.type = 'lowpass';
  echoLP.frequency.value = 2400;
  echoIn.connect(delay).connect(echoLP).connect(fb).connect(delay);
  echoLP.connect(lp);
  const hatHP = c.createBiquadFilter();
  hatHP.type = 'highpass';
  hatHP.frequency.value = 7000;
  hatHP.connect(track);
  const snareBP = c.createBiquadFilter();
  snareBP.type = 'bandpass';
  snareBP.frequency.value = 1900;
  snareBP.Q.value = 0.8;
  snareBP.connect(track);
  return { a, track, lp, duck, echoIn, hatHP, snareBP };
}

function osc(g: Graph, type: OscillatorType, freq: number, at: number, dur: number, peak: number, cut: number, attack = 0.005, echo = false): void {
  const c = g.a.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cut, at);
  const v = c.createGain();
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  v.gain.setTargetAtTime(0.0001, at + attack + dur * 0.4, dur * 0.35);
  o.connect(f).connect(v).connect(g.track);
  if (echo) v.connect(g.echoIn);
  o.start(at);
  o.stop(at + attack + dur * 1.6 + 0.05);
}

function noiseHit(g: Graph, dest: AudioNode, at: number, peak: number, decay: number): void {
  const c = g.a.ctx;
  const src = c.createBufferSource();
  src.buffer = g.a.noiseBuf;
  const v = c.createGain();
  v.gain.setValueAtTime(peak, at);
  v.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(v).connect(dest);
  src.start(at, Math.random() * 1.5, decay + 0.05);
}

function kick(g: Graph, at: number, vol: number): void {
  const c = g.a.ctx;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
  const v = c.createGain();
  v.gain.setValueAtTime(vol, at);
  v.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  o.connect(v).connect(g.track);
  o.start(at);
  o.stop(at + 0.32);
}

function snare(g: Graph, at: number, vol: number): void {
  noiseHit(g, g.snareBP, at, vol * 0.9, 0.16);
  const c = g.a.ctx;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(200, at);
  o.frequency.exponentialRampToValueAtTime(140, at + 0.08);
  const v = c.createGain();
  v.gain.setValueAtTime(vol * 0.35, at);
  v.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
  o.connect(v).connect(g.track);
  o.start(at);
  o.stop(at + 0.12);
}

function playStep(g: Graph, t: Track, s: number, at: number): void {
  const six = 60 / t.bpm / 4;
  const vol = t.vol;
  if (t.kick[s] > 0) kick(g, at, t.kick[s] * vol);
  if (t.snare[s] > 0) snare(g, at, t.snare[s] * vol);
  let hat = t.hat[s];
  if (energy > 0 && hat === 0 && wantedVariant() !== 'menu') hat = 0.06;
  if (hat > 0) noiseHit(g, g.hatHP, at, hat * vol, t.hatOpen[s] ? 0.22 : 0.045);
  if (t.bass[s] > 0) osc(g, t.bassType, t.bass[s], at, t.bassDur[s] * six, t.bassVol * vol, t.bassCut, 0.008);
  const lf = t.lead[s];
  if (lf > 0) {
    const f = energy > 0 ? lf * 2 : lf;
    if (t.leadTrem) {
      const n = Math.max(1, Math.round(t.leadDur[s]));
      for (let i = 0; i < n; i++) osc(g, t.leadType, f, at + i * six, six * 0.7, t.leadVol * vol * (i === 0 ? 1.2 : 0.85), t.leadCut, 0.003, true);
    } else osc(g, t.leadType, f, at, t.leadDur[s] * six, t.leadVol * vol, t.leadCut, 0.01, true);
  }
  const ci = s * 4;
  if (t.chord[ci] > 0) {
    const d = t.chordDur[s] * six;
    const long = d > six * 4;
    for (let k = 0; k < 4; k++) {
      const f = t.chord[ci + k];
      if (f > 0) osc(g, t.chordType, f, at + k * t.chordStrum, d, t.chordVol * vol, t.chordCut, long ? 0.25 : 0.004, long);
    }
  }
  if (t.alarm[s] > 0) osc(g, 'square', t.alarm[s], at, six * 3, 0.06 * vol, 3500, 0.004, true);
}

const wantedVariant = () => wanted?.variant ?? 'menu';

function tick(): void {
  if (!gr || !cur) return;
  const c = gr.a.ctx;
  if (c.state !== 'running') return;
  const now = c.currentTime;
  if (nextT < now - 0.25) nextT = now + 0.05; // tab was asleep: don't burst-play the backlog
  const six = 60 / cur.bpm / 4;
  while (nextT < now + LOOKAHEAD) {
    const off = (step & 3) === 2 ? cur.swing * six : 0;
    playStep(gr, cur, step, nextT + off);
    step = (step + 1) % STEPS;
    nextT += six;
  }
}

function startWanted(): void {
  if (!gr || !wanted) return;
  const key = `${wanted.variant}:${wanted.spec.style}:${wanted.spec.bpm}:${wanted.spec.root}:${wanted.spec.scale}`;
  const c = gr.a.ctx;
  const now = c.currentTime;
  if (key === curKey && cur) {
    gr.track.gain.cancelScheduledValues(now);
    gr.track.gain.setTargetAtTime(1, now, 0.2);
    return;
  }
  curKey = key;
  const fresh = !cur;
  cur = buildTrack(wanted.spec, wanted.variant);
  gr.echoIn.gain.setTargetAtTime(cur.echo, now, 0.05);
  // quick dip, restart the loop on the next beat, swell back in
  gr.track.gain.cancelScheduledValues(now);
  gr.track.gain.setTargetAtTime(0, now, 0.04);
  gr.track.gain.setTargetAtTime(1, now + 0.18, fresh ? 0.6 : 0.12);
  step = 0;
  nextT = now + 0.2;
  if (!timer) timer = window.setInterval(tick, 25);
}

/** Play `spec` in a variant (menu = calm title version). Safe before the first gesture: starts on audio init. */
export function playMusic(spec: MusicSpec, variant: MusicVariant): void {
  wanted = { spec, variant };
  if (variant !== 'level') energy = 0;
  startWanted();
}

/** Fade out and stop scheduling. */
export function stopMusic(fade = 1.2): void {
  wanted = null;
  if (!gr) return;
  const now = gr.a.ctx.currentTime;
  gr.track.gain.cancelScheduledValues(now);
  gr.track.gain.setTargetAtTime(0, now, fade / 4);
  const g = gr;
  window.setTimeout(() => {
    if (wanted) return; // something new started meanwhile
    cur = null;
    curKey = '';
    if (timer) clearInterval(timer);
    timer = 0;
    g.track.gain.cancelScheduledValues(g.a.ctx.currentTime);
  }, fade * 1000 + 50);
}

/** Dip the music by `db` for `dur` seconds (big hits, ULTRA, boss events). */
export function duckMusic(db = -8, dur = 0.4): void {
  if (!gr) return;
  const g = gr.duck.gain;
  const now = gr.a.ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setTargetAtTime(Math.pow(10, db / 20), now, 0.015);
  g.setTargetAtTime(1, now + dur, 0.12);
}

/** Muffle the music while paused. */
export function setMusicPaused(p: boolean): void {
  if (!gr) return;
  gr.lp.frequency.setTargetAtTime(p ? 520 : 18000, gr.a.ctx.currentTime, p ? 0.06 : 0.12);
}

/** Final frenzy: busier hats and the lead an octave up. */
export function setMusicEnergy(e: number): void {
  energy = e;
}

export function musicState(): { playing: boolean; variant: MusicVariant | null; style: string | null; bpm: number } {
  return { playing: !!cur && !!wanted, variant: wanted?.variant ?? null, style: cur ? (wanted?.variant === 'boss' ? 'boss' : (wanted?.spec.style ?? null)) : null, bpm: cur?.bpm ?? 0 };
}

let inited = false;
/** Wire the music to the game events. Call once at boot. */
export function initMusic(): void {
  if (inited) return;
  inited = true;
  onAudioInit((a) => {
    gr = buildGraph(a);
    if (wanted) startWanted();
  });
  events.on('levelLoad', ({ level }) => {
    setMusicPaused(false);
    playMusic(level.music, 'menu');
  });
  events.on('levelStart', ({ level }) => {
    setMusicPaused(false);
    playMusic(level.music, 'level');
  });
  events.on('bossSpawn', () => {
    if (game.level) playMusic(game.level.music, 'boss');
    duckMusic();
  });
  events.on('bossDefeated', () => {
    duckMusic(-12, 0.8);
    if (game.level && !game.level.boss?.endsLevel && game.mode === 'play') playMusic(game.level.music, 'level');
  });
  events.on('bossPhase', () => duckMusic());
  events.on('levelEnd', () => stopMusic(1.4));
  events.on('frenzy', () => setMusicEnergy(1));
  events.on('pause', () => setMusicPaused(true));
  events.on('resume', () => setMusicPaused(false));
  events.on('ultraStart', () => duckMusic());
  events.on('bigHit', ({ strength }) => {
    if (strength >= 0.5) duckMusic(-8 * Math.min(1, strength), 0.4);
  });
}

/** Test hook: the current audio context (null before the first gesture). */
export const musicContext = () => audio()?.ctx ?? null;
