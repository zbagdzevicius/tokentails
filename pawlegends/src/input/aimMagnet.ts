/**
 * Aim magnet (TARGETING.md §6, Wild Rift's "generous auto aim" on a drag-aimed skillshot): a dragged skillshot or
 * ground cast that ends close to an enemy hero is pulled onto it, so a skill aimed at a carry in a clump lands
 * without pixel-exact aim. Small on purpose (Riot refused a champions-only snap as "too close to being automated"):
 * - a direction (line, cone, dash that is not an escape) turns toward the enemy hero within MAGNET.arc of it, or
 *   whose centre is within MAGNET.sideMm of the aim line, and in reach (range + MAGNET.reachMm); the hero nearest the
 *   line wins;
 * - a ground point moves onto the enemy hero within MAGNET.pointMm of it (the cast's own radius sets a floor) and
 *   within the cast range.
 * Never for blinks, escapes or flashes (the player chose where to go), ally casts or casts with no smart target.
 * Pure and client only: it changes the point a Cast command carries, nothing in the sim. Floats are fine here.
 */
import type { AimSpec } from './abilities';
import { isEnemy, type Unit } from './targeting';

export const MAGNET = Object.freeze({
  /** A direction within this angle (rad) of an enemy hero snaps to it. */
  arc: (10 * Math.PI) / 180,
  /** Or the hero's centre is within this far (mm) of the aim line. */
  sideMm: 1000,
  /** Heroes this far (mm) past the cast range still count (a skillshot reaches their body). */
  reachMm: 600,
  /** A ground point within this far (mm) of an enemy hero lands on it. */
  pointMm: 1000,
});

/** Does `aim` take the magnet at all? */
export function magnetFor(aim: AimSpec): boolean {
  if (aim.kind !== 'dir' && aim.kind !== 'point') return false;
  if (aim.blink || aim.heading || aim.flash || aim.away) return false;
  return aim.smart === 'hero' || aim.smart === 'any';
}

const foes = (units: readonly Unit[], myTeam: number): Unit[] => units.filter((u) => u.kind === 'hero' && u.state !== 'dead' && isEnemy(u, myTeam));

/**
 * The aim point (mm) after the magnet, or `pt` unchanged. `pt` is where the drag aims from `me` (for a direction, any
 * point along it: only the angle and its length are kept).
 */
export function aimMagnet(aim: AimSpec, me: { x: number; y: number }, pt: { x: number; y: number }, units: readonly Unit[], myTeam: number): { x: number; y: number } {
  if (!magnetFor(aim)) return pt;
  const dx = pt.x - me.x;
  const dy = pt.y - me.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return pt;
  if (aim.kind === 'point') {
    const r = Math.max(MAGNET.pointMm, (aim.radius ?? 0) * 0.5);
    let best: Unit | null = null;
    let bd = r;
    for (const u of foes(units, myTeam)) {
      const d = Math.hypot(u.x - pt.x, u.y - pt.y);
      if (d <= bd && Math.hypot(u.x - me.x, u.y - me.y) <= aim.range) {
        bd = d;
        best = u;
      }
    }
    return best ? { x: best.x, y: best.y } : pt;
  }
  const ux = dx / len;
  const uy = dy / len;
  let best: Unit | null = null;
  let bs = Infinity;
  for (const u of foes(units, myTeam)) {
    const ox = u.x - me.x;
    const oy = u.y - me.y;
    const d = Math.hypot(ox, oy);
    if (d < 1 || d > aim.range + MAGNET.reachMm) continue;
    const along = ox * ux + oy * uy;
    if (along <= 0) continue;
    const side = Math.abs(ox * uy - oy * ux);
    const gap = Math.acos(Math.max(-1, Math.min(1, along / d)));
    if (gap > MAGNET.arc && side > MAGNET.sideMm) continue;
    if (side < bs) {
      bs = side;
      best = u;
    }
  }
  if (!best) return pt;
  const a = Math.atan2(best.y - me.y, best.x - me.x);
  return { x: me.x + Math.cos(a) * len, y: me.y + Math.sin(a) * len };
}
