/**
 * 2 s video opener (GDD 7.3, M1a): decode the first 2 s of the player's cat video into 60 frames before the clip
 * pass (frames 0..59), cropped to the output framing with the face on FACE_RECT, so the match cut at 2.0 s lands.
 * Uses a hidden <video> and requestVideoFrameCallback; returns null where that is missing (the caller then uses
 * the one-frame still). Frames are downscaled (OPENER_SCALE) to bound memory: 60 x 540 x 960 x 4 B ≈ 124 MB.
 */
import { CLIP_H, CLIP_W } from '../../types';
import { openerSourceRect, type OpenerImage } from './compose';
import type { Rect } from './gates';
import { CLIP_FPS, OPENER_FRAMES } from './highlights';

export const OPENER_SCALE = 0.75;
export const VIDEO_OPENER_TIMEOUT_MS = 8000;

/**
 * For each of `n` output frames at `fps`, the index of the decoded frame to show: the last decoded frame whose
 * media time is at or before the output time (+ half a frame), else the first one. Pure (tested).
 */
export function pickFrameIndices(times: readonly number[], n = OPENER_FRAMES, fps = CLIP_FPS): number[] {
  const out: number[] = [];
  if (!times.length) return out;
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = k / fps + 0.5 / fps;
    while (j + 1 < times.length && times[j + 1] <= t) j++;
    out.push(j);
  }
  return out;
}

export function videoFrameCallbackSupported(): boolean {
  return typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback(cb: (now: number, meta: { mediaTime: number }) => void): number;
};

/** Decode frames 0..59 of a video opener. Null on any failure or without requestVideoFrameCallback. */
export async function decodeVideoOpener(
  media: Blob,
  opts: { faceCrop?: Rect | null; out?: { w: number; h: number }; n?: number; timeoutMs?: number } = {},
): Promise<OpenerImage[] | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function' || !videoFrameCallbackSupported()) return null;
  const n = opts.n ?? OPENER_FRAMES;
  const out = opts.out ?? { w: CLIP_W, h: CLIP_H };
  const rw = Math.round(out.w * OPENER_SCALE);
  const rh = Math.round(out.h * OPENER_SCALE);
  const url = URL.createObjectURL(media);
  const v = document.createElement('video') as RvfcVideo;
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.setAttribute('playsinline', '');
  v.style.cssText = 'position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  const got: { t: number; bmp: ImageBitmap }[] = [];
  const pending: Promise<void>[] = [];
  const endT = n / CLIP_FPS;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('video opener timeout')), opts.timeoutMs ?? VIDEO_OPENER_TIMEOUT_MS);
      let src: Rect | null = null;
      const finish = () => {
        clearTimeout(timer);
        try {
          v.pause();
        } catch {
          /* ignore */
        }
        resolve();
      };
      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (!src) src = openerSourceRect(v.videoWidth, v.videoHeight, 0, opts.faceCrop ?? null, out);
        const t = meta.mediaTime;
        const r = src;
        pending.push(
          createImageBitmap(v, r.x, r.y, r.w, r.h, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium' })
            .then((bmp) => {
              got.push({ t, bmp });
            })
            .catch(() => undefined),
        );
        if (t >= endT || v.ended) finish();
        else v.requestVideoFrameCallback(onFrame);
      };
      v.onended = finish;
      v.onerror = () => {
        clearTimeout(timer);
        reject(new Error('video opener decode error'));
      };
      v.onloadeddata = () => {
        v.requestVideoFrameCallback(onFrame);
        v.play().catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
      };
      v.src = url;
    });
    await Promise.all(pending);
    if (!got.length) return null;
    got.sort((a, b) => a.t - b.t);
    const idx = pickFrameIndices(
      got.map((g) => g.t - got[0].t),
      n,
    );
    const used = new Set(idx);
    got.forEach((g, i) => {
      if (!used.has(i)) g.bmp.close();
    });
    return idx.map((i) => got[i].bmp);
  } catch {
    for (const g of got) g.bmp.close();
    return null;
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute('src');
    v.remove();
  }
}

/** Close every distinct bitmap of a decoded opener. */
export function closeOpenerFrames(frames: readonly OpenerImage[] | null | undefined): void {
  if (!frames) return;
  for (const f of new Set(frames)) {
    try {
      (f as { close?: () => void }).close?.();
    } catch {
      /* ignore */
    }
  }
}
