/**
 * The Heist's night lift for the catnip sprig (plan G8; review 3e #4).
 *
 * The 16 px master (client/art/catnip/catnip-16.txt) is drawn for day-lit 2D screens: under the
 * Heist's purple night lights its deep teal outline and mid greens went grey-teal and the sprig
 * read as an amethyst crystal (lavender spike over dark leaves). This recolours only the green
 * family (leaves, stem, outline) part of the way toward mint, leaving the lavender spike and the
 * shape untouched, so the master and its hash pins stay as they are.
 */
import type { PixelSource } from './voxel/extrude';

/** The mint the leaves move toward (#9fe0b8). */
export const SPRIG_NIGHT_MINT = [0x9f, 0xe0, 0xb8] as const;
/** How far toward the mint (0 keeps the master, 1 is flat mint). */
export const SPRIG_NIGHT_LIFT = 0.65;

/** True for a green-family pixel: green leads both red and blue (the spike's lavenders do not). */
export function isSprigGreen(r: number, g: number, b: number): boolean {
  return g > r && g >= b;
}

/** A recoloured copy of `px`; transparent pixels and non-green pixels are copied as they are. */
export function nightLiftSprig(px: PixelSource, lift = SPRIG_NIGHT_LIFT): PixelSource {
  const data = new Uint8ClampedArray(px.data);
  const [mr, mg, mb] = SPRIG_NIGHT_MINT;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!isSprigGreen(r, g, b)) continue;
    data[i] = Math.round(r + (mr - r) * lift);
    data[i + 1] = Math.round(g + (mg - g) * lift);
    data[i + 2] = Math.round(b + (mb - b) * lift);
  }
  return { width: px.width, height: px.height, data };
}
