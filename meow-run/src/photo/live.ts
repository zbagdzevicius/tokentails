// PHOTO lane: the live filter on the game canvas (CSS filter, or a low pixel ratio for PIXEL) and its restore.
import { renderer } from '../core/engine';
import { FILTER_CSS, PINK_CSS, PIXEL_RATIO, type FilterId } from './filters';

let cur: FilterId = 'none';
let saved: { filter: string; rendering: string } | null = null;
let savedRatio: number | null = null;
let dreamyEl: HTMLElement | null = null;

/** the element that carries the dreamy pink overlay (inside the photo screen, under the UI) */
export function setDreamyLayer(el: HTMLElement): void {
  dreamyEl = el;
  el.style.background = PINK_CSS;
  el.classList.toggle('hidden', cur !== 'dreamy');
}

function leavePixel(): void {
  if (savedRatio === null) return;
  renderer.setPixelRatio(savedRatio);
  renderer.setSize(innerWidth, innerHeight);
  savedRatio = null;
}

export function setLiveFilter(id: FilterId): void {
  const el = renderer.domElement;
  if (!saved) saved = { filter: el.style.filter, rendering: el.style.imageRendering };
  if (id !== 'pixel') leavePixel();
  else if (savedRatio === null) {
    savedRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(PIXEL_RATIO);
    renderer.setSize(innerWidth, innerHeight);
  }
  el.style.imageRendering = id === 'pixel' ? 'pixelated' : saved.rendering;
  el.style.filter = FILTER_CSS[id] || saved.filter;
  dreamyEl?.classList.toggle('hidden', id !== 'dreamy');
  cur = id;
}

/** keep the canvas the size of the window (the engine resizes too; the pixel ratio stays what we set) */
export function onLiveResize(): void {
  renderer.setSize(innerWidth, innerHeight);
}

/** put the canvas back exactly as it was (exit) */
export function clearLive(): void {
  leavePixel();
  const el = renderer.domElement;
  if (saved) {
    el.style.filter = saved.filter;
    el.style.imageRendering = saved.rendering;
  }
  saved = null;
  dreamyEl?.classList.add('hidden');
  cur = 'none';
}
