/**
 * Clip job runner (FULL build): a clip is a list of steps (2D card frames and render passes on the live renderer)
 * drawn through one ClipComposer into one encoder, plus audio cues placed on the clip timeline.
 *
 *  - POV / stitch / reply / irl / roomba / still_waiting: one pass, output frame = pass frame.
 *  - household: title card, pass A (source frames 30..179), pass B, scores card.
 *
 * Encoders are injected by the caller (share/index.ts lazy-loads them), so this module never imports mediabunny.
 */
import type { AudioEngine, CatSpec, ClipPlan, PlayableRoom, RenderApi, Renderer, RoomTheme, SimEvent, TickInput } from '../../types';
import type { ClipComposer, OpenerImage } from './compose';
import type { ClipEncoder, EncodedClip } from './encoder-types';
import { ClipAbortError } from './encoder-types';
import type { Rect } from './gates';
import { CLIP_FPS, OPENER_FRAMES, clipFrameTick, gameFramesOf, loopFromFrame, planEndTick, planFrames } from './highlights';

export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, frame: number) => void;

export interface PassStep {
  kind: 'pass';
  plan: ClipPlan;
  cat: CatSpec;
  inputs: readonly TickInput[];
  /** Output frame of source frame `srcFrom`. */
  outFrom: number;
  srcFrom: number;
  srcTo: number;
  /** Runs before the pass (household: load the second cat's model into the renderer). */
  before?: () => Promise<void>;
  /** Swap the composer's opener before this pass (household); undefined = keep. */
  opener?: { still: OpenerImage | null; frames: readonly OpenerImage[] | null; faceCrop: Rect | null; load?: () => Promise<void> };
}
export interface CardStep {
  kind: 'card';
  from: number;
  to: number;
  paint: Painter;
}
export type ClipStep = PassStep | CardStep;

/** One audio mix placed on the clip timeline: `atSec` = clip time of the pass's match cut. */
export interface AudioCue {
  atSec: number;
  events: readonly SimEvent[];
  fromTick: number;
  toTick: number;
  slowMo?: ClipPlan['slowMo'];
  /** Longest the cue may run (its game part), seconds. */
  maxSec: number;
}

export interface ClipJobSpec {
  plan: ClipPlan;
  totalFrames: number;
  size: { w: number; h: number };
  steps: ClipStep[];
  cues: AudioCue[];
}

/** The audio cue of one pass: from the match cut to the last game tick, placed where source frame 60 lands. */
export function cueForPass(plan: ClipPlan, events: readonly SimEvent[], outFrom = 0, srcFrom = 0): AudioCue {
  const out60 = outFrom + (OPENER_FRAMES - srcFrom);
  return {
    atSec: out60 / CLIP_FPS,
    events,
    fromTick: plan.matchCutTick,
    toTick: planEndTick(plan),
    slowMo: plan.slowMo,
    maxSec: gameFramesOf(plan) / CLIP_FPS,
  };
}

/** The single-pass job of every one-cat format. */
export function singleJob(plan: ClipPlan, cat: CatSpec, inputs: readonly TickInput[], events: readonly SimEvent[]): ClipJobSpec {
  const n = planFrames(plan);
  const size = plan.size ?? { w: 720, h: 1280 };
  return {
    plan,
    totalFrames: n,
    size: { w: size.w, h: size.h },
    steps: [{ kind: 'pass', plan, cat, inputs, outFrom: 0, srcFrom: 0, srcTo: n - 1 }],
    cues: [cueForPass(plan, events)],
  };
}

/** Output frames each step writes, in order (tests: every frame 0..total-1 exactly once). */
export function jobFrameOrder(job: ClipJobSpec): number[] {
  const out: number[] = [];
  for (const s of job.steps) {
    if (s.kind === 'card') for (let f = s.from; f <= s.to; f++) out.push(f);
    else for (let i = s.srcFrom; i <= s.srcTo; i++) out.push(s.outFrom + i - s.srcFrom);
  }
  return out;
}

export interface RunDeps {
  render: RenderApi;
  renderer: Renderer;
  play: PlayableRoom;
  composer: ClipComposer;
  signal?: AbortSignal;
  isLost(): boolean;
  onProgress?(p: number): void;
  /** Raw game canvas of each pass frame, before compose (fallback 2 freeze-frame). */
  onRaw?(c: HTMLCanvasElement, out: number): void;
  cancelled: string;
  interrupted: string;
}

/** Draw every frame of the job into `enc` and finish it. Throws on abort, context loss or encoder failure. */
export async function runJob(job: ClipJobSpec, enc: ClipEncoder, d: RunDeps): Promise<EncodedClip> {
  const total = job.totalFrames;
  let done = 0;
  const check = () => {
    if (d.signal?.aborted) throw new ClipAbortError(d.cancelled);
    if (d.isLost()) throw new ClipAbortError(d.interrupted);
  };
  try {
    for (const step of job.steps) {
      check();
      if (step.kind === 'card') {
        for (let f = step.from; f <= step.to; f++) {
          check();
          d.composer.drawCard(f, step.paint);
          await enc.addFrame(d.composer.canvas, f);
          d.onProgress?.(Math.min(1, ++done / total));
        }
        continue;
      }
      if (step.before) await step.before();
      check();
      if (step.opener) {
        await step.opener.load?.();
        d.composer.setOpener(step.opener.still, step.opener.frames, step.opener.faceCrop);
      }
      await d.render.renderFrames(d.renderer, d.play, step.cat, step.inputs, step.plan, async (c, i) => {
        check();
        if (i < step.srcFrom || i > step.srcTo) return;
        const out = step.outFrom + i - step.srcFrom;
        d.onRaw?.(c, out);
        d.composer.drawFrame(c, out, i); // same task as the WebGL draw
        await enc.addFrame(d.composer.canvas, out);
        d.onProgress?.(Math.min(1, ++done / total));
      });
    }
    check();
    const out = await enc.finish();
    d.onProgress?.(1);
    return out;
  } catch (e) {
    await enc.cancel().catch(() => undefined);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------------------------

export interface MixOptions {
  music: boolean;
  theme?: RoomTheme;
}

/** Render one cue's buffer (renderClipMix when present, else renderOffline without music). */
async function cueBuffer(audio: AudioEngine, c: AudioCue, o: MixOptions): Promise<AudioBuffer | null> {
  if (audio.renderClipMix) {
    const mixOpts = { music: o.music, theme: o.theme, musicSeconds: Math.max(1, Math.round(c.maxSec)) };
    return audio.renderClipMix(c.events, c.fromTick, c.toTick, c.slowMo, mixOpts);
  }
  if (audio.renderOffline) return audio.renderOffline(c.events, c.fromTick, c.toTick, c.slowMo);
  return null;
}

/** Sample offsets of each cue in a combined buffer that starts at the first cue (pure). */
export function cueOffsets(cues: readonly AudioCue[], sampleRate: number): { start: number; offsets: number[]; maxLen: number[] } {
  const start = cues.length ? Math.min(...cues.map((c) => c.atSec)) : 0;
  return {
    start,
    offsets: cues.map((c) => Math.round((c.atSec - start) * sampleRate)),
    maxLen: cues.map((c) => Math.round(c.maxSec * sampleRate)),
  };
}

/**
 * Offline mix of every cue into one AudioBuffer placed at `startSec` on the clip timeline (WebCodecs path). Each cue
 * is trimmed to its game part (a 6 s Roomba clip does not carry 10 s of music). Null when nothing renders.
 */
export async function buildAudioMix(
  audio: AudioEngine | undefined,
  cues: readonly AudioCue[],
  o: MixOptions,
  /** The clip's length: the mix then starts at 0 and is padded with silence to the end (the track spans the video). */
  totalSec?: number,
): Promise<{ buffer: AudioBuffer; startSec: number } | null> {
  if (!audio || !cues.length) return null;
  const bufs: (AudioBuffer | null)[] = [];
  for (const c of cues) {
    try {
      bufs.push(await cueBuffer(audio, c, o));
    } catch {
      bufs.push(null);
    }
  }
  const first = bufs.find((b): b is AudioBuffer => !!b);
  if (!first) return null;
  const sr = first.sampleRate;
  const ch = first.numberOfChannels;
  const placed = cueOffsets(cues, sr);
  let { start, offsets } = placed;
  const { maxLen } = placed;
  // Full-length track: shift every cue by its start and pad to the clip's end (round 2: 9.05 s of audio in 12 s).
  const full = typeof totalSec === 'number' && totalSec > 0;
  if (full) {
    const lead = Math.round(start * sr);
    offsets = offsets.map((x) => x + lead);
    start = 0;
  }
  let len = full ? Math.round(totalSec! * sr) : 0;
  bufs.forEach((b, i) => {
    if (b) len = Math.max(len, offsets[i] + Math.min(b.length, maxLen[i] || b.length));
  });
  if (typeof AudioBuffer === 'undefined') return { buffer: first, startSec: placed.start };
  try {
    const out = new AudioBuffer({ length: Math.max(1, len), numberOfChannels: ch, sampleRate: sr });
    bufs.forEach((b, i) => {
      if (!b || b.sampleRate !== sr) return;
      const n = Math.min(b.length, maxLen[i] || b.length, out.length - offsets[i]);
      for (let k = 0; k < ch; k++) {
        const src = b.getChannelData(Math.min(k, b.numberOfChannels - 1));
        const dst = out.getChannelData(k);
        const o0 = offsets[i];
        for (let j = 0; j < n; j++) dst[o0 + j] += src[j];
      }
    });
    return { buffer: out, startSec: start };
  } catch {
    return { buffer: first, startSec: placed.start };
  }
}

/**
 * MediaRecorder path: schedule every cue in real time; call at the moment clip frame 0 is recorded. Returns one
 * cancel function, or null when the engine cannot schedule (silent clip).
 */
export function scheduleCues(audio: AudioEngine | undefined, cues: readonly AudioCue[], o: MixOptions): (() => void) | null {
  if (!audio?.scheduleClip || !audio.now) return null;
  const t0 = audio.now();
  if (t0 === null || t0 === undefined) return null;
  const cancels: (() => void)[] = [];
  for (const c of cues) {
    try {
      cancels.push(audio.scheduleClip(c.events, c.fromTick, c.toTick, c.slowMo, t0 + c.atSec, { music: o.music, theme: o.theme }));
    } catch {
      /* skip this cue */
    }
  }
  return () => cancels.forEach((f) => f());
}

// ---------------------------------------------------------------------------------------------
// Fallback 2: capture frames for the GIF and the card's freeze-frame
// ---------------------------------------------------------------------------------------------

export const GIF_SRC_FRAMES = 60; // 2 s of clip frames
export const GIF_STEP = 2; // 30 fps -> 15 fps

/** Output frames for the 2 s slow-motion GIF (every 2nd frame) and the freeze-frame (the crash). */
export function gifWindow(plan: ClipPlan): { frames: number[]; freeze: number } {
  const loopFrom = loopFromFrame(plan);
  const lo = OPENER_FRAMES;
  const hi = Math.max(lo, loopFrom - GIF_SRC_FRAMES);
  const slow = plan.slowMo.speed < 1 && plan.slowMo.toTick > plan.slowMo.fromTick;
  const key = slow ? plan.slowMo.fromTick : plan.crime.breakTick - 15;
  let first = lo;
  for (let f = lo; f < loopFrom; f++)
    if (clipFrameTick(plan, f) >= key) {
      first = f;
      break;
    }
  const start = Math.min(hi, Math.max(lo, first - 6));
  const frames: number[] = [];
  for (let f = start; f < Math.min(loopFrom, start + GIF_SRC_FRAMES); f += GIF_STEP) frames.push(f);
  let freeze = start;
  for (let f = lo; f < loopFrom; f++)
    if (clipFrameTick(plan, f) >= plan.crime.breakTick) {
      freeze = f;
      break;
    }
  return { frames, freeze };
}

export interface CaptureResult {
  frames: { width: number; height: number; data: Uint8ClampedArray }[];
  freeze: HTMLCanvasElement | null;
}

/** A pseudo-encoder that keeps downscaled RGBA copies of the chosen frames (no timing, no output file). */
export function createCaptureEncoder(want: readonly number[], width: number, height: number): ClipEncoder & { result: CaptureResult } {
  const set = new Set(want);
  const small = document.createElement('canvas');
  small.width = width;
  small.height = height;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const result: CaptureResult = { frames: [], freeze: null };
  return {
    kind: 'capture',
    result,
    async addFrame(canvas: HTMLCanvasElement, i: number): Promise<void> {
      if (!set.has(i) || !sctx) return;
      sctx.drawImage(canvas, 0, 0, width, height);
      const img = sctx.getImageData(0, 0, width, height);
      result.frames.push({ width, height, data: img.data });
    },
    async finish(): Promise<EncodedClip> {
      small.width = 0;
      small.height = 0;
      return { blob: new Blob([], { type: 'image/gif' }), mime: 'image/gif', audio: false };
    },
    async cancel(): Promise<void> {
      small.width = 0;
      small.height = 0;
    },
  };
}
