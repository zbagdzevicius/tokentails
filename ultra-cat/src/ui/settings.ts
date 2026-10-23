// Settings modal (volumes, shake, quality, tutorial, reset) and a generic confirm dialog. Owned by the META-UI lane.
import { setVolumes } from '../audio/synth';
import { uiBack, uiClick } from '../audio/ui-sfx';
import { addFrameHook, events, game, setQuality, settings, type Settings } from '../core/api';
import { defaultSave } from '../meta/save';
import { $, closeModal, onTap, openModal, toast } from './dom';
import { go } from './router';
import { store } from './store';

const modal = $('settings');
const confirmEl = $('confirm');

/** Push saved settings into the engine and the mixer (boot and every change). */
export function applySettings(s: Settings): void {
  Object.assign(settings, s);
  setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
  setQuality(s.quality);
}

function setSetting<K extends keyof Settings>(k: K, v: Settings[K], persist: boolean): void {
  const s = store.get();
  const next = { ...s.settings, [k]: v };
  applySettings(next);
  if (persist) store.set({ ...s, settings: next });
}

function sync(): void {
  const s = store.get().settings;
  for (const k of ['master', 'music', 'sfx', 'shake'] as const) {
    const inp = $(`set_${k}`) as HTMLInputElement;
    inp.value = String(Math.round(s[k] * 100));
    ($(`val_${k}`) as HTMLElement).textContent = `${inp.value}%`;
  }
  $('setLow').classList.toggle('on', s.quality === 'low');
  $('setHigh').classList.toggle('on', s.quality === 'high');
  $('setLow').setAttribute('aria-pressed', String(s.quality === 'low'));
  $('setHigh').setAttribute('aria-pressed', String(s.quality === 'high'));
  $('setTut').textContent = store.get().tutorialDone ? 'REPLAY TUTORIAL' : 'TUTORIAL: ON NEXT RUN';
}

export function openSettings(): void {
  sync();
  openModal(modal);
}

/** Yes/no dialog. Resolves true on the confirm button. */
export function confirmBox(text: string, yes: string): Promise<boolean> {
  return new Promise((res) => {
    $('confirmText').textContent = text;
    const y = $('confirmYes');
    const n = $('confirmNo');
    y.textContent = yes;
    let done = false;
    const finish = (v: boolean, closed = false) => {
      if (done) return;
      done = true;
      y.onclick = n.onclick = null;
      if (!closed) closeModal();
      res(v);
    };
    y.onclick = () => {
      uiClick();
      finish(true);
    };
    n.onclick = () => {
      uiBack();
      finish(false);
    };
    openModal(confirmEl, () => finish(false, true));
  });
}

// Frame-time watchdog: if the first 3 s of a run average slower than ~45 fps on HIGH, drop to LOW once and keep it.
let wdT = 0;
let wdN = 0;
let wdSum = 0;
let wdLast = 0;
let wdDone = false;
function watchdog(): void {
  events.on('levelStart', () => {
    wdT = wdN = wdSum = 0;
    wdLast = 0;
  });
  addFrameHook(() => {
    if (wdDone || game.mode !== 'play' || store.get().settings.quality !== 'high') return;
    const now = performance.now();
    if (wdLast) {
      const ms = now - wdLast;
      if (ms < 250) {
        wdSum += ms;
        wdN++;
        wdT += ms / 1000;
      }
    }
    wdLast = now;
    if (wdT < 3) return;
    wdDone = true;
    if (wdSum / wdN > 22) {
      setSetting('quality', 'low', true);
      toast('Switched to LOW quality for a smoother rampage (Settings to change)');
    }
  });
}

export function initSettings(): void {
  watchdog();
  for (const k of ['master', 'music', 'sfx', 'shake'] as const) {
    const inp = $(`set_${k}`) as HTMLInputElement;
    inp.addEventListener('input', () => {
      ($(`val_${k}`) as HTMLElement).textContent = `${inp.value}%`;
      setSetting(k, Number(inp.value) / 100, false);
    });
    inp.addEventListener('change', () => {
      setSetting(k, Number(inp.value) / 100, true);
      if (k === 'sfx' || k === 'master') uiClick();
    });
  }
  onTap($('setLow'), () => {
    setSetting('quality', 'low', true);
    sync();
  });
  onTap($('setHigh'), () => {
    setSetting('quality', 'high', true);
    sync();
  });
  onTap($('setTut'), () => {
    store.set({ ...store.get(), tutorialDone: false });
    sync();
    toast(game.mode === 'paused' ? 'The tutorial plays the next time you start Meowhattan' : 'The tutorial plays on your next Meowhattan run');
  });
  onTap($('setReset'), async () => {
    const ok = await confirmBox('Erase all stars, catnip, cats and upgrades? Your settings stay.', 'YES, ERASE');
    if (!ok) return;
    const keep = store.get().settings;
    store.set({ ...defaultSave(), settings: keep });
    closeModal();
    toast('Fresh start. The city has forgotten you.');
    go.title();
  });
  onTap($('setClose'), () => closeModal(), uiBack);
  modal.addEventListener('pointerdown', (e) => {
    if (e.target === modal) closeModal();
  });
}
