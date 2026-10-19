/**
 * Starter audio (juice lane seed, GDD 10): WebAudio synth only, no files. Engine purr pitched to speed, countdown
 * "mrrp, mrrp, mrrp, MEOW!", drift whine steps, mini-turbo whoosh, wall thud, item roulette ticks, lap and finish
 * stings, and a 128 BPM synth loop that goes to 140 BPM and +2 semitones on the final lap. The juice lane replaces
 * this with the copied bad-cat synth/voices/music; it listens on the JuiceBus only.
 */
import type { RaceEvent } from '../../types';
import { speedOf } from '../../core/sim/kart';
import type { FrameInfo, JuiceListener } from '../bus';

type Ctx = AudioContext;

export class StarterAudio implements JuiceListener {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private engine: { a: OscillatorNode; b: OscillatorNode; f: BiquadFilterNode; g: GainNode; lfo: OscillatorNode } | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private nextBeat = 0;
  private beat = 0;
  private bpm = 128;
  private key = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private racing = false;
  muted = false;

  /** Call from a user gesture (GDD 10: audio unlocks on the first touch). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = 0.28;
    this.music.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine: two detuned saws through a lowpass, amplitude-modulated purr
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = b.type = 'sawtooth';
    b.detune.value = 14;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.35;
    const am = ctx.createGain();
    am.gain.value = 0.65;
    lfo.connect(lfoG).connect(am.gain);
    a.connect(f);
    b.connect(f);
    f.connect(am).connect(g).connect(this.master);
    a.start();
    b.start();
    lfo.start();
    this.engine = { a, b, f, g, lfo };
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  onReset(): void {
    this.racing = false;
    this.bpm = 128;
    this.key = 0;
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    const me = e.kart === info.me;
    switch (e.type) {
      case 'countdown':
        this.mrrp(330, 0.18);
        break;
      case 'go':
        this.meow(1);
        this.racing = true;
        if (this.ctx) this.nextBeat = this.ctx.currentTime + 0.05;
        break;
      case 'pounce':
        if (me) this.whoosh(0.5, 1.4);
        break;
      case 'driftTier':
        if (me) this.blip([0, 660, 880, 1320][e.a ?? 1], 0.09, 'square', 0.12);
        break;
      case 'miniTurbo':
        if (me) {
          this.whoosh(0.35 + 0.15 * (e.a ?? 1), 0.9 + 0.3 * (e.a ?? 1));
          if (e.a === 3) this.meow(1.3);
        }
        break;
      case 'pad':
      case 'trick':
        if (me) this.whoosh(0.4, 1.2);
        break;
      case 'wall':
        if (me) this.thud(e.a === 2 ? 0.5 : 0.25);
        break;
      case 'bump':
        if (e.kart === info.me || e.b === info.me) this.thud(0.15);
        break;
      case 'land':
        if (me && (e.a ?? 0) > 15) this.blip(520, 0.06, 'triangle', 0.15, 900);
        break;
      case 'itemPickup':
        if (me) for (let i = 0; i < 12; i++) this.blip(1800 + (i % 2) * 300, 0.03, 'sine', 0.06, undefined, 0.06 + i * i * 0.008);
        break;
      case 'itemUse':
        if (me) this.whoosh(0.3, 1.6);
        break;
      case 'overtake':
        if (me) this.blip(990, 0.05, 'square', 0.07, 1480);
        break;
      case 'finalLap':
        if (me) {
          this.bpm = 140;
          this.key = 2;
          this.meow(1.5);
        }
        break;
      case 'lap':
        if (me) [523, 659, 784].forEach((f, i) => this.blip(f, 0.1, 'square', 0.09, undefined, i * 0.08));
        break;
      case 'finish':
        if (me) {
          [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.18, 'square', 0.1, undefined, i * 0.11));
          this.racing = false;
        }
        break;
      case 'hit':
        if (me) this.meow(0.7);
        break;
    }
  }

  onFrame(info: FrameInfo): void {
    if (!this.ctx || !this.engine) return;
    const k = info.st.karts[info.me];
    const v = speedOf(k);
    const frac = Math.min(1.4, v / info.topSpeed);
    const t = this.ctx.currentTime;
    const run = info.paused || info.st.phase === 'done' ? 0 : 1;
    const rpm = 70 + 170 * frac + (k.driftDir !== 0 ? 18 : 0);
    this.engine.a.frequency.setTargetAtTime(rpm, t, 0.05);
    this.engine.b.frequency.setTargetAtTime(rpm * 1.005, t, 0.05);
    this.engine.f.frequency.setTargetAtTime(600 + 2600 * Math.min(1, frac) + (k.boostTicks > 0 ? 1200 : 0), t, 0.05);
    this.engine.lfo.frequency.setTargetAtTime(22 + 6 * Math.min(1, frac), t, 0.1);
    this.engine.g.gain.setTargetAtTime(run * (0.05 + 0.07 * Math.min(1, frac)), t, 0.08);
  }

  // ---- music: kick, hats, saw bass arpeggio ----------------------------------------------------------------------------
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.racing || !this.music) return;
    const spb = 60 / this.bpm / 2; // eighth notes
    const roots = [0, 0, -4, -4, 3, 3, -2, -2];
    while (this.nextBeat < ctx.currentTime + 0.1) {
      const t = this.nextBeat;
      const step = this.beat % 16;
      const bar = Math.floor(this.beat / 16) % 8;
      if (step % 4 === 0) this.kick(t);
      if (step % 2 === 1) this.hat(t);
      if (step === 4 || step === 12) this.snare(t);
      const root = 45 + roots[bar] + this.key; // A2 base
      const arp = [0, 12, 7, 12, 0, 12, 10, 12][step % 8];
      this.note(t, root + arp, spb * 0.9, 'sawtooth', 0.08, this.music);
      if (step % 4 === 2) this.note(t, root + 24 + [0, 3, 7][(step >> 2) % 3], spb * 0.8, 'square', 0.035, this.music);
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private note(t: number, midi: number, dur: number, type: OscillatorType, vol: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.music!);
    o.start(t);
    o.stop(t + 0.22);
  }

  private hat(t: number): void {
    this.noise(t, 0.04, 0.08, 7000, 'highpass', this.music!);
  }

  private snare(t: number): void {
    this.noise(t, 0.14, 0.2, 1800, 'bandpass', this.music!);
  }

  private noise(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, out: AudioNode): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // ---- sfx ------------------------------------------------------------------------------------------------------------------
  private blip(freq: number, dur: number, type: OscillatorType, vol: number, to?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** "mrrp": a rolled chirp. */
  private mrrp(freq: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 0.8, t);
    o.frequency.linearRampToValueAtTime(freq * 1.25, t + dur);
    const trem = ctx.createOscillator();
    trem.frequency.value = 38;
    const tg = ctx.createGain();
    tg.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    trem.connect(tg).connect(g.gain);
    o.connect(g).connect(this.master);
    o.start(t);
    trem.start(t);
    o.stop(t + dur + 0.02);
    trem.stop(t + dur + 0.02);
  }

  /** "MEOW": a saw through a sweeping formant filter. */
  private meow(pitch: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const dur = 0.45;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420 * pitch, t);
    o.frequency.linearRampToValueAtTime(620 * pitch, t + 0.12);
    o.frequency.linearRampToValueAtTime(380 * pitch, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1600, t + 0.15);
    f.frequency.linearRampToValueAtTime(800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private whoosh(dur: number, bright: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400 * bright, t);
    f.frequency.exponentialRampToValueAtTime(3200 * bright, t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  private thud(vol: number): void {
    this.blip(90, 0.18, 'sine', vol * 1.4, 40);
    if (this.ctx && this.master) this.noise(this.ctx.currentTime, 0.08, vol * 0.4, 900, 'lowpass', this.master);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
