/** `ring` (POC.md §4.4): everything whose footprint touches a disc of radius `r` around (x, y). */
import { dist2 } from '../fixed';

export function inRing(x: number, y: number, r: number, px: number, py: number, pr: number): boolean {
  const reach = r + pr;
  return dist2(x, y, px, py) <= reach * reach;
}
