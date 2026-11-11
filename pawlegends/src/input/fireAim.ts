/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §1.5): aiming the Kibble Cannon. Pure (no DOM): the touch FIRE button and the
 * desktop F key both use it.
 *
 * - Quick fire (a tap, the zero-friction rule): at the nearest enemy hero in sight within the shot's range, else
 *   straight ahead along the hero's facing.
 * - Drag aim: the thumb's direction (already turned into sim space by the caller), the full range.
 */
import { BuffFlag } from '../sim/api';
import type { Unit } from './targeting';

/** Does an entity with these buff bits carry the Kibble Cannon? */
export const carriesCannon = (buffs: number | undefined): boolean => ((buffs ?? 0) & BuffFlag.Cannon) !== 0;

/** Where a tap fires from `me` (mm): the nearest living enemy hero within `range`, else `range` ahead along `yaw`. */
export function quickFireAim(units: readonly Unit[], me: { x: number; y: number; team: number }, yaw: number, range: number): { x: number; y: number } {
  let best: Unit | null = null;
  let bd = range * range;
  for (const u of units) {
    if (u.kind !== 'hero' || u.team === me.team || u.team > 1 || u.state === 'dead') continue;
    const d = (u.x - me.x) ** 2 + (u.y - me.y) ** 2;
    if (d <= bd) {
      bd = d;
      best = u;
    }
  }
  if (best) return { x: best.x, y: best.y };
  return { x: me.x + Math.cos(yaw) * range, y: me.y + Math.sin(yaw) * range };
}

/** A drag aim: `range` mm from `me` along the sim-space direction (dx, dy); null for a zero drag. */
export function dragFireAim(me: { x: number; y: number }, dx: number, dy: number, range: number): { x: number; y: number } | null {
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  return { x: me.x + (dx / len) * range, y: me.y + (dy / len) * range };
}
