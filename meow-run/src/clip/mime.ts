// Pure: pick the clip container. MP4 first (Instagram and TikTok uploads on iOS reject WebM), WebM as the fallback.
export type ClipExt = 'mp4' | 'webm';
export interface ClipMime {
  mime: string;
  ext: ClipExt;
}

export const MIME_ORDER: readonly string[] = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** The first supported type in MIME_ORDER (null = the browser records none of them). Never throws. */
export function pickMime(isSupported: (t: string) => boolean): ClipMime | null {
  for (const mime of MIME_ORDER) {
    let ok = false;
    try {
      ok = !!isSupported(mime);
    } catch {
      ok = false;
    }
    if (ok) return { mime, ext: extFor(mime) };
  }
  return null;
}

/** 'video/mp4;codecs=...' -> 'mp4'; anything else -> 'webm' */
export function extFor(mime: string): ClipExt {
  return /^video\/mp4/i.test(mime.trim()) ? 'mp4' : 'webm';
}
