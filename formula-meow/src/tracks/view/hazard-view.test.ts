import { describe, expect, it } from 'vitest';
import { sheetBlocksSight } from './hazard-view';

describe('laundry sheet camera-ray fade (playtest, iteration 4)', () => {
  // a washing line across a road that runs along +z: the line runs along x through (0, 0)
  const line = (cx: number, cz: number, kx: number, kz: number, sx = 0, half = 3) => sheetBlocksSight(cx, cz, kx, kz, sx, 0, 1, 0, half);
  it('fades only while the sheet is between the camera and the kart', () => {
    // the kart just past the sheet, the chase camera 6 m behind it: blocked
    expect(line(0, -4, 0, 2)).toBe(true);
    // both before the sheet, or both past it: clear
    expect(line(0, -10, 0, -4)).toBe(false);
    expect(line(0, 1, 0, 7)).toBe(false);
    // the sheet slid to the far side of the road: the sight line passes beside it
    expect(line(0, -4, 0, 2, 5, 2)).toBe(false);
    expect(line(-1, -4, 1, 2, 1.5, 2)).toBe(true);
    // parallel to the line: never
    expect(line(-5, 0.0001, 5, 0.0001)).toBe(false);
  });
});
