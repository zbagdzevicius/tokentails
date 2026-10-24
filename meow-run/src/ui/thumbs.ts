// Little painted postcards for the stage select (2D canvas, procedural). META-UI lane.
import type { StageId } from '../core/types';

const INK = '#2a1c14';

interface Pal {
  sky: [string, string];
  far: string;
  hill: string;
  hill2: string;
  mesa: string;
  mesaShade: string;
  path: string;
  sun: string;
}
const PAL: Record<StageId, Pal> = {
  meadow: { sky: ['#4cb8ff', '#c8eeff'], far: '#9cc8e8', hill: '#86d45a', hill2: '#5fb93c', mesa: '#e0a964', mesaShade: '#b97a3e', path: '#e6bf86', sun: '#fff6c0' },
  gorge: { sky: ['#5ec4ff', '#d8f4ff'], far: '#8fb8d8', hill: '#6cc35a', hill2: '#3f9a46', mesa: '#c98c56', mesaShade: '#9a6034', path: '#38b8e8', sun: '#fffbe0' },
  sunset: { sky: ['#6a5acd', '#ffb46b'], far: '#c48ab0', hill: '#b6c45a', hill2: '#7d9a3c', mesa: '#e88a5a', mesaShade: '#a8523a', path: '#f0c08a', sun: '#ffe08a' },
  endless: { sky: ['#3fa0ff', '#ffe0b0'], far: '#a0b8e0', hill: '#8ad460', hill2: '#56ad3a', mesa: '#d99a5c', mesaShade: '#a96a3a', path: '#e6bf86', sun: '#fff0a0' },
  // iteration 2: the Daily Run (seeded endless) and player-made trails (not on the map; lanes may draw their own cards)
  daily: { sky: ['#ff8fb8', '#ffe6a8'], far: '#c8a0d8', hill: '#8ad460', hill2: '#56ad3a', mesa: '#e89a6c', mesaShade: '#b0623e', path: '#e6bf86', sun: '#fff0a0' },
  trail: { sky: ['#48d0c0', '#e0fff4'], far: '#98c8d8', hill: '#86d45a', hill2: '#4fa83c', mesa: '#d9a35c', mesaShade: '#a9733a', path: '#f0c890', sun: '#fff6c0' },
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function cloud(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.fillStyle = 'rgba(255,255,255,.95)';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.arc(x + r * 0.9, y + r * 0.2, r * 0.75, 0, Math.PI * 2);
  c.arc(x - r * 0.9, y + r * 0.25, r * 0.7, 0, Math.PI * 2);
  c.arc(x + r * 0.2, y - r * 0.5, r * 0.7, 0, Math.PI * 2);
  c.fill();
}

function mesa(c: CanvasRenderingContext2D, p: Pal, x: number, base: number, w: number, h: number): void {
  c.fillStyle = p.mesa;
  c.beginPath();
  c.moveTo(x - w * 0.6, base);
  c.lineTo(x - w * 0.45, base - h);
  c.lineTo(x + w * 0.45, base - h);
  c.lineTo(x + w * 0.6, base);
  c.fill();
  c.fillStyle = p.mesaShade;
  c.beginPath();
  c.moveTo(x + w * 0.1, base - h);
  c.lineTo(x + w * 0.45, base - h);
  c.lineTo(x + w * 0.6, base);
  c.lineTo(x + w * 0.2, base);
  c.fill();
  c.fillStyle = '#6fbf4a';
  c.fillRect(x - w * 0.48, base - h - 3, w * 0.96, 5);
}

function tree(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string): void {
  c.fillStyle = '#7a4a2a';
  c.fillRect(x - s * 0.12, y - s * 0.6, s * 0.24, s * 0.6);
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y - s * 0.9, s * 0.55, 0, Math.PI * 2);
  c.arc(x - s * 0.35, y - s * 0.7, s * 0.4, 0, Math.PI * 2);
  c.arc(x + s * 0.35, y - s * 0.7, s * 0.4, 0, Math.PI * 2);
  c.fill();
}

function cottage(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.fillStyle = '#fff1d6';
  c.fillRect(x - s, y - s * 1.1, s * 2, s * 1.1);
  c.fillStyle = '#d9483b';
  c.beginPath();
  c.moveTo(x - s * 1.3, y - s * 1.05);
  c.lineTo(x, y - s * 2);
  c.lineTo(x + s * 1.3, y - s * 1.05);
  c.fill();
  c.fillStyle = '#ffd36a';
  c.fillRect(x - s * 0.7, y - s * 0.75, s * 0.45, s * 0.4);
  c.fillStyle = '#8a5a3a';
  c.fillRect(x + s * 0.2, y - s * 0.75, s * 0.42, s * 0.75);
}

/** Paint a stage postcard into the canvas. */
export function drawThumb(cv: HTMLCanvasElement, id: StageId): void {
  const c = cv.getContext('2d');
  if (!c) return;
  const w = cv.width;
  const h = cv.height;
  const p = PAL[id];
  const r = rng(id.length * 977 + id.charCodeAt(0));
  const g = c.createLinearGradient(0, 0, 0, h * 0.7);
  g.addColorStop(0, p.sky[0]);
  g.addColorStop(1, p.sky[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // sun
  c.fillStyle = p.sun;
  c.beginPath();
  c.arc(w * (id === 'sunset' ? 0.62 : 0.8), h * (id === 'sunset' ? 0.5 : 0.18), h * 0.11, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 3; i++) cloud(c, w * (0.12 + i * 0.33 + r() * 0.1), h * (0.12 + r() * 0.15), h * (0.05 + r() * 0.03));
  // far haze hills
  c.fillStyle = p.far;
  c.beginPath();
  c.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += w / 8) c.lineTo(x, h * (0.5 + Math.sin(x * 0.05 + 1) * 0.04));
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
  // mesas
  mesa(c, p, w * 0.15, h * 0.66, w * 0.18, h * 0.3);
  mesa(c, p, w * 0.86, h * 0.66, w * 0.16, h * (id === 'gorge' ? 0.42 : 0.24));
  if (id !== 'meadow') mesa(c, p, w * 0.72, h * 0.66, w * 0.1, h * 0.18);
  // hills
  c.fillStyle = p.hill;
  c.beginPath();
  c.moveTo(0, h * 0.7);
  c.quadraticCurveTo(w * 0.3, h * 0.52, w * 0.6, h * 0.66);
  c.quadraticCurveTo(w * 0.85, h * 0.76, w, h * 0.62);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
  c.fillStyle = p.hill2;
  c.beginPath();
  c.moveTo(0, h * 0.86);
  c.quadraticCurveTo(w * 0.25, h * 0.74, w * 0.5, h * 0.84);
  c.quadraticCurveTo(w * 0.8, h * 0.94, w, h * 0.8);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
  // the winding path / river to the horizon
  c.fillStyle = p.path;
  c.beginPath();
  c.moveTo(w * 0.3, h);
  c.bezierCurveTo(w * 0.42, h * 0.85, w * 0.62, h * 0.8, w * 0.5, h * 0.66);
  c.lineTo(w * 0.53, h * 0.66);
  c.bezierCurveTo(w * 0.7, h * 0.8, w * 0.6, h * 0.88, w * 0.72, h);
  c.fill();
  if (id === 'gorge') {
    c.strokeStyle = 'rgba(255,255,255,.8)';
    c.lineWidth = Math.max(1, w * 0.008);
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      const yy = h * (0.75 + i * 0.06);
      c.moveTo(w * (0.46 + i * 0.01), yy);
      c.lineTo(w * (0.54 + i * 0.03), yy + 2);
      c.stroke();
    }
  }
  if (id === 'sunset') cottage(c, w * 0.52, h * 0.66, w * 0.035);
  if (id === 'endless' || id === 'daily') {
    c.strokeStyle = 'rgba(255,255,255,.9)';
    c.lineWidth = w * 0.03;
    c.lineCap = 'round';
    c.beginPath();
    const cx = w * 0.5;
    const cy = h * 0.32;
    const a = w * 0.13;
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const d = 1 + Math.sin(t) ** 2;
      c.lineTo(cx + (a * Math.cos(t)) / d, cy + (a * Math.sin(t) * Math.cos(t)) / d);
    }
    c.stroke();
    c.strokeStyle = INK;
    c.lineWidth = w * 0.012;
    c.stroke();
  }
  // trees and bushes
  for (let i = 0; i < 6; i++) {
    const x = r() < 0.5 ? w * (0.02 + r() * 0.25) : w * (0.75 + r() * 0.23);
    tree(c, x, h * (0.72 + r() * 0.2), h * (0.1 + r() * 0.06), id === 'sunset' ? '#6f8f34' : '#3f9a3c');
  }
  if (id === 'meadow' || id === 'endless') {
    // bamboo
    c.fillStyle = '#7fbf4a';
    for (let i = 0; i < 4; i++) c.fillRect(w * (0.8 + i * 0.03), h * 0.48, w * 0.012, h * 0.3);
  }
}

/** A HiDPI postcard canvas. */
export function thumbCanvas(id: StageId, cssW = 240, cssH = 150): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  drawThumb(cv, id);
  return cv;
}
