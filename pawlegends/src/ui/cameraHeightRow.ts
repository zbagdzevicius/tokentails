/**
 * Feel pass B1: the "Camera height" row (Settings and the pause menu): two chips, Normal and High
 * (render/camera/height.ts). Picking one saves it and calls `onPick`, so a running match follows at once.
 */
import { CAMERA_HEIGHT_EVENT, loadCameraHeight, saveCameraHeight, type CameraHeight } from '../render/camera/height';

/** The row's markup, at the saved step (or `value`). */
export function cameraHeightRowHtml(value: CameraHeight = loadCameraHeight()): string {
  const chip = (h: CameraHeight, label: string): string => `<button type="button" class="chip${h === value ? ' on' : ''}" data-camh="${h}" aria-pressed="${h === value}">${label}</button>`;
  return `<div class="set-row set-camh"><span>Camera height</span><span class="chips">${chip('normal', 'Normal')}${chip('high', 'High')}</span></div>`;
}

/**
 * Wire the row inside `root` (delegated, so bind once; a redrawn row keeps working). Returns the unbind.
 */
export function bindCameraHeightRow(root: HTMLElement, onPick?: (h: CameraHeight) => void): () => void {
  const show = (h: CameraHeight): void => {
    for (const b of root.querySelectorAll<HTMLElement>('[data-camh]')) {
      const on = b.dataset.camh === h;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  const onClick = (e: Event): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-camh]');
    if (!b || !root.contains(b)) return;
    e.stopPropagation();
    const h: CameraHeight = b.dataset.camh === 'high' ? 'high' : 'normal';
    saveCameraHeight(h);
    show(h);
    onPick?.(h);
  };
  const onSaved = (e: Event): void => {
    if (!root.isConnected) {
      window.removeEventListener(CAMERA_HEIGHT_EVENT, onSaved);
      return;
    }
    show((e as CustomEvent<CameraHeight>).detail === 'high' ? 'high' : 'normal');
  };
  root.addEventListener('click', onClick, true);
  window.addEventListener(CAMERA_HEIGHT_EVENT, onSaved);
  return () => {
    window.removeEventListener(CAMERA_HEIGHT_EVENT, onSaved);
    root.removeEventListener('click', onClick, true);
  };
}
