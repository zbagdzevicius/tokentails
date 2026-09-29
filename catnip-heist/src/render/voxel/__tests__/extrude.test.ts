import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { analyseRect, detectFrames, extrudeRect, type PixelSource } from '../extrude';

function grid(rows: string[], rgb = [200, 100, 50]): PixelSource {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rows[y][x] !== '.') {
        const o = (y * w + x) * 4;
        data.set([rgb[0], rgb[1], rgb[2], 255], o);
      }
  return { width: w, height: h, data };
}

async function loadPng(rel: string): Promise<PixelSource> {
  const file = join(__dirname, '../../../../public/assets', rel);
  const { data, info } = await sharp(readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

describe('voxel extrusion', () => {
  it('turns a single pixel into a closed box (12 triangles)', () => {
    const d = extrudeRect(grid(['X']), { x: 0, y: 0, w: 1, h: 1 });
    expect(d.voxels).toBe(1);
    expect(d.triangles).toBe(12);
    expect(d.max[2] - d.min[2]).toBe(3); // edge pixel depth = 2 + 1
  });

  it('merges same-colour faces and culls shared walls', () => {
    const d = extrudeRect(grid(['XX']), { x: 0, y: 0, w: 2, h: 1 });
    expect(d.triangles).toBe(12);
  });

  it('rounds interior pixels deeper than edges', () => {
    const g = analyseRect(grid(['XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX']), { x: 0, y: 0, w: 7, h: 7 });
    expect(g.depth[0]).toBe(3);
    expect(g.depth[1 * 7 + 1]).toBe(4);
    expect(g.depth[3 * 7 + 3]).toBe(5);
  });

  it('flips image rows so the sprite stands up and is centred on z = 0', () => {
    const d = extrudeRect(grid(['X.', 'XX']), { x: 0, y: 0, w: 2, h: 2 }, { anchorX: 0, anchorY: 2 });
    expect(d.min[1]).toBe(0);
    expect(d.max[1]).toBe(2);
    expect(d.min[2]).toBe(-d.max[2]);
  });

  it('keeps real cat frames within a triangle budget', async () => {
    const px = await loadPng('cats/bob.png');
    const counts = detectFrames(px, 48);
    expect(counts).toEqual([7, 4, 15, 7, 12, 7, 9, 4, 5, 8]);
    let max = 0;
    for (let r = 0; r < counts.length; r++)
      for (let f = 0; f < counts[r]; f++) max = Math.max(max, extrudeRect(px, { x: f * 48, y: r * 48, w: 48, h: 48 }).triangles);
    expect(max).toBeLessThan(2500);
  });
});
