// CLIP lane entry (ITERATION2.md 6.1): rolling replay capture, the clip sheet (16:9 or 9:16 crop, watermark, end
// card, share/download) and the Replays setting. src/ugc/index.ts calls registerClip() once, after the menus exist.
import { game } from '../core/state';
import { save, setSave } from '../ui/flow';
import { exposeTestHook, provide, ugc } from '../ugc/contract';
import { addButton, onScreen, refreshHub } from '../ugc/hub';
import type { CaptureMode } from '../meta/save';
import {
  availableSeconds,
  captureEnabled,
  captureFailed,
  captureSettingChanged,
  clipMime,
  installCapture,
  isRecording,
  onCaptureChange,
  ring,
} from './capture';
import { renderClip } from './render';
import { installTimeline } from './timeline';
import { closeClipSheet, FILM_SVG, openClipSheet, sheetInfo, sheetOpen } from './sheet';
import './clip.css';

/** a clip of the last seconds can be saved now: capture is on and the replay holds at least 3 s */
export const clipReady = (): boolean => captureEnabled() && availableSeconds() >= 3;

let askedName = false;
function openClip(): void {
  if (!clipReady()) return;
  // the first clip asks for a name once, so the end card says who made it (not "A Mochi fan")
  let named = '';
  try {
    named = ugc.playerName();
  } catch {
    named = '';
  }
  if (named || askedName) return openClipSheet();
  askedName = true;
  void ugc
    .askName()
    .catch(() => '')
    .then(() => {
      if (clipReady()) openClipSheet();
    });
}

// ---------------------------------------------------------------- settings rows (Replays, Vertical clips)
let capSeg: HTMLElement | null = null;
let vertTog: HTMLButtonElement | null = null;
function injectSettings(): void {
  const card = document.querySelector('#settings .card');
  if (!card || document.getElementById('setCapture')) return;
  const note = card.querySelector('p.note');
  const row1 = document.createElement('div');
  row1.className = 'set clip-set';
  row1.innerHTML =
    'Replays <div class="seg" id="setCapture" role="group" aria-label="Replays"><button type="button" data-c="auto">AUTO</button><button type="button" data-c="on">ON</button><button type="button" data-c="off">OFF</button></div>';
  const row2 = document.createElement('div');
  row2.className = 'set clip-set';
  row2.innerHTML = 'Vertical clips <button type="button" class="tog" id="setClipVertical" aria-label="Vertical clips"></button>';
  card.insertBefore(row1, note);
  card.insertBefore(row2, note);
  capSeg = row1.querySelector('#setCapture');
  vertTog = row2.querySelector('#setClipVertical');
  for (const b of row1.querySelectorAll<HTMLButtonElement>('button')) {
    b.addEventListener('click', () => {
      const c = (b.dataset.c as CaptureMode) ?? 'auto';
      setSave({ ...save, settings: { ...save.settings, capture: c } });
      captureSettingChanged();
      renderSettings();
    });
  }
  vertTog!.addEventListener('click', () => {
    setSave({ ...save, settings: { ...save.settings, clipVertical: !save.settings.clipVertical } });
    renderSettings();
  });
  renderSettings();
}
function renderSettings(): void {
  const st = save.settings;
  if (capSeg) {
    for (const b of capSeg.querySelectorAll<HTMLButtonElement>('button')) {
      const on = b.dataset.c === (st.capture ?? 'auto');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    // a browser that cannot record: say so on the row instead of a switch that does nothing
    capSeg.title = clipMime() ? '' : 'This browser cannot record clips';
  }
  if (vertTog) {
    vertTog.classList.toggle('on', !!st.clipVertical);
    vertTog.setAttribute('aria-pressed', String(!!st.clipVertical));
  }
}

let registered = false;
export function registerClip(): void {
  if (registered) return;
  registered = true;
  installCapture();
  installTimeline();
  provide({ clipReady, openClip });

  addButton({
    id: 'ugcClipPause',
    slot: 'pause',
    label: 'SAVE CLIP',
    icon: FILM_SVG,
    order: 20,
    visible: clipReady,
    badge: () => {
      const s = Math.min(12, Math.floor(availableSeconds()));
      return s >= 3 ? `${s}s` : null;
    },
    onClick: openClip,
  });
  addButton({ id: 'ugcClip', slot: 'results', label: 'SAVE CLIP', icon: FILM_SVG, order: 30, visible: clipReady, onClick: openClip });
  // buttons follow the replay: a segment lands, capture switches off, the after-finish recording ends
  onCaptureChange(() => {
    const sc = document.body.dataset.screen;
    if (sc === 'pause') refreshHub('pause');
    else if (sc === 'results') refreshHub('results');
  });

  injectSettings();
  onScreen((s) => {
    if (s === 'settings') renderSettings();
    if (s !== 'pause' && s !== 'results' && sheetOpen() && game.mode === 'play') closeClipSheet();
  });

  exposeTestHook('clip', {
    state: () => ({
      enabled: captureEnabled(),
      recording: isRecording(),
      segments: ring.length,
      seconds: Math.round(availableSeconds() * 100) / 100,
      mime: clipMime()?.mime ?? null,
      failed: captureFailed(),
      bytes: ring.bytes,
    }),
    ready: clipReady,
    open: openClipSheet,
    close: closeClipSheet,
    sheet: sheetInfo,
    /** renders without the sheet; the file stays readable through lastUrl() */
    renderBlob: async ({ vertical = false }: { vertical?: boolean } = {}) => {
      const out = await renderClip({ aspect: vertical ? '9:16' : '16:9' });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(out.file);
      return { size: out.file.size, type: out.file.type, ms: out.ms, w: out.w, h: out.h, seconds: out.seconds, name: out.file.name };
    },
    lastUrl: () => lastUrl,
    /** same as the Replays setting buttons (shots) */
    setMode: (c: CaptureMode) => {
      setSave({ ...save, settings: { ...save.settings, capture: c } });
      captureSettingChanged();
      renderSettings();
    },
  });
}
let lastUrl = '';
