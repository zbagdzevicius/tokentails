/**
 * Tiny pixel-art sprites authored as ASCII, turned into voxel geometry with the same extrusion as the
 * cats (key, '!' / '?' marks, active-cat chevron). Keeping them in code means no extra art files and
 * the style stays identical to the extruded sheets.
 */
import type * as THREE from 'three';
import { PALETTE } from '../types';
import type { PixelSource } from './voxel/extrude';
import { voxelizeImage } from './voxel/sheets';

/** Character -> '#rrggbb'. '.' and ' ' are transparent. */
export type PixelPalette = Record<string, string>;

export function asciiToPixels(rows: string[], palette: PixelPalette): PixelSource {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? '.';
      const hex = palette[ch];
      if (!hex) continue;
      const n = parseInt(hex.slice(1), 16);
      const o = (y * w + x) * 4;
      data[o] = (n >> 16) & 255;
      data[o + 1] = (n >> 8) & 255;
      data[o + 2] = n & 255;
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const OUT = PALETTE.outline;

export const KEY_ART = {
  rows: [
    '.oooo.........',
    'olllyo........',
    'oly..yoooooooo',
    'oly..yyyyyyyyo',
    'olyyyyoooyoyoo',
    '.oooo....oo.o.',
  ],
  palette: { o: '#7a4a12', l: '#fff3b0', y: PALETTE.coin } as PixelPalette,
};

export const ALERT_ART = {
  rows: ['.ooo.', 'owrro', 'orrro', 'orrro', 'orrro', '.oro.', '.ooo.', '.....', '.ooo.', 'orrro', '.ooo.'],
  palette: { o: OUT, r: '#ff3b2e', w: '#ffd2c8' } as PixelPalette,
};

export const QUESTION_ART = {
  rows: [
    '.ooooo.',
    'oowyyoo',
    'oyyoyyo',
    'ooooyyo',
    '...oyyo',
    '..oyyo.',
    '..oyoo.',
    '..ooo..',
    '.......',
    '..ooo..',
    '..oyo..',
    '..ooo..',
  ],
  palette: { o: OUT, y: PALETTE.coin, w: PALETTE.cream } as PixelPalette,
};

export const CHEVRON_ART = {
  rows: ['ooooooo', 'olyyyyo', '.oyyyo.', '..oyo..', '...o...'],
  palette: { o: OUT, y: PALETTE.coin, l: PALETTE.cream } as PixelPalette,
};

export const VAULT_ART = {
  // Round dial / keyhole emblem for the vault door.
  rows: ['..oooo..', '.oyyyyo.', 'oyyooyyo', 'oyyooyyo', 'oyyyoyyo', 'oyyooyyo', '.oyyyyo.', '..oooo..'],
  palette: { o: OUT, y: PALETTE.coin } as PixelPalette,
};

export function voxelArt(art: { rows: string[]; palette: PixelPalette }, depth = 1): Promise<THREE.BufferGeometry> {
  const px = asciiToPixels(art.rows, art.palette);
  return voxelizeImage(px, { size: 64, baseDepth: depth, maxExtra: 1 });
}

/** Pad glyph rows by 1 and add a 1-px outline ring (8-neighbour dilation) in 'o'. */
function outlined(rows: string[], fill: string): string[] {
  const w = Math.max(...rows.map((r) => r.length)) + 2;
  const h = rows.length + 2;
  const at = (x: number, y: number) => (rows[y - 1]?.[x - 1] ?? '.') === '#';
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      if (at(x, y)) line += fill;
      else {
        let near = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) near = true;
        line += near ? 'o' : '.';
      }
    }
    out.push(line);
  }
  return out;
}

/** Floating "EXIT" sign over the exit portal (3x5 glyphs). */
export const EXIT_ART = {
  rows: outlined(['###.#.#.###.###', '#...#.#..#...#.', '##...#...#...#.', '#...#.#..#...#.', '###.#.#.###..#.'], 'm'),
  palette: { o: OUT, m: PALETTE.coin } as PixelPalette,
};
