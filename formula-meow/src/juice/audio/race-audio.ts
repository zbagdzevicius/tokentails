/**
 * Race audio (GDD 10; iteration 2 audio-ui lane): the mixer, the engine purr, the adaptive music, every SFX cue, the
 * announcer and the UI sounds. A JuiceListener: it hears the race only through the JuiceBus and never writes the sim.
 * Audio unlocks on the first touch or key (iOS needs a gesture). WebAudio synth only, no files.
 *
 * Buses (each with its own volume from the settings): music → duck gain (the announcer ducks it) → pause low-pass →
 * master; sfx (race cues and UI sounds); engine; voice (the announcer, through a PA chain). All into a compressor.
 *
 * Scenes: `race` (the default, driven by race events), `menu` (the lounge loop; the engine is silent, race cues are
 * not played), `podium` (fanfare, then the winners' loop). The audio-ui install switches scenes from the screen stack.
 *
 * One voice budget (24) covers cues, music notes, announcer lines and UI sounds; `budget.peak` is exposed for QA.
 */
import type { ItemId, RaceEvent } from '../../types';
import type { FrameInfo, JuiceListener } from '../bus';
import { EngineVoice } from './engine';
import { Music, SONG } from './music';
import { cueLength, cuesFor, incomingCue, incomingInterval, playCue, VoiceBudget, type Cue } from './sfx';
import { makeNoise, type SynthGraph } from './synth';
import { AnnouncerLogic, FINISH_LINES, LOW_LINES, lineLength, playLine, type AnnounceId } from './announcer';
import { TunnelAudio } from './tunnel';
import { playUi, uiSoundSpec, type UiSoundId } from './stings';

export interface Mixer {
  master: number;
  music: number;
  sfx: number;
  engine: number;
  /** the announcer */
  voice: number;
}

export type AudioScene = 'race' | 'menu' | 'podium';

/** An item flying at the player (from the HUD feed): kind 0 hairball, 1 yarn, 2 laser; seconds to impact. */
export interface IncomingSound {
  kind: number;
  eta: number;
}

const MASTER = 0.8;
const MUSIC = 0.32;
const SFX = 0.9;
const ENGINE = 0.9;
const VOICE = 1.1;
/** music level while the announcer speaks */
const DUCK = 0.38;

/**
 * A context that should be resumed: anything but running or closed. WebKit on iOS reports the non-standard
 * 'interrupted' after an audio-session interruption (a call, Siri, another app's audio); it must resume like 'suspended'.
 */
export function audioResumable(state: string): boolean {
  return state !== 'running' && state !== 'closed';
}

export class RaceAudio implements JuiceListener {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: { music: GainNode; sfx: GainNode; engine: GainNode; voice: GainNode; duck: GainNode } | null = null;
  private pauseLp: BiquadFilterNode | null = null;
  /** iteration 3: the tunnel's low-pass, slap-back echo and engine lift */
  private tunnel: TunnelAudio | null = null;
  private tunnelWanted = false;
  private engine: EngineVoice | null = null;
  private music: Music | null = null;
  private graph: SynthGraph | null = null;
  private voiceGraph: SynthGraph | null = null;
  readonly budget = new VoiceBudget(24);
  readonly announcer = new AnnouncerLogic();
  private finalLap = false;
  private finished = false;
  private pausedNow = false;
  private scene: AudioScene = 'race';
  private raceLive = false;
  /** each kart's last used item (the per-item hit sounds) */
  private readonly lastItem = new Map<number, ItemId>();
  private incoming: IncomingSound | null = null;
  private nextBeep = 0;
  private lastLineEnd = 0;
  /** iteration 4 (juice lane): the final-lap duel tension and ON FIRE (music), the slipstream whoosh voice */
  private tension = 0;
  private fire = false;
  private slip: { src: AudioBufferSourceNode; bp: BiquadFilterNode; gain: GainNode } | null = null;
  private slipLevel = 0;
  private slipHeld = 0;
  muted = false;
  mixer: Mixer = { master: 1, music: 1, sfx: 1, engine: 1, voice: 1 };
  /** the song for the current race (set by the juice install: the track's music or theme) */
  songOf: () => number = () => 0;
  /** the race mode (battle changes the finish lines) */
  modeOf: () => string = () => 'race';
  /** every announcer line, even while muted (captions) */
  onLine: ((id: AnnounceId) => void) | null = null;

  /** Call from a user gesture (GDD 10: audio unlocks on the first touch). Safe to call many times. */
  unlock(): void {
    if (this.ctx) {
      if (audioResumable(this.ctx.state) && !(typeof document !== 'undefined' && document.hidden)) void this.ctx.resume().catch(() => undefined);
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
    // the music: its level → the announcer duck → a low-pass that closes while paused
    this.pauseLp = ctx.createBiquadFilter();
    this.pauseLp.type = 'lowpass';
    this.pauseLp.frequency.value = Math.min(20000, ctx.sampleRate / 2);
    this.pauseLp.connect(this.master);
    const duck = ctx.createGain();
    duck.gain.value = 1;
    // the tunnel low-pass sits between the duck and the pause low-pass; its echo returns to the master
    this.tunnel = new TunnelAudio(ctx, this.master);
    duck.connect(this.tunnel.lp);
    this.tunnel.lp.connect(this.pauseLp);
    const music = ctx.createGain();
    music.gain.value = MUSIC * this.mixer.music;
    music.connect(duck);
    const sfx = ctx.createGain();
    sfx.gain.value = SFX * this.mixer.sfx;
    sfx.connect(this.master);
    const engine = ctx.createGain();
    engine.gain.value = ENGINE * this.mixer.engine;
    engine.connect(this.master);
    sfx.connect(this.tunnel.send);
    engine.connect(this.tunnel.send);
    // the announcer's PA: band-limited, a presence lift and a gentle saturation (it reads as "a voice on a speaker")
    const voice = ctx.createGain();
    voice.gain.value = VOICE * this.mixer.voice;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 1900;
    presence.gain.value = 5;
    presence.Q.value = 0.9;
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8);
    }
    sat.curve = curve;
    const pre = ctx.createGain();
    pre.connect(hp).connect(presence).connect(sat).connect(voice).connect(this.master);
    this.buses = { music, sfx, engine, voice, duck };
    const noiseBuf = makeNoise(ctx, 2);
    this.graph = { ctx, out: sfx, noise: noiseBuf };
    this.voiceGraph = { ctx, out: pre, noise: noiseBuf };
    if (this.tunnelWanted) {
      this.tunnel.set(true);
      engine.gain.value = ENGINE * this.mixer.engine * this.tunnel.engineTrim;
    }
    this.engine = new EngineVoice(ctx, engine, noiseBuf);
    // iteration 4: the slipstream's rising whoosh, one looping noise voice that only sounds while a draft charges
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(sfx);
      src.start();
      this.slip = { src, bp, gain };
    } catch {
      this.slip = null;
    }
    this.music = new Music(ctx, music, noiseBuf, this.budget);
    if (this.scene === 'menu') this.music.menu(SONG.menu);
    else if (this.scene === 'podium') {
      this.music.setSong(SONG.menu);
      this.music.results(true);
    } else {
      this.music.setSong(this.songOf());
      if (this.raceLive) this.music.go();
      else this.music.pre();
    }
  }

  /** B34: a hidden tab is silent (the shell calls this on visibilitychange). */
  suspend(): void {
    // an interrupted (WebKit) context is suspended too, so it does not start playing in a hidden tab when the interruption ends
    if (this.ctx && (this.ctx.state as string) !== 'suspended' && this.ctx.state !== 'closed') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && audioResumable(this.ctx.state) && !(typeof document !== 'undefined' && document.hidden)) void this.ctx.resume().catch(() => undefined);
  }

  /** true once the audio context exists and runs (QA). */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER * this.mixer.master, this.ctx.currentTime, 0.05);
  }

  setMixer(m: Partial<Mixer>): void {
    Object.assign(this.mixer, m);
    if (!this.ctx || !this.buses) return;
    const t = this.ctx.currentTime;
    this.buses.music.gain.setTargetAtTime(MUSIC * this.mixer.music, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(SFX * this.mixer.sfx, t, 0.05);
    this.buses.engine.gain.setTargetAtTime(ENGINE * this.mixer.engine * (this.tunnel?.engineTrim ?? 1), t, 0.05);
    this.buses.voice.gain.setTargetAtTime(VOICE * this.mixer.voice, t, 0.05);
    this.setMuted(this.muted);
  }

  /** Switch what the music plays (the audio-ui install calls this from the screen stack). */
  setScene(s: AudioScene): void {
    if (s === this.scene) return;
    const prev = this.scene;
    this.scene = s;
    if (!this.music) return;
    if (s === 'menu') {
      this.engine?.silence();
      this.music.menu(SONG.menu);
    } else if (s === 'podium') {
      this.engine?.silence();
      this.ui('podium');
      this.music.setSong(SONG.menu);
      this.music.results(true);
    } else if (prev !== 'race') {
      // back to a race: its own song, on the countdown drone or straight into the band
      this.music.setSong(this.songOf());
      if (this.finished) this.music.results(false);
      else if (this.raceLive) this.music.go();
      else this.music.pre();
    }
  }

  get currentScene(): AudioScene {
    return this.scene;
  }

  /** The music state (QA, e2e): scene, music mode and the song playing. */
  get state(): { scene: AudioScene; mode: string; song: string; peak: number; active: number } {
    return { scene: this.scene, mode: this.music?.currentMode ?? 'off', song: this.music?.songName ?? '', peak: this.budget.peak, active: this.budget.active };
  }

  /** A UI sound (menus, toggles, the results stamp, stingers). */
  ui(id: UiSoundId, n = 0): void {
    const g = this.graph;
    if (!g || !this.ctx || this.muted || this.ctx.state !== 'running') return;
    const spec = uiSoundSpec(id);
    const now = this.ctx.currentTime;
    if (!this.budget.admit(now, spec.prio, spec.len)) return;
    try {
      playUi(g, id, now + 0.005, n);
    } catch {
      /* never break a menu over a sound */
    }
  }

  /** Play a race cue directly (the HUD feed: split chimes, battle timer). */
  cue(c: Cue): void {
    const g = this.graph;
    if (!g || !this.ctx || this.muted || this.scene !== 'race') return;
    const now = this.ctx.currentTime;
    if (!this.budget.admit(now, c.prio, cueLength(c.id))) return;
    try {
      playCue(g, c, now + 0.005);
    } catch {
      /* ignored */
    }
  }

  /**
   * Iteration 3: in or out of a tunnel (the juice install reads the tunnel mask under the player). The music closes
   * to a low-pass, the sfx and engine get a short echo, the engine comes up 3 dB, a whoosh marks each portal, and the
   * announcer calls the first tunnel of the race.
   */
  setTunnel(on: boolean, tick = 0): void {
    this.tunnelWanted = on;
    const tn = this.tunnel;
    if (!tn || !tn.set(on)) return;
    if (this.ctx && this.buses) this.buses.engine.gain.setTargetAtTime(ENGINE * this.mixer.engine * tn.engineTrim, this.ctx.currentTime, 0.08);
    if (this.scene !== 'race') return;
    this.cue({ id: on ? 'tunnelIn' : 'tunnelOut', prio: 1, n: 0, pitch: 1, delay: 0, vol: 1 });
    if (on) {
      const line = this.announcer.onTunnel(tick);
      if (line) this.announce(line);
    }
  }

  /** The tunnel state (QA, e2e): inside, and the music low-pass target. */
  get tunnelState(): { inside: boolean; wanted: boolean } {
    return { inside: !!this.tunnel?.inside, wanted: this.tunnelWanted };
  }

  /**
   * Iteration 4 (juice lane, F5): the slipstream charge 0..1 (0 = none). The whoosh rises in pitch and level as the
   * draft fills; it holds one voice of the budget while it sounds and gives way when the voices are busy.
   */
  setSlip(frac: number): void {
    const s = this.slip;
    if (!s || !this.ctx) return;
    const now = this.ctx.currentTime;
    let want = this.scene === 'race' && !this.muted ? Math.max(0, Math.min(1, frac)) : 0;
    if (want > 0.02 && now >= this.slipHeld) {
      if (this.budget.admit(now, 1, 0.25)) this.slipHeld = now + 0.2;
      else want = 0;
    }
    if (Math.abs(want - this.slipLevel) < 0.01) return;
    this.slipLevel = want;
    s.gain.gain.setTargetAtTime(want * want * 0.22, now, 0.06);
    s.bp.frequency.setTargetAtTime(500 + 2600 * want, now, 0.08);
  }

  /** Iteration 4: the final-lap duel tension 0..1 (heartbeat) and ON FIRE (the lead layer). */
  setDuel(tension: number, fire: boolean): void {
    this.tension = tension;
    this.fire = fire;
  }

  /** Iteration 4: taking P1 on the final lap: the band drops out for one beat and slams back. */
  musicDrop(): void {
    if (this.scene === 'race') this.music?.drop();
  }

  /** The music tempo (QA, e2e). */
  get tempo(): number {
    return this.music?.tempo ?? 0;
  }

  /** Iteration 4: a panned race cue (a cat zipping past on the left or right). */
  cuePanned(c: Cue, pan: number): void {
    const g = this.graph;
    if (!g || !this.ctx || this.muted || this.scene !== 'race' || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (!this.budget.admit(now, c.prio, cueLength(c.id))) return;
    try {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(g.out);
      playCue({ ...g, out: p }, c, now + 0.005);
      setTimeout(() => p.disconnect(), 1000);
    } catch {
      /* ignored */
    }
  }

  /** An announcer line: captions always hear it; the voice plays on its bus and ducks the music. */
  announce(id: AnnounceId): void {
    this.onLine?.(id);
    const g = this.voiceGraph;
    if (!g || !this.ctx || this.muted || !this.buses || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const len = lineLength(id);
    // set-piece lines are flavour: they give way when the voices are busy
    if (!this.budget.admit(now, LOW_LINES.has(id) ? 2 : 3, len)) return;
    // never two lines on top of each other: a new one waits for the last to end (short ones only); a line about the
    // finish (photo finish, stolen at the line) waits for the finish line itself
    const t = Math.max(now + 0.01, this.lastLineEnd + 0.03);
    if (t - now > (FINISH_LINES.has(id) ? 1.3 : 0.6)) return;
    try {
      const end = playLine(g, id, t, 1);
      this.lastLineEnd = end;
      const d = this.buses.duck.gain;
      d.cancelScheduledValues(now);
      d.setTargetAtTime(DUCK, t - 0.02, 0.03);
      d.setTargetAtTime(1, end + 0.1, 0.15);
    } catch {
      /* ignored */
    }
  }

  /** Items flying at the player (HUD feed, every frame): the nearest one drives the beeper. */
  setIncoming(list: readonly IncomingSound[]): void {
    let best: IncomingSound | null = null;
    for (const x of list) if (!best || x.eta < best.eta) best = x;
    this.incoming = best && best.eta < 2.6 ? best : null;
  }

  onReset(): void {
    this.tension = 0;
    this.fire = false;
    this.setSlip(0);
    this.finalLap = false;
    this.finished = false;
    this.raceLive = false;
    this.lastItem.clear();
    this.incoming = null;
    this.announcer.reset();
    this.budget.clear();
    this.tunnelWanted = false;
    if (this.tunnel) {
      this.tunnel.reset();
      if (this.ctx && this.buses) this.buses.engine.gain.setTargetAtTime(ENGINE * this.mixer.engine, this.ctx.currentTime, 0.05);
    }
    if (this.music && this.scene === 'race') {
      this.music.setSong(this.songOf());
      this.music.pre();
    }
  }

  onEvent(e: RaceEvent, info: FrameInfo): void {
    const me = info.me;
    if (e.type === 'itemUse' && e.item) this.lastItem.set(e.kart, e.item);
    if (e.type === 'go') {
      this.raceLive = true;
      if (this.scene === 'race') this.music?.go();
    }
    if (e.type === 'countdown' && e.a === 3 && this.scene === 'race') this.music?.pre();
    // iteration 4 (F14): the battle frenzy speeds the band up
    if (e.type === 'frenzy' && this.scene === 'race') this.music?.frenzy();
    if (e.type === 'finalLap' && e.kart === me) {
      this.finalLap = true;
      if (this.scene === 'race') this.music?.finalLap();
    }
    if (e.type === 'finish' && e.kart === me) {
      this.finished = true;
      if (this.scene === 'race') this.music?.results((e.a ?? 8) <= 1);
    }
    if (this.scene !== 'race') return;
    const line = this.announcer.onEvent(e, me, this.modeOf());
    if (line) this.announce(line);
    const g = this.graph;
    if (!g || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const c of cuesFor(e, me, (k) => this.lastItem.get(k))) {
      if (c.near != null) {
        // a rival's sound: only within 30 m, quieter with distance
        const o = info.st.karts[c.near];
        const p = info.st.karts[me];
        if (!o || !p) continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d > 30) continue;
        c.vol *= 1 - d / 36;
      }
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
    const running = this.scene === 'race' && !info.paused && st.phase !== 'done' && !k.finished;
    this.engine.update(st.karts, info.me, info.topSpeed, running);
    if (!running && this.slipLevel > 0) this.setSlip(0);
    if (info.paused !== this.pausedNow && this.pauseLp) {
      this.pausedNow = info.paused;
      this.pauseLp.frequency.setTargetAtTime(info.paused ? 500 : Math.min(20000, this.ctx.sampleRate / 2), this.ctx.currentTime, 0.08);
    }
    if (this.music && !this.finished && this.scene === 'race') {
      const closing = this.finalLap && st.lapLength > 0 && k.s / st.lapLength > 0.82;
      this.music.setRace(k.place || 8, this.finalLap, closing, this.tension, this.fire);
    }
    // the incoming-item beeper: faster as it closes
    const inc = this.incoming;
    if (running && inc && this.graph && !this.muted) {
      const now = this.ctx.currentTime;
      if (now >= this.nextBeep) {
        const c = incomingCue(inc.kind, inc.eta);
        if (this.budget.admit(now, c.prio, cueLength(c.id))) {
          try {
            playCue(this.graph, c, now + 0.005);
          } catch {
            /* ignored */
          }
        }
        this.nextBeep = now + incomingInterval(inc.eta);
      }
    }
  }

  dispose(): void {
    try {
      this.slip?.src.stop();
    } catch {
      /* never started */
    }
    this.music?.dispose();
    this.engine?.dispose();
    void this.ctx?.close();
    this.ctx = null;
  }
}
