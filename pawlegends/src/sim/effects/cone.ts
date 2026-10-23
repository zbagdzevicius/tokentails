/**
 * `cone` (POC.md §4.4): a sector of `range` mm and `arc` angle steps (full width) centred on `dir` from (x, y). A
 * footprint counts when its centre is within range + radius and its bearing within half the arc, or when it overlaps
 * the apex.
 */
import { angleDiff, dist2, iatan2 } from '../fixed';

export function inCone(x: number, y: number, dir: number, range: number, arc: number, px: number, py: number, pr: number): boolean {
  const d2 = dist2(x, y, px, py);
  const reach = range + pr;
  if (d2 > reach * reach) return false;
  if (d2 <= pr * pr) return true;
  return Math.abs(angleDiff(dir, iatan2(py - y, px - x))) * 2 <= arc;
}
