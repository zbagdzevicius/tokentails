/**
 * L-AUDIO: every sound is built here from oscillators, one shared noise buffer, filters and a
 * waveshaper. No samples, no convolver (a short feedback delay stands in for reverb on phones).
 *
 * Graph:
 *   kick (clean | waveshaper "hardstyle") ─┐
 *   hats, claps, snares ───────────── drums ┤
 *   bass, lead, pad ── duck (sidechain) ── lowpass sweep ┤── pre ── glue comp ── limiter ── out (mute) ── speakers
 *   meows, cheer, riser, impact ─────── fx ┤
 *   send ── delay ⟲ lowpass ── wet ────────┘
 */
import { CHORDS, keyShift, leadAt, midiHz, rollRate } from './music';
import { hatOn, kickOn, type BarPos } from './timeline';

const rand = Math.random;
const EPS = 0.0001;
const MASTER = 0.62;

export interface StepInput {
  /** AudioContext time of this 16th. */
  t: number;
  /** 0..15 inside the bar. */
  s16: number;
  pos: BarPos;
  /** The bar after this one, as currently planned (used for the pre-drop vocal). */
  next: BarPos;
  held: boolean;
  stepDur: number;
}

function curve(k: number) {
  const n = 2048;
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

export class Synth {
  readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly pre: GainNode;
  private readonly drums: GainNode;
  private readonly kickClean: GainNode;
  private readonly kickDirt: GainNode;
  private readonly duck: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly fx: GainNode;
  private readonly send: GainNode;
  private readonly noise: AudioBuffer;
  private readonly voices: number;

  constructor(ctx: AudioContext, opts: { voices: number; bpm: number }) {
    this.ctx = ctx;
    this.voices = Math.max(1, Math.round(opts.voices));
    const spb = 60 / opts.bpm;
    const c = ctx;

    this.out = c.createGain();
    this.out.gain.value = 0;
    this.out.connect(c.destination);

    const limiter = c.createDynamicsCompressor();
    Synth.comp(limiter, -1.5, 0, 20, 0.001, 0.06);
    limiter.connect(this.out);
    const glue = c.createDynamicsCompressor();
    Synth.comp(glue, -18, 8, 3.5, 0.006, 0.2);
    glue.connect(limiter);

    this.pre = this.gain(0.8, glue);
    this.drums = this.gain(1, this.pre);
    this.kickClean = this.gain(1, this.drums);

    const shaper = c.createWaveShaper();
    shaper.curve = curve(9);
    shaper.oversample = '2x';
    const dirtLp = this.filter('lowpass', 3200, 0.7);
    shaper.connect(dirtLp);
    dirtLp.connect(this.gain(0.55, this.drums));
    this.kickDirt = c.createGain();
    this.kickDirt.connect(shaper);

    this.lp = this.filter('lowpass', 18000, 0.8);
    this.lp.connect(this.pre);
    this.duck = this.gain(1, this.lp);
    this.fx = this.gain(1, this.pre);

    const delay = c.createDelay(2);
    delay.delayTime.value = spb * 0.75;
    const fbLp = this.filter('lowpass', 2600, 0.5);
    const fb = c.createGain();
    fb.gain.value = 0.32;
    this.send = c.createGain();
    this.send.connect(delay);
    delay.connect(fbLp);
    fbLp.connect(fb);
    fb.connect(delay);
    fbLp.connect(this.gain(0.45, this.pre));

    const len = Math.floor(c.sampleRate * 2);
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1;
  }

  // ---------------------------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------------------------

  private static comp(n: DynamicsCompressorNode, thr: number, knee: number, ratio: number, att: number, rel: number) {
    n.threshold.value = thr;
    n.knee.value = knee;
    n.ratio.value = ratio;
    n.attack.value = att;
    n.release.value = rel;
  }

  private gain(v: number, dest?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q: number, dest?: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (dest) f.connect(dest);
    return f;
  }

  private osc(type: OscillatorType, freq: number, t: number, stop: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  private noiseSrc(t: number, dur: number, dest: AudioNode): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.connect(dest);
    s.start(t, rand() * 1.5);
    s.stop(t + dur);
    return s;
  }

  /** Attack to `peak`, hold, exponential release. */
  private static env(p: AudioParam, t: number, a: number, peak: number, hold: number, rel: number) {
    p.setValueAtTime(EPS, t);
    p.linearRampToValueAtTime(Math.max(EPS, peak), t + a);
    if (hold > 0) p.setValueAtTime(Math.max(EPS, peak), t + a + hold);
    p.exponentialRampToValueAtTime(EPS, t + a + hold + rel);
  }

  /** Master volume, 0..1 (mute fades go through here). Scaled so the drop sits near -14 dBFS RMS. */
  fade(to: number, seconds: number) {
    to *= MASTER;
    const p = this.out.gain;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(to, now + Math.max(0.01, seconds));
  }

  private filterSweep(t: number, from: number, to: number, dur: number) {
    const p = this.lp.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(from, t);
    if (dur > 0 && to !== from) p.exponentialRampToValueAtTime(to, t + dur);
  }

  private duckAt(t: number, depth: number) {
    const p = this.duck.gain;
    p.setTargetAtTime(depth, t, 0.004);
    p.setTargetAtTime(1, t + 0.04, 0.07);
  }

  // ---------------------------------------------------------------------------------------------
  // Instruments
  // ---------------------------------------------------------------------------------------------

  kick(t: number, vel: number, hard: boolean) {
    const end = t + (hard ? 0.45 : 0.32);
    const g = this.gain(0, hard ? this.kickDirt : this.kickClean);
    const o = this.osc('sine', hard ? 260 : 180, t, end, g);
    o.frequency.exponentialRampToValueAtTime(hard ? 58 : 52, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(hard ? 46 : 42, end - 0.05);
    Synth.env(g.gain, t, 0.003, vel, hard ? 0.13 : 0.05, hard ? 0.28 : 0.22);
    // Hardstyle kicks keep some clean body under the distortion.
    if (hard) {
      const body = this.gain(0, this.kickClean);
      o.connect(body);
      Synth.env(body.gain, t, 0.003, vel * 0.5, 0.04, 0.18);
    }
    const click = this.gain(0, this.drums);
    const hp = this.filter('highpass', 1800, 0.7, click);
    this.noiseSrc(t, 0.03, hp);
    Synth.env(click.gain, t, 0.001, vel * 0.35, 0, 0.018);
  }

  hat(t: number, vel: number, open: boolean) {
    const g = this.gain(0, this.drums);
    const hp = this.filter('highpass', open ? 7000 : 9000, 0.7, g);
    this.noiseSrc(t, open ? 0.16 : 0.06, hp);
    Synth.env(g.gain, t, 0.001, vel * 0.5, 0, open ? 0.11 : 0.035);
  }

  clap(t: number, vel: number) {
    const g = this.gain(0, this.drums);
    g.connect(this.gain(0.15, this.send));
    const bp = this.filter('bandpass', 1400, 1, g);
    this.noiseSrc(t, 0.3, bp);
    const p = g.gain;
    const v = vel * 0.9;
    p.setValueAtTime(v, t);
    p.exponentialRampToValueAtTime(v * 0.1, t + 0.009);
    p.setValueAtTime(v, t + 0.011);
    p.exponentialRampToValueAtTime(v * 0.1, t + 0.02);
    p.setValueAtTime(v, t + 0.022);
    p.exponentialRampToValueAtTime(EPS, t + 0.22);
  }

  snare(t: number, vel: number) {
    const g = this.gain(0, this.drums);
    const bp = this.filter('bandpass', 2000, 0.8, g);
    this.noiseSrc(t, 0.12, bp);
    Synth.env(g.gain, t, 0.001, vel * 0.7, 0, 0.09);
    const body = this.gain(0, this.drums);
    this.osc('triangle', 190, t, t + 0.08, body);
    Synth.env(body.gain, t, 0.001, vel * 0.35, 0, 0.06);
  }

  crash(t: number, vel: number) {
    const g = this.gain(0, this.fx);
    g.connect(this.gain(0.2, this.send));
    const hp = this.filter('highpass', 3500, 0.5, g);
    this.noiseSrc(t, 2, hp);
    Synth.env(g.gain, t, 0.002, vel * 0.32, 0, 1.8);
  }

  bass(t: number, midi: number, dur: number, vel: number, bright: number) {
    const f0 = midiHz(midi);
    const g = this.gain(0, this.duck);
    const lp = this.filter('lowpass', 400 + 2400 * bright, 6, g);
    lp.frequency.setValueAtTime(400 + 2400 * bright, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur * 0.85);
    const end = t + dur + 0.03;
    this.osc('sawtooth', f0, t, end, lp).detune.value = -9;
    this.osc('sawtooth', f0, t, end, lp).detune.value = 9;
    this.osc('square', f0 / 2, t, end, this.gain(0.35, lp));
    Synth.env(g.gain, t, 0.003, vel * 0.32, dur * 0.4, dur * 0.55);
  }

  /** Detuned supersaw stab with a sub-octave. */
  lead(t: number, midi: number, dur: number, vel: number, cutoff: number) {
    const f = midiHz(midi);
    const n = this.voices;
    const g = this.gain(0, this.duck);
    g.connect(this.gain(0.28, this.send));
    const lp = this.filter('lowpass', cutoff, 1.4, g);
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(500, cutoff * 0.45), t + dur + 0.05);
    const end = t + dur + 0.3;
    for (let i = 0; i < n; i++) {
      const o = this.osc('sawtooth', f, t, end, lp);
      o.detune.value = n > 1 ? ((i / (n - 1)) * 2 - 1) * 26 + (rand() - 0.5) * 4 : 0;
    }
    this.osc('sawtooth', f / 2, t, end, this.gain(0.5, lp));
    const peak = (vel * 0.3) / Math.sqrt(n + 1);
    const p = g.gain;
    p.setValueAtTime(EPS, t);
    p.linearRampToValueAtTime(peak, t + 0.004);
    p.setTargetAtTime(peak * 0.65, t + 0.01, Math.max(0.02, dur * 0.4));
    p.setTargetAtTime(EPS, t + dur, 0.045);
  }

  pad(t: number, notes: readonly number[], dur: number, vel: number) {
    const g = this.gain(0, this.duck);
    g.connect(this.gain(0.2, this.send));
    const lp = this.filter('lowpass', 1500, 0.6, g);
    const end = t + dur + 0.6;
    for (const m of notes) {
      const f = midiHz(m);
      this.osc('sawtooth', f, t, end, lp).detune.value = -12;
      this.osc('sawtooth', f, t, end, lp).detune.value = 12;
    }
    const peak = vel * 0.06;
    const p = g.gain;
    p.setValueAtTime(EPS, t);
    p.linearRampToValueAtTime(peak, t + dur * 0.3);
    p.setValueAtTime(peak, t + dur);
    p.linearRampToValueAtTime(EPS, t + dur + 0.5);
  }

  /** One bar of the build riser, from progress p0 to p1 (0..1 through the build). */
  riser(t: number, dur: number, p0: number, p1: number) {
    const g = this.gain(0, this.fx);
    const bp = this.filter('bandpass', 500, 1.5, g);
    bp.frequency.setValueAtTime(500 * Math.pow(16, p0), t);
    bp.frequency.exponentialRampToValueAtTime(500 * Math.pow(16, p1), t + dur);
    this.noiseSrc(t, dur + 0.02, bp);
    const p = g.gain;
    p.setValueAtTime(0.03 + 0.3 * p0, t);
    p.linearRampToValueAtTime(0.03 + 0.3 * p1, t + dur);
    p.linearRampToValueAtTime(EPS, t + dur + 0.015);
    // A rising saw "siren" under the noise.
    const sg = this.gain(0, this.fx);
    const slp = this.filter('lowpass', 2200, 0.7, sg);
    const o = this.osc('sawtooth', 110 * Math.pow(2, p0 * 3), t, t + dur + 0.02, slp);
    o.frequency.exponentialRampToValueAtTime(110 * Math.pow(2, p1 * 3), t + dur);
    sg.gain.setValueAtTime(0.012 + 0.04 * p0, t);
    sg.gain.linearRampToValueAtTime(0.012 + 0.04 * p1, t + dur);
    sg.gain.linearRampToValueAtTime(EPS, t + dur + 0.015);
  }

  /** "Mee-ow": a saw through three moving formants (i → a → u) with a rise-and-fall pitch. */
  meow(t: number, midi: number, dur: number, vel: number) {
    const f0 = midiHz(midi);
    const end = t + dur + 0.05;
    const sum = this.gain(0, this.fx);
    sum.connect(this.gain(0.35, this.send));
    const src = this.ctx.createGain();
    const o = this.osc('sawtooth', f0 * 0.82, t, end, src);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.12, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + dur);
    const vib = this.gain(f0 * 0.025);
    vib.connect(o.frequency);
    this.osc('sine', 5.5 + rand(), t, end, vib);
    const FORMANTS: [number, number, number, number, number][] = [
      // [start, mid, end, Q, gain]
      [350, 950, 480, 3, 1],
      [2300, 1400, 850, 4, 0.55],
      [3100, 2700, 2450, 5, 0.3],
    ];
    for (const [a, b, c, q, gn] of FORMANTS) {
      const bp = this.filter('bandpass', a, q, this.gain(gn, sum));
      bp.frequency.setValueAtTime(a, t);
      bp.frequency.linearRampToValueAtTime(b, t + dur * 0.35);
      bp.frequency.linearRampToValueAtTime(c, t + dur);
      src.connect(bp);
    }
    const p = sum.gain;
    const peak = vel * 1.6;
    p.setValueAtTime(EPS, t);
    p.linearRampToValueAtTime(peak * 0.3, t + 0.03); // the nasal "m"
    p.linearRampToValueAtTime(peak, t + dur * 0.25);
    p.setValueAtTime(peak, t + dur * 0.6);
    p.exponentialRampToValueAtTime(EPS, t + dur);
  }

  /** Synthesized crowd: two noise washes, a handful of "woo" voices and a whistle. */
  cheer(t: number, size: number) {
    const dur = 2.2 + size * 0.8;
    const wash = (freq: number, q: number, level: number) => {
      const g = this.gain(0, this.fx);
      const bp = this.filter('bandpass', freq, q, g);
      this.noiseSrc(t, dur + 0.1, bp);
      const p = g.gain;
      p.setValueAtTime(EPS, t);
      p.linearRampToValueAtTime(level * size, t + 0.25);
      p.setValueAtTime(level * size, t + dur * 0.35);
      p.exponentialRampToValueAtTime(EPS, t + dur);
    };
    wash(1100, 0.6, 0.28);
    wash(2800, 1.4, 0.1);

    const n = Math.min(10, this.voices + 2 + Math.round(size * 2));
    for (let i = 0; i < n; i++) {
      const st = t + rand() * 0.4;
      const d = 0.6 + rand() * 0.9;
      const f = 260 + rand() * 420;
      const g = this.gain(0, this.fx);
      const bp1 = this.filter('bandpass', 700 + rand() * 300, 3, g);
      const bp2 = this.filter('bandpass', 1100 + rand() * 400, 4, g);
      const src = this.ctx.createGain();
      src.connect(bp1);
      src.connect(bp2);
      const o = this.osc(rand() < 0.5 ? 'sawtooth' : 'triangle', f * 0.9, st, st + d + 0.05, src);
      o.frequency.exponentialRampToValueAtTime(f * 1.35, st + d * 0.35);
      o.frequency.exponentialRampToValueAtTime(f * 1.05, st + d);
      const vib = this.gain(f * 0.03);
      vib.connect(o.frequency);
      this.osc('sine', 5 + rand() * 3, st, st + d + 0.05, vib);
      Synth.env(g.gain, st, 0.06, 0.22 * size, d * 0.4, d * 0.5);
    }
    // Two-finger whistle.
    const wg = this.gain(0, this.fx);
    const ws = t + 0.1 + rand() * 0.3;
    const w = this.osc('sine', 2200, ws, ws + 0.9, wg);
    w.frequency.linearRampToValueAtTime(3100, ws + 0.3);
    w.frequency.linearRampToValueAtTime(2600, ws + 0.85);
    Synth.env(wg.gain, ws, 0.04, 0.035 * size, 0.4, 0.4);
  }

  /** The drop hit: a sub boom and a crash. */
  impact(t: number) {
    const g = this.gain(0, this.fx);
    const o = this.osc('sine', 90, t, t + 1.5, g);
    o.frequency.exponentialRampToValueAtTime(32, t + 1);
    Synth.env(g.gain, t, 0.004, 0.75, 0.05, 1.3);
    this.crash(t, 1);
  }

  /** The DJ's sword: a swoosh into a bright metallic ring. */
  shing(t: number) {
    const sw = this.gain(0, this.fx);
    const bp = this.filter('bandpass', 1500, 2, sw);
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.exponentialRampToValueAtTime(9000, t + 0.16);
    this.noiseSrc(t, 0.25, bp);
    sw.gain.setValueAtTime(EPS, t);
    sw.gain.linearRampToValueAtTime(0.3, t + 0.14);
    sw.gain.exponentialRampToValueAtTime(EPS, t + 0.22);
    const rt = t + 0.13;
    const ring = this.gain(0, this.fx);
    ring.connect(this.gain(0.3, this.send));
    for (const f of [1870, 2810, 3950, 5230, 6890]) {
      const o = this.osc('sine', f, rt, rt + 1.6, ring);
      o.detune.value = (rand() - 0.5) * 20;
    }
    Synth.env(ring.gain, rt, 0.002, 0.12, 0, 1.5);
  }

  /** Tap feedback: an open hat and a tiny chirp. */
  chirp(t: number) {
    this.hat(t, 0.6, true);
    this.meow(t, 84 + Math.floor(rand() * 5), 0.17, 0.45);
  }

  // ---------------------------------------------------------------------------------------------
  // The song, one 16th at a time
  // ---------------------------------------------------------------------------------------------

  step(s: StepInput) {
    const { t, s16, pos, next, held, stepDur } = s;
    const sec = pos.section;
    const sb = pos.sectionBar;
    const barDur = stepDur * 16;
    const beatInBar = s16 >> 2;
    const chordIdx = sb % CHORDS.length;
    const chord = CHORDS[chordIdx];
    // Each pass through the arrangement moves key (and swaps the lead pattern, see leadAt).
    const key = keyShift(pos.loop);
    const root = chord.root + key;
    const padNotes = key ? chord.pad.map((m) => m + key) : chord.pad;
    const onBeat = s16 % 4 === 0;
    const offbeat = s16 % 4 === 2;

    // Section one-offs and the master lowpass.
    if (s16 === 0) {
      switch (sec) {
        case 'intro':
          this.filterSweep(t, 500 + (sb / pos.bars) * 2500, 500 + ((sb + 1) / pos.bars) * 2500, barDur);
          break;
        case 'groove':
          this.filterSweep(t, 18000, 18000, 0);
          break;
        case 'build': {
          const f = (p: number) => 300 * Math.pow(60, Math.min(1, p));
          this.filterSweep(t, f(sb / pos.bars), f((sb + 1) / pos.bars), barDur);
          break;
        }
        case 'drop':
          this.filterSweep(t, 20000, 20000, 0);
          if (sb === 0) {
            this.impact(t);
            this.shing(t);
            this.cheer(t + 0.05, pos.cause === 'new-cat' ? 1.4 : 1);
          } else if (sb % 8 === 0) this.crash(t, 0.8);
          break;
        case 'breakdown':
          if (sb === 0) this.crash(t, 0.6);
          this.filterSweep(t, 2400, 2400, 0);
          break;
      }
    }

    // Kick + sidechain.
    if (onBeat) {
      const k = kickOn(pos, beatInBar, held);
      if (k > 0) {
        this.kick(t, k, sec === 'drop');
        this.duckAt(t, sec === 'drop' ? 0.2 : sec === 'breakdown' ? 0.65 : 0.3);
      }
    }

    // Hats.
    if (offbeat) {
      const h = hatOn(pos);
      if (h > 0) this.hat(t, h, true);
    } else if (s16 % 2 === 1 && (sec === 'drop' || (sec === 'groove' && sb >= 4))) {
      this.hat(t, sec === 'drop' ? 0.2 : 0.13, false);
    }

    // Claps on 2 and 4.
    if ((s16 === 4 || s16 === 12) && (sec === 'groove' || sec === 'drop' || (sec === 'build' && sb < 4))) {
      this.clap(t, sec === 'drop' ? 0.9 : 0.75);
    }

    // Offbeat bass (a galloping pair in the drop).
    const bassOn = sec === 'groove' || sec === 'drop' || (sec === 'build' && (sb < 6 || held));
    if (bassOn && offbeat) {
      this.bass(t, root, stepDur * 1.6, sec === 'drop' ? 0.95 : 0.8, sec === 'drop' ? 0.85 : 0.4 + 0.03 * sb);
    } else if (sec === 'drop' && s16 % 4 === 3) {
      this.bass(t, root, stepDur * 0.9, 0.55, 0.6);
    }

    // Pads.
    if (s16 === 0 && (sec === 'intro' || sec === 'breakdown' || sec === 'build')) {
      const vel = sec === 'build' ? 0.5 + 0.5 * (sb / pos.bars) : sec === 'breakdown' ? 0.85 : 0.6;
      this.pad(t, padNotes, barDur, vel);
    }

    // Lead: full in the drop, filtered in the breakdown's second half, a teaser late in the groove.
    const ld = leadAt(pos.loop, chordIdx, s16);
    if (ld) {
      const note = ld.note;
      const dur = ld.steps * stepDur;
      if (sec === 'drop' && !(sb % 8 === 7 && s16 >= 8)) this.lead(t, note, dur, 1, 5200);
      else if (sec === 'breakdown' && sb >= 4) this.lead(t, note, dur, 0.55, 1600);
      else if (sec === 'groove' && sb >= 8) this.lead(t, note, dur, 0.4, 1300);
    }

    // Build: snare roll that doubles, riser, last-bar 32nds, the pre-drop "MEOW".
    if (sec === 'build') {
      const prog = sb / pos.bars;
      if (s16 === 0) this.riser(t, barDur, prog, Math.min(1, (sb + 1) / pos.bars));
      const rate = rollRate(sb, held);
      const every = 16 / rate;
      if (s16 % every === 0) {
        const v = 0.25 + 0.6 * (prog + s16 / 16 / pos.bars);
        this.snare(t, v);
        if (!held && sb >= pos.bars - 1) this.snare(t + stepDur / 2, v);
      }
      if (s16 === 12 && next.section === 'drop' && next.sectionBar === 0) this.meow(t, 88 + key, stepDur * 3.6, 1);
    }

    // Vocal chops.
    if (sec === 'groove' && sb < 8 && sb % 4 === 3 && (s16 === 10 || s16 === 14)) {
      this.meow(t, (s16 === 10 ? 83 : 79) + key, stepDur * 3.2, 0.7);
    } else if (sec === 'drop' && sb % 8 === 7 && (s16 === 8 || s16 === 11 || s16 === 14)) {
      this.meow(t, (s16 === 8 ? 79 : s16 === 11 ? 83 : 86) + key, stepDur * (s16 === 14 ? 3.5 : 2.8), 0.9);
    } else if (sec === 'breakdown' && (sb === 2 || sb === 6) && s16 === 0) {
      this.meow(t, (sb === 2 ? 79 : 76) + key, barDur * 0.5, 0.75);
    } else if (sec === 'intro' && sb === pos.bars - 1 && s16 === 8) {
      this.meow(t, 81 + key, stepDur * 4, 0.7);
    }
  }
}
