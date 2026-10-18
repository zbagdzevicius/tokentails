/**
 * Match music with intensity layers (fun plan F2 item 13): a small procedural step sequencer on the sfx
 * AudioContext (no files, no autoplay: it starts once the first gesture unlocked audio). Four layers stack:
 *   0 walking (pad and bass), 1 a hero is near (hats and a pluck), 2 a 2v2+ fight or Sunset (drums and driving
 *   bass), 3 Sudden Death or a core under attack (lead and toms).
 * Layers crossfade over ~1.5 s. Routed through the sfx master, so the mute setting silences it (the host's music
 * volume scales its own bus; the sfx volume does not touch it); while muted it
 * schedules nothing. Render side only; never feeds the sim.
 */
import { sfx } from './sfx';

export type Intensity = 0 | 1 | 2 | 3;

const BPM = 116;
const STEP_S = 60 / BPM / 4;
const LOOKAHEAD_S = 0.25;
/** setTargetAtTime constant: ~95% of the way in 3τ = 1.5 s. */
const FADE_TAU = 0.5;
const VOLUME = 0.2;
const LAYER_GAIN = [0.9, 0.75, 0.85, 0.7];

/** C – G – Am – F, one bar each (MIDI roots and triads). */
const BARS: readonly { root: number; chord: readonly number[] }[] = [
  { root: 48, chord: [60, 64, 67] },
  { root: 43, chord: [59, 62, 67] },
  { root: 45, chord: [60, 64, 69] },
  { root: 41, chord: [60, 65, 69] },
];
/** Lead (layer 3): a bright 16-step motif per bar, scale degrees as MIDI offsets from the chord's top (-1 = rest). */
const LEAD = [0, -1, 2, 4, -1, 4, 2, 0, 5, -1, 4, 2, 0, -1, 2, -1];
const PLUCK_STEPS = new Set([0, 3, 6, 10, 12]);

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Intensity from what is around the player (pure; the match session feeds it). */
export function intensityOf(o: { enemyNear: boolean; fight2v2: boolean; sunset: boolean; suddenDeath: boolean; coreUnderAttack: boolean }): Intensity {
  if (o.suddenDeath || o.coreUnderAttack) return 3;
  if (o.fight2v2 || o.sunset) return 2;
  if (o.enemyNear) return 1;
  return 0;
}

export class Music {
  private ac: AudioContext | null = null;
  private bus: GainNode | null = null;
  private layers: GainNode[] = [];
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextAt = 0;
  private step = 0;
  private level: Intensity = 0;
  private applied = -1;
  private running = false;
  /** Seconds each layer has been silent (skip scheduling it after the fade). */
  private readonly off = [0, 1e9, 1e9, 1e9];
  /** Highest level held, and until when (a fight does not drop the music the moment it pauses). */
  private hold = { level: 0 as Intensity, until: 0 };

  get intensity(): Intensity {
    return this.level;
  }

  /** Start (or keep trying until audio is unlocked). */
  start(): void {
    this.running = true;
    this.tryInit();
  }

  private tryInit(): void {
    if (this.ac || !this.running) return;
    const ac = sfx.context;
    const out = sfx.output;
    if (!ac || !out) return;
    try {
      this.ac = ac;
      this.bus = ac.createGain();
      this.bus.gain.value = VOLUME * sfx.musicVolume;
      this.bus.connect(out);
      for (let i = 0; i < 4; i++) {
        const g = ac.createGain();
        g.gain.value = i === 0 ? LAYER_GAIN[0] : 0;
        g.connect(this.bus);
        this.layers.push(g);
      }
      const n = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const d = n.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        d[i] = (seed / 0xffffffff) * 2 - 1;
      }
      this.noise = n;
      this.nextAt = ac.currentTime + 0.1;
      this.step = 0;
      this.applied = -1;
      this.timer = setInterval(() => this.schedule(), 60);
    } catch {
      this.ac = null;
    }
  }

  /** Per frame: the wanted level (held 4 s before it may drop). */
  setIntensity(want: Intensity, nowMs = performance.now()): void {
    if (want >= this.hold.level || nowMs > this.hold.until) this.hold = { level: want, until: nowMs + 4000 };
    this.level = Math.max(want, this.hold.level) as Intensity;
    this.tryInit();
    this.applyLevel();
  }

  private applyLevel(): void {
    const ac = this.ac;
    if (!ac || this.applied === this.level) return;
    this.applied = this.level;
    const now = ac.currentTime;
    this.layers.forEach((g, i) => {
      const on = i <= this.level;
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(on ? LAYER_GAIN[i] : 0, now, FADE_TAU);
      } catch {
        g.gain.value = on ? LAYER_GAIN[i] : 0;
      }
      if (on) this.off[i] = 0;
    });
  }

  private schedule(): void {
    const ac = this.ac;
    if (!ac || !this.running) return;
    // the host's music volume (audio{music}); mute stays on the sfx master
    const vol = VOLUME * sfx.musicVolume;
    if (this.bus && this.bus.gain.value !== vol) this.bus.gain.value = vol;
    if (sfx.isMuted || ac.state !== 'running') {
      this.nextAt = ac.currentTime + 0.1;
      return;
    }
    // a hidden tab throttles timers: never schedule a backlog of notes
    if (this.nextAt < ac.currentTime - 0.5) this.nextAt = ac.currentTime + 0.05;
    while (this.nextAt < ac.currentTime + LOOKAHEAD_S) {
      this.playStep(this.step, this.nextAt);
      this.nextAt += STEP_S;
      this.step = (this.step + 1) % (16 * BARS.length);
      for (let i = 1; i < 4; i++) if (i > this.level) this.off[i] += STEP_S;
    }
  }

  private live(i: number): boolean {
    return i <= this.level || this.off[i] < 2;
  }

  private playStep(step: number, t: number): void {
    const bar = BARS[Math.floor(step / 16) % BARS.length];
    const s = step % 16;
    // layer 0: pad on the bar, bass on 1 and 3
    if (s === 0) for (const n of bar.chord) this.tone(0, 'triangle', hz(n), t, STEP_S * 16, 0.07, 0.4, 0.6);
    if (s === 0 || s === 8) this.tone(0, 'sine', hz(bar.root), t, STEP_S * 6, 0.32, 0.01, 0.3);
    // layer 1: hats on the off 8ths, a pluck arpeggio
    if (this.live(1)) {
      if (s % 2 === 1) this.hat(1, t, 0.05, 0.035);
      if (PLUCK_STEPS.has(s)) this.tone(1, 'triangle', hz(bar.chord[(s / 3) % 3 | 0] + 12), t, STEP_S * 1.5, 0.12, 0.005, 0.12);
    }
    // layer 2: kick, snare, driving 8th bass
    if (this.live(2)) {
      if (s % 4 === 0) this.kick(2, t);
      if (s === 4 || s === 12) this.hat(2, t, 0.14, 0.22, 1800);
      if (s % 2 === 0) this.tone(2, 'square', hz(bar.root + 12), t, STEP_S * 0.9, 0.06, 0.005, 0.05, 900);
    }
    // layer 3: lead motif, 16th hats, a tom fill on the last beat of the cycle
    if (this.live(3)) {
      const d = LEAD[s];
      if (d >= 0) this.tone(3, 'sawtooth', hz(bar.chord[2] + 12 + d), t, STEP_S * 0.9, 0.07, 0.005, 0.06, 2600);
      if (s % 2 === 0) this.hat(3, t, 0.03, 0.025);
      if (step % 64 >= 60) this.tone(3, 'sine', 160 - (step % 4) * 25, t, STEP_S * 1.2, 0.25, 0.002, 0.15);
    }
  }

  private tone(layer: number, type: OscillatorType, f: number, t: number, dur: number, vol: number, attack: number, release: number, lowpass = 0): void {
    const ac = this.ac;
    if (!ac) return;
    try {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + attack);
      g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
      g.gain.linearRampToValueAtTime(0, t + dur);
      let tail: AudioNode = g;
      if (lowpass > 0) {
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;
        g.connect(lp);
        tail = lp;
      }
      o.connect(g);
      tail.connect(this.layers[layer]);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch {
      /* best effort */
    }
  }

  private hat(layer: number, t: number, dur: number, vol: number, band = 7000): void {
    const ac = this.ac;
    if (!ac || !this.noise) return;
    try {
      const src = ac.createBufferSource();
      src.buffer = this.noise;
      const f = ac.createBiquadFilter();
      f.type = band > 4000 ? 'highpass' : 'bandpass';
      f.frequency.value = band;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.layers[layer]);
      src.start(t, Math.random() * 0.3, dur + 0.02);
    } catch {
      /* best effort */
    }
  }

  private kick(layer: number, t: number): void {
    const ac = this.ac;
    if (!ac) return;
    try {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g);
      g.connect(this.layers[layer]);
      o.start(t);
      o.stop(t + 0.25);
    } catch {
      /* best effort */
    }
  }

  /** Fade out and stop scheduling. */
  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ac = this.ac;
    const bus = this.bus;
    if (ac && bus) {
      try {
        bus.gain.setTargetAtTime(0, ac.currentTime, 0.3);
        setTimeout(() => bus.disconnect(), 1500);
      } catch {
        bus.disconnect();
      }
    }
    this.ac = null;
    this.bus = null;
    this.layers = [];
  }
}
