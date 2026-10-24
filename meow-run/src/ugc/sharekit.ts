// Sharing helpers every UGC lane uses (clips, photos, share cards, challenge and trail links). INTEGRATOR-owned.
// Web Share API with files when the browser can, else a download (files) or the clipboard (links).
// iOS Safari only shares inside a fresh user gesture: build the file first, then call shareOrDownload straight from
// a button's click handler (no long await before it).

/** The canonical page for links: tokentails.com/meow-run in production, this page anywhere else (dev, previews). */
export function shareBase(): string {
  if (typeof location === 'undefined') return 'https://tokentails.com/meow-run';
  if (/(^|\.)tokentails\.com$/.test(location.hostname)) return 'https://tokentails.com/meow-run';
  return location.origin + location.pathname;
}
/** The watermark and card footer text (branding; links use shareBase()). */
export const WATERMARK = 'tokentails.com/meow-run';

/** shareBase() + ?k=v... (values are URL-encoded) */
export function linkWith(params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return q ? `${shareBase()}?${q}` : shareBase();
}

/** The page's query parameters (?c= challenge, ?t= trail). */
export function readParams(): URLSearchParams {
  return new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
}
/** Drop consumed parameters from the address bar (no reload), so a refresh does not replay the link. */
export function clearParams(keys: string[]): void {
  try {
    const u = new URL(location.href);
    for (const k of keys) u.searchParams.delete(k);
    history.replaceState(history.state, '', u.pathname + (u.search ? u.search : '') + u.hash);
  } catch {
    /* sandboxed */
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export type ShareOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

/**
 * Share a file (clip, photo, card) and/or a link. With a file: the native share sheet if it accepts files, else a
 * download. Without a file: the native share sheet for the link, else the clipboard.
 */
export async function shareOrDownload(o: { file?: File; title: string; text: string; url?: string }): Promise<ShareOutcome> {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { canShare?: (d: ShareData) => boolean });
  const text = o.url ? `${o.text} ${o.url}` : o.text;
  try {
    if (o.file) {
      if (nav?.share && nav.canShare?.({ files: [o.file] })) {
        await nav.share({ files: [o.file], title: o.title, text });
        return 'shared';
      }
      downloadBlob(o.file, o.file.name);
      return 'downloaded';
    }
    if (nav?.share && o.url) {
      await nav.share({ title: o.title, text: o.text, url: o.url });
      return 'shared';
    }
    return (await copyText(text)) ? 'copied' : 'failed';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    // a share sheet that refuses (NotAllowedError after a slow render): fall back so the player still gets the thing
    if (o.file) {
      downloadBlob(o.file, o.file.name);
      return 'downloaded';
    }
    return (await copyText(text)) ? 'copied' : 'failed';
  }
}

/** Safe file name stem: meowrun-<what>-<yyyymmdd-hhmm> */
export function fileStem(what: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `meowrun-${what}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
