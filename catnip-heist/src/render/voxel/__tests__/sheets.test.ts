import { describe, expect, it } from 'vitest';
import { CAT_ROWS, FRAME_PX } from '../../../types';
import { assetUrl, detectRows } from '../sheets';

/** A synthetic client sheet: 15 x 10 frames of 48 px, `frames[r]` filled frames per row. */
function sheet(frames: number[]) {
  const width = 15 * FRAME_PX, height = frames.length * FRAME_PX;
  const data = new Uint8ClampedArray(width * height * 4);
  frames.forEach((n, r) => {
    for (let c = 0; c < n; c++)
      for (let y = 20; y < 40; y++)
        for (let x = 14; x < 34; x++) data[((r * FRAME_PX + y) * width + c * FRAME_PX + x) * 4 + 3] = 255;
  });
  return { width, height, data };
}

describe('sheet rows for client cats', () => {
  it('detects frames per row and names the rows in CAT_ROWS order', () => {
    const counts = [7, 4, 15, 7, 12, 7, 9, 4, 5, 8];
    const rows = detectRows(sheet(counts), FRAME_PX, CAT_ROWS);
    expect(rows.map((r) => r.name)).toEqual([...CAT_ROWS]);
    expect(rows.map((r) => r.frames)).toEqual(counts);
    expect(rows[4].bounds).toEqual({ minX: 14, minY: 20, maxX: 33, maxY: 39 });
  });

  it('falls back to ROWn names without a name list', () => {
    expect(detectRows(sheet([2, 3]), FRAME_PX).map((r) => r.name)).toEqual(['ROW0', 'ROW1']);
  });
});

describe('assetUrl', () => {
  it('prefixes manifest paths with the base', () => {
    expect(assetUrl('cats/bob.png', '/heist-game/assets/')).toBe('/heist-game/assets/cats/bob.png');
  });

  it('passes absolute, root-relative, data and blob URLs through', () => {
    for (const url of ['https://cdn.example.com/SABLE/base.png', '/cats/a.png', 'data:image/png;base64,AA', 'blob:https://x/1'])
      expect(assetUrl(url, '/heist-game/assets/')).toBe(url);
  });
});
