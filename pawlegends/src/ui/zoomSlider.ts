/**
 * The camera zoom slider (Settings and the pause menu): ZOOM_MIN..zoomMax(width), labelled as a percent of the default
 * view (100% = default; bigger shows more of the map). Moving it saves the zoom (render/camera/zoom.ts) and calls
 * `onZoom`, so a running match follows at once.
 */
import { clampZoom, loadZoom, saveZoom, ZOOM_DEFAULT, ZOOM_EVENT, ZOOM_MIN, zoomMax, zoomPercent } from '../render/camera/zoom';

const viewportWidth = (): number => (typeof window !== 'undefined' ? window.innerWidth : 1280);

/** The slider row's markup, at the saved zoom (or `value`). */
export function zoomRowHtml(value: number = loadZoom()): string {
  const max = zoomMax(viewportWidth());
  const z = clampZoom(value, max);
  return `<div class="set-row set-zoom"><label for="pl-zoom">Camera zoom</label><span class="zoom-ctl">
    <input id="pl-zoom" type="range" data-zoom min="${ZOOM_MIN}" max="${max}" step="0.01" value="${z.toFixed(2)}" aria-valuetext="${zoomPercent(z)}% of the default view">
    <output data-zoom-out>${zoomPercent(z)}%</output>
    <button class="chip" data-zoom-reset aria-label="Reset camera zoom">Reset</button></span></div>`;
}

/**
 * Wire the slider row inside `root`. The listeners are delegated on `root`, so bind once: a re-render of the row
 * (innerHTML) keeps working, and binding again would call `onZoom` twice. Returns the unbind.
 */
export function bindZoomRow(root: HTMLElement, onZoom?: (z: number) => void): () => void {
  const show = (v: number): void => {
    const input = root.querySelector<HTMLInputElement>('input[data-zoom]');
    const out = root.querySelector<HTMLElement>('[data-zoom-out]');
    if (input && Math.abs(Number(input.value) - v) > 0.004) input.value = v.toFixed(2);
    input?.setAttribute('aria-valuetext', `${zoomPercent(v)}% of the default view`);
    if (out) out.textContent = `${zoomPercent(v)}%`;
  };
  const set = (z: number): void => {
    const v = clampZoom(z, zoomMax(viewportWidth()));
    saveZoom(v);
    show(v);
    onZoom?.(v);
  };
  // the wheel, +/− or a pinch while the row is open (the pause menu): the slider follows
  const onSaved = (e: Event): void => {
    // the menu or Settings closed without calling the unbind: drop the window listener
    if (!root.isConnected) {
      window.removeEventListener(ZOOM_EVENT, onSaved);
      return;
    }
    const z = Number((e as CustomEvent<number>).detail);
    if (Number.isFinite(z)) show(clampZoom(z, zoomMax(viewportWidth())));
  };
  const onInput = (e: Event): void => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.dataset.zoom !== undefined) set(Number(t.value));
  };
  const onClick = (e: Event): void => {
    if ((e.target as HTMLElement).closest('[data-zoom-reset]')) {
      e.stopPropagation();
      set(ZOOM_DEFAULT);
    }
  };
  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick, true);
  window.addEventListener(ZOOM_EVENT, onSaved);
  return () => {
    window.removeEventListener(ZOOM_EVENT, onSaved);
    root.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick, true);
  };
}
