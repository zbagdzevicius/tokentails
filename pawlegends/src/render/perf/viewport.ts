/**
 * PERF-IOS P1-5: the window's size and DPR, cached and refreshed on `resize` (one listener for the whole page), so
 * per-frame code (the overhead canvas) does not read `innerWidth`/`innerHeight` every frame (a forced layout on
 * WebKit when anything in the page changed since the last frame).
 */
interface Viewport {
  w: number;
  h: number;
  dpr: number;
}

const vp: Viewport = { w: 0, h: 0, dpr: 1 };
let installed = false;

function read(): void {
  vp.w = window.innerWidth;
  vp.h = window.innerHeight;
  vp.dpr = window.devicePixelRatio || 1;
}

/** The cached viewport (the same object every call: read its fields, do not keep it). */
export function viewport(): Readonly<Viewport> {
  if (!installed && typeof window !== 'undefined') {
    installed = true;
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
  }
  return vp;
}
