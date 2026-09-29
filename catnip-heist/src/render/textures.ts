/**
 * Procedural 16x16 pixel-art textures (nearest filtering) for floor tiles, brick walls and crates.
 * They are near-white so per-instance colours tint them.
 */
import * as THREE from 'three';

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeTexture(size: number, draw: (ctx: CanvasRenderingContext2D, rnd: () => number) => void, seed = 7): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, lcg(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

const g = (v: number) => `rgb(${v},${v},${v})`;

/** Floor tile: bevelled square with a dark grout line and a few speckles. */
export function floorTexture(): THREE.CanvasTexture {
  return makeTexture(16, (ctx, rnd) => {
    ctx.fillStyle = g(232);
    ctx.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = g(214 + Math.floor(rnd() * 14));
      ctx.fillRect(1 + Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 14), 1, 1);
    }
    ctx.fillStyle = g(255);
    ctx.fillRect(1, 1, 14, 1);
    ctx.fillRect(1, 1, 1, 14);
    ctx.fillStyle = g(200);
    ctx.fillRect(1, 14, 14, 1);
    ctx.fillRect(14, 1, 1, 14);
    ctx.fillStyle = g(150);
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
  }, 11);
}

/** Rug: woven stripes with a border. */
export function rugTexture(): THREE.CanvasTexture {
  return makeTexture(16, (ctx) => {
    for (let y = 0; y < 16; y++) {
      ctx.fillStyle = g(y % 4 < 2 ? 236 : 212);
      ctx.fillRect(0, y, 16, 1);
    }
    for (let x = 0; x < 16; x += 4) {
      ctx.fillStyle = g(255);
      ctx.fillRect(x + 1, 7, 2, 2);
    }
  }, 3);
}

/** Running-bond bricks, 4 rows of 4 px. */
export function brickTexture(): THREE.CanvasTexture {
  return makeTexture(16, (ctx, rnd) => {
    ctx.fillStyle = g(150);
    ctx.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let b = -1; b < 2; b++) {
        const x0 = b * 8 + off;
        const v = 222 + Math.floor(rnd() * 26);
        ctx.fillStyle = g(v);
        ctx.fillRect(x0 + 1, row * 4 + 1, 7, 3);
        ctx.fillStyle = g(Math.min(255, v + 18));
        ctx.fillRect(x0 + 1, row * 4 + 1, 7, 1);
      }
    }
  }, 5);
}

/** Wooden crate: frame, planks and a diagonal brace. */
export function crateTexture(): THREE.CanvasTexture {
  return makeTexture(16, (ctx) => {
    ctx.fillStyle = g(205);
    ctx.fillRect(0, 0, 16, 16);
    for (let y = 2; y < 14; y += 3) {
      ctx.fillStyle = g(180);
      ctx.fillRect(2, y, 12, 1);
    }
    ctx.fillStyle = g(245);
    for (let i = 2; i < 14; i++) ctx.fillRect(i, i, 2, 1);
    ctx.fillStyle = g(250);
    ctx.fillRect(0, 0, 16, 2);
    ctx.fillRect(0, 14, 16, 2);
    ctx.fillRect(0, 0, 2, 16);
    ctx.fillRect(14, 0, 2, 16);
    ctx.fillStyle = g(120);
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillStyle = g(160);
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) ctx.fillRect(x, y, 1, 1);
  }, 9);
}

/** Soft radial glow (white, alpha falloff) for additive light pools and plate glows. */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
