/**
 * Save a made file (a clip video, the Legend Moment picture) on every platform, and say plainly what happened.
 *
 * - Web (desktop and phone browsers): a download (`<a download>`), "Saved to your Downloads."
 * - The app (iOS, Android, Mac): a WebView ignores `<a download>`, so it never counts as saved there. A shell that has
 *   the native `PawlegendsShell.saveFile` (from the store build after Nov 18 2026: Android MediaStore, Movies /
 *   Pictures › Paw Legends; iOS Photos) saves straight to the gallery; else (an older binary, Photos access refused)
 *   the system share sheet with the file ("Save Video" / "Save to Files"); else the player is told it cannot be saved
 *   in this app version.
 *
 * Founder, Nov 18: "I can't save it". Before this, Save said "Saved." in the app while nothing was saved.
 * Lives in the share chunks (clip.ts, card.ts): nothing here loads before a player saves.
 */
import { shellPlatform, type ShellPlatform } from '../app/platform';

export type SaveVia = 'download' | 'device' | 'sheet';
export type SaveFail = 'cancelled' | 'unsupported' | 'denied' | 'error';
export type SaveResult = { ok: true; via: SaveVia; note: string } | { ok: false; why: SaveFail; note: string };

/** How a file gets saved here. Pure. */
export function saveRoute(o: { platform: ShellPlatform | null; native: boolean; shareFiles: boolean }): 'download' | 'device' | 'sheet' | 'none' {
  if (o.platform === null) return 'download';
  if (o.native) return 'device';
  if (o.shareFiles) return 'sheet';
  return 'none';
}

/** The player-facing line for a result. Pure. */
export function saveNote(r: { ok: true; via: SaveVia; video: boolean; folder?: string | null } | { ok: false; why: SaveFail; video: boolean }): string {
  const thing = r.video ? 'video' : 'picture';
  if (r.ok) {
    if (r.via === 'download') return 'Saved to your Downloads.';
    if (r.via === 'device') return r.folder === 'Photos' ? 'Saved to Photos.' : `Saved to your gallery${r.folder ? ` (${r.folder.replace(/\//g, ' › ')})` : ''}.`;
    return 'Done.';
  }
  if (r.why === 'cancelled') return '';
  if (r.why === 'denied') return `Allow Paw Legends to add to Photos in Settings, then save the ${thing} again.`;
  if (r.why === 'unsupported') return `This app version can't save the ${thing}. Update the app, or save it on pawlegends.app.`;
  return `Couldn't save the ${thing}. Try again.`;
}

export interface CapLike {
  PluginHeaders?: { name: string; methods?: { name: string }[] }[];
  nativePromise?: (plugin: string, method: string, opts: Record<string, unknown>) => Promise<unknown>;
}

const cap = (): CapLike | null => {
  try {
    return ((globalThis as { Capacitor?: CapLike }).Capacitor ?? null) as CapLike | null;
  } catch {
    return null;
  }
};

/** The native shell can save files itself (`PawlegendsShell.saveFile`). */
export function nativeSaveAvailable(c: CapLike | null = cap()): boolean {
  try {
    if (typeof c?.nativePromise !== 'function') return false;
    const h = c.PluginHeaders?.find((p) => p.name === 'PawlegendsShell');
    return !!h?.methods?.some((m) => m.name === 'saveFile');
  } catch {
    return false;
  }
}

type Nav = Navigator & { canShare?: (d: ShareData) => boolean };

/** The system share sheet takes this file. */
export function canShareFile(file: File | null, nav: Nav | null = typeof navigator !== 'undefined' ? (navigator as Nav) : null): boolean {
  try {
    return !!file && !!nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** A browser download. True when the link was clicked (a browser can still block it; nothing tells us). */
export function download(blob: Blob, name: string): boolean {
  try {
    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
    return true;
  } catch {
    return false;
  }
}

const base64Of = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      res(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => rej(r.error ?? new Error('read'));
    r.readAsDataURL(blob);
  });

/** Save `blob` as `name`. Never throws. */
export async function saveFile(blob: Blob, name: string, o: { platform?: ShellPlatform | null; capacitor?: CapLike | null; nav?: Nav | null } = {}): Promise<SaveResult> {
  const video = blob.type.startsWith('video/');
  const platform = o.platform !== undefined ? o.platform : shellPlatform();
  const c = o.capacitor !== undefined ? o.capacitor : cap();
  const nav = o.nav !== undefined ? o.nav : typeof navigator !== 'undefined' ? (navigator as Nav) : null;
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: blob.type }) : null;
  const route = saveRoute({ platform, native: nativeSaveAvailable(c), shareFiles: canShareFile(file, nav) });
  const fail = (why: SaveFail): SaveResult => ({ ok: false, why, note: saveNote({ ok: false, why, video }) });
  if (route === 'download') return download(blob, name) ? { ok: true, via: 'download', note: saveNote({ ok: true, via: 'download', video }) } : fail('error');
  if (route === 'device') {
    try {
      const r = (await c!.nativePromise!('PawlegendsShell', 'saveFile', { name, mime: blob.type, data: await base64Of(blob) })) as { folder?: string } | null;
      return { ok: true, via: 'device', note: saveNote({ ok: true, via: 'device', video, folder: typeof r?.folder === 'string' ? r.folder : null }) };
    } catch (err) {
      // Android 8-9 (no gallery folder without a permission), Photos access refused, a WebM on iOS: the share sheet
      // when there is one, else say why
      if (!canShareFile(file, nav)) {
        const code = (err as { code?: string })?.code;
        return fail(code === 'UNSUPPORTED' ? 'unsupported' : code === 'DENIED' ? 'denied' : 'error');
      }
    }
  }
  if (route === 'sheet' || route === 'device') {
    try {
      await nav!.share({ files: [file!] });
      return { ok: true, via: 'sheet', note: saveNote({ ok: true, via: 'sheet', video }) };
    } catch (err) {
      return fail((err as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'error');
    }
  }
  return fail('unsupported');
}
