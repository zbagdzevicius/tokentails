#!/usr/bin/env node
/**
 * PNG app icons drawn in-repo (no downloads, no image libraries): the paw of public/icon.svg rasterised by a tiny
 * 4x4-supersampled shape renderer and written with node:zlib. iOS ignores SVG apple-touch-icons, so the home screen
 * needs these.
 *
 *   node tools/icon-png.mjs            writes public/icons/apple-touch-icon.png (180), icon-192.png, icon-512.png
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#2b1d2e');
const DISC = hex('#3b2840');
const PAW = hex('#ffb3c7');

/** Shapes in the icon's 512 viewBox, painted in order. `full`: no rounded mask (maskable icons need the bleed). */
function shapes() {
  const ell = (cx, cy, rx, ry, deg, color) => ({ kind: 'ellipse', cx, cy, rx, ry, a: (deg * Math.PI) / 180, color });
  return [
    { kind: 'disc', cx: 256, cy: 256, r: 196, color: DISC },
    ell(256, 318, 92, 78, 0, PAW),
    ell(160, 214, 38, 50, -18, PAW),
    ell(226, 168, 38, 52, -6, PAW),
    ell(292, 168, 38, 52, 6, PAW),
    ell(354, 214, 38, 50, 18, PAW),
    // the two "x x" eyes of the paw pad (stroke 10, round caps)
    ...[[206, 300, 228, 322], [228, 300, 206, 322], [284, 300, 306, 322], [306, 300, 284, 322]].map(([x1, y1, x2, y2]) => ({ kind: 'seg', x1, y1, x2, y2, w: 5, color: BG })),
  ];
}

function inside(s, x, y) {
  switch (s.kind) {
    case 'disc':
      return (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r * s.r;
    case 'ellipse': {
      const dx = x - s.cx;
      const dy = y - s.cy;
      const c = Math.cos(-s.a);
      const sn = Math.sin(-s.a);
      const u = dx * c - dy * sn;
      const v = dx * sn + dy * c;
      return (u * u) / (s.rx * s.rx) + (v * v) / (s.ry * s.ry) <= 1;
    }
    case 'seg': {
      const vx = s.x2 - s.x1;
      const vy = s.y2 - s.y1;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / (vx * vx + vy * vy)));
      return (x - (s.x1 + t * vx)) ** 2 + (y - (s.y1 + t * vy)) ** 2 <= s.w * s.w;
    }
    default:
      return false;
  }
}

/** True when (x, y) of the 512 box is inside the rounded square (rx 112). */
function inRounded(x, y, r = 112) {
  const cx = Math.max(r, Math.min(512 - r, x));
  const cy = Math.max(r, Math.min(512 - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

export function renderIcon(size, { rounded = true } = {}) {
  const list = shapes();
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sj = 0; sj < SS; sj++)
        for (let si = 0; si < SS; si++) {
          const x = ((i + (si + 0.5) / SS) / size) * 512;
          const y = ((j + (sj + 0.5) / SS) / size) * 512;
          if (rounded && !inRounded(x, y)) continue;
          let c = BG;
          for (const s of list) if (inside(s, x, y)) c = s.color;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      const n = SS * SS;
      const o = (j * size + i) * 4;
      // premultiplied average, then un-premultiply for straight-alpha PNG
      const al = a / n;
      px[o] = al ? Math.round((r / n) * (255 / al)) : 0;
      px[o + 1] = al ? Math.round((g / n) * (255 / al)) : 0;
      px[o + 2] = al ? Math.round((b / n) * (255 / al)) : 0;
      px[o + 3] = Math.round(al);
    }
  return encodePng(size, size, px);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(ROOT, 'public', 'icons');
  fs.mkdirSync(out, { recursive: true });
  // iOS masks its own corners: the touch icon is full-bleed; the manifest icons keep the rounded square
  fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), renderIcon(180, { rounded: false }));
  fs.writeFileSync(path.join(out, 'icon-192.png'), renderIcon(192));
  fs.writeFileSync(path.join(out, 'icon-512.png'), renderIcon(512));
  console.log(`icons written to ${path.relative(ROOT, out)}`);
}
