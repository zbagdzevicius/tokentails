// Rolling replay capture (browser). The game canvas and the game audio are recorded by MediaRecorder in standalone
// 6 s segments (the next recorder starts on the same stream before the previous one stops, so there is no gap); the
// ring keeps the last 3. A recorder exists only while a run is live (play, paused, finish, which holds the finish
// flourish) and for a moment after stageEnd so the encoder flushes; capture.endMark is the stageEnd time on the
// capture clock, and a clip ends there (never on the results screen's idle camera). There is no per-frame JS: the browser captures and encodes. Off or idle = no stream.
// Any failure warns once and switches capture off for the session (never console.error: the smoke fails on it).
import { onAudioInit, type AudioHandles } from '../audio/synth';
import { getQuality, renderer } from '../core/engine';
import { events } from '../core/events';
import { game } from '../core/state';
import { save } from '../ui/flow';
import { pickMime, type ClipMime } from './mime';
import { SegmentRing } from './ring';

export const SEGMENT_SECONDS = 6;
/** keep recording this long after stageEnd (the encoder flushes; the clip itself ends at endMark) */
export const AFTER_END_MS = 400;
/** the capture-clock time of the last stageEnd (-1 = the run is still going) */
export const endMark = { t: -1 };
/** a segment shorter than this is dropped (it would only push a longer one out of the ring) */
const MIN_SEGMENT = 0.25;

interface LiveSegment {
  rec: MediaRecorder;
  chunks: Blob[];
  t0: number;
  epoch: number;
}

export const ring = new SegmentRing<Blob>();

let mime: ClipMime | null | undefined;
let failed = false;
let warned = false;
let stream: MediaStream | null = null;
let cur: LiveSegment | null = null;
let tick = 0;
let endTimer = 0;
let resizeT = 0;
let epoch = 0;
let A: AudioHandles | null = null;
let dest: MediaStreamAudioDestinationNode | null = null;
let audioLinked = false;
// capture clock: seconds of recorded time (pauses excluded)
let clockAcc = 0;
let clockSince = 0;
const listeners: (() => void)[] = [];

/** the container this browser records (null = none); probed once */
export function clipMime(): ClipMime | null {
  if (mime !== undefined) return mime;
  try {
    const ok =
      typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
      typeof MediaStream !== 'undefined';
    mime = ok ? pickMime((t) => MediaRecorder.isTypeSupported(t)) : null;
  } catch {
    mime = null;
  }
  return mime;
}

/** The Replays setting allows capture and this browser can do it (and it has not failed this session). */
export function captureEnabled(): boolean {
  if (failed) return false;
  const mode = save.settings.capture ?? 'auto';
  if (mode === 'off') return false;
  return !!clipMime();
}
export const isRecording = () => !!cur;
export const captureFailed = () => failed;

/** recorded seconds so far on the capture clock */
export function recNow(): number {
  return clockAcc + (clockSince ? (performance.now() - clockSince) / 1000 : 0);
}
/** seconds of footage available now (finished segments + the live one) */
export function availableSeconds(): number {
  return ring.seconds + (cur ? Math.max(0, recNow() - cur.t0) : 0);
}
/** Something changed that clipReady() depends on (the clip lane refreshes its buttons). */
export function onCaptureChange(fn: () => void): void {
  listeners.push(fn);
}
function changed(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener never breaks capture */
    }
  }
}

/** warn once, switch capture off for the session */
export function captureFail(err: unknown): void {
  if (!warned) {
    warned = true;
    console.warn('Meow Run: replays are off for this session', err);
  }
  failed = true;
  teardown(false);
  changed();
}

function linkAudio(on: boolean): void {
  if (!A) return;
  try {
    if (on && !audioLinked) {
      dest ??= A.ctx.createMediaStreamDestination();
      A.out.connect(dest);
      audioLinked = true;
    } else if (!on && audioLinked && dest) {
      A.out.disconnect(dest);
      audioLinked = false;
    }
  } catch {
    audioLinked = false;
  }
}

function startSegment(): LiveSegment | null {
  if (!stream || !mime) return null;
  const tracks = [...stream.getVideoTracks()];
  if (audioLinked && dest) tracks.push(...dest.stream.getAudioTracks());
  const low = getQuality() === 'low';
  const rec = new MediaRecorder(new MediaStream(tracks), {
    mimeType: mime.mime,
    videoBitsPerSecond: low ? 1_200_000 : 2_500_000,
    audioBitsPerSecond: 96_000,
  });
  const seg: LiveSegment = { rec, chunks: [], t0: recNow(), epoch };
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) seg.chunks.push(e.data);
  };
  rec.onerror = (e) => captureFail((e as Event & { error?: unknown }).error ?? e);
  rec.start();
  if (game.mode === 'paused') rec.pause();
  return seg;
}

/** Stop a segment; resolves once its file is in the ring (or dropped). */
function finishSegment(seg: LiveSegment): Promise<void> {
  const t1 = recNow();
  return new Promise((resolve) => {
    const done = () => {
      try {
        if (seg.epoch === epoch && t1 - seg.t0 >= MIN_SEGMENT && seg.chunks.length) {
          const blob = new Blob(seg.chunks, { type: seg.rec.mimeType || mime?.mime || 'video/webm' });
          if (blob.size > 0) ring.push({ blob, t0: seg.t0, t1 });
        }
      } finally {
        resolve();
        changed();
      }
    };
    if (seg.rec.state === 'inactive') return done();
    seg.rec.onstop = done;
    try {
      seg.rec.stop();
    } catch {
      done();
    }
  });
}

function rotate(): void {
  if (!cur) return;
  try {
    if (recNow() - cur.t0 < SEGMENT_SECONDS) return;
    const prev = cur;
    cur = startSegment();
    void finishSegment(prev);
  } catch (err) {
    captureFail(err);
  }
}

function freshStream(): void {
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = renderer.domElement.captureStream(getQuality() === 'low' ? 24 : 30);
}

/** Start recording the run (stageStart, or the setting turned on mid-run). */
function begin(): void {
  if (stream || !captureEnabled()) return;
  try {
    freshStream();
    linkAudio(true);
    clockAcc = 0;
    clockSince = game.mode === 'paused' ? 0 : performance.now();
    cur = startSegment();
    tick = window.setInterval(rotate, 500);
    changed();
  } catch (err) {
    captureFail(err);
  }
}

/** Stop everything; keep = finish the live segment into the ring (results), else drop it and clear the ring. */
function teardown(keep: boolean): Promise<void> {
  clearInterval(tick);
  clearTimeout(endTimer);
  clearTimeout(resizeT);
  tick = 0;
  endTimer = 0;
  let p: Promise<void> = Promise.resolve();
  if (!keep) {
    epoch++;
    ring.clear();
  }
  if (cur) {
    const seg = cur;
    cur = null;
    if (keep) p = finishSegment(seg);
    else
      try {
        seg.rec.stop();
      } catch {
        /* already stopped */
      }
  }
  if (clockSince) clockAcc += (performance.now() - clockSince) / 1000;
  clockSince = 0;
  if (stream) {
    for (const t of stream.getTracks()) t.stop();
    stream = null;
  }
  linkAudio(false);
  return p;
}

/**
 * Close the live segment so the ring holds everything up to now (the clip sheet calls it first). While paused the
 * next segment starts on resume; in the 1.5 s after stageEnd recording ends here.
 */
export async function cutNow(): Promise<void> {
  if (!cur) return;
  if (game.mode === 'over' || game.mode === 'title') {
    await teardown(true);
    return;
  }
  const prev = cur;
  cur = game.mode === 'paused' ? null : safeStart();
  await finishSegment(prev);
}
function safeStart(): LiveSegment | null {
  try {
    return startSegment();
  } catch (err) {
    captureFail(err);
    return null;
  }
}

/** The Replays setting changed. */
export function captureSettingChanged(): void {
  if (!captureEnabled()) {
    void teardown(false);
  } else if (!stream && (game.mode === 'play' || game.mode === 'paused' || game.mode === 'finish')) {
    begin();
  }
  changed();
}

let installed = false;
export function installCapture(): void {
  if (installed) return;
  installed = true;
  onAudioInit((a) => {
    A = a;
    // the run started before the first gesture: the next segment carries the game audio
    if (stream) linkAudio(true);
  });
  events.on('stageStart', () => {
    endMark.t = -1;
    void teardown(false);
    begin();
  });
  events.on('pause', () => {
    if (clockSince) clockAcc += (performance.now() - clockSince) / 1000;
    clockSince = 0;
    try {
      if (cur && cur.rec.state === 'recording') cur.rec.pause();
    } catch (err) {
      captureFail(err);
    }
  });
  events.on('resume', () => {
    if (!stream) return;
    clockSince = performance.now();
    try {
      if (cur && cur.rec.state === 'paused') cur.rec.resume();
      else if (!cur) {
        // the clip sheet closed the segment while paused: a fresh canvas track (a new encoder on a track that sat
        // idle can trip Chrome's MP4 muxer)
        freshStream();
        cur = startSegment();
      }
    } catch (err) {
      captureFail(err);
    }
  });
  events.on('stageEnd', () => {
    if (!stream) return;
    endMark.t = recNow();
    clearTimeout(endTimer);
    endTimer = window.setTimeout(() => void teardown(true), AFTER_END_MS);
  });
  // the canvas changes size (rotation, window resize, the quality auto-downgrade): MP4 (avc1) cannot change resolution
  // inside one file, so the live segment ends here and the next one starts on a fresh track
  // (debounced: phones resize while the address bar slides, desktops while a window edge is dragged)
  const resized = () => {
    if (!stream) return;
    if (cur) {
      const prev = cur;
      cur = null;
      void finishSegment(prev);
    }
    clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      if (!stream || cur) return;
      try {
        freshStream();
        if (game.mode !== 'paused') cur = startSegment();
        changed();
      } catch (err) {
        captureFail(err);
      }
    }, 300);
  };
  addEventListener('resize', resized);
  events.on('qualityChange', resized);
  const drop = () => {
    void teardown(false);
    changed();
  };
  events.on('quit', drop);
  events.on('stageLoad', drop);
}
