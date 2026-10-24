// The clip sheet (browser): an overlay that renders the clip with a live preview and a progress bar, then offers
// SHARE (the native share sheet with the file, else a download), DOWNLOAD and CLOSE. 16:9 or 9:16 (portrait
// screens: 9:16 only). Opening it from pause keeps the game paused; Esc closes it.
import { game } from '../core/state';
import { lastRunResult, save, setSave } from '../ui/flow';
import { ugc } from '../ugc/contract';
import { openOverlay, toast } from '../ugc/hub';
import { downloadBlob, shareBase, shareOrDownload, type ShareOutcome } from '../ugc/sharekit';
import type { Aspect } from './layout';
import { quickFile, RenderAborted, renderClip } from './render';

export const FILM_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="3.2" fill="#ff4f7b" stroke="#2a1c14" stroke-width="2.2"/>' +
  '<path d="M16 10.6l5.6-3.3v9.4L16 13.4z" fill="#ffc21a" stroke="#2a1c14" stroke-width="2.2" stroke-linejoin="round"/>' +
  '<circle cx="6.6" cy="10.4" r="1.7" fill="#fff7ea"/></svg>';

export type SheetState = 'closed' | 'rendering' | 'done' | 'error';
export interface SheetInfo {
  state: SheetState;
  aspect: Aspect | null;
  size: number;
  type: string;
  ms: number;
  quick: boolean;
}

let open: { close(): void } | null = null;
const info: SheetInfo = { state: 'closed', aspect: null, size: 0, type: '', ms: 0, quick: false };
let warnedRender = false;

export const sheetInfo = (): SheetInfo => ({ ...info });
export const sheetOpen = () => !!open;

/** The challenge or game link that goes with a shared clip. */
function linkFor(): string {
  const r = game.mode === 'over' || game.mode === 'title' ? lastRunResult() : null;
  let url: string | null = null;
  try {
    url = r ? ugc.challengeUrl(r) : null;
  } catch {
    url = null;
  }
  return url ?? shareBase();
}

function bumpClips(): void {
  setSave({ ...save, ugcStats: { ...save.ugcStats, clips: (save.ugcStats?.clips ?? 0) + 1 } });
}

function outcomeToast(o: ShareOutcome): void {
  if (o === 'shared') toast('Shared!');
  else if (o === 'downloaded') toast('Clip saved!');
  else if (o === 'failed') toast('Could not share the clip');
  if (o === 'shared' || o === 'downloaded') bumpClips();
}

const portraitScreen = () => innerHeight > innerWidth;

export function openClipSheet(): void {
  if (open) return;
  const ov = openOverlay('clip-sheet');
  ov.el.setAttribute('role', 'dialog');
  ov.el.setAttribute('aria-modal', 'true');
  ov.el.setAttribute('aria-label', 'Save clip');
  ov.el.innerHTML = `
    <div class="card clip-card">
      <div class="clip-head"><span class="clip-ico">${FILM_SVG}</span><h2>Save clip</h2></div>
      <div class="clip-stage"><div class="clip-rec"><i></i>REPLAY</div></div>
      <div class="clip-side">
      <div class="clip-prog"><div class="clip-bar"><i></i></div><p class="clip-msg" aria-live="polite">Getting the replay...</p></div>
      <div class="seg clip-aspect" role="group" aria-label="Clip shape">
        <button type="button" data-a="9:16"><span class="clip-shape tall"></span>9:16</button>
        <button type="button" data-a="16:9"><span class="clip-shape wide"></span>16:9</button>
      </div>
      <div class="row clip-actions">
        <button type="button" id="clipShare" class="btn small gold" disabled>SHARE</button>
        <button type="button" id="clipDownload" class="btn small" disabled>DOWNLOAD</button>
        <button type="button" id="clipQuick" class="btn small hidden">QUICK SAVE</button>
        <button type="button" id="clipClose" class="btn small alt">CLOSE</button>
      </div>
      </div>
    </div>`;
  const $ = <T extends HTMLElement>(sel: string) => ov.el.querySelector(sel) as T;
  const stage = $<HTMLElement>('.clip-stage');
  const rec = $<HTMLElement>('.clip-rec');
  const bar = $<HTMLElement>('.clip-bar i');
  const msg = $<HTMLElement>('.clip-msg');
  const seg = $<HTMLElement>('.clip-aspect');
  const shareBtn = $<HTMLButtonElement>('#clipShare');
  const dlBtn = $<HTMLButtonElement>('#clipDownload');
  const quickBtn = $<HTMLButtonElement>('#clipQuick');
  const closeBtn = $<HTMLButtonElement>('#clipClose');

  let file: File | null = null;
  let quick: File | null = null;
  let previewUrl = '';
  let sig = { aborted: false };
  const portrait = portraitScreen();
  let aspect: Aspect = portrait || save.settings.clipVertical ? '9:16' : '16:9';
  if (portrait) seg.classList.add('hidden');

  const setAspectUi = () => {
    stage.classList.toggle('a169', aspect === '16:9');
    stage.classList.toggle('a916', aspect === '9:16');
    for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) {
      b.classList.toggle('on', b.dataset.a === aspect);
      b.setAttribute('aria-pressed', String(b.dataset.a === aspect));
    }
  };
  const clearPreview = () => {
    for (const el of stage.querySelectorAll('canvas, video')) el.remove();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  };

  const run = () => {
    sig.aborted = true;
    const my = { aborted: false };
    sig = my;
    file = null;
    quick = null;
    clearPreview();
    setAspectUi();
    shareBtn.disabled = true;
    dlBtn.disabled = true;
    quickBtn.classList.add('hidden');
    shareBtn.classList.remove('hidden');
    dlBtn.classList.remove('hidden');
    rec.classList.remove('hidden');
    bar.style.width = '0%';
    bar.parentElement?.classList.add('busy');
    shareBtn.textContent = 'SHARE';
    msg.textContent = 'Getting the replay...';
    Object.assign(info, { state: 'rendering', aspect, size: 0, type: '', ms: 0, quick: false });
    renderClip({
      aspect,
      signal: my,
      onCanvas: (c) => {
        if (my.aborted) return;
        stage.insertBefore(c, rec);
      },
      onProgress: (done, left) => {
        if (my.aborted) return;
        bar.style.width = `${Math.round(done * 100)}%`;
        // the clip is re-recorded in real time: say so, and count down on the button itself
        msg.textContent = left > 0 ? 'Recording your replay in real time...' : 'Almost there...';
        shareBtn.textContent = left > 0 ? `SHARE in ${left} s` : 'SHARE';
      },
    })
      .then((out) => {
        if (my.aborted) return;
        file = out.file;
        clearPreview();
        rec.classList.add('hidden');
        const v = document.createElement('video');
        previewUrl = URL.createObjectURL(out.file);
        v.src = previewUrl;
        v.controls = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.muted = true;
        v.loop = true;
        v.autoplay = true;
        stage.insertBefore(v, rec);
        void v.play().catch(() => {});
        bar.style.width = '100%';
        bar.parentElement?.classList.remove('busy');
        shareBtn.textContent = 'SHARE';
        const mb = out.file.size / (1024 * 1024);
        msg.textContent = `Your ${Math.round(out.seconds)} s clip is ready (${mb < 1 ? '<1' : mb.toFixed(1)} MB). Post it and tag a friend!`;
        shareBtn.disabled = false;
        dlBtn.disabled = false;
        Object.assign(info, { state: 'done', size: out.file.size, type: out.file.type, ms: out.ms });
        shareBtn.focus({ preventScroll: true });
      })
      .catch((err: unknown) => {
        if (my.aborted || err instanceof RenderAborted) return;
        if (!warnedRender) {
          warnedRender = true;
          console.warn('Meow Run: the clip could not be made', err);
        }
        clearPreview();
        rec.classList.add('hidden');
        quick = quickFile();
        bar.style.width = '0%';
        bar.parentElement?.classList.remove('busy');
        shareBtn.classList.add('hidden');
        dlBtn.classList.add('hidden');
        if (quick) {
          quickBtn.classList.remove('hidden');
          msg.textContent = 'The clip editor hiccuped. Quick save keeps the raw replay (no frame).';
        } else msg.textContent = 'No replay to save yet. Play a few seconds first!';
        Object.assign(info, { state: 'error', quick: !!quick, size: quick?.size ?? 0, type: quick?.type ?? '' });
      });
  };

  // ---- buttons (SHARE runs straight in the click: iOS needs the fresh gesture)
  shareBtn.addEventListener('click', () => {
    if (!file) return;
    void shareOrDownload({ file, title: 'Meow Run', text: 'Can you beat my run?', url: linkFor() }).then(outcomeToast);
  });
  dlBtn.addEventListener('click', () => {
    if (!file) return;
    downloadBlob(file, file.name);
    outcomeToast('downloaded');
  });
  quickBtn.addEventListener('click', () => {
    if (!quick) return;
    void shareOrDownload({ file: quick, title: 'Meow Run', text: 'Can you beat my run?', url: linkFor() }).then(outcomeToast);
  });
  for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) {
    b.addEventListener('click', () => {
      const a = b.dataset.a as Aspect;
      if (a === aspect) return;
      aspect = a;
      setSave({ ...save, settings: { ...save.settings, clipVertical: a === '9:16' } });
      run();
    });
  }

  const onKey = (e: KeyboardEvent) => {
    // the sheet owns the keyboard while it is open (flow would resume the run on Esc, the results keys would act)
    e.stopImmediatePropagation();
    if (e.code === 'Escape' && !e.repeat) {
      e.preventDefault();
      close();
    }
  };
  addEventListener('keydown', onKey, true);
  ov.el.addEventListener('pointerdown', (e) => {
    if (e.target === ov.el && info.state !== 'rendering') close();
  });

  const close = () => {
    if (!open) return;
    sig.aborted = true;
    removeEventListener('keydown', onKey, true);
    clearPreview();
    ov.close();
    open = null;
    Object.assign(info, { state: 'closed' });
  };
  closeBtn.addEventListener('click', close);
  open = { close };
  run();
}

export function closeClipSheet(): void {
  open?.close();
}
