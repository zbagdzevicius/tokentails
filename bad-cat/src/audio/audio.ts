/**
 * L7 Audio engine (GDD 12). The AudioContext is created lazily inside unlock() (first user gesture, iOS);
 * before that every call is a silent no-op. Without WebAudio (Node, very old browsers) the engine stays a
 * no-op and never throws.
 *
 * Graph: voices -> sfxBus ┐
 *        music  -> musicBus ┴-> master -> limiter -> destination
 *        sfxBus -> MediaStreamAudioDestinationNode (captureStream, clip pass, unaffected by mute)
 */
import type { AudioEngine, ClipPlan, PlayableRoom, RoomTheme, SimEvent, SimState } from '../types';
import { MusicLoop, type MusicFlavor, type MusicStyle } from './music';
import {
  CRASH_CLASS,
  DEFAULT_ROOM_AUDIO,
  MAX_PER_TICK,
  MIN_GAP_S,
  cuesFor,
  cuesForContext,
  inSlowMo,
  liveTickCues,
  musicModeFor,
  roomAudioFor,
  snoreCues,
  tickToClipSeconds,
  type Cue,
  type CueContext,
  type LiveTickMemo,
  type RoomAudio,
} from './sfx-map';
import { SILENT, makeNoise, playCue, type SynthGraph } from './synth';
import { normalizeClip } from './loudness';

type Ctor<T> = new (...args: never[]) => T;

function audioContextCtor(): Ctor<AudioContext> | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor<AudioContext>; webkitAudioContext?: Ctor<AudioContext> };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function offlineCtor(): (new (channels: number, length: number, sampleRate: number) => OfflineAudioContext) | null {
  const g = globalThis as unknown as {
    OfflineAudioContext?: new (c: number, l: number, r: number) => OfflineAudioContext;
    webkitOfflineAudioContext?: new (c: number, l: number, r: number) => OfflineAudioContext;
  };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/** Extra engine methods beyond the frozen AudioEngine interface (optional for callers). */
export interface AudioEngineExtras {
  /** Tell the engine which room is playing (room event cue kind, prop kinds for the offline mix). */
  setRoom(play: PlayableRoom): void;
  readonly muted: boolean;
}

export type BadCatAudio = AudioEngine & AudioEngineExtras;

export interface OfflineMixOptions {
  /** Prop kinds by prop index (material lookup). */
  propKinds?: readonly number[];
  /** RoomEventKind for the event cue. */
  eventKind?: number;
  sampleRate?: number;
  channels?: number;
  /** v5 room context (personas, Napper, telegraph cues, theme). */
  room?: RoomAudio;
  /** Add the clip music sting under the SFX (W1-AUDIO). */
  music?: boolean;
  /** Theme for the sting's layers (xmas sleigh bells...); defaults to room.theme. */
  theme?: RoomTheme;
  /** Sting length in seconds (default CLIP_MUSIC_S). */
  musicSeconds?: number;
}

export interface ClipScheduleOptions {
  music?: boolean;
  theme?: RoomTheme;
  musicSeconds?: number;
}

/**
 * Clip music sting length. The clip is 12 s and the SFX buffer starts at clip time 2.0 s (the match cut), so the
 * sting covers the remaining 10 s: in at the match cut, out on the loop cut.
 */
export const CLIP_MUSIC_S = 10;
/** Sting level under the SFX (before the clip compressor), and its fades. */
export const CLIP_MUSIC_LEVEL = 0.5;
export const CLIP_MUSIC_FADE_IN = 0.25;
export const CLIP_MUSIC_FADE_OUT = 1.5;

export function musicStyleFor(room: RoomAudio | undefined): MusicStyle {
  if (!room) return 'jazz';
  if (room.boss) return 'boss';
  if (room.nappers.some(Boolean)) return 'lullaby';
  return 'jazz';
}

/** Cues of a clip window, in schedule order: SFX + offline snores, capped per tick. */
export function clipCues(events: readonly SimEvent[], fromTick: number, toTick: number, opts: OfflineMixOptions): Cue[] {
  const kinds = opts.propKinds ?? [];
  let stamp = 0;
  for (const e of events) if (e.t === 'caught') stamp = 3;
  const cueCtx: CueContext = { kindOf: (i) => kinds[i], stamp, eventKind: opts.eventKind ?? opts.room?.eventKind, room: opts.room, inferRoombaPause: true };
  const inWindow = events.filter((e) => e.tick >= fromTick && e.tick < toTick);
  const cues = cuesForContext(inWindow, cueCtx).filter((c) => c.tick >= fromTick && c.tick < toTick);
  for (const c of snoreCues(events, fromTick, toTick, opts.room)) cues.push(c);
  cues.sort((a, b) => a.tick - b.tick);
  return limitPerTick(cues);
}

/** Schedule clip cues on a graph with time 0 of the clip window at context time `t0`. */
function scheduleCues(g: SynthGraph, cues: readonly Cue[], fromTick: number, slowMo: ClipPlan['slowMo'] | undefined, t0: number): number[] {
  const crashAt: number[] = [];
  for (const c of cues) {
    const slow = inSlowMo(c.tick, slowMo);
    const at = t0 + tickToClipSeconds(c.tick, fromTick, slowMo);
    const cc = slow ? { ...c, pitch: c.pitch - 3, delay: c.delay / (slowMo?.speed || 1) } : c;
    if (CRASH_CLASS.includes(c.id)) crashAt.push(at + cc.delay);
    try {
      playCue(g, cc, at);
    } catch {
      /* one bad voice never kills the mix */
    }
  }
  return crashAt;
}

/**
 * The clip music sting: the room's loop (boss / lullaby / jazz + theme layer) from t0 for `seconds`, sneaky
 * until the first crash, then the full band; fades in and out and ducks ~6 dB under every crash.
 */
function scheduleSting(g: SynthGraph, t0: number, seconds: number, flavor: MusicFlavor, crashAt: readonly number[]): void {
  const { ctx } = g;
  const t1 = t0 + seconds;
  const fade = ctx.createGain();
  const lv = CLIP_MUSIC_LEVEL;
  fade.gain.value = SILENT;
  fade.gain.setValueAtTime(SILENT, t0);
  fade.gain.exponentialRampToValueAtTime(lv, t0 + CLIP_MUSIC_FADE_IN);
  fade.gain.setValueAtTime(lv, Math.max(t0 + CLIP_MUSIC_FADE_IN + 0.01, t1 - CLIP_MUSIC_FADE_OUT));
  fade.gain.exponentialRampToValueAtTime(SILENT, t1);
  fade.connect(g.out);
  const duck = ctx.createGain();
  duck.gain.setValueAtTime(1, t0);
  let free = t0;
  for (const tc of [...crashAt].sort((a, b) => a - b)) {
    if (tc - 0.03 < free || tc > t1) continue;
    duck.gain.setValueAtTime(1, tc - 0.03);
    duck.gain.linearRampToValueAtTime(0.5, tc);
    duck.gain.setValueAtTime(0.5, tc + 0.35);
    duck.gain.linearRampToValueAtTime(1, tc + 0.85);
    free = tc + 0.85;
  }
  duck.connect(fade);
  const loop = new MusicLoop(ctx, duck, g.noise, g.track);
  loop.setFlavor(flavor);
  const first = crashAt.length ? Math.min(...crashAt) : t0 + seconds * 0.4;
  loop.scheduleSpan(t0, t1, 'sneaky', Math.max(t0, first - 0.6));
}

/** Build the master chain on a context: master gain -> soft limiter -> destination. */
function masterChain(ctx: BaseAudioContext): { master: GainNode; sfx: GainNode; music: GainNode } {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(limiter);
  const sfx = ctx.createGain();
  sfx.connect(master);
  const music = ctx.createGain();
  music.connect(master);
  return { master, sfx, music };
}

/**
 * Clip bus (round 3): sfx → compressor (3:1 above -18 dB) → makeup gain → limiter (-1 dB) → destination. The
 * rendered buffer is then normalised to -14 LUFS with a -1 dBFS look-ahead limiter (loudness.ts).
 */
function clipChain(ctx: BaseAudioContext, dest: AudioNode): { sfx: GainNode; head: AudioNode } {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.connect(dest);
  const makeup = ctx.createGain();
  makeup.gain.value = CLIP_MAKEUP_GAIN;
  makeup.connect(limiter);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 6;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  comp.connect(makeup);
  const sfx = ctx.createGain();
  sfx.connect(comp);
  return { sfx, head: limiter };
}
/** +6 dB before the limiter; the exact -14 LUFS comes from normalizeClip on the rendered buffer. */
export const CLIP_MAKEUP_GAIN = 2;

/**
 * Render the SFX of an event list into an AudioBuffer (clip mix, GDD 7.3/12: SFX only, the crash and the
 * sting). Time 0 = fromTick; the slow-motion window stretches time by 1/speed and pitches cues down slightly.
 * Returns null without OfflineAudioContext.
 */
export async function renderEventsOffline(
  events: readonly SimEvent[],
  fromTick: number,
  toTick: number,
  slowMo?: ClipPlan['slowMo'],
  opts: OfflineMixOptions = {},
): Promise<AudioBuffer | null> {
  const Off = offlineCtor();
  if (!Off || !(toTick > fromTick)) return null;
  const rate = opts.sampleRate ?? 48000;
  const sfxSeconds = Math.max(0.1, tickToClipSeconds(toTick, fromTick, slowMo));
  const musicSeconds = opts.music ? Math.max(1, opts.musicSeconds ?? CLIP_MUSIC_S) : 0;
  const seconds = Math.max(sfxSeconds, musicSeconds);
  let ctx: OfflineAudioContext;
  try {
    ctx = new Off(opts.channels ?? 2, Math.ceil(seconds * rate), rate);
  } catch {
    return null;
  }
  const { sfx } = clipChain(ctx, ctx.destination);
  const g: SynthGraph = { ctx, out: sfx, noise: makeNoise(ctx) };
  const crashAt = scheduleCues(g, clipCues(events, fromTick, toTick, opts), fromTick, slowMo, 0);
  if (musicSeconds > 0) {
    try {
      const flavor: MusicFlavor = { style: musicStyleFor(opts.room), theme: opts.theme ?? opts.room?.theme };
      scheduleSting(g, 0, musicSeconds, flavor, crashAt);
    } catch {
      /* the sting is optional: the SFX mix still ships */
    }
  }
  let buf: AudioBuffer;
  try {
    const res = (ctx.startRendering as () => Promise<AudioBuffer> | undefined)();
    if (res && typeof (res as Promise<AudioBuffer>).then === 'function') buf = await res;
    else
      buf = await new Promise<AudioBuffer>((resolve) => {
        ctx.oncomplete = (ev) => resolve(ev.renderedBuffer);
      });
  } catch {
    return null;
  }
  try {
    const chans: Float32Array[] = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    normalizeClip(chans, buf.sampleRate);
  } catch {
    /* loudness is polish: the raw mix still ships */
  }
  return buf;
}

/** Drop cues beyond MAX_PER_TICK per (tick, id): a domino cascade stays a crash, not a wall of noise. */
export function limitPerTick(cues: readonly Cue[]): Cue[] {
  const counts = new Map<string, number>();
  const out: Cue[] = [];
  for (const c of cues) {
    const cap = MAX_PER_TICK[c.id];
    if (cap !== undefined) {
      const key = c.tick + ':' + c.id;
      const n = counts.get(key) ?? 0;
      if (n >= cap) continue;
      counts.set(key, n + 1);
    }
    out.push(c);
  }
  return out;
}

export function createAudio(): BadCatAudio {
  let ctx: AudioContext | null = null;
  let graph: SynthGraph | null = null;
  let buses: { master: GainNode; sfx: GainNode; music: GainNode } | null = null;
  let music: MusicLoop | null = null;
  let streamDest: MediaStreamAudioDestinationNode | null = null;
  let unlocked = false;
  let unlocking: Promise<void> | null = null;
  let muted = false;
  let musicOn = false;
  let disposed = false;
  let vol = { master: 0.9, music: 0.6, sfx: 1 };
  let propKinds: number[] = [];
  let lastProps: unknown = null;
  let eventKind = 0;
  let room: RoomAudio = DEFAULT_ROOM_AUDIO;
  const tickMemo: LiveTickMemo = { roombaPause: 0 };
  const clipCancels = new Set<() => void>();
  const lastPlayed = new Map<string, number>();
  let visHandler: (() => void) | null = null;

  const now = (): number => (ctx ? ctx.currentTime : 0);

  function applyMaster(): void {
    if (!ctx || !buses) return;
    const t = ctx.currentTime;
    buses.master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.02);
    buses.music.gain.setTargetAtTime(vol.music, t, 0.05);
    buses.sfx.gain.setTargetAtTime(vol.sfx, t, 0.02);
  }

  function syncMusic(): void {
    if (!music) return;
    if (musicOn && unlocked && !muted && !disposed) music.start();
    else music.stop();
  }

  function play(c: Cue, when?: number): void {
    if (!graph || !ctx) return;
    const t = when ?? ctx.currentTime;
    const gap = MIN_GAP_S[c.id];
    if (gap !== undefined) {
      const last = lastPlayed.get(c.id);
      if (last !== undefined && t + c.delay - last < gap) return;
      lastPlayed.set(c.id, t + c.delay);
    }
    try {
      playCue(graph, c, t);
    } catch {
      /* never let a voice throw into the game loop */
    }
  }

  async function doUnlock(): Promise<void> {
    if (disposed) return;
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    try {
      if (!ctx) {
        ctx = new (Ctor as unknown as new (o?: AudioContextOptions) => AudioContext)({ latencyHint: 'interactive' });
        buses = masterChain(ctx);
        graph = { ctx, out: buses.sfx, noise: makeNoise(ctx) };
        music = new MusicLoop(ctx, buses.music, graph.noise);
        music.setFlavor({ style: musicStyleFor(room), theme: room.theme });
        applyMaster();
        // iOS: a one-sample silent buffer inside the gesture fully unlocks output
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
        if (typeof document !== 'undefined') {
          visHandler = () => {
            if (!ctx) return;
            if (document.hidden) void ctx.suspend().catch(() => undefined);
            else if (unlocked) void ctx.resume().catch(() => undefined);
          };
          document.addEventListener('visibilitychange', visHandler);
        }
      }
      if (ctx.state !== 'running') await ctx.resume();
      // Some WebKit builds still report 'suspended' right after resume() resolves; the gesture did its job.
      unlocked = true;
      syncMusic();
    } catch {
      unlocked = false;
    }
  }

  const engine: BadCatAudio = {
    get unlocked() {
      return unlocked;
    },
    get muted() {
      return muted;
    },
    unlock() {
      if (unlocked && ctx && ctx.state === 'running') return Promise.resolve();
      // iOS: resume() only counts inside a real gesture, and an earlier non-gesture resume() can stay pending.
      // Call it on every gesture, even while an unlock is in flight.
      if (unlocking && ctx && ctx.state !== 'running') {
        try {
          void ctx.resume().catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
      if (!unlocking) unlocking = doUnlock().finally(() => (unlocking = null));
      return unlocking;
    },
    onEvents(events: readonly SimEvent[], s: SimState) {
      if (s.props !== lastProps) {
        lastProps = s.props;
        propKinds = s.props.map((p) => p.kind);
      }
      if (!unlocked || !graph || !ctx || disposed) return;
      if (music) {
        music.setMode(musicModeFor(s));
        for (const e of events) if (e.t === 'human' && e.state === 'telegraph') music.duck(0.8, 0.3);
      }
      const extra = liveTickCues(s, room, tickMemo);
      if (muted || (events.length === 0 && extra.length === 0)) return;
      const t = now();
      for (const c of limitPerTick(cuesFor(events, s, { eventKind, room }))) play(c, t);
      for (const c of extra) play(c, t);
    },
    setMusic(on: boolean) {
      musicOn = on;
      syncMusic();
    },
    stinger(kind) {
      if (!unlocked || muted) return;
      const id = kind === 'perfect' ? 'perfect' : kind === 'caught' ? 'caught' : kind === 'go' ? 'go' : 'stamp';
      play({ id, tick: 0, delay: 0, pitch: 0, gain: 1, variant: 0 });
    },
    setVolumes(v) {
      vol = {
        master: clamp01(v.master ?? vol.master),
        music: clamp01(v.music ?? vol.music),
        sfx: clamp01(v.sfx ?? vol.sfx),
      };
      applyMaster();
    },
    setMuted(m: boolean) {
      muted = m;
      applyMaster();
      syncMusic();
    },
    captureStream() {
      if (!ctx || !buses) return null;
      try {
        if (!streamDest) {
          streamDest = ctx.createMediaStreamDestination();
          buses.sfx.connect(streamDest);
        }
        return streamDest.stream;
      } catch {
        return null;
      }
    },
    renderOffline(events, fromTick, toTick, slowMo) {
      return renderEventsOffline(events, fromTick, toTick, slowMo, { propKinds, eventKind, room }).catch(() => null);
    },
    renderClipMix(events, fromTick, toTick, slowMo, opts) {
      return renderEventsOffline(events, fromTick, toTick, slowMo, {
        propKinds,
        eventKind,
        room,
        music: !!opts?.music,
        theme: opts?.theme,
        musicSeconds: (opts as ClipScheduleOptions | undefined)?.musicSeconds,
      }).catch(() => null);
    },
    scheduleClip(events, fromTick, toTick, slowMo, startAt, opts) {
      const noop = (): void => undefined;
      if (!ctx || !buses || disposed || !(toTick > fromTick) || !Number.isFinite(startAt)) return noop;
      const c = ctx;
      try {
        if (!streamDest) {
          streamDest = c.createMediaStreamDestination();
          buses.sfx.connect(streamDest);
        }
        // the clip goes only to the recorder (the clip chain, like the offline mix), never to the speakers
        const chain = clipChain(c, streamDest);
        const sources: AudioScheduledSourceNode[] = [];
        const g: SynthGraph = { ctx: c, out: chain.sfx, noise: graph?.noise ?? makeNoise(c), track: (n) => sources.push(n) };
        const t0 = Math.max(startAt, c.currentTime);
        const mix: OfflineMixOptions = { propKinds, eventKind, room };
        const crashAt = scheduleCues(g, clipCues(events, fromTick, toTick, mix), fromTick, slowMo, t0);
        if (opts?.music) {
          try {
            const o = opts as ClipScheduleOptions;
            scheduleSting(g, t0, Math.max(1, o.musicSeconds ?? CLIP_MUSIC_S), { style: musicStyleFor(room), theme: o.theme ?? room.theme }, crashAt);
          } catch {
            /* optional */
          }
        }
        let done = false;
        const cancel = (): void => {
          if (done) return;
          done = true;
          clipCancels.delete(cancel);
          const at = ctx ? ctx.currentTime : 0;
          for (const n of sources) {
            try {
              n.stop(at);
            } catch {
              /* already stopped */
            }
          }
          try {
            chain.head.disconnect();
          } catch {
            /* already gone */
          }
        };
        clipCancels.add(cancel);
        // tidy up after the clip has played out (disconnects the clip chain from the recorder)
        const len = Math.max(tickToClipSeconds(toTick, fromTick, slowMo), opts?.music ? CLIP_MUSIC_S : 0);
        if (typeof setTimeout === 'function') setTimeout(cancel, Math.max(0, (t0 - c.currentTime + len + 4) * 1000));
        return cancel;
      } catch {
        return noop;
      }
    },
    now() {
      return ctx && unlocked && !disposed ? ctx.currentTime : null;
    },
    setRoom(play: PlayableRoom) {
      room = roomAudioFor(play);
      eventKind = room.eventKind;
      propKinds = play.room.props.map((p) => p.kind);
      lastProps = null;
      tickMemo.roombaPause = 0;
      music?.setFlavor({ style: musicStyleFor(room), theme: room.theme });
    },
    dispose() {
      disposed = true;
      for (const cancel of [...clipCancels]) cancel();
      music?.dispose();
      music = null;
      if (visHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visHandler);
      visHandler = null;
      const c = ctx;
      ctx = null;
      graph = null;
      buses = null;
      streamDest = null;
      unlocked = false;
      if (c) void c.close().catch(() => undefined);
    },
  };
  return engine;
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 1;
}
