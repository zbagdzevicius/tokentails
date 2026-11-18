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
import { saveFile, type SaveResult } from './saveFile';

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

/**
 * A clip length from the allowed list (else the default). HIGHLIGHTS.md §5.3: `exact` (a highlight's own length)
 * takes any whole number of seconds from 6 to 20. Pure.
 */
export function clipSeconds(v: unknown, exact = false): number {
  if (exact && typeof v === 'number' && Number.isFinite(v)) return Math.max(6, Math.min(20, Math.round(v)));
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

/** What a video is: a free clip, one highlight, or the match montage (the file name says which). */
export type ClipKind = 'clip' | 'highlight' | 'montage';

/** The download / share file name. Pure. */
export function clipFileName(ext: string, at = new Date(), kind: ClipKind = 'clip'): string {
  const d = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}`;
  return `paw-legends-${kind}-${d}.${ext}`;
}

/** The share text. Pure. */
export function clipShareText(title: string | null, heroName: string, kind: ClipKind = 'clip'): string {
  if (kind === 'montage') return `My Paw Legends match montage with ${heroName}!`;
  const t = title?.trim();
  return t ? `${t} with ${heroName} in Paw Legends!` : `My Legend Moment with ${heroName} in Paw Legends!`;
}

export interface ClipResult {
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
  seconds: number;
  framing: Framing;
  /** 'clip' when absent. */
  kind?: ClipKind;
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
  /** 'highlight' names the file paw-legends-highlight-…; default 'clip'. */
  kind?: ClipKind;
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

/** Draw one clip frame: the game view, the banner while `t` < BANNER_SECONDS (or `banner`), the mark. */
export function drawClipFrame(g: CanvasRenderingContext2D, src: CanvasImageSource & { width: number; height: number }, o: { w: number; h: number; t: number; title: string; sub: string; banner?: number }): void {
  const { w, h } = o;
  const r = cropRect(src.width, src.height, w, h);
  if (r.w > 0 && r.h > 0) g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const s = Math.min(w, h) / 720;
  const bannerFor = o.banner ?? BANNER_SECONDS;
  // the banner: slides in, holds, fades (v6: a night band with the bolt edge, the headline in gold)
  if (o.t < bannerFor && o.title) {
    const a = Math.min(1, o.t / 0.25, (bannerFor - o.t) / 0.4);
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
    resolveDone({ blob: new Blob(chunks, { type }), mime: type, ext: type.includes('mp4') ? 'mp4' : fmt.ext, seconds: Math.round(elapsed), framing: o.framing, kind: o.kind ?? 'clip' });
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

/** Save the clip as a file: a download on the web; in the app the gallery or the share sheet (share/saveFile.ts). */
export function saveClip(clip: ClipResult): Promise<SaveResult> {
  return saveFile(clip.blob, clipFileName(clip.ext, new Date(), clip.kind ?? 'clip'));
}

/** The system share sheet with the video file: 'shared', 'cancelled' or 'unsupported'. */
export async function shareClip(clip: ClipResult, text: string, url: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof File === 'undefined' || typeof nav.share !== 'function') return 'unsupported';
  const file = new File([clip.blob], clipFileName(clip.ext, new Date(), clip.kind ?? 'clip'), { type: clip.mime });
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
  const text = clipShareText(o.title, o.heroName, o.clip.kind ?? 'clip');
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
    <h2>${o.clip.kind === 'montage' ? 'Your montage' : o.clip.kind === 'highlight' ? 'Your highlight' : 'Your clip'}</h2>
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
  const saveBtn = root.querySelector<HTMLButtonElement>('[data-c="save"]')!;
  /** Save, and say where it went (or why not). */
  const save = async (): Promise<SaveResult> => {
    saveBtn.disabled = true;
    note.textContent = 'Saving…';
    const r = await saveClip(o.clip);
    saveBtn.disabled = false;
    note.textContent = r.note;
    note.dataset.save = r.ok ? r.via : r.why;
    if (r.ok) o.track?.('clip_share', { via: 'save', framing: o.clip.framing, to: r.via });
    else if (r.why !== 'cancelled') o.track?.('clip_save_fail', { why: r.why });
    return r;
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-c]')?.dataset.c;
    if (a === 'close' || t === root) close();
    else if (a === 'save') void save();
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
          o.onLink(url, text);
          void save().then((s) => {
            if (s.ok) note.textContent = `${s.note} Link copied. Post them together.`;
          });
        }
      });
    }
  });
  o.track?.('clip_made', { seconds: o.clip.seconds, framing: o.clip.framing, ext: o.clip.ext, kb: Math.round(o.clip.blob.size / 1024), kind: o.clip.kind ?? 'clip' });
  root.querySelector<HTMLElement>('[data-c="share"]')?.focus({ preventScroll: true });
  return root;
}

// ------------------------------------------------------------------------------------------ montage

/** HIGHLIGHTS.md §5.3: the opening card, a segment's banner, the wipe between segments and the end card (s). */
export const MONTAGE_TIMING = Object.freeze({ intro: 1, banner: 1.6, wipe: 0.35, outro: 1.5 });

export interface MontageSegmentOpts {
  /** Start tick. */
  at: number;
  seconds: number;
  title: string;
  sub: string;
}

export interface MontageOpts {
  source: HTMLCanvasElement;
  framing: Framing;
  audio: MediaStream | null;
  segments: readonly MontageSegmentOpts[];
  /** The opening card ("MATCH MONTAGE", the champion) and the end card (the outcome, K/D/A, "vs bots"). */
  intro: { title: string; sub: string };
  outro: { title: string; sub: string };
  /** Put the replay at `at`, playing at 1x; resolves when the new view is drawn. */
  seekTo(at: number, index: number): Promise<void>;
  /** Hold or run the replay (between segments and over the cards). */
  play(on: boolean): void;
  onTick?(seconds: number): void;
}

/** Draw a card frame: the night ground, the bolt band, the headline, the sub and the mark. */
export function drawCardFrame(g: CanvasRenderingContext2D, o: { w: number; h: number; t: number; title: string; sub: string; kicker?: string }): void {
  const { w, h } = o;
  const s = Math.min(w, h) / 720;
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#2a1240');
  bg.addColorStop(1, '#12091f');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // the bolt band slides in
  const k = Math.min(1, o.t / 0.3);
  g.save();
  g.fillStyle = '#ffe14a';
  g.translate(w / 2, h / 2);
  g.rotate(-0.12);
  g.fillRect(-w * k, 70 * s, w * 2 * k, 10 * s);
  g.fillStyle = '#ff4f9a';
  g.fillRect(-w * k, -96 * s, w * 2 * k, 6 * s);
  g.restore();
  g.textAlign = 'center';
  if (o.kicker) {
    g.font = UI(Math.round(26 * s), 700);
    outlined(g, o.kicker, w / 2, h / 2 - 60 * s, '#9fd8ff', '#12091f', 6 * s);
  }
  g.font = DISPLAY(Math.round(64 * s));
  outlined(g, o.title.toUpperCase().slice(0, 28), w / 2, h / 2 + 10 * s, '#ffe14a', '#12091f', 12 * s);
  g.font = UI(Math.round(28 * s), 600);
  outlined(g, o.sub.slice(0, 44), w / 2, h / 2 + 52 * s, '#fff3e3', '#12091f', 6 * s);
  g.textAlign = 'right';
  g.font = DISPLAY(Math.round(30 * s));
  outlined(g, 'PAW LEGENDS', w - 24 * s, h - 48 * s, '#f7bc3c', '#12091f', 8 * s);
  g.font = UI(Math.round(18 * s), 600);
  outlined(g, PUBLIC_GAME_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), w - 24 * s, h - 22 * s, '#fff3e3', '#12091f', 5 * s);
}

/** The bolt wipe over the last frame: a slanted gold and rose band sweeping across (`p` 0..1). */
export function drawWipe(g: CanvasRenderingContext2D, w: number, h: number, p: number): void {
  const x = -w * 0.4 + p * w * 1.8;
  g.save();
  g.beginPath();
  g.moveTo(x - w * 0.25, 0);
  g.lineTo(x + w * 0.15, 0);
  g.lineTo(x - w * 0.05, h);
  g.lineTo(x - w * 0.45, h);
  g.closePath();
  g.fillStyle = '#12091f';
  g.fill();
  g.beginPath();
  g.moveTo(x + w * 0.15, 0);
  g.lineTo(x + w * 0.2, 0);
  g.lineTo(x, h);
  g.lineTo(x - w * 0.05, h);
  g.closePath();
  g.fillStyle = '#ffe14a';
  g.fill();
  g.restore();
}

/**
 * Record a montage: one MediaRecorder; the opening card, then per segment a seek (the recorder paused while the view
 * rebuilds), the segment at 1x with its own short banner, a bolt wipe drawn into the video, and the end card. The
 * cards and wipes are drawn by a timer while the recorder runs, so every cut is in the video, not a gap.
 */
export function startMontage(o: MontageOpts): ClipRecorder {
  const [w, h] = CLIP_SIZE[o.framing];
  const fmt = typeof MediaRecorder !== 'undefined' ? pickMime((m) => MediaRecorder.isTypeSupported(m)) : null;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d', { alpha: false });
  let resolveDone!: (r: ClipResult | null) => void;
  const done = new Promise<ClipResult | null>((r) => (resolveDone = r));
  const none: ClipRecorder = { stop: () => undefined, cancel: () => undefined, pause: () => undefined, done };
  if (!fmt || !g || !o.segments.length) {
    resolveDone(null);
    return none;
  }
  const video = out.captureStream(30);
  const stream = new MediaStream([...video.getVideoTracks(), ...(o.audio?.getAudioTracks() ?? [])]);
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: o.framing === 'vertical' ? 3_000_000 : 3_500_000, audioBitsPerSecond: 128_000 });
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch {
      resolveDone(null);
      return none;
    }
  }
  const chunks: Blob[] = [];
  let cancelled = false;
  let finished = false;
  let recorded = 0;
  let mark = performance.now();
  let lastWhole = -1;
  /** The recorder's clock: counts while it records (not while it waits for a seek or a hidden tab). */
  const clock = (): void => {
    const now = performance.now();
    if (rec.state === 'recording') recorded += Math.min(1, (now - mark) / 1000);
    mark = now;
    const whole = Math.floor(recorded);
    if (whole !== lastWhole) {
      lastWhole = whole;
      o.onTick?.(whole);
    }
  };
  const settle = (): void => {
    for (const t of video.getTracks()) t.stop();
    if (cancelled || recorded < CLIP_MIN_SECONDS || !chunks.length) return resolveDone(null);
    const type = (rec.mimeType || fmt.mime).split(';')[0] || fmt.mime.split(';')[0];
    resolveDone({ blob: new Blob(chunks, { type }), mime: type, ext: type.includes('mp4') ? 'mp4' : fmt.ext, seconds: Math.round(recorded), framing: o.framing, kind: 'montage' });
  };
  let timer: ReturnType<typeof setInterval> | null = null;
  const stopTimer = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const onVis = (): void => {
    if (finished) return;
    try {
      if (document.hidden && rec.state === 'recording') rec.pause();
      else if (!document.hidden && rec.state === 'paused' && !waiting) rec.resume();
    } catch {
      /* the frames just hold */
    }
    mark = performance.now();
  };
  let waiting = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    stopTimer();
    setFrameTap(null);
    document.removeEventListener('visibilitychange', onVis);
    try {
      if (rec.state !== 'inactive') rec.stop();
      else settle();
    } catch {
      settle();
    }
  };
  rec.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = settle;
  rec.onerror = () => {
    cancelled = true;
    finish();
  };
  document.addEventListener('visibilitychange', onVis);

  /** Draw with a timer for `sec` seconds (cards, wipes): `draw(t)` paints the frame at t. */
  const timed = (sec: number, draw: (t: number) => void): Promise<void> =>
    new Promise((res) => {
      const t0 = performance.now();
      draw(0);
      stopTimer();
      timer = setInterval(() => {
        if (finished) {
          stopTimer();
          return res();
        }
        clock();
        const t = (performance.now() - t0) / 1000;
        draw(Math.min(sec, t));
        if (t >= sec) {
          stopTimer();
          res();
        }
      }, 33);
    });
  const frames = (n: number): Promise<void> => new Promise((res) => {
    let k = 0;
    const f = (): void => (++k >= n ? res() : void requestAnimationFrame(f));
    requestAnimationFrame(f);
    // a hidden tab draws no frames: never wait forever
    setTimeout(res, 400);
  });
  /** Play one segment: the game's frames with its banner, until its length has been recorded. */
  const segment = (seg: MontageSegmentOpts): Promise<void> =>
    new Promise((res) => {
      let el = 0;
      let at = performance.now();
      const end = (): void => {
        setFrameTap(null);
        clearInterval(guard);
        res();
      };
      setFrameTap(() => {
        if (finished) return end();
        const now = performance.now();
        if (rec.state === 'recording') el += Math.min(1, (now - at) / 1000);
        at = now;
        clock();
        drawClipFrame(g, o.source, { w, h, t: el, title: seg.title, sub: seg.sub, banner: MONTAGE_TIMING.banner });
        if (el >= seg.seconds) end();
      });
      // the clock also runs without frames (a hidden tab), so a segment always ends
      const guard = setInterval(() => {
        if (finished) return end();
        const now = performance.now();
        if (rec.state === 'recording' && !document.hidden) el += Math.min(0.25, (now - at) / 1000);
        at = now;
        if (el >= seg.seconds + 1) end();
      }, 250);
    });

  const run = async (): Promise<void> => {
    // the first segment is cued before the recorder starts: the opening card runs straight into it
    o.play(false);
    waiting = true;
    await o.seekTo(o.segments[0].at, 0);
    o.play(false);
    if (finished) return;
    waiting = false;
    const started = new Promise<void>((res) => {
      rec.onstart = () => res();
      setTimeout(res, 1000);
    });
    rec.start(500);
    await started;
    mark = performance.now();
    await timed(MONTAGE_TIMING.intro, (t) => drawCardFrame(g, { w, h, t, title: o.intro.title, sub: o.intro.sub, kicker: 'PAW LEGENDS' }));
    for (let i = 0; i < o.segments.length && !finished; i++) {
      const seg = o.segments[i];
      if (i > 0) {
        // the cut: the recorder waits (paused) while the replay seeks and the view rebuilds
        waiting = true;
        try {
          if (rec.state === 'recording') rec.pause();
        } catch {
          /* older recorders: the frames just hold */
        }
        await o.seekTo(seg.at, i);
        await frames(2);
        if (finished) return;
        waiting = false;
        try {
          if (rec.state === 'paused' && !document.hidden) rec.resume();
        } catch {
          /* see above */
        }
      } else o.play(true);
      mark = performance.now();
      await segment(seg);
      o.play(false);
      if (finished) return;
      // the bolt wipe over the segment's last frame
      const still = document.createElement('canvas');
      still.width = w;
      still.height = h;
      still.getContext('2d')?.drawImage(out, 0, 0);
      await timed(MONTAGE_TIMING.wipe, (t) => {
        g.drawImage(still, 0, 0);
        drawWipe(g, w, h, t / MONTAGE_TIMING.wipe);
      });
    }
    if (finished) return;
    await timed(MONTAGE_TIMING.outro, (t) => drawCardFrame(g, { w, h, t, title: o.outro.title, sub: o.outro.sub, kicker: 'MATCH MONTAGE' }));
    finish();
  };
  void run().catch(() => {
    cancelled = true;
    finish();
  });
  return {
    stop: finish,
    cancel: () => {
      cancelled = true;
      finish();
    },
    pause: (on) => {
      if (finished) return;
      try {
        if (on && rec.state === 'recording') rec.pause();
        else if (!on && rec.state === 'paused' && !waiting) rec.resume();
      } catch {
        /* see above */
      }
      mark = performance.now();
    },
    done,
  };
}
