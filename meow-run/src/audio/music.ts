// Procedural music player: a lookahead WebAudio step sequencer over the patterns in songs.ts. No audio files.
// The scheduler runs on setInterval (not the frame loop) and only reads precomputed arrays.
//
// Chain: voices -> track gain (fades) -> pause low-pass -> duck -> audio().music
//        lead / bells also -> echo send -> delay (feedback) -> pause low-pass
// Variant swaps (level <-> chase) happen on the next bar line and keep the bar position, so the tune carries on.
import { events } from '../core/events';
import { game } from '../core/state';
import { audio, onAudioInit, type AudioHandles } from './synth';
import { buildPattern, endingJingle, fanfare, mtof, sadJingle, songFor, STEPS, type Jingle, type Pattern, type SongId, type Variant, type Voice } from './songs';

interface Graph {
  a: AudioHandles;
  track: GainNode;
  jingle: GainNode;
  lp: BiquadFilterNode;
  duck: GainNode;
  echoIn: GainNode;
  hatHP: BiquadFilterNode;
  snareBP: BiquadFilterNode;
}
let gr: Graph | null = null;
let cur: Pattern | null = null;
let wanted: { song: SongId; variant: Variant } | null = null;
let step = 0;
let nextT = 0;
let timer = 0;
const LOOKAHEAD = 0.14;
const cache = new Map<string, Pattern>();

function pattern(song: SongId, variant: Variant): Pattern {
  const k = `${song}:${variant}`;
  let p = cache.get(k);
  if (!p) {
    p = buildPattern(song, variant);
    cache.set(k, p);
  }
  return p;
}

function buildGraph(a: AudioHandles): Graph {
  const c = a.ctx;
  const track = c.createGain();
  track.gain.value = 0;
  const jingle = c.createGain();
  jingle.gain.value = 0.9;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(18000, c.sampleRate * 0.45);
  lp.Q.value = 0.7;
  const duck = c.createGain();
  track.connect(lp);
  jingle.connect(lp);
  lp.connect(duck).connect(a.music);
  const echoIn = c.createGain();
  echoIn.gain.value = 0.18;
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.23;
  const fb = c.createGain();
  fb.gain.value = 0.3;
  const echoLP = c.createBiquadFilter();
  echoLP.type = 'lowpass';
  echoLP.frequency.value = 2600;
  echoIn.connect(delay).connect(echoLP).connect(fb).connect(delay);
  echoLP.connect(lp);
  const hatHP = c.createBiquadFilter();
  hatHP.type = 'highpass';
  hatHP.frequency.value = 7500;
  hatHP.connect(track);
  const snareBP = c.createBiquadFilter();
  snareBP.type = 'bandpass';
  snareBP.frequency.value = 1800;
  snareBP.Q.value = 0.7;
  snareBP.connect(track);
  return { a, track, jingle, lp, duck, echoIn, hatHP, snareBP };
}

// ---------- voices ----------
function oscNote(g: Graph, dest: AudioNode, type: OscillatorType, freq: number, at: number, peak: number, attack: number, hold: number, release: number, detune = 0): OscillatorNode {
  const c = g.a.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.min(freq, c.sampleRate * 0.45), at);
  if (detune) o.detune.setValueAtTime(detune, at);
  const v = c.createGain();
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  v.gain.setTargetAtTime(0.0001, at + attack + hold, release / 3);
  o.connect(v).connect(dest);
  o.start(at);
  o.stop(at + attack + hold + release * 1.6 + 0.05);
  return o;
}

function lowpass(g: Graph, dest: AudioNode, at: number, from: number, to: number, time: number, q = 0.8): BiquadFilterNode {
  const f = g.a.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + Math.max(0.01, time));
  f.connect(dest);
  return f;
}

/** Play one note of a voice. dur in seconds. */
function voice(g: Graph, dest: AudioNode, v: Voice, freq: number, at: number, dur: number, vol: number, echo = false): void {
  const out = echo ? g.a.ctx.createGain() : dest;
  if (echo) {
    (out as GainNode).connect(dest);
    (out as GainNode).connect(g.echoIn);
  }
  switch (v) {
    case 'pluck': {
      const f = lowpass(g, out, at, 4200, 900, dur * 0.8);
      oscNote(g, f, 'triangle', freq, at, vol, 0.003, 0.02, dur * 0.9);
      oscNote(g, f, 'square', freq * 2, at, vol * 0.18, 0.002, 0.01, dur * 0.4);
      break;
    }
    case 'whistle': {
      const o = oscNote(g, out, 'sine', freq, at, vol, 0.025, dur * 0.7, 0.12);
      o.frequency.setValueAtTime(freq * 0.965, at);
      o.frequency.exponentialRampToValueAtTime(freq, at + 0.05);
      oscNote(g, out, 'sine', freq * 2, at, vol * 0.07, 0.03, dur * 0.6, 0.1);
      break;
    }
    case 'flute': {
      const o = oscNote(g, out, 'sine', freq, at, vol, 0.05, dur * 0.75, 0.2);
      o.frequency.setValueAtTime(freq * 0.985, at);
      o.frequency.exponentialRampToValueAtTime(freq, at + 0.08);
      oscNote(g, out, 'triangle', freq, at, vol * 0.3, 0.06, dur * 0.7, 0.2, 6);
      break;
    }
    case 'brass': {
      const f = lowpass(g, out, at, 500, 2200, 0.06, 1.2);
      f.frequency.setTargetAtTime(1300, at + 0.08, 0.15);
      oscNote(g, f, 'sawtooth', freq, at, vol, 0.02, dur * 0.75, 0.12);
      oscNote(g, f, 'sawtooth', freq, at, vol * 0.6, 0.025, dur * 0.75, 0.12, 9);
      break;
    }
    case 'synth': {
      const f = lowpass(g, out, at, 3200, 1400, dur, 2);
      oscNote(g, f, 'square', freq, at, vol, 0.004, dur * 0.6, 0.08);
      oscNote(g, f, 'sawtooth', freq * 1.005, at, vol * 0.5, 0.004, dur * 0.6, 0.08);
      break;
    }
    case 'glock': {
      oscNote(g, out, 'sine', freq, at, vol, 0.002, 0.01, Math.max(0.3, dur * 1.4));
      oscNote(g, out, 'sine', freq * 2.76, at, vol * 0.28, 0.002, 0.005, 0.25);
      oscNote(g, out, 'sine', freq * 5.4, at, vol * 0.1, 0.001, 0.003, 0.1);
      break;
    }
    case 'pad': {
      const f = lowpass(g, out, at, 900, 1300, dur, 0.6);
      const att = Math.min(0.35, dur * 0.3);
      oscNote(g, f, 'sawtooth', freq, at, vol, att, dur * 0.8, 0.4, -7);
      oscNote(g, f, 'sawtooth', freq, at, vol, att, dur * 0.8, 0.4, 7);
      break;
    }
    case 'bassPluck': {
      const f = lowpass(g, out, at, 1400, 300, dur * 0.7, 3);
      oscNote(g, f, 'triangle', freq, at, vol, 0.004, dur * 0.4, dur * 0.5);
      oscNote(g, f, 'square', freq, at, vol * 0.25, 0.004, dur * 0.2, dur * 0.3);
      break;
    }
    case 'bassSaw': {
      const f = lowpass(g, out, at, 1100, 260, dur * 0.8, 5);
      oscNote(g, f, 'sawtooth', freq, at, vol, 0.006, dur * 0.5, dur * 0.4);
      oscNote(g, out, 'sine', freq, at, vol * 0.6, 0.006, dur * 0.5, dur * 0.4);
      break;
    }
    case 'bassSub': {
      oscNote(g, out, 'sine', freq, at, vol, 0.02, dur * 0.7, dur * 0.4);
      oscNote(g, out, 'triangle', freq * 2, at, vol * 0.15, 0.02, dur * 0.5, dur * 0.3);
      break;
    }
  }
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
  o.frequency.setValueAtTime(150, at);
  o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  const v = c.createGain();
  v.gain.setValueAtTime(vol, at);
  v.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
  o.connect(v).connect(g.track);
  o.start(at);
  o.stop(at + 0.3);
}

function snare(g: Graph, at: number, vol: number): void {
  noiseHit(g, g.snareBP, at, vol * 0.85, 0.15);
  const c = g.a.ctx;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(210, at);
  o.frequency.exponentialRampToValueAtTime(150, at + 0.07);
  const v = c.createGain();
  v.gain.setValueAtTime(vol * 0.3, at);
  v.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  o.connect(v).connect(g.track);
  o.start(at);
  o.stop(at + 0.11);
}

function tom(g: Graph, at: number, freq: number): void {
  const c = g.a.ctx;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, at + 0.18);
  const v = c.createGain();
  v.gain.setValueAtTime(0.45, at);
  v.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  o.connect(v).connect(g.track);
  o.start(at);
  o.stop(at + 0.27);
}

function playStep(g: Graph, t: Pattern, s: number, at: number): void {
  const six = 60 / t.bpm / 4;
  if (t.kick[s] > 0) kick(g, at, t.kick[s] * 0.85);
  if (t.snare[s] > 0) snare(g, at, t.snare[s]);
  if (t.hat[s] > 0) noiseHit(g, g.hatHP, at, t.hat[s], t.hatOpen[s] ? 0.2 : 0.04);
  if (t.tom[s] > 0) tom(g, at, t.tom[s]);
  if (t.bass[s] > 0) voice(g, g.track, t.bassVoice, t.bass[s], at, t.bassDur[s] * six, t.bassVol);
  if (t.lead[s] > 0) voice(g, g.track, t.leadVoice, t.lead[s], at, t.leadDur[s] * six, t.leadVol, true);
  if (t.bell[s] > 0) voice(g, g.track, 'glock', t.bell[s], at, six * 2, t.bellVol, true);
  if (t.stab[s] > 0) {
    voice(g, g.track, 'brass', t.stab[s], at, six * 1.5, 0.06);
    voice(g, g.track, 'brass', t.stab[s] * 1.5, at, six * 1.5, 0.045);
  }
  const ci = s * 4;
  if (t.chord[ci] > 0) {
    const d = t.chordDur[s] * six;
    for (let k = 0; k < 4; k++) {
      const f = t.chord[ci + k];
      if (f > 0) voice(g, g.track, t.chordVoice, f, at + k * t.strum, d, t.chordVol);
    }
  }
}

function tick(): void {
  if (!gr || !cur) return;
  const c = gr.a.ctx;
  if (c.state !== 'running') return;
  const now = c.currentTime;
  if (nextT < now - 0.25) nextT = now + 0.05; // the tab slept: skip the backlog
  while (nextT < now + LOOKAHEAD) {
    // variant swaps land on a bar line and keep the bar position
    if ((step & 15) === 0 && wanted && (wanted.song !== cur.song || wanted.variant !== cur.variant)) {
      if (wanted.song !== cur.song) step = 0;
      cur = pattern(wanted.song, wanted.variant);
      gr.echoIn.gain.setTargetAtTime(cur.echo, nextT, 0.05);
    }
    const six = 60 / cur.bpm / 4;
    const off = (step & 1) === 1 ? cur.swing * six * 0.5 : 0;
    playStep(gr, cur, step, nextT + off);
    step = (step + 1) % STEPS;
    nextT += six;
  }
}

function ensureTimer(): void {
  if (!timer && typeof window !== 'undefined') timer = window.setInterval(tick, 25);
}

/** Play a song variant. Song changes restart from bar 1 with a quick fade; variant changes wait for the bar line. */
export function playSong(song: SongId, variant: Variant): void {
  wanted = { song, variant };
  if (!gr) return;
  const c = gr.a.ctx;
  const now = c.currentTime;
  gr.track.gain.cancelScheduledValues(now);
  // calm <-> play switches (menus, stage start) restart cleanly; level <-> chase waits for the bar line
  const same = cur && cur.song === song && cur.variant === variant;
  if (!same && (!cur || cur.song !== song || cur.variant === 'calm' || variant === 'calm')) {
    const fresh = !cur;
    cur = pattern(song, variant);
    step = 0;
    gr.echoIn.gain.setTargetAtTime(cur.echo, now, 0.05);
    gr.track.gain.setTargetAtTime(0, now, 0.03);
    gr.track.gain.setTargetAtTime(1, now + 0.12, fresh ? 0.5 : 0.1);
    nextT = now + 0.14;
  } else gr.track.gain.setTargetAtTime(1, now, 0.15);
  ensureTimer();
}

/** Fade the loop out and stop scheduling. */
export function stopMusic(fade = 1): void {
  wanted = null;
  if (!gr) return;
  const now = gr.a.ctx.currentTime;
  gr.track.gain.cancelScheduledValues(now);
  gr.track.gain.setTargetAtTime(0, now, fade / 4);
  const g = gr;
  window.setTimeout(() => {
    if (wanted) return;
    cur = null;
    if (timer) clearInterval(timer);
    timer = 0;
    g.track.gain.cancelScheduledValues(g.a.ctx.currentTime);
  }, fade * 1000 + 60);
}

/** One-shot jingle on its own bus (the loop should be stopped or ducked first). Returns its length (s). */
export function playJingle(j: Jingle, vol = 1): number {
  if (!gr) return 0;
  const g = gr;
  const at = g.a.ctx.currentTime + 0.05;
  const beat = 60 / j.bpm;
  let end = 0;
  for (const [tb, midi, db, v] of j.notes) {
    const f = mtof(midi);
    const lv = v === 'pad' ? 0.04 : v === 'bassSub' ? 0.35 : v === 'brass' ? 0.08 : 0.12;
    voice(g, g.jingle, v, f, at + tb * beat, db * beat, lv * vol, v !== 'bassSub');
    end = Math.max(end, (tb + db) * beat);
  }
  return end;
}

/** Dip the music by db for dur seconds. */
export function duckMusic(db = -8, dur = 0.4): void {
  if (!gr) return;
  const g = gr.duck.gain;
  const now = gr.a.ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setTargetAtTime(Math.pow(10, db / 20), now, 0.015);
  g.setTargetAtTime(1, now + dur, 0.15);
}

/** Muffle everything while paused. */
export function setMusicPaused(p: boolean): void {
  if (!gr) return;
  gr.lp.frequency.setTargetAtTime(p ? 480 : Math.min(18000, gr.a.ctx.sampleRate * 0.45), gr.a.ctx.currentTime, p ? 0.06 : 0.12);
}

export function musicState(): { playing: boolean; song: SongId | null; variant: Variant | null; bpm: number; step: number } {
  return { playing: !!cur && !!wanted, song: cur?.song ?? null, variant: cur?.variant ?? null, bpm: cur?.bpm ?? 0, step };
}

let endingT = 0;
let calmT = 0;
let inited = false;
let chaseOn = false;

const stageSong = () => songFor(game.stage?.music);

/** Wire the music to the game events. Call once at boot. */
export function initMusic(): void {
  if (inited) return;
  inited = true;
  onAudioInit((a) => {
    gr = buildGraph(a);
    if (wanted) playSong(wanted.song, wanted.variant);
  });
  const calmLater = (ms: number) => {
    clearTimeout(calmT);
    calmT = window.setTimeout(() => {
      if (game.mode === 'over' || game.mode === 'title') playSong(stageSong(), 'calm');
    }, ms);
  };
  events.on('stageLoad', ({ stage }) => {
    clearTimeout(calmT);
    setMusicPaused(false);
    chaseOn = false;
    playSong(songFor(stage.music), 'calm');
  });
  events.on('stageStart', ({ stage }) => {
    clearTimeout(calmT);
    setMusicPaused(false);
    chaseOn = false;
    playSong(songFor(stage.music), 'level');
  });
  events.on('chase', ({ on }) => {
    chaseOn = on;
    if (game.mode !== 'play') return;
    playSong(stageSong(), on ? 'chase' : 'level');
    if (on) duckMusic(-6, 0.25);
  });
  events.on('respawn', () => {
    if (chaseOn) {
      chaseOn = false;
      playSong(stageSong(), 'level');
    }
  });
  events.on('finishLine', () => {
    stopMusic(0.5);
    window.setTimeout(() => playJingle(fanfare(stageSong())), 120);
  });
  events.on('stageEnd', ({ result }) => {
    if (!result.finished) {
      stopMusic(0.4);
      window.setTimeout(() => playJingle(sadJingle(), 0.9), 150);
      calmLater(2600);
    } else if (!game.stage?.ending) calmLater(1800);
    else calmLater(14000); // the cottage cutscene plays its own jingle; results get the calm tune after
  });
  events.on('setPiece', ({ id, phase }) => {
    if (id !== 'ending') return;
    if (phase === 'start') {
      stopMusic(0.6);
      clearTimeout(endingT);
      endingT = window.setTimeout(() => playJingle(endingJingle(), 1), 300);
    } else if (phase === 'end') calmLater(400);
  });
  events.on('quit', ({ stage }) => {
    setMusicPaused(false);
    playSong(songFor(stage.music), 'calm');
  });
  events.on('pause', () => setMusicPaused(true));
  events.on('resume', () => setMusicPaused(false));
  events.on('lifeLost', () => duckMusic(-14, 0.9));
  events.on('bigHit', ({ strength }) => duckMusic(-9 * Math.min(1, strength), 0.35));
}

/** Test hook: the current audio context (null before the first gesture). */
export const musicContext = () => audio()?.ctx ?? null;
