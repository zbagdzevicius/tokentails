/**
 * The Paw Match glove pointer (plan G14 "Paw Match hint"): a 32x32 pixel glove authored as a pixel
 * matrix, one character per pixel. The PNG the scene loads, `client/public/match3/pointer/glove.png`,
 * is exported from this matrix and must match it byte for byte:
 *
 *   UPDATE_GLOVE=1 npx jest __test__/match3-glove.test.ts   # writes the PNG
 *   npx jest __test__/match3-glove.test.ts                  # fails if the PNG drifted
 *
 * This is the stand-in until the artist's glove lands (the artist brief, plan G14); the artist's
 * file replaces the PNG and this matrix together. The finger points up; the scene rotates it.
 */

/** Public path of the exported PNG (served from the app's origin, not the CDN). */
export const GLOVE_TEXTURE_URL = "/match3/pointer/glove.png";
export const GLOVE_TEXTURE_KEY = "match3-glove";

/** RGBA per matrix character. `.` is transparent. */
export const GLOVE_PALETTE: Readonly<Record<string, readonly [number, number, number, number]>> = {
  ".": [0, 0, 0, 0],
  K: [27, 18, 48, 255], // outline, night ink
  W: [255, 247, 230, 255], // glove
  S: [214, 196, 160, 255], // glove shade
  L: [255, 255, 255, 255], // highlight
  C: [249, 210, 125, 255], // cuff, gold 400
  H: [254, 243, 199, 255], // cuff rim
  D: [192, 138, 62, 255], // cuff shade
};

// prettier-ignore
export const GLOVE_MATRIX: ReadonlyArray<string> = [
  "...........KK...................",
  "..........KWSK..................",
  ".........KWWWSK.................",
  "........KWLWWWSK................",
  "........KWLWWWSK................",
  "........KWLWWWSK................",
  "........KWLWWWSK................",
  "........KWLWWWSK................",
  "........KWLWWWSKK...............",
  "........KWLWWWSKSK..K...........",
  "........KWLWWWKWWSKKSK..........",
  "........KWLWWWKWWWKWWSKK........",
  "........KWWWWWKWWWKWWWWSK.......",
  "........KWWWWWKWWWKWWKWWSK......",
  "......KKKWWWWWWWWWKWWKWWWSK.....",
  ".....KWWWWWWWWWWWWWWWKWWWSK.....",
  "....KWWWWWWWWWWWWWWWWKWWWSK.....",
  "...KWWWWWWWWWWWWWWWWWWWWWSK.....",
  "...KWWWWWWWWWWWWWWWWWWWWWSK.....",
  "...KSWWWWKWWWWWWWWWWWWWWWSK.....",
  "....KSWWWWKWWWWWWWWWWWWWWSK.....",
  ".....KSWWWWKWWWWWWWWWWWWWSK.....",
  "......KSWWWWWWWWWWWWWWWWWSK.....",
  ".......KSWWWWWWWWWWWWWWWSK......",
  "........KWHHHHHHHHHHHHHHHK......",
  "........KCCCCCCCCCCCCCCCCDK.....",
  "........KCCCCCCCCCCCCCCCCDK.....",
  "........KCCCCCCCCCCCCCCCCDK.....",
  "........KCCCCCCCCCCCCCCCCDK.....",
  "........KDDDDDDDDDDDDDDDDDK.....",
  ".........KDDDDDDDDDDDDDDDK......",
  "..........KKKKKKKKKKKKKKK.......",
];

/** The matrix as RGBA bytes, row by row (width x height x 4). */
export function glovePixels(matrix: ReadonlyArray<string> = GLOVE_MATRIX): { width: number; height: number; data: Uint8Array } {
  const height = matrix.length;
  const width = matrix[0]?.length ?? 0;
  const data = new Uint8Array(width * height * 4);
  matrix.forEach((row, y) => {
    if (row.length !== width) throw new Error(`glove row ${y} is ${row.length} px wide, expected ${width}`);
    Array.from(row).forEach((char, x) => {
      const rgba = GLOVE_PALETTE[char];
      if (!rgba) throw new Error(`glove pixel ${x},${y} uses unknown colour "${char}"`);
      data.set(rgba, (y * width + x) * 4);
    });
  });
  return { width, height, data };
}
