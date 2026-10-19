// Copied from bad-cat/src/render/face-decal-material.ts at 4889ed41 (copy, never import; adapted for formula-meow).
/**
 * The cat's face quad (GDD 6.1, 11.1): a dedicated plane on the front of the head whose `map` is
 * either the player's 256² photo crop (feathered alpha from the cat maker) or a procedural toon
 * face drawn into a DataTexture (pure JS, so it also works in Node tests). The procedural face has
 * an open and a closed-eye variant for blinks, the loaf and the clip's slow blink.
 */
import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  MeshLambertMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from 'three';
import type { CatSpec } from '../../types';
import { catColors, mixHex } from './palette';

const N = 128;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function rgba(hex: number, a = 255): Rgba {
  return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255, a };
}

/** Pixel painter on an RGBA buffer, u right / v down in 0..1 (rows are flipped for GL on output). */
class Painter {
  readonly data = new Uint8Array(N * N * 4);
  blend(px: number, py: number, c: Rgba, cov: number): void {
    if (px < 0 || py < 0 || px >= N || py >= N || cov <= 0) return;
    // flip v so v=0 is the top of the face
    const i = ((N - 1 - py) * N + px) * 4;
    const a = (c.a / 255) * Math.min(1, cov);
    const d = this.data;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = (c.r * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c.g * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c.b * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }
  /** Filled ellipse with a 1.2 px anti-aliased edge. */
  ellipse(cu: number, cv: number, ru: number, rv: number, c: Rgba): void {
    const x0 = Math.floor((cu - ru) * N) - 2;
    const x1 = Math.ceil((cu + ru) * N) + 2;
    const y0 = Math.floor((cv - rv) * N) - 2;
    const y1 = Math.ceil((cv + rv) * N) + 2;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5) / N;
        const v = (y + 0.5) / N;
        const dd = Math.hypot((u - cu) / ru, (v - cv) / rv);
        const edge = (1 - dd) * Math.min(ru, rv) * N;
        this.blend(x, y, c, Math.max(0, Math.min(1, edge / 1.2 + 0.5)));
      }
  }
  /** Thick anti-aliased segment. */
  line(u0: number, v0: number, u1: number, v1: number, w: number, c: Rgba): void {
    const x0 = Math.floor(Math.min(u0, u1) * N - w * N) - 2;
    const x1 = Math.ceil(Math.max(u0, u1) * N + w * N) + 2;
    const y0 = Math.floor(Math.min(v0, v1) * N - w * N) - 2;
    const y1 = Math.ceil(Math.max(v0, v1) * N + w * N) + 2;
    const dx = u1 - u0;
    const dy = v1 - v0;
    const l2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5) / N;
        const v = (y + 0.5) / N;
        const t = Math.max(0, Math.min(1, ((u - u0) * dx + (v - v0) * dy) / l2));
        const dist = Math.hypot(u - (u0 + dx * t), v - (v0 + dy * t));
        this.blend(x, y, c, Math.max(0, Math.min(1, (w / 2 - dist) * N + 0.5)));
      }
  }
}

/** Eye lid state: open, half (the smug slow blink, mugshots) or closed (blink, loaf, cuddle). */
export type Lid = 'open' | 'half' | 'closed';

/** Procedural toon face pixels (RGBA, 128²). `closed` draws content "‿" eyes, 'half' smug half-lidded eyes. */
export function paintFace(spec: CatSpec, closed: boolean | Lid): Uint8Array {
  const lid: Lid = closed === true ? 'closed' : closed === false ? 'open' : closed;
  const cc = catColors(spec);
  const p = new Painter();
  // face oval (feathered alpha) in the fur colour, lighter muzzle
  const fur = spec.pattern === 'colorpoint' ? mixHex(cc.base, cc.secondary, 0.65) : cc.base;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N;
      const v = (y + 0.5) / N;
      const dd = Math.hypot((u - 0.5) / 0.47, (v - 0.53) / 0.45);
      const a = Math.max(0, Math.min(1, (1 - dd) * 7));
      p.blend(x, y, rgba(fur), a);
    }
  if (spec.pattern === 'tabby') {
    // the forehead "M"
    const s = rgba(cc.secondary, 230);
    p.line(0.36, 0.3, 0.42, 0.14, 0.035, s);
    p.line(0.5, 0.3, 0.5, 0.12, 0.035, s);
    p.line(0.64, 0.3, 0.58, 0.14, 0.035, s);
    p.line(0.12, 0.5, 0.24, 0.52, 0.025, s);
    p.line(0.88, 0.5, 0.76, 0.52, 0.025, s);
  }
  const muzzle = spec.pattern === 'tuxedo' || spec.pattern === 'bicolor' || spec.pattern === 'calico' ? cc.tertiary : mixHex(fur, 0xffffff, 0.35);
  p.ellipse(0.42, 0.72, 0.12, 0.1, rgba(muzzle, 235));
  p.ellipse(0.58, 0.72, 0.12, 0.1, rgba(muzzle, 235));
  // cheeks
  // small, solid blush dots (a big faint oval read as a smudge beside the muzzle at preview size)
  p.ellipse(0.19, 0.66, 0.045, 0.03, rgba(0xff8fa8, 170));
  p.ellipse(0.81, 0.66, 0.045, 0.03, rgba(0xff8fa8, 170));
  const furLum = 0.299 * ((fur >> 16) & 255) + 0.587 * ((fur >> 8) & 255) + 0.114 * (fur & 255);
  const ink = rgba(0x2a1f2b);
  // closed eyes on a dark coat are drawn light so the slow blink still reads
  const lidInk = furLum < 80 ? rgba(0xf3e6dc) : ink;
  for (const side of [-1, 1]) {
    const eu = 0.5 + side * 0.19;
    const ev = 0.47;
    if (lid === 'closed') {
      // happy closed eye: a little upside-down arc
      const pts = 7;
      for (let i = 0; i < pts; i++) {
        const a0 = Math.PI * (i / pts);
        const a1 = Math.PI * ((i + 1) / pts);
        p.line(eu - Math.cos(a0) * 0.085, ev + Math.sin(a0) * 0.04, eu - Math.cos(a1) * 0.085, ev + Math.sin(a1) * 0.04, 0.03, lidInk);
      }
    } else {
      p.ellipse(eu, ev, 0.11, 0.13, ink);
      p.ellipse(eu, ev, 0.095, 0.115, rgba(cc.eye));
      p.ellipse(eu, ev + 0.01, 0.035, 0.095, ink);
      p.ellipse(eu + 0.035, ev - 0.045, 0.028, 0.03, rgba(0xffffff));
      p.ellipse(eu - 0.03, ev + 0.05, 0.013, 0.013, rgba(0xffffff, 200));
      if (lid === 'half') {
        // smug: the upper lid (fur colour) covers the top half of the eye, a lid line, a tiny lifted brow
        p.ellipse(eu, ev - 0.075, 0.125, 0.105, rgba(fur));
        p.line(eu - 0.105, ev - 0.005, eu + 0.105, ev - 0.02 + side * 0.012, 0.03, lidInk);
        p.line(eu - 0.07, ev - 0.17 - side * 0.01, eu + 0.07, ev - 0.15 + side * 0.012, 0.016, rgba(mixHex(fur, 0x2a1f2b, 0.5), 200));
      }
    }
  }
  // nose and "w" mouth
  p.ellipse(0.5, 0.64, 0.045, 0.03, rgba(cc.nose));
  p.line(0.5, 0.66, 0.5, 0.7, 0.018, ink);
  p.line(0.5, 0.7, 0.45, 0.74, 0.018, ink);
  p.line(0.5, 0.7, 0.55, 0.74, 0.018, ink);
  // whiskers
  // whiskers: at least 1.5 texels wide and nearly opaque, so magnification does not smear them into a haze
  const wh = rgba(0xffffff, 225);
  p.line(0.3, 0.7, 0.04, 0.66, 0.012, wh);
  p.line(0.3, 0.74, 0.05, 0.76, 0.012, wh);
  p.line(0.7, 0.7, 0.96, 0.66, 0.012, wh);
  p.line(0.7, 0.74, 0.95, 0.76, 0.012, wh);
  return p.data;
}

export function faceTexture(spec: CatSpec, closed: boolean | Lid): DataTexture {
  const t = new DataTexture(paintFace(spec, closed), N, N, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Texture from the player's crop. ImageBitmaps are copied to a canvas so flipY behaves everywhere. */
export function decalTexture(src: HTMLCanvasElement | ImageBitmap): Texture | null {
  try {
    let canvas: HTMLCanvasElement;
    if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) canvas = src;
    else {
      if (typeof document === 'undefined') return null;
      canvas = document.createElement('canvas');
      canvas.width = src.width || 256;
      canvas.height = src.height || 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  } catch {
    return null;
  }
}

export interface FaceMaterial extends MeshLambertMaterial {
  userData: { open: Texture; closed: Texture; half: Texture | null; spec: CatSpec; decal: Texture | null; isClosed: boolean; lid: Lid };
}

export function createFaceMaterial(spec: CatSpec, decal?: Texture | null): FaceMaterial {
  const open = faceTexture(spec, false);
  const closed = faceTexture(spec, true);
  const m = new MeshLambertMaterial({
    map: decal ?? open,
    transparent: true,
    alphaTest: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }) as FaceMaterial;
  m.userData = { open, closed, half: null, spec, decal: decal ?? null, isClosed: false, lid: 'open' };
  return m;
}

/** Blink: swaps to the closed-eye face (procedural faces only; a photo face keeps its eyes). */
export function setFaceClosed(m: FaceMaterial, closed: boolean): void {
  setFaceLid(m, closed ? 'closed' : 'open');
}

/** Lid state of the procedural face (the half lid is drawn on first use). A photo face keeps its eyes. */
export function setFaceLid(m: FaceMaterial, lid: Lid): void {
  const u = m.userData;
  if (u.decal || u.lid === lid) return;
  u.lid = lid;
  u.isClosed = lid === 'closed';
  if (lid === 'half' && !u.half) u.half = faceTexture(u.spec, 'half');
  m.map = lid === 'closed' ? u.closed : lid === 'half' ? u.half : u.open;
}

export function setFaceDecal(m: FaceMaterial, decal: Texture | null): void {
  m.userData.decal?.dispose();
  m.userData.decal = decal;
  const u = m.userData;
  m.map = decal ?? (u.lid === 'closed' ? u.closed : u.lid === 'half' && u.half ? u.half : u.open);
  m.needsUpdate = true;
}

export function disposeFaceMaterial(m: FaceMaterial): void {
  m.userData.open.dispose();
  m.userData.closed.dispose();
  m.userData.half?.dispose();
  m.userData.decal?.dispose();
  m.dispose();
}
