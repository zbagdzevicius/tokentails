/**
 * Ad purchase form rules, mirrored from the backend (rave-ads.validation.ts) for inline messages only; the
 * server re-checks everything and re-encodes the image. Pure functions plus one canvas helper.
 */

export const AD_NAME_MIN = 2;
export const AD_NAME_MAX = 32;
export const AD_URL_MAX = 300;
export const AD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AD_IMAGE_TYPES: readonly string[] = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const NAME_CHARS_RE = /^[\p{L}\p{N} &.,'!+\-_:]+$/u;
const LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u;
const URLISH_RE = /(:\/\/|www\.|\.(com|net|org|io|xyz|app|gg|co|me|ly|link|site|online|shop)\b)/i;

export type UrlCheck = { ok: true; url: string } | { ok: false; message: string };
export type TextCheck = { ok: true; value: string } | { ok: false; message: string };

/** https only, a public DNS name, no credentials or port, at most 300 characters. */
export function normalizeAdUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, message: 'Add the link people open when they tap your ad.' };
  if (raw.length > AD_URL_MAX || /[\s<>"'`\\]/.test(raw)) return { ok: false, message: 'That link does not look right.' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: /^[a-z][a-z0-9+.-]*:/i.test(raw) ? 'Use an https:// link.' : 'Use a full link starting with https://' };
  }
  if (url.protocol !== 'https:') return { ok: false, message: 'Use an https:// link.' };
  const host = url.hostname.toLowerCase();
  if (url.username || url.password || url.port || IPV4_RE.test(host) || host.startsWith('[') || !HOST_RE.test(host) || /(^|\.)localhost$/.test(host)) {
    return { ok: false, message: 'Use a link to a public website.' };
  }
  if (url.href.length > AD_URL_MAX) return { ok: false, message: 'That link is too long.' };
  return { ok: true, url: url.href };
}

export function checkAdName(input: string): TextCheck {
  const name = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  const n = [...name].length;
  if (n < AD_NAME_MIN) return { ok: false, message: 'Add your brand or name (2+ characters).' };
  if (n > AD_NAME_MAX) return { ok: false, message: `Keep it to ${AD_NAME_MAX} characters.` };
  if (!NAME_CHARS_RE.test(name) || !LETTER_OR_DIGIT_RE.test(name) || URLISH_RE.test(name)) {
    return { ok: false, message: 'Letters, numbers and simple punctuation only (no links).' };
  }
  return { ok: true, value: name };
}

export function checkImageFile(file: { type: string; size: number } | null | undefined): { ok: true } | { ok: false; message: string } {
  if (!file) return { ok: false, message: 'Add an image for your ad.' };
  if (!AD_IMAGE_TYPES.includes(file.type)) return { ok: false, message: 'Use a PNG, JPG or WebP image.' };
  if (file.size > AD_IMAGE_MAX_BYTES) return { ok: false, message: 'The image is over 2 MB. Try a smaller one.' };
  return { ok: true };
}

/** Same gross-up as the server (raveAdQuote): the full price lands after Stripe's fee. */
export function adQuote(priceCents: number, coverFee: boolean, fee: { percentBps: number; fixedCents: number }) {
  if (!coverFee) return { priceCents, feeCents: 0, amountCents: priceCents };
  const num = (priceCents + fee.fixedCents) * 10000;
  const den = 10000 - fee.percentBps;
  const amountCents = Math.floor((num + den - 1) / den);
  return { priceCents, feeCents: amountCents - priceCents, amountCents };
}

/** The centred crop of a `w` x `h` source that has the target `aspect` (w / h). */
export function cropRect(w: number, h: number, aspect: number): { sx: number; sy: number; sw: number; sh: number } {
  if (w <= 0 || h <= 0 || !(aspect > 0)) return { sx: 0, sy: 0, sw: Math.max(0, w), sh: Math.max(0, h) };
  if (w / h > aspect) {
    const sw = Math.round(h * aspect);
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h };
  }
  const sh = Math.round(w / aspect);
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
}

/**
 * Crops the picked image to the slot's aspect and size in the browser (preview and upload). The server
 * crops again, so a page that skips this still gets a correct ad. Rejects when the file cannot be decoded.
 */
export async function cropImageToSlot(file: Blob, px: readonly [number, number]): Promise<{ blob: Blob; url: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const r = cropRect(bitmap.width, bitmap.height, px[0] / px[1]);
    const canvas = document.createElement('canvas');
    canvas.width = px[0];
    canvas.height = px[1];
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, px[0], px[1]);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('encode failed');
    // A large photo can grow past 2 MB as PNG: fall back to JPEG.
    const out = blob.size <= AD_IMAGE_MAX_BYTES ? blob : await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!out) throw new Error('encode failed');
    return { blob: out, url: URL.createObjectURL(out) };
  } finally {
    bitmap.close?.();
  }
}

export const formatCents = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, '')}`;
