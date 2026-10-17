/** `knockback` (POC.md §4.4): pushed `dist` straight away from (fromX, fromY); hard CC while it travels. */
import { EFFECTS } from '../../data/effects';
import { icos, idiv, isin, isqrt, TRIG_ONE } from '../fixed';
import type { MatchHandle } from '../state';
import { FM } from '../world';
import { clipTravel, startForced } from './dash';
import { ccImmune, interrupt } from './status';

const end = new Int32Array(2);

/** Push `id` away from (fromX, fromY); when they coincide, along `fallbackAngle`. */
export function knockback(m: MatchHandle, id: number, fromX: number, fromY: number, dist: number, fallbackAngle: number): void {
  const w = m.world;
  if (dist <= 0 || ccImmune(w, id)) return;
  let dx = w.x[id] - fromX;
  let dy = w.y[id] - fromY;
  let d = isqrt(dx * dx + dy * dy);
  if (d === 0) {
    dx = idiv(icos(fallbackAngle) * dist, TRIG_ONE);
    dy = idiv(isin(fallbackAngle) * dist, TRIG_ONE);
    d = Math.max(1, isqrt(dx * dx + dy * dy));
  }
  interrupt(w, id, true);
  clipTravel(m, id, w.x[id] + idiv(dx * dist, d), w.y[id] + idiv(dy * dist, d), end);
  startForced(w, id, end[0], end[1], EFFECTS.knockbackTicks, FM.Knock);
}
