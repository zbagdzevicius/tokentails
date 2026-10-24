// PHOTO lane: the shutter. Renders the scene at photo resolution and grabs it in the same task (preserveDrawingBuffer
// is off), restores the live size, then filter -> frame -> stickers -> watermark, and encodes a PNG.
import { audio, env, noise, tone } from '../audio/synth';
import { camera, isTouch, renderer, scene } from '../core/engine';
import { WATERMARK } from '../ugc/sharekit';
import { applyFilter, matchingPixelBlock, type FilterId } from './filters';
import { drawFrame, drawWatermark, type FrameId, type FrameInfo } from './frames';
import { drawSticker, stickerDef, toPx, type Placed } from './stickers';

/** a crop of the screen, css px */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ShotSpec {
  filter: FilterId;
  frame: FrameId;
  stickers: readonly Placed[];
  info: FrameInfo;
  /** the exported part of the screen (css px; default the whole screen) */
  crop?: CropRect;
}

/** the photo's pixel ratio: the exported crop's short edge at least 1080 px (what Instagram and TikTok expect) and
 *  its long edge at most 2400, and the whole render at most 4800 px (or the GPU's limit) on its long edge */
export function photoRatio(cw = innerWidth, ch = innerHeight): number {
  const short = Math.max(1, Math.min(cw, ch));
  const long = Math.max(1, cw, ch);
  const full = Math.max(1, innerWidth, innerHeight);
  const gpu = Math.max(2048, Math.min(4800, renderer.capabilities.maxTextureSize || 4096));
  const want = Math.max(1080 / short, (isTouch ? 1280 : 1920) / long);
  return Math.max(0.5, Math.min(want, 2400 / long, gpu / full));
}

/** synchronous part: render + grab + compose. Call it straight from the click handler. */
export function capture(spec: ShotSpec): HTMLCanvasElement {
  const el = renderer.domElement;
  const prev = renderer.getPixelRatio();
  const cv = document.createElement('canvas');
  const cr = spec.crop ?? { x: 0, y: 0, w: innerWidth, h: innerHeight };
  let k = 1;
  let ox = 0;
  let oy = 0;
  let fullW = 1;
  let fullH = 1;
  try {
    renderer.setPixelRatio(photoRatio(cr.w, cr.h));
    renderer.setSize(innerWidth, innerHeight);
    renderer.render(scene, camera);
    fullW = el.width;
    fullH = el.height;
    k = el.width / Math.max(1, innerWidth);
    ox = Math.max(0, Math.round(cr.x * k));
    oy = Math.max(0, Math.round(cr.y * k));
    cv.width = Math.max(1, Math.min(el.width - ox, Math.round(cr.w * k)));
    cv.height = Math.max(1, Math.min(el.height - oy, Math.round(cr.h * k)));
    cv.getContext('2d', { willReadFrequently: spec.filter !== 'none' })!.drawImage(el, ox, oy, cv.width, cv.height, 0, 0, cv.width, cv.height);
  } finally {
    renderer.setPixelRatio(prev);
    renderer.setSize(innerWidth, innerHeight);
    renderer.render(scene, camera);
  }
  const w = cv.width;
  const h = cv.height;
  const ctx = cv.getContext('2d')!;
  if (spec.filter !== 'none') {
    const img = ctx.getImageData(0, 0, w, h);
    applyFilter(img, spec.filter, { pixelBlock: matchingPixelBlock(fullW, innerWidth) });
    ctx.putImageData(img, 0, 0);
  }
  drawFrame(ctx, spec.frame, w, h, spec.info);
  for (const s of spec.stickers) {
    const def = stickerDef(s.id);
    if (!def) continue;
    // sticker positions are fractions of the whole screen: back into the crop
    const p = toPx(s, fullW, fullH);
    drawSticker(ctx, def, p.x - ox, p.y - oy, p.size, s.rot);
  }
  drawWatermark(ctx, spec.frame, w, h, WATERMARK);
  return cv;
}

export function toPng(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));
}

/** a mechanical shutter: two filtered noise clicks and a tiny spring */
export function shutterSound(): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  const click = (at: number, dur: number, freq: number, peak: number) => {
    const src = noise(dur);
    const f = a.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.4;
    const g = a.ctx.createGain();
    env(g, peak, 0.002, dur, at);
    src.connect(f).connect(g).connect(a.sfx);
  };
  click(t, 0.035, 3400, 0.55);
  click(t + 0.075, 0.06, 1700, 0.4);
  tone('square', 2600, 0.018, 0.04);
  tone('triangle', 880, 0.07, 0.07, { at: t + 0.08, to: 520 });
}

/** a soft tick for tray buttons */
export function tick(hi = false): void {
  if (!audio()) return;
  tone('triangle', hi ? 990 : 760, 0.05, 0.08, { to: hi ? 1320 : 900 });
}
