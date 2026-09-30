import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { analyseRect, detectFrames, extrudeRect, meshGrid, type ExtrudeOptions, type PixelSource } from '../extrude';

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

  // Golden hashes of every frame of two real sheets under four option sets, taken with the original
  // (array-based) mesher before the typed-array rewrite and before the lossless palette-PNG pass
  // over public/assets. Any change to vertex order, positions, normals, colours or indices fails.
  it('produces byte-identical geometry to the reference mesher', async () => {
    const rim = { color: 0x9966cc, amount: 0.55, maxLuma: 0.2 };
    const presets: ExtrudeOptions[] = [
      { baseDepth: 2, maxExtra: 3, rim },
      { baseDepth: 3, maxExtra: 0, rim },
      {},
      { baseDepth: 1, maxExtra: 2, linear: false, shade: { top: 1.4, side: 0.5 } },
    ];
    const golden: Record<string, string> = {
      'cats/bob.png': 'b7cb7e5f2ab359593156c92b7241df3d32f09581',
      'dogs/black.png': '34f37eb97a83bad8f2f28e56f3c61c58d368a47b',
    };
    for (const [rel, want] of Object.entries(golden)) {
      const px = await loadPng(rel);
      const counts = detectFrames(px, 48);
      const hash = createHash('sha1');
      for (const opts of presets)
        for (let r = 0; r < counts.length; r++)
          for (let f = 0; f < counts[r]; f++) {
            const d = meshGrid(analyseRect(px, { x: f * 48, y: r * 48, w: 48, h: 48 }, opts), { ...opts, anchorX: 24, anchorY: 40 });
            for (const a of [d.positions, d.normals, d.colors, d.indices]) hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
            hash.update(JSON.stringify([d.min, d.max, d.voxels, d.triangles, d.indices.constructor.name]));
          }
      expect(hash.digest('hex'), rel).toBe(want);
    }
  });

  it('switches to 32-bit indices past 65535 vertices and stays consistent', () => {
    // A 128x128 checkerboard of two colours: nothing merges, so the mesh is huge.
    const n = 128;
    const data = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) data.set((i + ((i / n) | 0)) & 1 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    const d = extrudeRect({ width: n, height: n, data }, { x: 0, y: 0, w: n, h: n });
    expect(d.indices).toBeInstanceOf(Uint32Array);
    expect(d.positions.length / 3).toBeGreaterThan(65535);
    expect(d.triangles * 3).toBe(d.indices.length);
    expect(d.normals.length).toBe(d.positions.length);
    expect(d.colors.length).toBe(d.positions.length);
    let maxIndex = 0;
    for (const i of d.indices) if (i > maxIndex) maxIndex = i;
    expect(maxIndex).toBe(d.positions.length / 3 - 1);
  });
});
