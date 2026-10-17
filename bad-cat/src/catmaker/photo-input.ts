/**
 * Photo / video input (GDD 6.1 "Photo input"). Decodes on the device, never uploads.
 * Images: createImageBitmap (EXIF orientation applied) → <img> fallback. HEIC that the browser cannot decode
 * → a friendly error asking for a screenshot or a JPEG. Video: the source stays open for the 2 s scrubber.
 * Output is a working canvas capped at MAX_WORK_PX on the long side, plus the scale back to source pixels.
 */

import { openVideoSource, type VideoSource } from './video-opener';

export const MAX_WORK_PX = 1600;
export const OPENER_MAX_PX = 1280;

export const ACCEPT_CAMERA = 'image/jpeg,image/png,image/*';
export const ACCEPT_GALLERY = 'image/jpeg,image/png,image/*,video/*';

export interface DecodedPhoto {
  canvas: HTMLCanvasElement; // working copy
  /** working px × scale = source px */
  scale: number;
  kind: 'photo' | 'video';
  /** Videos: the open source for the 2 s scrubber and the opener (dispose when done). */
  video?: VideoSource;
  /** The picked file (videos keep it as the opener when it is small enough). */
  file?: Blob;
}

export class PhotoError extends Error {
  constructor(
    public readonly code: 'heic' | 'decode' | 'video' | 'empty',
    message: string,
  ) {
    super(message);
  }
}

export const MSG_CANT_OPEN = "This photo won't open here. Send a screenshot or a JPEG instead.";
export const MSG_VIDEO = "That video won't open here. Try a photo or a screenshot.";

export function isHeic(file: { type?: string; name?: string }): boolean {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif');
}

export function isVideo(file: { type?: string; name?: string }): boolean {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name || '');
}

/** Fit (w, h) into a max long side; returns integer size and scale (out → in). */
export function fitSize(w: number, h: number, maxPx: number): { w: number; h: number; scale: number } {
  const long = Math.max(w, h);
  const k = long > maxPx ? maxPx / long : 1;
  const ow = Math.max(1, Math.round(w * k));
  const oh = Math.max(1, Math.round(h * k));
  return { w: ow, h: oh, scale: w / ow };
}

function drawToWorkCanvas(src: CanvasImageSource, w: number, h: number): { canvas: HTMLCanvasElement; scale: number } {
  const f = fitSize(w, h, MAX_WORK_PX);
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new PhotoError('decode', MSG_CANT_OPEN);
  ctx.drawImage(src, 0, 0, f.w, f.h);
  return { canvas: c, scale: f.scale };
}

async function decodeImage(file: Blob): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      try {
        return drawToWorkCanvas(bmp, bmp.width, bmp.height);
      } finally {
        bmp.close?.();
      }
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('img decode'));
      img.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty');
    return drawToWorkCanvas(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Initial frame of a video for the face crop: ~0.5 s in, or the middle of a very short clip. Pure. */
export function initialFrameTime(duration: number): number {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 1;
  return Math.min(0.5, d / 2);
}

/** Browser only: redraws the video's current frame into an existing working canvas (scrubber). */
export function drawVideoFrame(src: VideoSource, work: HTMLCanvasElement): void {
  work.getContext('2d')?.drawImage(src.video, 0, 0, work.width, work.height);
}

/** Opens a video and grabs the initial frame; the source stays open for scrubbing (the caller disposes it). */
async function grabVideoFrame(file: Blob): Promise<{ canvas: HTMLCanvasElement; scale: number; video: VideoSource }> {
  const src = await openVideoSource(file);
  try {
    await src.seek(initialFrameTime(src.duration));
    return { ...drawToWorkCanvas(src.video, src.width, src.height), video: src };
  } catch (e) {
    src.dispose();
    throw e;
  }
}

/** Decodes a picked file. Throws PhotoError with a user-facing message. */
export async function decodeFile(file: File): Promise<DecodedPhoto> {
  if (!file || file.size === 0) throw new PhotoError('empty', MSG_CANT_OPEN);
  if (isVideo(file)) {
    try {
      const r = await grabVideoFrame(file);
      return { ...r, kind: 'video', file };
    } catch {
      throw new PhotoError('video', MSG_VIDEO);
    }
  }
  try {
    const r = await decodeImage(file);
    return { ...r, kind: 'photo', file };
  } catch {
    throw new PhotoError(isHeic(file) ? 'heic' : 'decode', MSG_CANT_OPEN);
  }
}

/** Opener still (JPEG, ≤ OPENER_MAX_PX) from the working canvas. Kept as the clip opener (GDD 7.3). */
/**
 * A crop rect in working-canvas pixels → the same rect in opener pixels (openerCanvas downscales the working copy
 * to OPENER_MAX_PX). Round 3: FaceDecal.crop is stored in OPENER pixels, because that is the image the clip
 * composer crops; it used to be source-photo pixels, ~3× off for a 4032 × 3024 phone photo. Pure, tested.
 */
export function cropToOpener(crop: { x: number; y: number; w: number; h: number }, workW: number, workH: number): { x: number; y: number; w: number; h: number } {
  const f = fitSize(workW, workH, OPENER_MAX_PX);
  const k = workW > 0 ? f.w / workW : 1;
  return { x: Math.round(crop.x * k), y: Math.round(crop.y * k), w: Math.round(crop.w * k), h: Math.round(crop.h * k) };
}

export function openerCanvas(work: HTMLCanvasElement): HTMLCanvasElement {
  const f = fitSize(work.width, work.height, OPENER_MAX_PX);
  if (f.w === work.width && f.h === work.height) return work;
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  c.getContext('2d')?.drawImage(work, 0, 0, f.w, f.h);
  return c;
}

/**
 * Opens the system picker. Resolves with the file, or null on `cancel` (where supported). Without `cancel`
 * support the promise simply stays pending after a back-out, so callers must not block the UI on it.
 */
export function pickFile(opts: { accept: string; capture?: boolean }): Promise<File | null> {
  return new Promise((resolve) => {
    document.querySelectorAll('input[data-bcm-picker]').forEach((el) => el.remove());
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.accept;
    input.dataset.bcmPicker = '1';
    if (opts.capture) input.setAttribute('capture', 'environment');
    input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px';
    let done = false;
    const finish = (f: File | null): void => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}
