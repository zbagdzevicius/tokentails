/**
 * `line` (POC.md §4.4): a segment a→b with a half width. `alongLine` returns how far along the segment (as the dot
 * product, 0..|ab|²) the footprint (px, py, pr) is hit, or −1 when it is not.
 */
import { dist2, idiv } from '../fixed';

export function alongLine(ax: number, ay: number, bx: number, by: number, half: number, px: number, py: number, pr: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const reach = half + pr;
  if (l2 === 0) return dist2(ax, ay, px, py) <= reach * reach ? 0 : -1;
  let dot = (px - ax) * dx + (py - ay) * dy;
  if (dot < 0) dot = 0;
  else if (dot > l2) dot = l2;
  const cx = ax + idiv(dx * dot, l2);
  const cy = ay + idiv(dy * dot, l2);
  return dist2(cx, cy, px, py) <= reach * reach ? dot : -1;
}

export const inLine = (ax: number, ay: number, bx: number, by: number, half: number, px: number, py: number, pr: number): boolean =>
  alongLine(ax, ay, bx, by, half, px, py, pr) >= 0;
