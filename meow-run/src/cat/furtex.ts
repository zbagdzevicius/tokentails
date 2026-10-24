// Mochi's painted fur: the body and head canvas textures for a (fur colour, pattern) pair. Textures are cached per
// pair and reference counted, so the gameplay rig, the cutscene kitten, the title runner and the Wardrobe preview
// share one pair of canvases, and the last rig that lets go disposes them. The classic pair (orange tabby) paints
// exactly the iteration 1 textures (same colours, same random sequence).
import * as THREE from 'three';
import { furColors, patternId, type FurColors, type PatternId } from '../wardrobe/catalog';
import { css } from '../wardrobe/color';
import { prng } from './toon';

export interface FurTex {
  fur: THREE.CanvasTexture;
  head: THREE.CanvasTexture;
}
const cache = new Map<string, FurTex & { refs: number }>();

export const furTexKey = (fur: number, pattern: number) => `${fur}:${pattern}`;

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** the textures for a (fur, pattern) pair; call releaseFurTex with the same key when the rig is disposed */
export function acquireFurTex(fur: number, pattern: number): FurTex {
  const key = furTexKey(fur, pattern);
  let e = cache.get(key);
  if (!e) {
    const c = furColors(fur);
    const pat = patternId(pattern);
    e = { fur: canvasTexture(512, 256, (g, w, h) => paintFur(g, w, h, c, pat)), head: canvasTexture(512, 256, (g, w, h) => paintHead(g, w, h, c, pat)), refs: 0 };
    cache.set(key, e);
  }
  e.refs++;
  return e;
}
export function releaseFurTex(key: string): void {
  const e = cache.get(key);
  if (!e) return;
  if (--e.refs <= 0) {
    e.fur.dispose();
    e.head.dispose();
    cache.delete(key);
  }
}
/** live cached pairs (tests / leak checks) */
export const furTexCount = () => cache.size;

function flecks(g: CanvasRenderingContext2D, w: number, h: number, c: FurColors, n: number, R: () => number, darkA: number): void {
  const light = css(c.fleckLight, 0.22);
  const dark = css(c.fleckDark, darkA);
  for (let i = 0; i < n; i++) {
    g.fillStyle = R() < 0.5 ? light : dark;
    g.fillRect(R() * w, R() * h, 2, 5);
  }
}

function belly(g: CanvasRenderingContext2D, w: number, h: number, c: FurColors, from: number): void {
  const grad = g.createLinearGradient(0, h * from, 0, h * (from + 0.16));
  grad.addColorStop(0, css(c.belly, 0));
  grad.addColorStop(1, css(c.belly, 1));
  g.fillStyle = grad;
  g.fillRect(0, h * from, w, h * (1 - from));
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, R: () => number): void {
  // a soft irregular patch: a few overlapping circles, wrapped across the u seam
  for (let k = 0; k < 4; k++) {
    const a = R() * Math.PI * 2;
    const rr = r * (0.55 + R() * 0.4);
    for (const dx of [0, -g.canvas.width, g.canvas.width]) {
      g.beginPath();
      g.arc(x + dx + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.35, rr, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function specks(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const R = prng(seed);
  for (let i = 0; i < 170; i++) {
    g.fillStyle = R() < 0.7 ? 'rgba(255,255,255,0.85)' : 'rgba(255,224,140,0.9)';
    const s = R() < 0.85 ? 1.5 : 3;
    g.fillRect(R() * w, R() * h * 0.78, s, s);
  }
  // a few twinkle stars
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 14; i++) {
    const x = R() * w;
    const y = R() * h * 0.7;
    const r = 4 + R() * 4;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r * 0.25, y - r * 0.25);
    g.lineTo(x + r, y);
    g.lineTo(x + r * 0.25, y + r * 0.25);
    g.lineTo(x, y + r);
    g.lineTo(x - r * 0.25, y + r * 0.25);
    g.lineTo(x - r, y);
    g.lineTo(x - r * 0.25, y - r * 0.25);
    g.closePath();
    g.fill();
  }
}

/** body: top of the canvas = the back, bottom = the tummy; u = 0.25 is the front of a three.js sphere */
function paintFur(g: CanvasRenderingContext2D, w: number, h: number, c: FurColors, pat: PatternId): void {
  const R = prng(7);
  g.fillStyle = css(c.base);
  g.fillRect(0, 0, w, h);
  flecks(g, w, h, c, 2600, R, 0.14);
  g.fillStyle = css(c.dark);
  if (pat === 'tabby') {
    // bold wavy tabby stripes on the back half (top of the sphere), thinner toward the sides
    for (let s = 0; s < 12; s++) {
      const x0 = (s / 12) * w + R() * 8;
      const sw = 9 + R() * 7;
      g.beginPath();
      g.moveTo(x0, 0);
      for (let y = 0; y <= h * 0.62; y += 10) g.lineTo(x0 + Math.sin(y * 0.06 + s) * 7, y);
      for (let y = Math.floor(h * 0.62); y >= 0; y -= 10) g.lineTo(x0 + sw * (1 - y / (h * 0.75)) + Math.sin(y * 0.06 + s) * 7, y);
      g.closePath();
      g.fill();
    }
  } else if (pat === 'spots') {
    for (let i = 0; i < 26; i++) {
      const x = R() * w;
      const y = 10 + R() * h * 0.55;
      g.beginPath();
      g.ellipse(x, y, 9 + R() * 9, 7 + R() * 6, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (pat === 'patches') {
    for (let i = 0; i < 5; i++) blob(g, (i / 5) * w + R() * 40, 20 + R() * h * 0.4, 40 + R() * 22, R);
    g.fillStyle = css(c.belly);
    for (let i = 0; i < 3; i++) blob(g, R() * w, 30 + R() * h * 0.35, 26 + R() * 14, R);
  }
  if (c.specks) specks(g, w, h, 21);
  belly(g, w, h, c, pat === 'tuxedo' ? 0.5 : 0.62);
  if (pat === 'tuxedo') {
    // the white shirt front
    g.fillStyle = css(c.belly);
    g.beginPath();
    g.ellipse(w * 0.25, h * 0.62, w * 0.11, h * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** head: u = 0.25 is the face, u = 0.75 the back of the head (what the chase camera sees) */
function paintHead(g: CanvasRenderingContext2D, w: number, h: number, c: FurColors, pat: PatternId): void {
  const R = prng(9);
  g.fillStyle = css(c.base);
  g.fillRect(0, 0, w, h);
  flecks(g, w, h, c, 1800, R, 0.12);
  g.fillStyle = css(c.dark);
  const stripe = (cx: number, y0: number, y1: number, wd: number) => {
    g.beginPath();
    g.moveTo(cx - wd / 2, y0);
    g.quadraticCurveTo(cx + wd * 0.4, (y0 + y1) / 2, cx, y1);
    g.quadraticCurveTo(cx + wd * 0.9, (y0 + y1) / 2, cx + wd / 2, y0);
    g.closePath();
    g.fill();
  };
  if (pat === 'tabby') {
    // the tabby "M" on the forehead
    for (let i = -1; i <= 1; i++) stripe(w * 0.25 + i * 20, h * 0.04, h * (i === 0 ? 0.36 : 0.3), 12);
    // bold stripes over the crown and down the back of the head
    for (let i = -3; i <= 3; i++) stripe(w * 0.75 + i * 26, 0, h * (0.52 - Math.abs(i) * 0.04), 16);
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) g.fillRect(w * 0.25 + side * (70 + k * 14) - 4, h * (0.45 + k * 0.07), 26, 5);
  } else if (pat === 'spots') {
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(w * 0.5 + (R() - 0.5) * w * 0.7, 8 + R() * h * 0.4, 6 + R() * 6, 5 + R() * 4, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (const dx of [-14, 0, 14]) {
      g.beginPath();
      g.arc(w * 0.25 + dx, h * 0.12, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  } else if (pat === 'patches') {
    // a patch over one eye and ear, and one on the back of the head
    g.beginPath();
    g.ellipse(w * 0.31, h * 0.2, 46, 52, 0.3, 0, Math.PI * 2);
    g.fill();
    blob(g, w * 0.78, h * 0.18, 44, R);
  }
  if (c.specks) specks(g, w, h, 23);
  belly(g, w, h, c, pat === 'tuxedo' ? 0.52 : 0.62);
  if (pat === 'tuxedo') {
    // the white blaze up the nose
    g.fillStyle = css(c.belly);
    g.beginPath();
    g.moveTo(w * 0.25 - 64, h * 0.62);
    g.quadraticCurveTo(w * 0.25 - 10, h * 0.42, w * 0.25, h * 0.2);
    g.quadraticCurveTo(w * 0.25 + 10, h * 0.42, w * 0.25 + 64, h * 0.62);
    g.closePath();
    g.fill();
  }
}
