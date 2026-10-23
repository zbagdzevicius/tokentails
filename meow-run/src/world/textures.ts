// Procedural canvas textures (WORLD-ART): dirt footpath, rock face, grass detail, far mountain backdrop.
// Built once per theme and cached (browser only).
import * as THREE from 'three';
import { hash1, seeded } from './noise';
import type { Palette } from './palette';

const css = (hex: number, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
function mixHex(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

/** draw fn at (x, y) and its vertical (and optionally horizontal) wrap copies so the texture tiles */
function wrapDraw(w: number, h: number, x: number, y: number, r: number, fn: (x: number, y: number) => void, horiz = false): void {
  fn(x, y);
  if (y - r < 0) fn(x, y + h);
  if (y + r > h) fn(x, y - h);
  if (horiz) {
    if (x - r < 0) fn(x + w, y);
    if (x + r > w) fn(x - w, y);
  }
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Footpath across u (0 = left edge, 1 = right edge), along v (tiles). Wavy transparent edges (alphaTest),
 * a worn lighter centre, darker shoulders, pebbles and a few cracks.
 */
export function dirtTexture(p: Palette, rock = false): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const [c, g] = canvas(W, H);
  const rnd = seeded(rock ? 77 : 11);
  const base = rock ? mixHex(p.rockB, 0xb8aa96, 0.35) : p.dirt;
  const dark = rock ? mixHex(p.rockDark, 0x8a8070, 0.3) : p.dirtDark;
  const light = rock ? mixHex(p.rockC, 0xe8dcc6, 0.3) : p.dirtLight;
  // across gradient: darker shoulders, worn light centre
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, css(dark));
  grad.addColorStop(0.16, css(base));
  grad.addColorStop(0.5, css(mixHex(base, light, 0.45)));
  grad.addColorStop(0.84, css(base));
  grad.addColorStop(1, css(dark));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // soft blotches
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 8 + rnd() * 26;
    const col = rnd() < 0.5 ? dark : light;
    wrapDraw(W, H, x, y, r, (xx, yy) => {
      g.fillStyle = css(col, 0.12 + rnd() * 0.12);
      g.beginPath();
      g.ellipse(xx, yy, r * 0.8, r * 1.6, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  if (rock) {
    // sandstone strata running along the wall (bands across u), then claw scratches
    let u = 0;
    const bands = [p.rockA, p.rockC, p.rockB, p.rockA, p.rockC, p.rockDark, p.rockA, p.rockC];
    let bi = 0;
    while (u < W) {
      const bw = 10 + rnd() * 34;
      g.fillStyle = css(mixHex(bands[bi++ % bands.length], 0xc8b8a0, 0.15), 0.85);
      g.fillRect(u, 0, bw, H);
      g.fillStyle = css(p.rockDark, 0.35);
      g.fillRect(u + bw - 2, 0, 2, H);
      u += bw;
    }
    for (let i = 0; i < 6; i++) {
      const x = 40 + rnd() * (W - 80);
      const y = rnd() * H;
      for (let k = 0; k < 3; k++)
        wrapDraw(W, H, x, y, 50, (xx, yy) => {
          g.strokeStyle = css(0xfff4e0, 0.4);
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(xx + k * 8, yy);
          g.lineTo(xx + k * 8 + 3, yy + 44);
          g.stroke();
          g.strokeStyle = css(p.rockDark, 0.5);
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(xx + k * 8 + 2, yy + 2);
          g.lineTo(xx + k * 8 + 5, yy + 46);
          g.stroke();
        });
    }
  } else {
    // two faint worn tracks
    for (const tx of [0.36, 0.64]) {
      g.fillStyle = css(light, 0.18);
      g.fillRect(tx * W - 10, 0, 20, H);
    }
  }
  // pebbles
  for (let i = 0; i < (rock ? 40 : 110); i++) {
    const x = 18 + rnd() * (W - 36);
    const y = rnd() * H;
    const r = 1.5 + rnd() * (rnd() < 0.15 ? 6 : 3);
    wrapDraw(W, H, x, y, r + 2, (xx, yy) => {
      g.fillStyle = css(dark, 0.75);
      g.beginPath();
      g.ellipse(xx, yy + 1, r, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css(mixHex(light, 0xffffff, 0.3), 0.85);
      g.beginPath();
      g.ellipse(xx - r * 0.2, yy - r * 0.25, r * 0.7, r * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    });
  }
  // cracks
  g.strokeStyle = css(dark, 0.5);
  g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    let x = 30 + rnd() * (W - 60);
    let y = rnd() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rnd() - 0.5) * 18;
      y += 6 + rnd() * 10;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // wavy alpha edges (periodic in v so it tiles)
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const wl = 0.045 + 0.025 * Math.sin(v * Math.PI * 2 * 3 + 1.3) + 0.018 * Math.sin(v * Math.PI * 2 * 7 + 0.4) + 0.012 * Math.sin(v * Math.PI * 2 * 13);
    const wr = 0.045 + 0.025 * Math.sin(v * Math.PI * 2 * 4 + 2.1) + 0.018 * Math.sin(v * Math.PI * 2 * 9 + 2.9) + 0.012 * Math.sin(v * Math.PI * 2 * 11 + 1);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const e = Math.min(u - wl, 1 - wr - u);
      const a = Math.max(0, Math.min(1, e * 60 + 0.5));
      d[(y * W + x) * 4 + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = finish(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

/** tileable greyscale-ish detail (multiplies vertex colours): grass strokes and mottling */
export function grassDetail(): THREE.CanvasTexture {
  const W = 256;
  const [c, g] = canvas(W, W);
  const rnd = seeded(5);
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W;
    const y = rnd() * W;
    const r = 10 + rnd() * 30;
    const v = rnd() < 0.5 ? 255 : 205;
    wrapDraw(W, W, x, y, r, (xx, yy) => {
      g.fillStyle = `rgba(${v},${v},${v},0.25)`;
      g.beginPath();
      g.arc(xx, yy, r, 0, Math.PI * 2);
      g.fill();
    }, true);
  }
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * W;
    const v = rnd() < 0.55 ? 255 : 190;
    const l = 3 + rnd() * 6;
    const a = (rnd() - 0.5) * 0.9;
    wrapDraw(W, W, x, y, l, (xx, yy) => {
      g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(xx, yy);
      g.lineTo(xx + Math.sin(a) * l, yy - Math.cos(a) * l);
      g.stroke();
    }, true);
  }
  return finish(c);
}

/** horizontal strata + cracks for cliff faces (multiplies vertex colours), tiles in both directions */
export function rockDetail(): THREE.CanvasTexture {
  const W = 256;
  const [c, g] = canvas(W, W);
  const rnd = seeded(9);
  g.fillStyle = '#ececec';
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 18; i++) {
    const y = rnd() * W;
    const v = rnd() < 0.5 ? 255 : 200;
    g.fillStyle = `rgba(${v},${v},${v},0.4)`;
    for (const yy of [y, y - W, y + W]) g.fillRect(0, yy, W, 2 + rnd() * 8);
  }
  g.strokeStyle = 'rgba(175,175,175,0.35)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) {
    let x = rnd() * W;
    let y = rnd() * W;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * 14;
      y += 8 + rnd() * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return finish(c);
}

/**
 * Far mountains around the horizon (wrapped on a cylinder): a hazy far ridge with mesas, a nearer ridge with
 * buttes and rolling hills, and the haze colour below so the base melts into the fog.
 */
export function ridgeTexture(p: Palette): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const horizonY = H * 0.72;
  const ridge = (color: number, base: number, amp: number, seed: number, mesas: number, alpha: number) => {
    g.fillStyle = css(color, alpha);
    g.beginPath();
    g.moveTo(0, H);
    const rnd = seeded(seed);
    // periodic rolling line
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    const tops: { x: number; w: number; h: number }[] = [];
    for (let i = 0; i < mesas; i++) tops.push({ x: rnd() * W, w: 40 + rnd() * 140, h: amp * (0.8 + rnd() * 1.6) });
    for (let x = 0; x <= W; x += 4) {
      const u = (x / W) * Math.PI * 2;
      let y = base - amp * (0.5 + 0.3 * Math.sin(u * 3 + ph[0]) + 0.15 * Math.sin(u * 7 + ph[1]) + 0.08 * Math.sin(u * 17 + ph[2]));
      for (const m of tops) {
        let dx = Math.abs(x - m.x);
        dx = Math.min(dx, W - dx);
        const edge = m.w * 0.5;
        if (dx < edge + 14) {
          const k = dx < edge ? 1 : 1 - (dx - edge) / 14;
          y = Math.min(y, base - m.h * k - (dx < edge ? hash1(Math.floor(x / 12) + seed) * 3 : 0));
        }
      }
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  };
  ridge(p.ridgeFar, horizonY, 60, 3, 9, 0.85);
  ridge(mixHex(p.ridgeNear, p.ridgeFar, 0.3), horizonY + 14, 44, 8, 7, 0.95);
  ridge(p.ridgeNear, horizonY + 30, 26, 15, 5, 1);
  // haze over the bases, into the fog colour
  const hz = g.createLinearGradient(0, horizonY - 80, 0, H);
  hz.addColorStop(0, css(p.fog, 0));
  hz.addColorStop(0.55, css(p.fog, 0.55));
  hz.addColorStop(0.8, css(p.fog, 1));
  hz.addColorStop(1, css(p.fog, 1));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = hz;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = css(p.fog, 1);
  g.fillRect(0, H * 0.93, W, H * 0.07);
  const t = finish(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
