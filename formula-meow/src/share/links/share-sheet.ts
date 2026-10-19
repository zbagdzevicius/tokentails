// Copied from bad-cat/src/share/share-sheet.ts at 4889ed41 (copy, never import; import paths adapted for formula-meow).
/**
 * Share-on-tap (GDD 7.3 Delivery). Must run from a fresh user gesture: navigator.share({ files }) first, then a
 * download link with a "Saved. Post it to TikTok" toast, then an inline <video> with "long-press to save".
 */
export type ShareMethod = 'native_share' | 'download' | 'long_press' | 'cancelled';

export function clipFileName(mime: string, now = new Date()): string {
  const ext = mime.includes('webm') ? 'webm' : 'mp4';
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `formula-meow-${d}.${ext}`;
}

function inAppUa(ua: string): boolean {
  return /BytedanceWebview|musical_ly|TikTok|Instagram|FBAN|FBAV/i.test(ua);
}

/** Can this browser share files with navigator.share? */
export function canShareFile(file: File, nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareClip(clip: Blob, text: string): Promise<ShareMethod> {
  const type = clip.type || 'video/mp4';
  const file = new File([clip], clipFileName(type), { type });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], text });
      return 'native_share';
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'AbortError') return 'cancelled';
      // NotAllowedError (no fresh gesture) or a webview refusing: fall through to download.
    }
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (!inAppUa(ua) && downloadSupported()) {
    downloadBlob(clip, file.name);
    showToast('Saved. Post it to TikTok');
    return 'download';
  }
  showInlineVideo(clip);
  return 'long_press';
}

/** Share a still image (result or story card): native share with files → download → inline image to long-press. */
export async function shareImage(png: Blob, text: string, filename: string): Promise<ShareMethod> {
  const type = png.type || 'image/png';
  const file = new File([png], filename, { type });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], text });
      return 'native_share';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (!inAppUa(ua) && downloadSupported()) {
    downloadBlob(png, filename);
    showToast('Card saved');
    return 'download';
  }
  showInlineImage(png);
  return 'long_press';
}

function showInlineImage(png: Blob): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(png);
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:10000;background:rgba(20,12,24,.88);display:grid;place-items:center;padding:16px;' +
    'padding-top:calc(16px + env(safe-area-inset-top))';
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Result card';
  img.style.cssText = 'max-width:100%;max-height:78vh;border-radius:14px';
  const note = document.createElement('p');
  note.textContent = 'Long-press the card to save it. Tap outside to close.';
  note.style.cssText = 'color:#fff;font:600 15px system-ui,sans-serif;text-align:center;margin:12px 0 0';
  const box = document.createElement('div');
  box.append(img, note);
  wrap.appendChild(box);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) {
      wrap.remove();
      URL.revokeObjectURL(url);
    }
  });
  document.body.appendChild(wrap);
}

export function downloadSupported(): boolean {
  if (typeof document === 'undefined') return false;
  return 'download' in document.createElement('a');
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const OVERLAY_ID = 'bc-share-overlay';

export function showToast(msg: string, ms = 2600): void {
  if (typeof document === 'undefined') return;
  const t = document.createElement('div');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  t.style.cssText =
    'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);' +
    'background:#2b1d2e;color:#fff;padding:12px 18px;border-radius:14px;font:600 15px system-ui,sans-serif;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.35);z-index:10000;max-width:calc(100% - 32px);text-align:center';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/** Full-screen inline video with "long-press to save" and a close button. */
export function showInlineVideo(clip: Blob): HTMLElement {
  // replacing an open overlay releases its clip blob too (several MB each), not only the "Done" path
  const prev = document.getElementById(OVERLAY_ID);
  if (prev) {
    const old = prev.querySelector('video')?.getAttribute('src');
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
    prev.remove();
  }
  const url = URL.createObjectURL(clip);
  const wrap = document.createElement('div');
  wrap.id = OVERLAY_ID;
  wrap.style.cssText =
    'position:fixed;inset:0;background:rgba(20,12,22,.94);z-index:10000;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:12px;padding:calc(16px + env(safe-area-inset-top)) 16px ' +
    'calc(16px + env(safe-area-inset-bottom))';
  const v = document.createElement('video');
  v.src = url;
  // no native controls over the clip's caption: tap toggles pause, long-press still saves
  v.controls = false;
  v.addEventListener('click', () => {
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  });
  v.playsInline = true;
  v.loop = true;
  v.muted = true;
  v.autoplay = true;
  v.style.cssText = 'max-width:100%;max-height:72vh;border-radius:16px;background:#000';
  const p = document.createElement('p');
  p.textContent = 'Long-press the video to save it';
  p.style.cssText = 'color:#fff;font:600 16px system-ui,sans-serif;margin:0;text-align:center';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Done';
  close.style.cssText =
    'min-height:44px;min-width:120px;border:0;border-radius:22px;background:#ffcf5c;color:#2b1d2e;font:700 16px system-ui,sans-serif';
  close.onclick = () => {
    wrap.remove();
    URL.revokeObjectURL(url);
  };
  wrap.append(v, p, close);
  document.body.appendChild(wrap);
  return wrap;
}

function extFor(type: string): string {
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('gif')) return 'gif';
  if (type.includes('webm')) return 'webm';
  if (type.includes('mp4')) return 'mp4';
  return 'bin';
}

/** "basename-1.jpg", "basename-2.jpg"... (one file keeps the bare name). */
export function multiFileNames(files: readonly Blob[], basename: string): string[] {
  const base = basename.replace(/\.[a-z0-9]+$/i, '') || 'formula-meow';
  return files.map((f, i) => `${base}${files.length > 1 ? `-${i + 1}` : ''}.${extFor(f.type || '')}`);
}

/** Native share of several files (carousel); falls back to downloading each one. */
export async function shareFiles(files: Blob[], text: string, basename: string): Promise<'native_share' | 'download' | 'cancelled'> {
  const names = multiFileNames(files, basename);
  const list = files.map((b, i) => new File([b], names[i], { type: b.type || 'application/octet-stream' }));
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    let ok = false;
    try {
      ok = nav.canShare({ files: list });
    } catch {
      ok = false;
    }
    if (ok) {
      try {
        await nav.share({ files: list, text });
        return 'native_share';
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      }
    }
  }
  if (!downloadSupported()) return 'cancelled';
  list.forEach((f, i) => setTimeout(() => downloadBlob(f, f.name), i * 350)); // browsers drop rapid multi-downloads
  showToast(files.length > 1 ? `Saved ${files.length} images` : 'Saved');
  return 'download';
}
