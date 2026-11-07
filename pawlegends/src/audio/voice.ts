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
  /** 0..1 (sound-effects volume × master); 0 or muted says nothing. */
  volume: number;
  muted: boolean;
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
    .then((r) => (r.ok ? r.json() : []))
    .then((list: unknown) => new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []))
    .catch(() => new Set<string>());
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
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .catch(() => null)
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
      .catch(() => null);
    decoded.set(key, p);
    void p.then((buf) => {
      if (buf) bytes.delete(key);
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

function duck(out: VoiceOut, on: boolean): void {
  const g = out.duck;
  const ctx = out.ctx;
  if (!g || !ctx) return;
  try {
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, ctx.currentTime, on ? 0.04 : 0.25);
  } catch {
    g.gain.value = on ? DUCK_LEVEL : 1;
  }
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
  void clip(ctx, key).then((buf) => {
    // a line that cut in meanwhile wins
    if (queue.current !== key) return;
    const now = outOf();
    if (!buf || now.muted || now.volume <= 0.01) {
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
      src.start();
      playing = { src, key };
      duck(now, true);
      queue.length(key, performance.now(), buf.duration * 1000);
      pump();
    } catch {
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

/** Say `key` (queued by priority; see VoiceQueue). `out()` is read when the line actually starts. */
export function sayLine(key: VoiceKey, out: () => VoiceOut): void {
  outOf = out;
  const o = out();
  if (o.muted || o.volume <= 0.01) return;
  void clips().then((have) => {
    // no clip, no line (and no robotic stand-in)
    if (!have.has(key)) return;
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
