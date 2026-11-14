/**
 * Can this browser record a highlight clip (docs/plans/moba/SHARE-PUSH.md §1)? Tiny and in the main chunk, so the
 * Legend Moment card knows whether to offer a clip without loading the recorder (share/clip.ts).
 */

/** The recorder formats, best first: MP4 (H.264) plays everywhere and goes straight to Photos and TikTok. */
export const CLIP_MIMES: readonly string[] = Object.freeze([
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]);

/** The first format this browser records, or null. Pure. */
export function pickMime(isSupported: (m: string) => boolean): { mime: string; ext: 'mp4' | 'webm' } | null {
  for (const m of CLIP_MIMES) {
    let ok = false;
    try {
      ok = isSupported(m);
    } catch {
      ok = false;
    }
    if (ok) return { mime: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  return null;
}

/** This browser can record a clip: MediaRecorder, canvas streams and one known format. */
export function clipSupported(): boolean {
  try {
    const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== 'function') return false;
    if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false;
    return !!pickMime((m) => MR.isTypeSupported(m));
  } catch {
    return false;
  }
}

