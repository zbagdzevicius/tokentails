// WebAudio primitives and mixer buses. FROZEN (copied from ultra-cat). Every lane builds its own sounds from these (no audio files).
//   out -> compressor -> destination, with sfx -> out and music -> out.
// All functions are safe before initAudio() (they return early / null).

export interface AudioHandles {
  ctx: AudioContext;
  out: GainNode; // master
  sfx: GainNode; // connect one-shot sounds here
  music: GainNode; // connect music here (cat-audio owns music and ducking)
  noiseBuf: AudioBuffer; // 2 s of white noise
}

let A: AudioHandles | null = null;
const vol = { master: 1, sfx: 1, music: 0.6 };
const MASTER = 0.55;
const initHooks: ((a: AudioHandles) => void)[] = [];

/** Call from any user gesture. Creates the context once, resumes it afterwards. */
export function initAudio(): void {
  if (A) {
    void A.ctx.resume();
    return;
  }
  const ctx = new AudioContext();
  const out = ctx.createGain();
  out.gain.value = MASTER * vol.master;
  const comp = ctx.createDynamicsCompressor();
  out.connect(comp).connect(ctx.destination);
  const sfx = ctx.createGain();
  sfx.gain.value = vol.sfx;
  sfx.connect(out);
  const music = ctx.createGain();
  music.gain.value = vol.music;
  music.connect(out);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  A = { ctx, out, sfx, music, noiseBuf };
  for (const h of initHooks) h(A);
}

/** Run fn once the audio context exists (immediately if it already does). Use it to start loops. */
export function onAudioInit(fn: (a: AudioHandles) => void): void {
  initHooks.push(fn);
  if (A) fn(A);
}

export const audio = (): AudioHandles | null => A;

// a hidden tab or a locked phone goes silent (and stops burning battery); it comes back when visible again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!A) return;
    if (document.hidden) void A.ctx.suspend();
    else void A.ctx.resume();
  });
}

/** 0..1 each. Persisted by meta-ui; applied immediately. */
export function setVolumes(v: Partial<{ master: number; sfx: number; music: number }>): void {
  Object.assign(vol, v);
  if (!A) return;
  const t = A.ctx.currentTime;
  A.out.gain.setTargetAtTime(MASTER * vol.master, t, 0.05);
  A.sfx.gain.setTargetAtTime(vol.sfx, t, 0.05);
  A.music.gain.setTargetAtTime(vol.music, t, 0.05);
}
export const getVolumes = () => ({ ...vol });

/** Looping noise source that stops itself after dur seconds. */
export function noise(dur: number): AudioBufferSourceNode {
  const c = A!.ctx;
  const src = c.createBufferSource();
  src.buffer = A!.noiseBuf;
  src.loop = true;
  src.start(c.currentTime, Math.random(), dur + 0.1);
  src.stop(c.currentTime + dur + 0.1);
  return src;
}

/** Exponential attack/decay envelope starting now (or at `at`). */
export function env(g: GainNode, peak: number, attack: number, decay: number, at?: number): void {
  const t = at ?? A!.ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** A one-shot oscillator note into `dest` (default the sfx bus). freq may glide to `to`. */
export function tone(type: OscillatorType, freq: number, dur: number, peak: number, opts: { to?: number; at?: number; attack?: number; dest?: AudioNode } = {}): void {
  if (!A) return;
  const c = A.ctx;
  const t = opts.at ?? c.currentTime;
  const o = c.createOscillator();
  o.type = type;
  const nyq = c.sampleRate * 0.45; // headless/low-rate contexts (24 kHz) clamp loudly above Nyquist
  o.frequency.setValueAtTime(Math.min(freq, nyq), t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.min(opts.to, nyq), t + dur);
  const g = c.createGain();
  env(g, peak, opts.attack ?? 0.005, dur, t);
  o.connect(g).connect(opts.dest ?? A.sfx);
  o.start(t);
  o.stop(t + (opts.attack ?? 0.005) + dur + 0.05);
}
