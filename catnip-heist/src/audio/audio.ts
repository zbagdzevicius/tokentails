/**
 * Procedural WebAudio: every sound effect is synthesised on the fly (no audio files), plus a
 * light chiptune loop scheduled with a look-ahead step sequencer.
 *
 *   const audio = createAudio();
 *   button.onclick = () => audio.unlock();       // user gesture (autoplay rules)
 *   audio.startMusic();
 *   audio.playEvents(state.events);               // once per sim tick
 *   audio.setMuted(true);                         // persisted per browser
 *
 * Safe without WebAudio (tests, old browsers): every call becomes a no-op.
 */
import type { AudioAPI, SfxName, SimEvent } from '../types';
import { MUSIC, type MusicTrack } from './music';

export interface HeistAudio extends AudioAPI {
  /** Map one tick's SimEvents to sound effects. */
  playEvents(events: readonly SimEvent[]): void;
  setVolume(sfx: number, music: number): void;
  /** `persist: false` applies the mute for this page only (the embed host's setting). */
  setMuted(muted: boolean, persist?: boolean): void;
  readonly unlocked: boolean;
  dispose(): void;
}

export interface AudioOptions {
  /** Start muted (overrides the stored preference). */
  muted?: boolean;
  /** Persist the mute flag in localStorage. Default true. */
  persist?: boolean;
}

const MUTE_KEY = 'catnip-heist.muted';

/** The authored mix: bus gains before any player or host setting. */
export const HEIST_SFX_VOLUME = 0.9;
export const HEIST_MUSIC_VOLUME = 0.45;

type Ctx = AudioContext;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeMuted(m: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function createAudio(opts: AudioOptions = {}): HeistAudio {
  const persist = opts.persist !== false;
  let muted = opts.muted ?? (persist ? readMuted() : false);
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let sfxVol = HEIST_SFX_VOLUME;
  let musicVol = HEIST_MUSIC_VOLUME;
  let wantMusic = false;
  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let nextStepTime = 0;
  let step = 0;
  let loopCount = 0;
  let lastStepSfx = 0;
  const track: MusicTrack = MUSIC;

  function ensure(): Ctx | null {
    if (ctx) return ctx;
    const AC: typeof AudioContext | undefined =
      typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!AC) return null;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxVol;
    musicBus = ctx.createGain();
    musicBus.gain.value = musicVol;
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 1);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      d[i] = ((seed >>> 0) / 4294967295) * 2 - 1;
    }
    return ctx;
  }

  // ---- primitives -----------------------------------------------------------------------------
  function env(g: GainNode, t: number, peak: number, attack: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest: AudioNode, attack = 0.005) {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    env(g, t, peak, attack, dur);
    o.connect(g).connect(dest);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  /**
   * One persistent filter per (destination, type, frequency, Q) for bursts whose filter does not
   * sweep: footsteps and the drum loop fire several times a second, and this saves a node each.
   * Keyed per destination node, so a new AudioContext starts with an empty cache.
   */
  const staticFilters = new WeakMap<AudioNode, Map<string, BiquadFilterNode>>();
  function staticFilter(dest: AudioNode, type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
    let byKey = staticFilters.get(dest);
    if (!byKey) staticFilters.set(dest, (byKey = new Map()));
    const key = `${type}|${freq}|${q}`;
    let f = byKey.get(key);
    if (!f) {
      f = ctx!.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      f.connect(dest);
      byKey.set(key, f);
    }
    return f;
  }

  function noiseBurst(t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, q: number, dest: AudioNode, freqEnd?: number) {
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + ((t * 997) % 1) * 0.4;
    const g = c.createGain();
    env(g, t, peak, 0.002, dur);
    let f: BiquadFilterNode | null = null;
    if (freqEnd) {
      // Swept filter: its own node, before the envelope.
      f = c.createBiquadFilter();
      f.type = filter;
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      f.Q.value = q;
      src.connect(f).connect(g).connect(dest);
    } else {
      // Fixed filter: shared, after the envelope (the envelope is slow next to the filter, so the
      // order makes no audible difference).
      src.connect(g).connect(staticFilter(dest, filter, freq, q));
    }
    src.onended = () => {
      src.disconnect();
      f?.disconnect();
      g.disconnect();
    };
    const off = ((t * 7919) % 0.8) || 0;
    src.start(t, off, dur + 0.05);
  }

  // ---- sound effects --------------------------------------------------------------------------
  const SFX: Record<SfxName, (t: number, out: AudioNode) => void> = {
    step(t, out) {
      noiseBurst(t, 0.035, 0.07, 'bandpass', 2200, 1.4, out);
      tone('sine', 180, 120, t, 0.03, 0.03, out);
    },
    coin(t, out) {
      tone('square', 988, 988, t, 0.07, 0.09, out);
      tone('square', 1319, 1319, t + 0.07, 0.2, 0.09, out);
      tone('sine', 2637, 2637, t + 0.07, 0.18, 0.03, out);
    },
    key(t, out) {
      [1047, 1319, 1568, 2093].forEach((f, i) => tone('triangle', f, f, t + i * 0.055, 0.22, 0.14, out));
      tone('sine', 4186, 4186, t + 0.22, 0.35, 0.03, out);
    },
    meow(t, out) {
      const c = ctx!;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(480, t);
      o.frequency.exponentialRampToValueAtTime(820, t + 0.13);
      o.frequency.exponentialRampToValueAtTime(560, t + 0.34);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.52);
      const vib = c.createOscillator();
      vib.frequency.value = 7;
      const vg = c.createGain();
      vg.gain.value = 14;
      vib.connect(vg).connect(o.frequency);
      const f1 = c.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 5;
      f1.frequency.setValueAtTime(900, t);
      f1.frequency.exponentialRampToValueAtTime(1900, t + 0.15);
      f1.frequency.exponentialRampToValueAtTime(1100, t + 0.5);
      const f2 = c.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 8;
      f2.frequency.setValueAtTime(2600, t);
      f2.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.06);
      g.gain.setValueAtTime(0.5, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.56);
      const g2 = c.createGain();
      g2.gain.value = 0.35;
      o.connect(f1).connect(g);
      o.connect(f2).connect(g2).connect(g);
      g.connect(out);
      o.start(t);
      vib.start(t);
      o.stop(t + 0.6);
      vib.stop(t + 0.6);
    },
    alarm(t, out) {
      const c = ctx!;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.connect(out);
      for (let i = 0; i < 4; i++) tone('square', i % 2 ? 660 : 880, i % 2 ? 640 : 900, t + i * 0.12, 0.11, 0.08, lp, 0.004);
      tone('sawtooth', 110, 90, t, 0.45, 0.05, lp);
    },
    door(t, out) {
      noiseBurst(t, 0.28, 0.16, 'lowpass', 900, 0.7, out, 180);
      tone('sine', 110, 48, t, 0.26, 0.28, out);
      tone('square', 220, 200, t + 0.02, 0.05, 0.03, out);
    },
    win(t, out) {
      const notes = [67, 72, 76, 79, 76, 79, 84];
      const dur = [0.1, 0.1, 0.1, 0.18, 0.1, 0.1, 0.5];
      let tt = t;
      notes.forEach((m, i) => {
        tone('square', midiHz(m), midiHz(m), tt, dur[i] + 0.04, 0.08, out);
        tone('triangle', midiHz(m - 12), midiHz(m - 12), tt, dur[i] + 0.04, 0.12, out);
        tt += dur[i];
      });
      tone('triangle', midiHz(48), midiHz(48), tt - 0.5, 0.6, 0.18, out);
    },
    swap(t, out) {
      tone('sine', 380, 920, t, 0.12, 0.14, out);
      tone('triangle', 760, 1500, t + 0.03, 0.1, 0.05, out);
      noiseBurst(t, 0.09, 0.04, 'highpass', 3000, 0.5, out);
    },
    rescue(t, out) {
      [60, 64, 67, 72, 76, 79].forEach((m, i) => {
        tone('triangle', midiHz(m), midiHz(m), t + i * 0.07, 0.3, 0.13, out);
        tone('square', midiHz(m + 12), midiHz(m + 12), t + i * 0.07 + 0.035, 0.08, 0.025, out);
      });
      SFX.meow(t + 0.5, out);
    },
    click(t, out) {
      tone('square', 1400, 1100, t, 0.025, 0.04, out, 0.001);
    },
    // Sentry turn telegraph: a soft rising two-note "tick-tock" about 0.8 s before the turn.
    sentry(t, out) {
      tone('triangle', 660, 660, t, 0.07, 0.07, out, 0.003);
      tone('triangle', 880, 900, t + 0.16, 0.09, 0.08, out, 0.003);
      noiseBurst(t + 0.16, 0.03, 0.03, 'highpass', 3000, 0.8, out);
    },
  };

  function play(name: SfxName) {
    if (muted || !ctx || ctx.state !== 'running' || !sfxBus) return;
    const t = ctx.currentTime + 0.005;
    if (name === 'step') {
      if (t - lastStepSfx < 0.11) return;
      lastStepSfx = t;
    }
    try {
      SFX[name](t, sfxBus);
    } catch {
      /* never let audio break the game */
    }
  }

  // ---- music ----------------------------------------------------------------------------------
  function scheduleStep(t: number, s: number) {
    const out = musicBus!;
    const stepDur = 60 / track.bpm / 4;
    const bass = track.bass[s];
    if (bass !== null) tone('triangle', midiHz(bass), midiHz(bass), t, stepDur * 1.6, 0.34, out, 0.004);
    const leadArr = loopCount % 2 === 1 && track.leadB ? track.leadB : track.lead;
    const lead = leadArr[s];
    if (lead !== null) {
      const len = holdLength(leadArr, s) * stepDur;
      tone('square', midiHz(lead), midiHz(lead), t, Math.min(len, stepDur * 3) * 0.9, 0.05, out, 0.004);
      tone('triangle', midiHz(lead + 12), midiHz(lead + 12), t, stepDur * 0.7, 0.025, out, 0.002);
    }
    const inBar = s % 16;
    if (inBar === 0 || inBar === 8 || (inBar === 11 && loopCount % 2 === 1)) tone('sine', 140, 45, t, 0.12, 0.35, out, 0.002);
    if (inBar === 4 || inBar === 12) noiseBurst(t, 0.09, 0.08, 'bandpass', 1800, 0.8, out);
    if (inBar % 4 === 2) noiseBurst(t, 0.03, 0.05, 'highpass', 7000, 0.7, out);
    if (inBar % 2 === 1 && loopCount > 0) noiseBurst(t, 0.015, 0.018, 'highpass', 9000, 0.7, out);
  }

  function holdLength(arr: (number | null)[], s: number): number {
    let n = 1;
    while (n < 4 && arr[(s + n) % arr.length] === null) n++;
    return n;
  }

  function pump() {
    if (!ctx || !musicBus) return;
    const stepDur = 60 / track.bpm / 4;
    const horizon = ctx.currentTime + 0.14;
    if (nextStepTime < ctx.currentTime - 0.2) nextStepTime = ctx.currentTime + 0.05;
    while (nextStepTime < horizon) {
      if (!muted) scheduleStep(nextStepTime, step);
      nextStepTime += stepDur;
      step++;
      if (step >= track.bass.length) {
        step = 0;
        loopCount++;
      }
    }
  }

  function startLoop() {
    if (musicTimer || !ctx || ctx.state !== 'running') return;
    nextStepTime = ctx.currentTime + 0.08;
    step = 0;
    loopCount = 0;
    musicBus!.gain.cancelScheduledValues(ctx.currentTime);
    musicBus!.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicBus!.gain.exponentialRampToValueAtTime(Math.max(0.0002, musicVol), ctx.currentTime + 0.8);
    musicTimer = setInterval(pump, 25);
    pump();
  }

  function stopLoop() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    if (ctx && musicBus) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    }
  }

  const onVisibility = () => {
    if (!ctx) return;
    if (document.hidden) {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      ctx.suspend().catch(() => undefined);
    } else {
      ctx.resume().then(() => wantMusic && startLoop(), () => undefined);
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  const api: HeistAudio = {
    get unlocked() {
      return !!ctx && ctx.state === 'running';
    },
    unlock() {
      const c = ensure();
      if (!c) return;
      if (c.state !== 'running') {
        c.resume().then(() => wantMusic && startLoop(), () => undefined);
      } else if (wantMusic) startLoop();
    },
    play,
    playEvents(events) {
      for (const e of events) {
        switch (e.type) {
          case 'COIN': play('coin'); break;
          case 'KEY': play('key'); break;
          case 'SPOTTED': play('alarm'); break;
          case 'DOOR': play('door'); break;
          case 'MEOW': play('meow'); break;
          case 'SWAP': play('swap'); break;
          case 'RESCUE': play('rescue'); break;
          case 'WIN': play('win'); break;
          case 'STEP': play('step'); break;
          case 'PLATE':
          case 'CHECKPOINT': play('click'); break;
          default: break;
        }
      }
    },
    startMusic() {
      wantMusic = true;
      startLoop();
    },
    stopMusic() {
      wantMusic = false;
      stopLoop();
    },
    setMuted(m, persistThis = true) {
      muted = m;
      if (persist && persistThis) writeMuted(m);
      if (ctx && master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03);
      }
    },
    isMuted: () => muted,
    setVolume(s, m) {
      sfxVol = Math.max(0, Math.min(1, s));
      musicVol = Math.max(0, Math.min(1, m));
      if (ctx && sfxBus && musicBus) {
        sfxBus.gain.setTargetAtTime(sfxVol, ctx.currentTime, 0.05);
        if (musicTimer) musicBus.gain.setTargetAtTime(Math.max(0.0001, musicVol), ctx.currentTime, 0.05);
      }
    },
    dispose() {
      stopLoop();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
  return api;
}
