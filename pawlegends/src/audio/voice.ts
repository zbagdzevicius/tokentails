/**
 * The announcer's voice (LoL pass, lane B): "First Blood", "Double Pounce", "Ace", "Victory"... Loaded with a dynamic
 * import on the first line or the match's preload (audio/sfx.ts), so it is never in the first-load JS.
 *
 * Every line is a recorded clip at public/voice/<key>.mp3 (an original designed female announcer voice, Qwen3-TTS,
 * Apache-2.0), played only when public/voice/manifest.json lists it. A key with no clip is silent: the browser's
 * speech synthesis is never used. Lines go through the VoiceQueue (audio/voiceLines.ts): one at a time, highest
 * priority first, stale ones dropped, the result cuts in. Music ducks under a line. Mute and the sound-effects volume
 * apply. Render side only; never feeds the sim.
 */
import { VoiceQueue, type VoiceKey } from './voiceLines';

export interface VoiceOut {
  /** The audio context and the bus to play clips into (null: nothing is said). */
  ctx: AudioContext | null;
  bus: AudioNode | null;
  /** The music's own gain, lowered while a line plays (null: no ducking). */
  duck: GainNode | null;
  /** The combat bus (hits, swings, hurts): ducked to COMBAT_DUCK under a line (absent or null: not ducked). */
  duckFx?: GainNode | null;
  /** 0..1 (sound-effects volume × master); 0 or muted says nothing. */
  volume: number;
  muted: boolean;
  /** Told when a line's clip starts (audible: checked first), with the clip's own gain. */
  said?: (key: VoiceKey, src: AudioBufferSourceNode, gain: number) => void;
}

/** One console warning per kind of failure (audio/sfx.ts warnAudioOnce, kept local so this chunk stays small). */
const warned = new Set<string>();
function warnOnce(what: string, err?: unknown): void {
  if (warned.has(what)) return;
  warned.add(what);
  try {
    console.warn(`[pawlegends audio] ${what}`, err ?? '');
  } catch {
    /* no console */
  }
}

/** The music's level under a line (of its own level). */
export const DUCK_LEVEL = 0.35;
/** The clip's own gain into the sound-effects bus (the clips are levelled to −16 LUFS). */
const CLIP_GAIN = 0.9;

const BASE = (() => {
  try {
    return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
})();

let manifest: Promise<ReadonlySet<string>> | null = null;
function clips(): Promise<ReadonlySet<string>> {
  manifest ??= fetch(`${BASE}voice/manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((list: unknown) => new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []))
    .catch((e: unknown) => {
      warnOnce(`announcer manifest ${BASE}voice/manifest.json not loaded: no voice lines`, e);
      // a later line tries again (a flaky network at boot must not silence the whole session)
      manifest = null;
      return new Set<string>();
    });
  return manifest;
}

/** The fetched bytes (fetched before the audio context exists), then the decoded clip. */
const bytes = new Map<string, Promise<ArrayBuffer | null>>();
const decoded = new Map<string, Promise<AudioBuffer | null>>();

function fetchClip(key: VoiceKey): Promise<ArrayBuffer | null> {
  let p = bytes.get(key);
  if (!p) {
    p = clips().then((have) =>
      have.has(key)
        ? fetch(`${BASE}voice/${key}.mp3`)
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.arrayBuffer();
            })
            .catch((e: unknown) => {
              warnOnce(`announcer clip ${key} not loaded`, e);
              bytes.delete(key);
              return null;
            })
        : null,
    );
    bytes.set(key, p);
  }
  return p;
}

function clip(ctx: AudioContext, key: VoiceKey): Promise<AudioBuffer | null> {
  let p = decoded.get(key);
  if (!p) {
    // decodeAudioData detaches the bytes: decode a copy, once
    p = fetchClip(key)
      .then((b) => (b ? ctx.decodeAudioData(b.slice(0)) : null))
      .catch((e: unknown) => {
        warnOnce(`announcer clip ${key} could not be decoded`, e);
        return null;
      });
    decoded.set(key, p);
    void p.then((buf) => {
      if (buf) bytes.delete(key);
      // a failed fetch or decode is tried again next time
      else decoded.delete(key);
    });
  }
  return p;
}

/** Fetch (and, once audio is unlocked, decode) these lines ahead of their moment. Missing ones cost nothing. */
export function preload(keys: readonly VoiceKey[], ctx: AudioContext | null): void {
  for (const k of keys) {
    if (ctx) void clip(ctx, k);
    else void fetchClip(k);
  }
}

const queue = new VoiceQueue();
let playing: { src: AudioBufferSourceNode; key: VoiceKey } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let outOf: () => VoiceOut = () => ({ ctx: null, bus: null, duck: null, volume: 0, muted: true });
/** Lines that start a little after they were queued (after the zzfx sting), ms. */
const leadOf = new Map<VoiceKey, number>();
/** A suspended context (iOS after an interruption, or before the first tap's end) gets this long to resume. */
const RESUME_WAIT_MS = 700;

/** Resolves true once `ctx` runs (a resume is asked for), false after RESUME_WAIT_MS. */
function running(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === 'running') return Promise.resolve(true);
  return new Promise((done) => {
    let over = false;
    const finish = (ok: boolean): void => {
      if (over) return;
      over = true;
      clearTimeout(t);
      ctx.removeEventListener?.('statechange', on);
      done(ok);
    };
    const on = (): void => {
      if (ctx.state === 'running') finish(true);
    };
    const t = setTimeout(() => finish(ctx.state === 'running'), RESUME_WAIT_MS);
    ctx.addEventListener?.('statechange', on);
    void ctx.resume().then(on, () => undefined);
  });
}

/** The combat bus's level under a line (hits stay present, the line stays clear). */
export const COMBAT_DUCK = 0.55;

function duckOne(g: GainNode | null | undefined, ctx: AudioContext | null, level: number, on: boolean): void {
  if (!g || !ctx) return;
  try {
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setTargetAtTime(on ? level : 1, ctx.currentTime, on ? 0.04 : 0.25);
  } catch {
    g.gain.value = on ? level : 1;
  }
}

function duck(out: VoiceOut, on: boolean): void {
  duckOne(out.duck, out.ctx, DUCK_LEVEL, on);
  duckOne(out.duckFx, out.ctx, COMBAT_DUCK, on);
}

function stopPlaying(): void {
  const p = playing;
  playing = null;
  if (!p) return;
  p.src.onended = null;
  try {
    p.src.stop();
  } catch {
    /* already ended */
  }
}

/** Start `key` now: its clip, or silence (the queue moves on) when there is none. */
function start(key: VoiceKey, cut: boolean): void {
  if (cut) stopPlaying();
  const out = outOf();
  const at = performance.now();
  const silent = (): void => {
    queue.length(key, at, 0);
    pump();
  };
  if (out.muted || out.volume <= 0.01 || !out.ctx || !out.bus) {
    silent();
    return;
  }
  const ctx = out.ctx;
  const bus = out.bus;
  const lead = leadOf.get(key) ?? 0;
  leadOf.delete(key);
  // a suspended context (iOS before the first tap's end, or after an interruption) is asked to resume and gets a
  // moment to do it, instead of the line being dropped at once; the queue's staleness still bounds how late it is
  void Promise.all([clip(ctx, key), running(ctx)]).then(([buf, live]) => {
    // a line that cut in meanwhile wins
    if (queue.current !== key) return;
    const now = outOf();
    if (!buf || !live || now.muted || now.volume <= 0.01) {
      if (buf && !live) warnOnce('announcer line skipped: audio is suspended until the next tap');
      silent();
      return;
    }
    try {
      stopPlaying();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = CLIP_GAIN;
      src.connect(g);
      g.connect(bus);
      src.onended = () => {
        if (playing?.src !== src) return;
        playing = null;
        if (queue.waitMs(performance.now()) < 0) duck(outOf(), false);
      };
      now.said?.(key, src, CLIP_GAIN);
      src.start(lead > 0 ? ctx.currentTime + lead / 1000 : 0);
      playing = { src, key };
      duck(now, true);
      queue.length(key, performance.now(), lead + buf.duration * 1000);
      pump();
    } catch (e) {
      warnOnce('an announcer line failed to start', e);
      silent();
    }
  });
}

/** Start the next waiting line when the voice is free, or wake up when it will be. */
function pump(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const now = performance.now();
  const go = queue.next(now);
  if (go) {
    start(go.key, go.cut);
    return;
  }
  const wait = queue.waitMs(now);
  if (wait >= 0) timer = setTimeout(pump, wait + 5);
}

/**
 * Say `key` (queued by priority; see VoiceQueue). `out()` is read when the line actually starts. `leadMs`: the clip
 * starts this long after its turn comes (the sting before a big line), while its place in the queue is taken now.
 */
export function sayLine(key: VoiceKey, out: () => VoiceOut, leadMs = 0): void {
  outOf = out;
  const o = out();
  if (o.muted || o.volume <= 0.01) return;
  void clips().then((have) => {
    // no clip, no line (and no robotic stand-in)
    if (!have.has(key)) return;
    if (leadMs > 0) leadOf.set(key, leadMs);
    else leadOf.delete(key);
    const go = queue.push(key, performance.now());
    if (go) start(go.key, go.cut);
    else pump();
  });
}

/** Stop the line playing and forget the waiting ones (mute, leaving a match). */
export function hush(out?: VoiceOut): void {
  queue.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  stopPlaying();
  if (out) duck(out, false);
}
