/**
 * Procedural night plates (plan G7 "Parallax plates"; decision #46).
 *
 * The art pipeline (task 6d) derives the real far, mid, near and fog plates from the landing
 * hero layers and lists them in the look manifest. Until a preset's set is listed (or when a file
 * fails to load), the backdrop draws these instead: small pixel-art strips at native art
 * resolution, from the preset's palette and a seeded generator, so a scene never boots onto an
 * empty sky. Every strip tiles horizontally (all shapes are periodic in the strip width).
 *
 * Shapes echo the landing hero: a far ridge with broken columns, a mid tree line, near foliage
 * with a few lilac blooms, and a soft fog band.
 *
 * Pure module: draws on any CanvasRenderingContext2D-like object; no Phaser import.
 */
import type { LookPreset } from "./presets";
import { createRng, type Rng } from "./rng";

export const PLATE_WIDTH = 320;
export const PLATE_HEIGHTS = { far: 96, mid: 64, near: 36, fog: 28 } as const;
export type ProceduralLayer = keyof typeof PLATE_HEIGHTS;

export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "globalAlpha" | "fillRect" | "clearRect"
>;

/** A periodic height profile: integer harmonics of the strip width, so x = 0 and x = W meet. */
function profile(rng: Rng, width: number, harmonics: number[], amplitude: number): (x: number) => number {
  const waves = harmonics.map((h) => ({
    h,
    a: amplitude * rng.float(0.4, 1) / Math.sqrt(h),
    p: rng.float(0, Math.PI * 2),
  }));
  return (x) => waves.reduce((sum, w) => sum + w.a * Math.sin((x / width) * Math.PI * 2 * w.h + w.p), 0);
}

function column(ctx: Ctx2D, x: number, base: number, height: number, width: number) {
  ctx.fillRect(x, base - height, width, height);
  ctx.fillRect(x - 1, base - height - 2, width + 2, 2); // capital
  ctx.fillRect(x - 1, base - 2, width + 2, 2); // plinth
}

/** Draws one layer into a `PLATE_WIDTH x PLATE_HEIGHTS[layer]` canvas. */
export function drawPlate(ctx: Ctx2D, layer: ProceduralLayer, preset: LookPreset, seed: string): void {
  const rng = createRng(`${seed}:${preset.name}:${layer}`);
  const W = PLATE_WIDTH;
  const H = PLATE_HEIGHTS[layer];
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  if (layer === "far") {
    const ridge = profile(rng, W, [1, 2, 3, 5], 14);
    ctx.fillStyle = preset.hills[0];
    for (let x = 0; x < W; x += 1) {
      const top = Math.round(H * 0.45 + ridge(x));
      ctx.fillRect(x, top, 1, H - top);
    }
    // Broken colonnade on the ridge (the landing's ruins), evenly spaced so it tiles.
    const count = 4;
    for (let i = 0; i < count; i += 1) {
      const x = Math.round((W / count) * i + rng.between(8, 40));
      const base = Math.round(H * 0.45 + ridge(x)) + 2;
      const height = rng.between(16, 30);
      column(ctx, x, base, height, 4);
      if (rng.next() < 0.6) column(ctx, x + 10, base, Math.round(height * rng.float(0.5, 0.9)), 4);
    }
    return;
  }

  if (layer === "mid") {
    const line = profile(rng, W, [2, 4, 7], 6);
    ctx.fillStyle = preset.hills[1];
    for (let x = 0; x < W; x += 1) {
      const top = Math.round(H * 0.5 + line(x));
      ctx.fillRect(x, top, 1, H - top);
    }
    // Round canopies, wrapped at the strip edge.
    const trees = 11;
    for (let i = 0; i < trees; i += 1) {
      const cx = Math.round((W / trees) * i + rng.between(0, 18));
      const r = rng.between(5, 10);
      const cy = Math.round(H * 0.5 + line(cx)) - r + 3;
      for (let dy = -r; dy <= r; dy += 1) {
        const half = Math.floor(Math.sqrt(r * r - dy * dy));
        for (const shift of [0, -W, W]) ctx.fillRect(cx - half + shift, cy + dy, half * 2 + 1, 1);
      }
      ctx.fillRect(cx, cy + r - 1, 2, H - (cy + r - 1)); // trunk
    }
    return;
  }

  if (layer === "near") {
    const line = profile(rng, W, [3, 5, 9], 5);
    ctx.fillStyle = preset.hills[2];
    for (let x = 0; x < W; x += 1) {
      const top = Math.round(H * 0.42 + line(x));
      ctx.fillRect(x, top, 1, H - top);
      // Grass blades on the edge, every few pixels.
      if (x % 3 === 0) ctx.fillRect(x, top - rng.between(1, 4), 1, 4);
    }
    // A few blooms in the foliage (lilac and the preset halo colour), like the hero's flowers.
    const blooms = 9;
    for (let i = 0; i < blooms; i += 1) {
      const x = Math.round((W / blooms) * i + rng.between(2, 26));
      const y = Math.round(H * 0.42 + line(x)) + rng.between(2, 8);
      ctx.fillStyle = i % 2 ? preset.halo : preset.fireflies[0];
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, y, 2, 2);
      ctx.fillRect(x - 1, y + 1, 1, 1);
      ctx.fillRect(x + 2, y + 1, 1, 1);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Fog: a band that fades out at top and bottom in four dithered steps.
  ctx.fillStyle = preset.fog;
  const steps = [0.05, 0.1, 0.16, 0.22, 0.16, 0.1, 0.05];
  const band = H / steps.length;
  steps.forEach((alpha, i) => {
    ctx.globalAlpha = alpha;
    const y0 = Math.round(i * band);
    const y1 = Math.round((i + 1) * band);
    for (let y = y0; y < y1; y += 1) {
      // Checker dither on the edge rows keeps the pixel look instead of a smooth gradient.
      const dither = i === 0 || i === steps.length - 1;
      for (let x = 0; x < W; x += dither ? 2 : W) {
        ctx.fillRect(dither ? x + (y % 2) : 0, y, dither ? 1 : W, 1);
      }
    }
  });
  ctx.globalAlpha = 1;
}

export interface Star {
  /** 0..1 across and down the sky. */
  u: number;
  v: number;
  size: 1 | 2;
  alpha: number;
}

/** Seeded star field; `density` stars per 10 000 art px of a 320 x 180 sky. */
export function starField(preset: LookPreset, seed: string): Star[] {
  const rng = createRng(`${seed}:${preset.name}:stars`);
  const count = Math.round((PLATE_WIDTH * 180 * preset.stars) / 10_000);
  return Array.from({ length: count }, () => ({
    u: rng.next(),
    v: rng.next() * 0.7,
    size: rng.next() < 0.15 ? 2 : 1,
    alpha: rng.float(0.35, 0.95),
  }));
}

/** The sky ramp as discrete bands (pixel-art banding, not a smooth gradient), top to bottom. */
export function skyBands(preset: LookPreset, bands = 8): string[] {
  const [top, mid, bottom] = preset.sky.map(hexToRgb);
  return Array.from({ length: bands }, (_, i) => {
    const t = bands === 1 ? 0 : i / (bands - 1);
    const [a, b, k] = t < 0.6 ? [top, mid, t / 0.6] : [mid, bottom, (t - 0.6) / 0.4];
    const mix = a.map((c, j) => Math.round(c + (b[j] - c) * k));
    return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
