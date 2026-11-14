/**
 * Highlight clips (docs/plans/moba/SHARE-PUSH.md §1): a 10-20 s video of a replay, recorded in the browser. Each frame
 * the game draws, the frame tap (render/renderer.ts `setFrameTap`) copies the WebGL canvas into a 2D canvas at the
 * clip's framing (vertical 720x1280 for Shorts / TikTok / Reels, wide 1280x720), centre-cropped on the camera's focus
 * (the champion), with the v6 title banner for the first seconds and the PAW LEGENDS mark. `MediaRecorder` records
 * that canvas's stream plus the game's audio (a tap on the WebAudio master, audio/sfx.ts `tap()`). Its own lazy chunk:
 * nothing here loads before a player asks for a clip. No price, no store.
 */
import { PUBLIC_GAME_URL } from '../app/platform';
import { setFrameTap } from '../render/renderer';
import { pickMime } from './clipSupport';

export { CLIP_MIMES, clipSupported, pickMime } from './clipSupport';

export type Framing = 'vertical' | 'wide';
export const CLIP_SIZE: Readonly<Record<Framing, readonly [number, number]>> = Object.freeze({ vertical: [720, 1280], wide: [1280, 720] });
export const CLIP_LENGTHS: readonly number[] = Object.freeze([10, 15, 20]);
export const CLIP_DEFAULT_SECONDS = 15;
/** A clip shorter than this (stopped at once) is thrown away. */
export const CLIP_MIN_SECONDS = 2;
/** The title banner's time on screen (s). */
export const BANNER_SECONDS = 2.6;

/** The source rectangle that fills an `ow`x`oh` frame from an `sw`x`sh` canvas (cover, centred). Pure. */
export function cropRect(sw: number, sh: number, ow: number, oh: number): { x: number; y: number; w: number; h: number } {
  if (sw <= 0 || sh <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const want = ow / oh;
  if (sw / sh > want) {
    const w = Math.round(sh * want);
    return { x: Math.round((sw - w) / 2), y: 0, w, h: sh };
  }
  const h = Math.round(sw / want);
  return { x: 0, y: Math.round((sh - h) / 2), w: sw, h };
}

/** A clip length from the allowed list (else the default). Pure. */
export function clipSeconds(v: unknown): number {
  return typeof v === 'number' && CLIP_LENGTHS.includes(v) ? v : CLIP_DEFAULT_SECONDS;
}

/** The framing a device suggests: vertical on a phone or a portrait screen, else wide. Pure. */
export function defaultFraming(o: { touch: boolean; w: number; h: number }): Framing {
  return o.touch || o.h > o.w ? 'vertical' : 'wide';
}

/**
 * Where the Legend Moment clip starts (sim ticks, 30 a second): the `seconds` window holding the most takedowns, 4 s
 * before its first one, so the fight leading in is seen; with no takedown, the match's last `seconds` (the base
 * falling or the forfeit). Clamped to the part of the replay that can be played. Pure.
 */
export function momentTick(info: { total: number; scouted: number; takedowns: readonly number[] }, seconds = CLIP_DEFAULT_SECONDS, leadTicks = 120): number {
  const span = seconds * 30;
  const last = Math.max(0, Math.min(info.total, info.scouted) - 1);
  const clamp = (t: number): number => Math.max(0, Math.min(t, Math.max(0, last - span)));
  const tds = [...info.takedowns].sort((a, b) => a - b);
  if (!tds.length) return clamp(info.total - span);
  let best = 0;
  let bestN = 0;
  for (let i = 0; i < tds.length; i++) {
    // the window opens `leadTicks` before takedown i; count the takedowns inside it
    const end = tds[i] - leadTicks + span;
    let n = 0;
    for (let j = i; j < tds.length && tds[j] <= end; j++) n++;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  return clamp(tds[best] - leadTicks);
}

/** The download / share file name. Pure. */
export function clipFileName(ext: string, at = new Date()): string {
  const d = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}`;
  return `paw-legends-clip-${d}.${ext}`;
}

/** The share text. Pure. */
export function clipShareText(title: string | null, heroName: string): string {
  const t = title?.trim();
  return t ? `${t} with ${heroName} in Paw Legends!` : `My Legend Moment with ${heroName} in Paw Legends!`;
}

export interface ClipResult {
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
  seconds: number;
  framing: Framing;
}

export interface ClipOpts {
  /** The game's WebGL canvas. */
  source: HTMLCanvasElement;
  framing: Framing;
  seconds: number;
  /** The banner headline ("SHUT DOWN!", "LEGEND MOMENT"). */
  title: string;
  /** The banner's second line ("Clem · Fighter"). */
  sub: string;
  /** The game's audio (sfx.tap()), or null for a silent clip. */
  audio: MediaStream | null;
  onTick?(seconds: number): void;
}

export interface ClipRecorder {
  /** Stop now; the clip ends here (thrown away under CLIP_MIN_SECONDS). */
  stop(): void;
  /** Stop and throw the clip away. */
  cancel(): void;
  pause(on: boolean): void;
  /** The clip, or null (cancelled, too short, or the recorder failed). */
  readonly done: Promise<ClipResult | null>;
}

const DISPLAY = (px: number): string => `italic 900 ${px}px Rubik, Fredoka, ui-rounded, system-ui, sans-serif`;
const UI = (px: number, w = 700): string => `${w} ${px}px Fredoka, ui-rounded, system-ui, sans-serif`;

function outlined(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: string, w: number): void {
  g.lineJoin = 'round';
  g.lineWidth = w;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/** Draw one clip frame: the game view, the banner while `t` < BANNER_SECONDS, the mark. */
export function drawClipFrame(g: CanvasRenderingContext2D, src: CanvasImageSource & { width: number; height: number }, o: { w: number; h: number; t: number; title: string; sub: string }): void {
  const { w, h } = o;
  const r = cropRect(src.width, src.height, w, h);
  if (r.w > 0 && r.h > 0) g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const s = Math.min(w, h) / 720;
  // the banner: slides in, holds, fades (v6: a night band with the bolt edge, the headline in gold)
  if (o.t < BANNER_SECONDS && o.title) {
    const a = Math.min(1, o.t / 0.25, (BANNER_SECONDS - o.t) / 0.4);
    const by = h * (h > w ? 0.16 : 0.12);
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.fillStyle = 'rgba(18,9,31,0.78)';
    g.fillRect(0, by - 62 * s, w, 104 * s);
    g.fillStyle = '#ffe14a';
    g.fillRect(0, by + 38 * s, w, 6 * s);
    g.textAlign = 'center';
    g.font = DISPLAY(Math.round(52 * s));
    outlined(g, o.title.toUpperCase().slice(0, 28), w / 2, by, '#ffe14a', '#12091f', 10 * s);
    g.font = UI(Math.round(24 * s), 600);
    outlined(g, o.sub.slice(0, 40), w / 2, by + 30 * s, '#fff3e3', '#12091f', 6 * s);
    g.restore();
  }
  // the mark, bottom right
  g.save();
  g.textAlign = 'right';
  g.font = DISPLAY(Math.round(30 * s));
  outlined(g, 'PAW LEGENDS', w - 24 * s, h - 48 * s, '#f7bc3c', '#12091f', 8 * s);
  g.font = UI(Math.round(18 * s), 600);
  outlined(g, PUBLIC_GAME_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), w - 24 * s, h - 22 * s, '#fff3e3', '#12091f', 5 * s);
  g.restore();
}

/** Start recording now. Frames come from the frame tap, so the clip runs at the game's own frame rate. */
export function startClip(o: ClipOpts): ClipRecorder {
  const [w, h] = CLIP_SIZE[o.framing];
  const fmt = pickMime((m) => MediaRecorder.isTypeSupported(m));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d', { alpha: false });
  let resolveDone!: (r: ClipResult | null) => void;
  const done = new Promise<ClipResult | null>((r) => (resolveDone = r));
  if (!fmt || !g) {
    resolveDone(null);
    return { stop: () => undefined, cancel: () => undefined, pause: () => undefined, done };
  }
  const video = out.captureStream(30);
  const stream = new MediaStream([...video.getVideoTracks(), ...(o.audio?.getAudioTracks() ?? [])]);
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: o.framing === 'vertical' ? 3_500_000 : 4_000_000, audioBitsPerSecond: 128_000 });
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch {
      resolveDone(null);
      return { stop: () => undefined, cancel: () => undefined, pause: () => undefined, done };
    }
  }
  const chunks: Blob[] = [];
  let cancelled = false;
  let finished = false;
  let paused = false;
  let elapsed = 0;
  let lastAt = performance.now();
  let lastTick = -1;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    setFrameTap(null);
    clearInterval(timer);
    try {
      if (rec.state !== 'inactive') rec.stop();
      else settle();
    } catch {
      settle();
    }
  };
  const settle = (): void => {
    for (const t of video.getTracks()) t.stop();
    if (cancelled || elapsed < CLIP_MIN_SECONDS || !chunks.length) return resolveDone(null);
    const type = (rec.mimeType || fmt.mime).split(';')[0] || fmt.mime.split(';')[0];
    resolveDone({ blob: new Blob(chunks, { type }), mime: type, ext: type.includes('mp4') ? 'mp4' : fmt.ext, seconds: Math.round(elapsed), framing: o.framing });
  };
  rec.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = settle;
  rec.onerror = () => {
    cancelled = true;
    finish();
  };
  const step = (): void => {
    const now = performance.now();
    if (!paused) elapsed += Math.min(1, (now - lastAt) / 1000);
    lastAt = now;
    if (elapsed >= o.seconds) return finish();
    const whole = Math.floor(elapsed);
    if (whole !== lastTick) {
      lastTick = whole;
      o.onTick?.(whole);
    }
  };
  // the first frame at once (the view is already drawn), then one per game frame
  drawClipFrame(g, o.source, { w, h, t: 0, title: o.title, sub: o.sub });
  setFrameTap(() => {
    if (finished || paused) return;
    step();
    if (!finished) drawClipFrame(g, o.source, { w, h, t: elapsed, title: o.title, sub: o.sub });
  });
  // the clock also runs without frames (a hidden tab draws none), so a clip always ends
  const timer = setInterval(step, 250);
  rec.start(500);
  return {
    stop: finish,
    cancel: () => {
      cancelled = true;
      finish();
    },
    pause: (on) => {
      if (finished || paused === on) return;
      paused = on;
      lastAt = performance.now();
      try {
        if (on && rec.state === 'recording') rec.pause();
        else if (!on && rec.state === 'paused') rec.resume();
      } catch {
        /* older recorders: the frames just hold */
      }
    },
    done,
  };
}

export interface ClipSheetOpts {
  clip: ClipResult;
  heroName: string;
  title: string | null;
  /** Send the game link the usual way (the share bridge), when the device cannot share a video. */
  onLink(url: string, text: string): void;
  /** Record another one (back to the replay). */
  onAgain?(): void;
  onClose?(): void;
  track?(event: string, props: Record<string, string | number | boolean>): void;
}

/** Save the clip as a file (a download; the app shell's WebView may not support it, then false). */
export function saveClip(clip: ClipResult): boolean {
  try {
    const a = document.createElement('a');
    const href = URL.createObjectURL(clip.blob);
    a.href = href;
    a.download = clipFileName(clip.ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** The system share sheet with the video file: 'shared', 'cancelled' or 'unsupported'. */
export async function shareClip(clip: ClipResult, text: string, url: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof File === 'undefined' || typeof nav.share !== 'function') return 'unsupported';
  const file = new File([clip.blob], clipFileName(clip.ext), { type: clip.mime });
  const data: ShareData = { files: [file], text, url };
  try {
    if (!nav.canShare?.(data)) {
      // some share targets refuse text with a file: the video alone
      if (!nav.canShare?.({ files: [file] })) return 'unsupported';
      await nav.share({ files: [file] });
      return 'shared';
    }
    await nav.share(data);
    return 'shared';
  } catch (err) {
    return (err as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The clip sheet: the video (looping, muted preview), Share, Save video, Record again, Close. */
export function openClipSheet(parent: HTMLElement, o: ClipSheetOpts): HTMLElement {
  const text = clipShareText(o.title, o.heroName);
  const url = PUBLIC_GAME_URL;
  const href = URL.createObjectURL(o.clip.blob);
  const mb = (o.clip.blob.size / 1_048_576).toFixed(1);
  const root = document.createElement('div');
  root.className = 'mm-share mm-clipsheet';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Your clip');
  root.dataset.testid = 'clip-sheet';
  root.innerHTML = `<div class="mm-share-card mm-clip-card" data-framing="${o.clip.framing}">
    <button type="button" class="pl-x" data-c="close" aria-label="Close">✕</button>
    <h2>Your clip</h2>
    <div class="mm-clip-pic"><video src="${href}" autoplay muted loop playsinline data-testid="clip-video" aria-label="${esc(text)}"></video></div>
    <p class="mm-clip-meta">${o.clip.seconds} s · ${o.clip.framing === 'vertical' ? 'Vertical 9:16' : 'Wide 16:9'} · ${o.clip.ext.toUpperCase()} · ${mb} MB</p>
    <div class="mm-row">
      ${o.onAgain ? '<button type="button" class="pl-btn ghost small" data-c="again" data-testid="clip-again">Record again</button>' : ''}
      <button type="button" class="pl-btn ghost small" data-c="save" data-testid="clip-save">Save video</button>
      <button type="button" class="pl-btn small" data-c="share" data-testid="clip-share">Share</button>
    </div>
    <p class="mm-share-note" aria-live="polite"></p>
  </div>`;
  parent.appendChild(root);
  const note = root.querySelector<HTMLElement>('.mm-share-note')!;
  document.documentElement.dataset.clipSheet = 'open';
  const close = (): void => {
    if (!root.isConnected) return;
    root.remove();
    delete document.documentElement.dataset.clipSheet;
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  const save = (): void => {
    if (saveClip(o.clip)) {
      note.textContent = 'Saved.';
      o.track?.('clip_share', { via: 'save', framing: o.clip.framing });
    } else note.textContent = 'This device cannot save the video here. Use Share.';
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-c]')?.dataset.c;
    if (a === 'close' || t === root) close();
    else if (a === 'save') save();
    else if (a === 'again') {
      close();
      o.onAgain?.();
    } else if (a === 'share') {
      void shareClip(o.clip, text, url).then((r) => {
        if (r === 'shared') {
          note.textContent = 'Shared.';
          o.track?.('clip_share', { via: 'share', framing: o.clip.framing });
        } else if (r === 'unsupported') {
          // no video sharing here (a desktop browser, an Android WebView): save it and send the link the usual way
          save();
          o.onLink(url, text);
          note.textContent = 'Video saved and link copied: post the video with the link.';
        }
      });
    }
  });
  o.track?.('clip_made', { seconds: o.clip.seconds, framing: o.clip.framing, ext: o.clip.ext, kb: Math.round(o.clip.blob.size / 1024) });
  root.querySelector<HTMLElement>('[data-c="share"]')?.focus({ preventScroll: true });
  return root;
}
