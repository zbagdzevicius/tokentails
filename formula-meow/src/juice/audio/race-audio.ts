/**
 * Race audio (GDD 10): the mixer (music, SFX and engine buses into a compressor), the engine purr, the adaptive
 * music and every SFX cue. A JuiceListener: it hears the race only through the JuiceBus and never writes the sim.
 * Audio unlocks on the first touch or key (iOS needs a gesture). WebAudio synth only, no files.
 */
import type { RaceEvent } from '../../types';
import type { FrameInfo, JuiceListener } from '../bus';
import { EngineVoice } from './engine';
import { Music } from './music';
import { cueLength, cuesFor, playCue, VoiceBudget } from './sfx';
import { makeNoise, type SynthGraph } from './synth';

export interface Mixer {
  master: number;
  music: number;
  sfx: number;
  engine: number;
}

const MASTER = 0.8;

export class RaceAudio implements JuiceListener {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: { music: GainNode; sfx: GainNode; engine: GainNode } | null = null;
  private duck: BiquadFilterNode | null = null;
  private engine: EngineVoice | null = null;
  private music: Music | null = null;
  private graph: SynthGraph | null = null;
  private readonly budget = new VoiceBudget(24);
  private finalLap = false;
  private finished = false;
  private pausedNow = false;
  muted = false;
  mixer: Mixer = { master: 1, music: 1, sfx: 1, engine: 1 };
  /** track theme for the music (set by the juice install, read on every reset) */
  themeOf: () => number = () => 0;

  /** Call from a user gesture (GDD 10: audio unlocks on the first touch). Safe to call many times. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER * this.mixer.master;
    this.master.connect(comp).connect(ctx.destination);
    // a low-pass on the music that closes while paused
    this.duck = ctx.createBiquadFilter();
    this.duck.type = 'lowpass';
    this.duck.frequency.value = Math.min(20000, ctx.sampleRate / 2);
    this.duck.connect(this.master);
    const music = ctx.createGain();
    music.gain.value = 0.32 * this.mixer.music;
    music.connect(this.duck);
    const sfx = ctx.createGain();
    sfx.gain.value = 0.9 * this.mixer.sfx;
    sfx.connect(this.master);
    const engine = ctx.createGain();
    engine.gain.value = 0.9 * this.mixer.engine;
    engine.connect(this.master);
    this.buses = { music, sfx, engine };
    const noiseBuf = makeNoise(ctx, 2);
    this.graph = { ctx, out: sfx, noise: noiseBuf };
    this.engine = new EngineVoice(ctx, engine, noiseBuf);
    this.music = new Music(ctx, music, noiseBuf, this.budget);
    this.music.setSong(this.themeOf());
    this.music.pre();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER * this.mixer.master, this.ctx.currentTime, 0.05);
  }

  setMixer(m: Partial<Mixer>): void {
    Object.assign(this.mixer, m);
    if (!this.ctx || !this.buses) return;
    const t = this.ctx.currentTime;
    this.buses.music.gain.setTargetAtTime(0.32 * this.mixer.music, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(0.9 * this.mixer.sfx, t, 0.05);
    this.buses.engine.gain.setTargetAtTime(0.9 * this.mixer.engine, t, 0.05);
    this.setMuted(this.muted);
  }

  onReset(): void {
    this.finalLap = false;
    this.finished = false;
    this.budget.clear();
    if (this.music) {
      this.music.setSong(this.themeOf());
      this.music.pre();
    }
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    const me = info.me;
    if (e.type === 'go') this.music?.go();
    if (e.type === 'countdown' && e.a === 3) this.music?.pre();
    if (e.type === 'finalLap' && e.kart === me) {
      this.finalLap = true;
      this.music?.finalLap();
    }
    if (e.type === 'finish' && e.kart === me) {
      this.finished = true;
      this.music?.results((e.a ?? 8) <= 1);
    }
    const g = this.graph;
    if (!g || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const c of cuesFor(e, me)) {
      if (!this.budget.admit(now, c.prio, cueLength(c.id))) continue;
      try {
        playCue(g, c, now + 0.005);
      } catch {
        /* a closed context or a bad param must never break the race */
      }
    }
  }

  onFrame(info: FrameInfo): void {
    if (!this.ctx || !this.engine) return;
    const st = info.st;
    const k = st.karts[info.me];
    const running = !info.paused && st.phase !== 'done' && !k.finished;
    this.engine.update(st.karts, info.me, info.topSpeed, running);
    if (info.paused !== this.pausedNow && this.duck) {
      this.pausedNow = info.paused;
      this.duck.frequency.setTargetAtTime(info.paused ? 500 : Math.min(20000, this.ctx.sampleRate / 2), this.ctx.currentTime, 0.08);
    }
    if (this.music && !this.finished) {
      const closing = this.finalLap && st.lapLength > 0 && k.s / st.lapLength > 0.82;
      this.music.setRace(k.place || 8, this.finalLap, closing);
    }
  }

  dispose(): void {
    this.music?.dispose();
    this.engine?.dispose();
    void this.ctx?.close();
    this.ctx = null;
  }
}
