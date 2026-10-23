// Settings card (META-UI lane): master / music / sfx volume, screen shake, quality (auto, low, high) and calm mode
// (reduced motion). Changes apply live and save immediately. Opened from the title or the pause card.
import type { SaveData, Settings } from '../meta/save';
import { uiBack } from './uisfx';

type Back = 'title' | 'pause';
let backTo: Back = 'title';
let getSave: () => SaveData = () => {
  throw new Error('settings not initialised');
};
let commit: (s: SaveData) => void = () => {};

const $ = (id: string) => document.getElementById(id)!;

function render(): void {
  const st = getSave().settings;
  for (const input of document.querySelectorAll<HTMLInputElement>('#settings input[type="range"]')) {
    const k = input.dataset.k as 'master' | 'music' | 'sfx' | 'shake';
    const v = Math.round(st[k] * 100);
    input.value = String(v);
    input.style.setProperty('--v', `${v}%`);
    const out = input.nextElementSibling as HTMLOutputElement | null;
    if (out) out.textContent = String(v);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#setQuality button')) b.classList.toggle('on', b.dataset.q === st.quality);
  $('setReduced').classList.toggle('on', st.reducedMotion);
}

function update(patch: Partial<Settings>): void {
  const s = getSave();
  commit({ ...s, settings: { ...s.settings, ...patch } });
  render();
}

export function initSettings(get: () => SaveData, set: (s: SaveData) => void): void {
  getSave = get;
  commit = set;
  for (const input of document.querySelectorAll<HTMLInputElement>('#settings input[type="range"]')) {
    input.addEventListener('input', () => {
      const k = input.dataset.k as 'master' | 'music' | 'sfx' | 'shake';
      update({ [k]: Math.max(0, Math.min(1, Number(input.value) / 100)) } as Partial<Settings>);
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#setQuality button'))
    b.addEventListener('click', () => update({ quality: (b.dataset.q as Settings['quality']) ?? 'auto' }));
  $('setReduced').addEventListener('click', () => update({ reducedMotion: !getSave().settings.reducedMotion }));
  $('settingsDone').addEventListener('click', closeSettings);
  addEventListener('keydown', (e) => {
    if (document.body.dataset.screen === 'settings' && e.code === 'Escape' && !e.repeat) {
      // stop the flow's own Esc handler (registered later) from also resuming the paused run
      e.stopImmediatePropagation();
      closeSettings();
    }
  });
}

export function openSettings(from: Back): void {
  backTo = from;
  render();
  document.body.dataset.screen = 'settings';
}
function closeSettings(): void {
  uiBack();
  document.body.dataset.screen = backTo;
}
