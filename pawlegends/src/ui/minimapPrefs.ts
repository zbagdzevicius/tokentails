/**
 * Minimap preferences (MAP-GAPS A4, A5), per viewer in browser storage (a convenience only: missing or blocked
 * storage gives the defaults). Colour-blind colours: the enemy hue moves from red to orange and every mark keeps its
 * dark outline. Size: S / M / L scales the minimap box (ui.css `--mm-k`).
 */
export type MinimapSize = 's' | 'm' | 'l';
export const MINIMAP_SIZES: readonly MinimapSize[] = Object.freeze(['s', 'm', 'l'] as MinimapSize[]);
/** The box scale per size (M is the default layout). */
export const MINIMAP_SIZE_K: Readonly<Record<MinimapSize, number>> = Object.freeze({ s: 0.82, m: 1, l: 1.2 });

const CVD_KEY = 'pawlegends.minimap.cvd';
const SIZE_KEY = 'pawlegends.minimap.size';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage blocked: not remembered */
  }
}

/** Colour-blind map colours on? (default off) */
export const colourBlind = (): boolean => read(CVD_KEY) === '1';
export function setColourBlind(on: boolean): void {
  write(CVD_KEY, on ? '1' : '0');
}

export function minimapSize(): MinimapSize {
  const v = read(SIZE_KEY);
  return v === 's' || v === 'l' ? v : 'm';
}
export function setMinimapSize(s: MinimapSize): void {
  write(SIZE_KEY, s);
  applyMinimapSize(s);
}
/** Put the size on the document (ui.css reads `--mm-k`). */
export function applyMinimapSize(s: MinimapSize = minimapSize()): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.style.setProperty('--mm-k', String(MINIMAP_SIZE_K[s]));
  document.documentElement.dataset.mmSize = s;
}
