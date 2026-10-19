// Copied from bad-cat/src/catmaker/body-colour.ts at 4889ed41 (copy, never import; import paths adapted for formula-meow).
/** Fur colour chips and RGB → RGB565 mapping (GDD 6.1 step 3). Pure, Node-testable. */
import { rgb565, rgb888 } from '../../types';

export interface ColourChip {
  id: string;
  label: string;
  rgb: number; // 0xRRGGBB
}

/** Common cat coat colours, warm toon palette. */
export const FUR_CHIPS: readonly ColourChip[] = [
  { id: 'black', label: 'Black', rgb: 0x23201f },
  { id: 'charcoal', label: 'Charcoal', rgb: 0x5b5b66 },
  { id: 'grey', label: 'Grey', rgb: 0x9a9aa2 },
  { id: 'silver', label: 'Silver', rgb: 0xc9c6cc },
  { id: 'white', label: 'White', rgb: 0xf2efe9 },
  { id: 'cream', label: 'Cream', rgb: 0xe8d3a9 },
  { id: 'ginger', label: 'Ginger', rgb: 0xd9823b },
  { id: 'brown', label: 'Brown', rgb: 0x7a5236 },
];

function channels(rgb: number): [number, number, number] {
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}

/** Perceptually weighted squared distance (cheap "redmean"). */
export function colourDistance(a: number, b: number): number {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/** Index of the nearest chip to an RGB888 colour. */
export function nearestChip(rgb: number, chips: readonly ColourChip[] = FUR_CHIPS): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < chips.length; i++) {
    const d = colourDistance(rgb, chips[i].rgb);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** RGB565 value stored in a CatSpec for a chip. */
export function chipToSpec(chip: ColourChip): number {
  return rgb565(chip.rgb);
}

/** Which chip (if any) a CatSpec RGB565 colour corresponds to exactly; -1 = custom (photo) colour. */
export function chipIndexOf565(c565: number, chips: readonly ColourChip[] = FUR_CHIPS): number {
  for (let i = 0; i < chips.length; i++) if (rgb565(chips[i].rgb) === (c565 & 0xffff)) return i;
  return -1;
}

export function luma(rgb: number): number {
  const [r, g, b] = channels(rgb);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function mix(rgb: number, target: number, t: number): number {
  const [r1, g1, b1] = channels(rgb);
  const [r2, g2, b2] = channels(target);
  const m = (a: number, b: number): number => Math.round(a + (b - a) * t) & 0xff;
  return (m(r1, r2) << 16) | (m(g1, g2) << 8) | m(b1, b2);
}

/** Tabby stripe colour derived from the base: darker, or lighter for very dark coats. Returns RGB565. */
export function deriveSecondary(base565: number): number {
  const rgb = rgb888(base565);
  return rgb565(luma(rgb) < 60 ? mix(rgb, 0xffffff, 0.3) : mix(rgb, 0x1a1210, 0.45));
}

export function hex(rgb: number): string {
  return '#' + (rgb & 0xffffff).toString(16).padStart(6, '0');
}
