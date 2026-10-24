// Pure: clip framing maths (crop, output size, watermark box).
export type Aspect = '16:9' | '9:16';
export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const RATIO: Record<Aspect, number> = { '16:9': 16 / 9, '9:16': 9 / 16 };
/**
 * 9:16 crops of a tall source (a phone) move the picture 8% of the source height up: the crop window sits that much
 * below centre, because the chase camera keeps Mochi at about 77% of the screen height and the sky on top is spare.
 * Mochi and the road ahead stay in frame. (A landscape source has no vertical slack: its 9:16 strip is full height.)
 */
export const VERTICAL_BIAS = 0.08;

/** The largest centred crop of `aspect` inside srcW x srcH (9:16: picture biased up). Integers, inside the source. */
export function cropRect(srcW: number, srcH: number, aspect: Aspect): Crop {
  const W = Math.max(1, Math.round(srcW || 1));
  const H = Math.max(1, Math.round(srcH || 1));
  const r = RATIO[aspect];
  if (W / H > r) {
    const sw = Math.max(1, Math.min(W, Math.round(H * r)));
    return { sx: Math.floor((W - sw) / 2), sy: 0, sw, sh: H };
  }
  const sh = Math.max(1, Math.min(H, Math.round(W / r)));
  let sy = (H - sh) / 2;
  if (aspect === '9:16') sy += H * VERTICAL_BIAS;
  sy = Math.max(0, Math.min(H - sh, Math.round(sy)));
  return { sx: 0, sy, sw: W, sh };
}

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/**
 * The encoded size: the crop scaled so its long edge is maxLong (1280 desktop, 960 phones; upscaling at most 2x),
 * both sides even (H.264 needs it).
 */
export function outputSize(crop: Pick<Crop, 'sw' | 'sh'>, maxLong: number): { w: number; h: number } {
  const long = Math.max(crop.sw, crop.sh, 1);
  const k = Math.min(2, Math.max(1e-3, maxLong) / long);
  return { w: even(crop.sw * k), h: even(crop.sh * k) };
}

export interface WatermarkBox {
  /** px, text size (about 3.2% of the height, narrower for tall frames) */
  font: number;
  /** paw icon size */
  icon: number;
  /** gap from the frame edges */
  margin: number;
  /** right and bottom anchor (the text is right-aligned, baseline at bottom - font * 0.25) */
  right: number;
  bottom: number;
}

/** Bottom-right watermark box for a w x h frame. */
export function watermarkBox(w: number, h: number): WatermarkBox {
  const font = Math.max(10, Math.round(Math.min(h * 0.032, w * 0.04)));
  const margin = Math.round(font * 0.8);
  return { font, icon: Math.round(font * 1.15), margin, right: w - margin, bottom: h - margin };
}
