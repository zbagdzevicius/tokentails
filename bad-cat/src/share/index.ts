/**
 * L6 Share + clip public API. This module is itself loaded lazily (GameServices.loadShare). The encoders under
 * ./clip/encoder-*, the GIF encoder (./clip/gif) and the muxer library are reached only through dynamic import(),
 * so they stay in their own chunks (450 KB first-load budget).
 *
 * FULL build (W2-SHARE): post formats (GDD 7.5) + household, Stitch/reply handle pill, Club caption styles, video
 * opener, music toggle, MediaRecorder audio, fallback 2 (card + GIF), every image card, carousel, multi-file share,
 * Android intent:// handoff, dare chains, studio session model, report props.
 */
import type {
  AudioEngine,
  CatSpec,
  ClipExportResult,
  ClipPlan,
  FaceDecal,
  HouseholdSecond,
  PlayableRoom,
  RenderApi,
  Renderer,
  RunResult,
  ShareApi,
  ShareFormat,
} from '../types';
import { ClipComposer, loadOpenerImage, type OpenerImage } from './clip/compose';
import type { ClipEncoder } from './clip/encoder-types';
import { ClipAbortError } from './clip/encoder-types';
import { HOUSEHOLD_FRAMES, householdCaption, householdTimeline, planFormatClip, planHousehold, planHouseholdPass } from './clip/format-plan';
import { layoutFor, type Rect } from './clip/gates';
import { CLIP_FPS, planClip as planClipImpl, planSize } from './clip/highlights';
import { scoresPainter, titlePainter, type HouseholdCat } from './clip/household-paint';
import {
  buildAudioMix,
  createCaptureEncoder,
  cueForPass,
  gifWindow,
  runJob,
  scheduleCues,
  singleJob,
  type ClipJobSpec,
  type MixOptions,
  type RunDeps,
} from './clip/pipeline';
import { closeOpenerFrames, decodeVideoOpener } from './clip/video-opener';
import { canvasBlob, drawRapSheetCard, renderCard, renderCarousel, type RapSheetInput } from './cards';
import { androidIntent as androidIntentImpl, buildRoomLink, copyHandoffLink as copyHandoffLinkImpl, safeEnv } from './inapp-handoff';
import { renderResultCard } from './image-card';
import { shareClip as shareClipImpl, shareFiles, shareImage } from './share-sheet';
import { formats } from './formats';

export { captionFor, clipShareText, formatGap, hookFor } from './clip/captions';
export { clipGates, DEFAULT_LAYOUT, layoutFor, safeBox, type ClipLayout, type Rect } from './clip/gates';
export {
  bestCandidate,
  CLIP_FRAMES,
  clipFrameTick,
  findCandidates,
  gameFramesOf,
  LOOP_FROM_FRAME,
  loopFromFrame,
  OPENER_FRAMES,
  planEndTick,
  planFrames,
  planSize,
  roomLabel,
  URL_FROM_FRAME,
  urlFromFrame,
  type CrimeCandidate,
} from './clip/highlights';
export {
  FORMAT_HOOKS,
  HOUSEHOLD_FRAMES,
  householdCaption,
  householdOutFrame,
  householdTimeline,
  householdVerdict,
  normalizeHandle,
  planFormatClip,
  planHousehold,
  planHouseholdPass,
  planRoomba,
  ROOMBA_FRAMES,
  SPLIT_SIZE,
  stillWaitingEndLine,
  type FormatPlanOptions,
  type HouseholdSegment,
} from './clip/format-plan';
export { CAPTION_STYLES, captionStyle, revealText } from './clip/styles';
export { openerSourceRect, pushRect } from './clip/compose';
export { pickFrameIndices } from './clip/video-opener';
export { cueForPass, cueOffsets, gifWindow, jobFrameOrder, singleJob, type AudioCue, type ClipJobSpec } from './clip/pipeline';
export { emojiCard, emojiTimeline, formatThousands } from './emoji-card';
export { drawResultCard, renderResultCard, RESULT_CARD, STORY_CARD, type ResultCardInput } from './image-card';
export {
  CAMEO_CARD,
  CAROUSEL_SLIDE,
  CAT_CARD,
  RAPSHEET_CARD,
  drawCameoCard,
  drawCatCard,
  drawRapSheetCard,
  renderCard,
  renderCarousel,
  stampAnim,
  type RapSheetInput,
} from './cards';
export { approxMeasure, cameoLine, crimeCount, fitText, makeYourCatLine, mostWantedLine, plural, rapSheetStats, wantedFor, yourCatNextLine } from './card-text';
export {
  androidIntentFor,
  buildDareChainLink,
  buildDareLink,
  buildHandoffLink,
  buildRoomDareLink,
  buildRoomLink,
  copyText,
  handoffEvent,
  handoffPlan,
  handoffSteps,
  intentUrl,
  isAndroidInApp,
  needsHandoff,
  type DareRun,
  type HandoffPurpose,
  type HandoffStep,
} from './inapp-handoff';
export { downloadBlob, multiFileNames, shareFiles, shareImage, showInlineVideo, showToast } from './share-sheet';
export { FORMAT_ORDER, HASHTAG, formatCaption, formatLabel, formats, type FormatContextX } from './formats';
export {
  createStudio,
  parseStudioBatch,
  STUDIO_PRACTICE_SECONDS,
  STUDIO_STEPS,
  studioCurrent,
  studioEnabled,
  studioExportOptions,
  studioFileName,
  studioHook,
  studioProgress,
  studioReducer,
  type StudioAction,
  type StudioItem,
  type StudioState,
  type StudioStep,
} from './studio';
export { reportPayload, reportProps, type ReportKind } from './report';

/** Error string the UI shows on the share screen ("Tap to retry" re-runs exportClip). */
export const CLIP_INTERRUPTED = 'Clip interrupted. Tap to retry';
export const CLIP_UNSUPPORTED = 'Clip export is not supported in this browser';
/** The export was cancelled (the player started another run); the job goes back to idle. */
export const CLIP_CANCELLED = 'Clip cancelled';
export const CLIP_NEEDS_SECOND = 'The household clip needs a second cat with a run of this room';

export interface ExportClipOptions {
  opener?: Blob;
  music: boolean;
  /** stitch / reply: the handle ("@luna.mom" or "luna.mom"); other formats: free overlay text (pill). */
  overlay?: string;
  audio?: AudioEngine;
  onProgress?: (p: number) => void;
  /** Face crop in opener-photo pixels (FaceDecal.crop): aligns the photo's face with FACE_RECT for the match cut. */
  faceCrop?: Rect | null;
  /** Abort to hand the renderer back after the current frame. */
  signal?: AbortSignal;
  /** Post format (default 'pov'). */
  format?: ShareFormat;
  /** Household: the second cat's run of the same room. */
  second?: HouseholdSecond;
  /** Club caption style 0..4 (0 = default). */
  captionStyle?: number;
  /** Replaces the URL line in the last 2 s (still_waiting default: "{cat} is still waiting"). */
  endLine?: string;
  /** still_waiting: the cat was adopted ("went home"). */
  adopted?: boolean;
  /** Fallback 2 card link (default: the room link). */
  link?: string;
  /**
   * Household only (FULL build, not in types.ts yet): the second cat's face decal for its model, and what the live
   * renderer held before (cats + faces), reloaded after the clip. Without `restore` the renderer is reloaded with
   * `[cat]` and no face decal (the next run's load() puts the face back).
   */
  secondFaces?: Map<number, FaceDecal>;
  restore?: { cats: CatSpec[]; faces?: Map<number, FaceDecal> };
}

/** Plan the clip for a finished run (GDD 7.3 tension pick). */
export function planClip(r: RunResult, play: PlayableRoom, catName: string): ClipPlan {
  return planClipImpl(r, play, catName, { shortUrl: safeEnv().shortUrl });
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function errText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (e && typeof e === 'object' && 'type' in e) return String((e as { type: unknown }).type);
  return String(e);
}

interface LoadedOpener {
  still: OpenerImage | null;
  frames: OpenerImage[] | null;
}

/** Photo -> still; video -> 60 decoded frames (requestVideoFrameCallback), else its one-frame still. */
async function loadOpener(media: Blob | undefined, faceCrop: Rect | null, out: { w: number; h: number }): Promise<LoadedOpener> {
  if (!media) return { still: null, frames: null };
  const video = media.type.startsWith('video/');
  if (video) {
    const frames = await decodeVideoOpener(media, { faceCrop, out }).catch(() => null);
    if (frames && frames.length) return { still: null, frames };
  }
  return { still: await loadOpenerImage(media, video ? 'video' : 'photo'), frames: null };
}

function releaseOpener(o: LoadedOpener | null): void {
  if (!o) return;
  closeOpenerFrames(o.frames);
  try {
    (o.still as { close?: () => void } | null)?.close?.();
  } catch {
    /* ignore */
  }
}

/** First encoder that works for this size: WebCodecs + mediabunny, else null (the caller tries MediaRecorder). */
async function webCodecsEncoder(size: { w: number; h: number }, audio: { buffer: AudioBuffer; startSec: number } | null): Promise<ClipEncoder | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const wc = await import('./clip/encoder-webcodecs');
  return wc
    .createWebCodecsEncoder({ width: size.w, height: size.h, fps: CLIP_FPS, audio: audio?.buffer ?? null, audioStartSec: audio?.startSec ?? 2 })
    .catch(() => null);
}

async function mediaRecorderEncoder(canvas: HTMLCanvasElement, audio: AudioEngine | undefined, job: ClipJobSpec, mix: MixOptions): Promise<ClipEncoder | null> {
  const mr = await import('./clip/encoder-mediarecorder');
  let stream: MediaStream | null = null;
  if (audio?.scheduleClip && audio.now && audio.now() !== null) {
    try {
      stream = audio.captureStream();
    } catch {
      stream = null;
    }
  }
  return mr.createMediaRecorderEncoder({
    canvas,
    fps: CLIP_FPS,
    audioStream: stream,
    onFirstFrame: () => scheduleCues(audio, job.cues, mix) ?? undefined,
  });
}

/** Build the job (steps + cues) for the requested format. */
function buildJob(
  play: PlayableRoom,
  cat: CatSpec,
  r: RunResult,
  opts: ExportClipOptions,
  shortUrl: string,
): { job: ClipJobSpec; household: { a: HouseholdCat; b: HouseholdCat; second: HouseholdSecond } | null } {
  const format = opts.format ?? 'pov';
  if (format === 'household' && opts.second) {
    const second = opts.second;
    const plan = planHousehold({ run: r, name: cat.name }, { run: second.run, name: second.cat.name }, play, shortUrl);
    if (opts.captionStyle) plan.captionStyle = opts.captionStyle;
    if (opts.music) plan.music = true;
    const pa = planHouseholdPass(r, play, cat.name, shortUrl);
    const pb = planHouseholdPass(second.run, play, second.cat.name, shortUrl);
    const t = householdTimeline();
    const a: HouseholdCat = { cat, score: r.score };
    const b: HouseholdCat = { cat: second.cat, score: second.run.score };
    const segA = t[1] as Extract<(typeof t)[number], { kind: 'cat' }>;
    const segB = t[2] as Extract<(typeof t)[number], { kind: 'cat' }>;
    return {
      household: { a, b, second },
      job: {
        plan,
        totalFrames: HOUSEHOLD_FRAMES,
        size: { w: 720, h: 1280 },
        steps: [
          { kind: 'card', from: t[0].from, to: t[0].to, paint: titlePainter(a, b, t[0].to - t[0].from + 1) },
          { kind: 'pass', plan: pa, cat, inputs: r.inputs, outFrom: segA.from, srcFrom: segA.srcFrom, srcTo: segA.srcTo },
          { kind: 'pass', plan: pb, cat: second.cat, inputs: second.run.inputs, outFrom: segB.from, srcFrom: segB.srcFrom, srcTo: segB.srcTo },
          { kind: 'card', from: t[3].from, to: t[3].to, paint: scoresPainter(a, b) },
        ],
        cues: [cueForPass(pa, r.events, segA.from, segA.srcFrom), cueForPass(pb, second.run.events, segB.from, segB.srcFrom)],
      },
    };
  }
  const plan = planFormatClip(r, play, cat.name, {
    format: format === 'household' ? 'pov' : format,
    handle: format === 'stitch' || format === 'reply' ? opts.overlay : undefined,
    captionStyle: opts.captionStyle,
    endLine: opts.endLine,
    music: opts.music,
    shortUrl,
    adopted: opts.adopted,
  });
  if (opts.overlay && format !== 'stitch' && format !== 'reply') plan.overlay = opts.overlay;
  return { job: singleJob(plan, cat, r.inputs, r.events), household: null };
}

/**
 * Render the clip through the live renderer's clip pass, compose it (opener, captions, handle pill, watermark,
 * URL/end line, loop cut) and encode it. Never throws; failures come back in `error`. When no encoder works,
 * fallback 2 returns `card` (result card PNG) and `gif` (2 s slow-motion crash).
 */
export async function exportClip(
  render: RenderApi,
  renderer: Renderer,
  play: PlayableRoom,
  cat: CatSpec,
  r: RunResult,
  opts: ExportClipOptions,
): Promise<ClipExportResult> {
  const t0 = now();
  const env = safeEnv();
  const ms = () => Math.round(now() - t0);
  if (opts.format === 'household' && !opts.second) return { blob: null, mime: '', encoder: 'fallback', audio: false, ms: ms(), error: CLIP_NEEDS_SECOND };
  const { job, household } = buildJob(play, cat, r, opts, env.shortUrl);
  const plan = job.plan;
  const size = planSize(plan);
  const mix: MixOptions = { music: !!opts.music, theme: play.room.theme };

  // Openers: the split-screen half shows no photo (the real cat is in the bottom half the owner films).
  let openerA: LoadedOpener | null = null;
  let openerB: LoadedOpener | null = null;
  const faceA = opts.faceCrop ?? null;
  if (plan.format !== 'irl_vs_game') {
    openerA = await loadOpener(opts.opener, faceA, size);
    if (opts.opener && (openerA.still || openerA.frames)) plan.opener = { media: opts.opener, kind: opts.opener.type.startsWith('video/') ? 'video' : 'photo' };
  }
  if (household) {
    const faceB = (household.second.faceCrop as FaceDecal['crop'] | null | undefined) ?? null;
    household.a.face = openerA?.still ?? openerA?.frames?.[0] ?? null;
    // B's opener loads now too (stills are small; a decoded video's 60 frames are released after its pass)
    openerB = await loadOpener(household.second.opener, faceB, size);
    household.b.face = openerB.still ?? openerB.frames?.[0] ?? null;
    const passA = job.steps[1];
    const passB = job.steps[2];
    if (passA.kind === 'pass') passA.opener = { still: openerA?.still ?? null, frames: openerA?.frames ?? null, faceCrop: faceA };
    if (passB.kind === 'pass') {
      passB.opener = { still: openerB.still, frames: openerB.frames, faceCrop: faceB };
      // the clip pass draws the renderer's loaded cat model: swap in the second cat for its crime
      passB.before = async () => {
        await renderer.load(play, [household.second.cat], opts.secondFaces);
      };
    }
  }
  const reloadAfter = household ? async () => renderer.load(play, opts.restore?.cats ?? [cat], opts.restore?.faces) : null;

  let lost = false;
  const onLost = () => {
    lost = true;
  };
  const canvas = renderer.canvas;
  canvas.addEventListener('webglcontextlost', onLost);

  let composer: ClipComposer | null = null;
  try {
    const hh = household;
    composer = new ClipComposer({
      plan,
      layout: layoutFor(plan),
      shortUrl: env.shortUrl,
      opener: household ? null : openerA?.still ?? null,
      openerFrames: household ? null : openerA?.frames ?? null,
      faceCrop: faceA,
      captionFor: hh ? (f) => householdCaption(f, { name: cat.name, score: r.score }, { name: hh.second.cat.name, score: hh.second.run.score }, plan) : undefined,
    });
    const comp = composer;
    const deps: RunDeps = {
      render,
      renderer,
      play,
      composer: comp,
      signal: opts.signal,
      isLost: () => lost,
      onProgress: opts.onProgress,
      cancelled: CLIP_CANCELLED,
      interrupted: CLIP_INTERRUPTED,
    };

    // WebCodecs path: offline mix (SFX + optional music sting) placed on the clip timeline.
    let audioMix: { buffer: AudioBuffer; startSec: number } | null = null;
    if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && opts.audio) {
      audioMix = await buildAudioMix(opts.audio, job.cues, mix, job.totalFrames / CLIP_FPS).catch(() => null);
    }

    let enc = await webCodecsEncoder(size, audioMix);
    if (enc) {
      try {
        const out = await runJob(job, enc, deps);
        return { blob: out.blob, mime: out.mime, encoder: 'webcodecs', audio: out.audio, ms: ms() };
      } catch (e) {
        // an encoder error (async, after isConfigSupported said yes) retries once with MediaRecorder;
        // a lost context or a cancel does not
        if (lost || opts.signal?.aborted || e instanceof ClipAbortError) throw e;
        enc = null;
        opts.onProgress?.(0);
      }
    }
    enc = await mediaRecorderEncoder(comp.canvas, opts.audio, job, mix);
    if (enc) {
      const out = await runJob(job, enc, deps);
      return { blob: out.blob, mime: out.mime, encoder: 'mediarecorder', audio: out.audio, ms: ms() };
    }
    // Fallback 2: result card + 2 s GIF of the slow-motion crash (single-cat formats; household uses cat A's pass).
    const fb = await fallbackTwo(job, deps, play, cat, r, opts.link ?? buildRoomLink(play));
    return { blob: null, mime: '', encoder: 'fallback', audio: false, ms: ms(), error: CLIP_UNSUPPORTED, card: fb.card, gif: fb.gif };
  } catch (e) {
    const cancelled = opts.signal?.aborted || (e instanceof ClipAbortError && e.message === CLIP_CANCELLED);
    return {
      blob: null,
      mime: 'video/mp4',
      encoder: 'fallback',
      audio: false,
      ms: ms(),
      error: cancelled ? CLIP_CANCELLED : lost || (e instanceof ClipAbortError && e.message === CLIP_INTERRUPTED) ? CLIP_INTERRUPTED : errText(e),
    };
  } finally {
    canvas.removeEventListener('webglcontextlost', onLost);
    composer?.dispose();
    if (reloadAfter) await reloadAfter().catch(() => undefined);
    // release the decoded opener photos / video frames now (iOS memory), not at the next GC
    releaseOpener(openerA);
    releaseOpener(openerB);
  }
}

/** Fallback 2 (GDD 7.3): a capture pass for the GIF frames and the freeze-frame, then the card and the GIF. */
async function fallbackTwo(
  job: ClipJobSpec,
  deps: RunDeps,
  play: PlayableRoom,
  cat: CatSpec,
  r: RunResult,
  link: string,
): Promise<{ card: Blob | null; gif: Blob | null }> {
  if (typeof document === 'undefined') return { card: null, gif: null };
  // one pass is enough: the first render pass of the job (household: cat A)
  const pass = job.steps.find((s) => s.kind === 'pass');
  if (!pass || pass.kind !== 'pass') return { card: null, gif: null };
  const win = gifWindow(pass.plan);
  const size = planSize(pass.plan);
  const gw = 360;
  const gh = Math.round((size.h / size.w) * gw);
  const want = win.frames.map((f) => pass.outFrom + f - pass.srcFrom);
  const cap = createCaptureEncoder(want, gw, gh);
  const freezeOut = pass.outFrom + win.freeze - pass.srcFrom;
  let freeze: HTMLCanvasElement | null = null;
  // render only the frames the GIF and the freeze need (output frames keep their numbers)
  const srcFrom = Math.max(pass.srcFrom, Math.min(win.frames[0] ?? 0, win.freeze));
  const srcTo = Math.min(pass.srcTo, Math.max(win.frames[win.frames.length - 1] ?? 0, win.freeze));
  const sub: ClipJobSpec = { ...job, steps: [{ ...pass, outFrom: pass.outFrom + (srcFrom - pass.srcFrom), srcFrom, srcTo }] };
  await runJob(sub, cap, {
    ...deps,
    onProgress: undefined,
    onRaw: (c, out) => {
      if (out !== freezeOut || freeze) return;
      const f = document.createElement('canvas');
      f.width = c.width;
      f.height = c.height;
      f.getContext('2d')?.drawImage(c, 0, 0);
      freeze = f;
    },
  });
  deps.onProgress?.(0.9);
  const card = await renderResultCard({ run: r, play, cat, link, freeze }).catch(() => null);
  let gif: Blob | null = null;
  if (cap.result.frames.length) {
    try {
      const g = await import('./clip/gif');
      const bytes = g.encodeGifWithin(cap.result.frames);
      if (bytes) gif = new Blob([bytes as BlobPart], { type: 'image/gif' });
    } catch {
      gif = null;
    }
  }
  if (freeze) (freeze as HTMLCanvasElement).width = 0;
  deps.onProgress?.(1);
  return { card, gif };
}

/** Share on tap: navigator.share({ files }) → download → inline video for long-press. */
export async function shareClip(clip: Blob, text: string): Promise<'native_share' | 'download' | 'long_press' | 'cancelled'> {
  return shareClipImpl(clip, text);
}

/** In-app browser: copy the clip handoff link. */
export async function copyHandoffLink(link: string): Promise<boolean> {
  return copyHandoffLinkImpl(link);
}

/** Result / story card PNG (GDD 7.4). */
export function resultCard(input: {
  run: RunResult;
  play: PlayableRoom;
  cat: CatSpec;
  link: string;
  format?: 'result' | 'story';
  freeze?: CanvasImageSource | null;
  photo?: ImageBitmap | HTMLCanvasElement | HTMLImageElement | null;
  catArt?: CanvasImageSource | null;
}): Promise<Blob | null> {
  try {
    return renderResultCard(input).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

export const RAPSHEET_LOOP_FRAMES = 90; // 3 s
export const RAPSHEET_LOOP_SIZE = { w: 720, h: 1280 } as const;

/**
 * Animated Club Rap Sheet card (GDD 8): a 3 s loop of the mugshot with the gold stamps thumping in, encoded with
 * the clip encoder when one works (WebCodecs, else MediaRecorder); null otherwise (show the still card).
 */
export async function renderRapSheetLoop(input: RapSheetInput, opts: { signal?: AbortSignal } = {}): Promise<{ blob: Blob; mime: string } | null> {
  if (typeof document === 'undefined') return null;
  const card = document.createElement('canvas');
  const out = document.createElement('canvas');
  out.width = RAPSHEET_LOOP_SIZE.w;
  out.height = RAPSHEET_LOOP_SIZE.h;
  const ctx = out.getContext('2d', { alpha: false });
  if (!ctx) return null;
  let enc: ClipEncoder | null = await webCodecsEncoder(RAPSHEET_LOOP_SIZE, null);
  if (!enc) {
    const mr = await import('./clip/encoder-mediarecorder');
    enc = await mr.createMediaRecorderEncoder({ canvas: out, fps: CLIP_FPS, audioStream: null });
  }
  if (!enc) return null;
  try {
    for (let i = 0; i < RAPSHEET_LOOP_FRAMES; i++) {
      if (opts.signal?.aborted) throw new ClipAbortError(CLIP_CANCELLED);
      drawRapSheetCard({ ...input, club: true }, card, i / CLIP_FPS);
      ctx.drawImage(card, 0, 0, out.width, out.height);
      await enc.addFrame(out, i);
    }
    const res = await enc.finish();
    return { blob: res.blob, mime: res.mime };
  } catch {
    await enc.cancel().catch(() => undefined);
    return null;
  } finally {
    card.width = 0;
    out.width = 0;
  }
}

/** Android Chrome intent:// link for an in-app browser handoff; null on iOS / desktop. */
export function androidIntent(link: string): string | null {
  return androidIntentImpl(link);
}

export { canvasBlob };

export const share: ShareApi = {
  planClip,
  exportClip,
  shareClip,
  copyHandoffLink,
  renderResultCard: resultCard,
  shareImage,
  formats,
  renderCard,
  renderCarousel,
  androidIntent,
  shareFiles,
  renderRapSheetLoop,
};
