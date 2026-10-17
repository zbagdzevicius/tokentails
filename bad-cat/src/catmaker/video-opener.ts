/**
 * 2 s video opener (GDD 6.1 "Opener media", 7.3). The clip's first 2 s are real footage of the cat:
 *
 *   - a video file ≤ 3 MB is kept as is (kind 'video'); the composer reads its 0–2 s;
 *   - a larger one is re-encoded on the device: the first 2 s, ≤ 540p, MediaRecorder over a canvas captureStream;
 *   - without MediaRecorder / captureStream (or when the re-encode fails) the opener falls back to a still frame
 *     (kind 'photo') with a friendly note.
 *
 * `videoGate` is the pure decision; everything else is browser only and never runs at module top level.
 * Videos never leave the device.
 */

export const OPENER_VIDEO_MAX_BYTES = 3 * 1024 * 1024;
export const OPENER_SECONDS = 2;
/** Re-encoded openers: short side at most this many pixels ("540p"). */
export const OPENER_VIDEO_SHORT_SIDE = 540;
export const OPENER_VIDEO_BITRATE = 1_600_000;
/** Shorter than this is no clip: keep a still. */
export const MIN_VIDEO_SECONDS = 0.4;

export type VideoPlan = 'keep' | 'reencode' | 'still';

export const NOTE_KEEP = 'Opener: the first 2 seconds of this video. Lights, camera, cat.';
export const NOTE_REENCODE = 'Big video! We will trim it to the first 2 seconds, right here on your phone.';
export const NOTE_STILL = 'This browser can’t trim videos, so your clip opens on this frame. Still adorable.';
export const NOTE_SHORT = 'That clip is shorter than a slow blink, so your clip opens on this frame.';
export const NOTE_PHOTO_ONLY = 'Clip openers are photos here, so we’ll use this frame.';

/** Pure: what to do with a picked video. `duration` NaN / Infinity = unknown (common for recorded webm). */
export function videoGate(i: { bytes: number; duration: number; canReencode: boolean; allowVideo?: boolean }): { plan: VideoPlan; note: string } {
  if (i.allowVideo === false) return { plan: 'still', note: NOTE_PHOTO_ONLY };
  if (Number.isFinite(i.duration) && i.duration < MIN_VIDEO_SECONDS) return { plan: 'still', note: NOTE_SHORT };
  if (i.bytes > 0 && i.bytes <= OPENER_VIDEO_MAX_BYTES) return { plan: 'keep', note: NOTE_KEEP };
  if (i.canReencode) return { plan: 'reencode', note: NOTE_REENCODE };
  return { plan: 'still', note: NOTE_STILL };
}

/** Pure: re-encode size, short side ≤ 540, even numbers (encoders like those). */
export function reencodeSize(w: number, h: number, shortSide = OPENER_VIDEO_SHORT_SIDE): { w: number; h: number } {
  const s = Math.min(w, h);
  const k = s > shortSide ? shortSide / s : 1;
  const even = (v: number): number => Math.max(2, Math.round((v * k) / 2) * 2);
  return { w: even(w), h: even(h) };
}

/** Pure: a crop rect in one pixel space (aw × ah) mapped to another (bw × bh). */
export function scaleCrop(c: { x: number; y: number; w: number; h: number }, aw: number, ah: number, bw: number, bh: number): { x: number; y: number; w: number; h: number } {
  const kx = aw > 0 ? bw / aw : 1;
  const ky = ah > 0 ? bh / ah : 1;
  return { x: Math.round(c.x * kx), y: Math.round(c.y * ky), w: Math.round(c.w * kx), h: Math.round(c.h * ky) };
}

const MIMES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/** Browser only: the first MediaRecorder MIME type this engine records, or null. */
export function recorderMime(): string | null {
  try {
    const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    if (typeof MR !== 'function') return null;
    if (typeof MR.isTypeSupported !== 'function') return '';
    for (const m of MIMES) if (MR.isTypeSupported(m)) return m;
    return null;
  } catch {
    return null;
  }
}

/** Browser only: can this engine trim a video to 2 s (MediaRecorder + canvas.captureStream)? */
export function canReencode(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown };
    return typeof c.captureStream === 'function' && recorderMime() !== null;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------ video source

export interface VideoSource {
  readonly video: HTMLVideoElement;
  readonly file: Blob;
  /** Seconds; NaN when the engine does not know. */
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  /** Seek and wait for the frame (best effort, never rejects). */
  seek(t: number): Promise<void>;
  dispose(): void;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Browser only: loads a video file into a hidden, muted, inline <video> and keeps it for scrubbing. */
export async function openVideoSource(file: Blob, timeoutMs = 8000): Promise<VideoSource> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  };
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        let done = false;
        const ok = (): void => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        v.onloadeddata = ok;
        // iOS ignores preload and may decode no frame until play(): metadata + a seek is enough there
        v.onloadedmetadata = () => {
          if (v.videoWidth && v.videoHeight) ok();
        };
        v.onerror = () => reject(new Error('video'));
        v.src = url;
        v.load();
        try {
          const pr = v.play();
          if (pr && typeof pr.then === 'function') pr.then(() => v.pause()).catch(() => undefined);
        } catch {
          /* autoplay refused: a seek still decodes a frame on most engines */
        }
      }),
      timeoutMs,
    );
    if (!v.videoWidth || !v.videoHeight) throw new Error('no frame');
  } catch (e) {
    dispose();
    throw e;
  }
  const seek = async (t: number): Promise<void> => {
    if (disposed) return;
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
    const tt = Math.max(0, Math.min(t, d - 0.01));
    if (Math.abs(v.currentTime - tt) < 0.001) return;
    await withTimeout(
      new Promise<void>((resolve) => {
        v.onseeked = () => resolve();
        v.currentTime = tt;
      }),
      3000,
    ).catch(() => undefined); // some engines never fire seeked: use the current frame
  };
  return {
    video: v,
    file,
    get duration() {
      return Number.isFinite(v.duration) ? v.duration : NaN;
    },
    width: v.videoWidth,
    height: v.videoHeight,
    seek,
    dispose,
  };
}

/**
 * Browser only: the first OPENER_SECONDS of a video, re-encoded at ≤ 540p with MediaRecorder from a canvas
 * captureStream (the canvas also does the downscale). Resolves null on any failure or when the result is still
 * over the size cap; the caller then keeps a still.
 */
export async function trimVideo(src: VideoSource, seconds = OPENER_SECONDS): Promise<{ blob: Blob; width: number; height: number } | null> {
  const mime = recorderMime();
  if (mime === null) return null;
  const v = src.video;
  const size = reencodeSize(src.width, src.height);
  const canvas = document.createElement('canvas') as HTMLCanvasElement & { captureStream?(fps?: number): MediaStream };
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') return null;
  let raf = 0;
  let rec: MediaRecorder | null = null;
  try {
    await src.seek(0);
    ctx.drawImage(v, 0, 0, size.w, size.h);
    const stream = canvas.captureStream(30);
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: OPENER_VIDEO_BITRATE } : { videoBitsPerSecond: OPENER_VIDEO_BITRATE });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      rec!.onstop = () => resolve();
    });
    rec.start(250);
    const draw = (): void => {
      try {
        ctx.drawImage(v, 0, 0, size.w, size.h);
      } catch {
        /* frame not ready */
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    await v.play();
    await withTimeout(
      new Promise<void>((resolve) => {
        const tick = (): void => {
          if (v.currentTime >= seconds || v.ended) return resolve();
          setTimeout(tick, 30);
        };
        tick();
      }),
      (seconds + 4) * 1000,
    ).catch(() => undefined);
    v.pause();
    cancelAnimationFrame(raf);
    if (rec.state !== 'inactive') rec.stop();
    await withTimeout(stopped, 3000).catch(() => undefined);
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: (mime || rec.mimeType || 'video/webm').split(';')[0] });
    if (!blob.size || blob.size > OPENER_VIDEO_MAX_BYTES) return null;
    return { blob, width: size.w, height: size.h };
  } catch {
    cancelAnimationFrame(raf);
    try {
      if (rec && rec.state !== 'inactive') rec.stop();
    } catch {
      /* ignore */
    }
    return null;
  }
}
