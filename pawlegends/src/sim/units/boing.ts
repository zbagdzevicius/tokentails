/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §2.1): Boing Beds. Springy cat beds at fixed spots (FUN_BY_MAP[map].beds, team
 * 0's side; team 1 has each one's reflection). Both teams may use every bed. A launch is a FM.Leap flight of
 * BOING.flight ticks to the landing point, straight in the sim (the arc is render only). Nothing stops it (no CC, no
 * other forced movement), the hero cannot attack or cast, and it can still be hit. Then BOING.cooldown ticks before its
 * next bed (`boingT`, hashed).
 *
 * Sim v24 (V21-FUN.md §2.1 "v24: instant beds"): from the gate barrier's drop, a hero whose centre is inside a bed's
 * disc (BOING.reach, the drawn cushion) launches:
 * - at once with a move, attack-move or kite order that steps onto the bed: its goal within BOING.near of the bed (a tap
 *   on or by the cushion, a touch stick's 2 m look-ahead from anywhere on it) unless it walks away from the landing
 *   (goal more than 120° off the bed's throw), or a far goal the throw brings at least half its length nearer;
 * - after BOING.stand ticks in the disc stopped or idle (Order.None, `bedT`, hashed).
 * Not launched: a hero brushing the rim (centre outside the disc), one walking past to a far goal that is not toward the
 * landing (a lane walk over a bed beside the lane), and one fighting (Attack) on the cushion. After a launch, a goal
 * no nearer the landing than the bed becomes the landing, so the hero stays there instead of walking back over the bed.
 * v21 to v23 launched only a move whose goal was on the bed or nearer the landing than the bed, within 0.9 m: a touch
 * stick steering onto the bed from the side rarely qualified, and a hero stopped on the cushion never launched.
 */
import { BOING, FUN_BY_MAP } from '../../data/fun';
import { mirrorX, mirrorY } from '../../data/map';
import { TIMELINE } from '../../data/timeline';
import { dist2, iatan2, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, Order, RANGE, fmClear, heroAt, type World } from '../world';
import { disabled } from '../effects/status';

/** Beds on the map of `w`, both teams' (team 0's first). */
export const bedCount = (w: World): number => FUN_BY_MAP[w.map].beds.length * 2;

/** Bed `i` (of bedCount): out = [bedX, bedY, landX, landY]. */
export function bedOf(w: World, i: number, out: Int32Array): void {
  const beds = FUN_BY_MAP[w.map].beds;
  const n = beds.length;
  const b = beds[i % n];
  const mirror = i >= n;
  out[0] = mirror ? mirrorX(b[0]) : b[0];
  out[1] = mirror ? mirrorY(b[1]) : b[1];
  out[2] = mirror ? mirrorX(b[2]) : b[2];
  out[3] = mirror ? mirrorY(b[3]) : b[3];
}

const bed = new Int32Array(4);

/** Could hero `id` take a bed now (order aside)? */
function free(w: World, id: number): boolean {
  if (w.kind[id] !== Kind.Hero || w.alive[id] === 0 || w.hp[id] <= 0 || w.boingT[id] > 0) return false;
  if (w.fmKind[id] !== FM.None || disabled(w, id) || w.rootT[id] > 0 || w.napT[id] > 0 || w.castPhase[id] !== 0) return false;
  return !(w.globals[G.CannonBy] === id && w.globals[G.CannonWind] > 0);
}

/** Launch hero `id` off bed `b` (it lands at b[2], b[3]). */
function launch(m: MatchHandle, id: number, b: Int32Array): void {
  const w = m.world;
  // A goal no nearer the landing than the bed (on the cushion, behind it, off along the lane): stay at the landing, so
  // a hero thrown while walking past does not walk straight back over the bed.
  if (dist2(w.moveX[id], w.moveY[id], b[2], b[3]) >= dist2(w.moveX[id], w.moveY[id], b[0], b[1])) {
    w.moveX[id] = b[2];
    w.moveY[id] = b[3];
  }
  w.fmX[id] = b[2];
  w.fmY[id] = b[3];
  w.fmT[id] = BOING.flight;
  w.fmKind[id] = FM.Leap;
  fmClear(w, id);
  w.windup[id] = 0;
  w.pathLen[id] = 0;
  w.facing[id] = iatan2(b[3] - w.y[id], b[2] - w.x[id]);
  w.boingT[id] = BOING.flight + BOING.cooldown;
  w.bedT[id] = 0;
  m.events.push({ type: 'boing', tick: w.globals[G.Tick], id, x: w.x[id], y: w.y[id], tx: b[2], ty: b[3] });
}

/** A walking order: move, attack-move or kite (each walks to moveX, moveY). */
const walking = (o: number): boolean => o === Order.Move || o === Order.AttackMove || o === Order.Kite;

/**
 * Does hero `id`'s walk step onto bed `b`: a goal within BOING.near of the bed and not more than 120° off the bed's
 * throw (bed → landing), or a far goal at least half the throw's length nearer the landing than the bed?
 */
function steps(w: World, id: number, b: Int32Array): boolean {
  const gx = w.moveX[id];
  const gy = w.moveY[id];
  const near = dist2(gx, gy, b[0], b[1]) <= BOING.near * BOING.near;
  // A far goal: the throw must bring it at least half the throw's length nearer (a walk across the map that only
  // grazes the bed is not thrown sideways into the jungle).
  const gain = isqrt(dist2(gx, gy, b[0], b[1])) - isqrt(dist2(gx, gy, b[2], b[3]));
  if (!near && gain * 2 < isqrt(dist2(b[0], b[1], b[2], b[3]))) return false;
  const hx = gx - w.x[id];
  const hy = gy - w.y[id];
  const lx = b[2] - b[0];
  const ly = b[3] - b[1];
  const dot = hx * lx + hy * ly;
  if (dot >= 0) return true;
  // A near goal may be up to 120° off the throw: cos ≥ −1/2 ⇔ 4·dot² ≤ |h|²·|l|² (dot < 0); |h| ≤ near + reach and |l|
  // under 16 m keep both sides below 2^53, so the products are exact.
  if (!near) return false;
  return 4 * dot * dot <= (hx * hx + hy * hy) * (lx * lx + ly * ly);
}

/** Step 4 (after movement): cooldowns run down; a hero in a bed's disc that steps onto it (or stops on it) is launched. */
export function stepBoing(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) if (w.boingT[id] > 0) w.boingT[id]--;
  if (w.globals[G.Tick] < TIMELINE.barrierDrop) return;
  const n = bedCount(w);
  const reach = BOING.reach * BOING.reach;
  for (let k = RANGE.heroes; k < RANGE.minions; k++) {
    const id = heroAt(w, k);
    let on = false;
    if (free(w, id)) {
      for (let i = 0; i < n && !on; i++) {
        bedOf(w, i, bed);
        on = dist2(w.x[id], w.y[id], bed[0], bed[1]) <= reach;
      }
    }
    if (!on) {
      w.bedT[id] = 0;
      continue;
    }
    const o = w.order[id];
    if (o !== Order.None) {
      w.bedT[id] = 0;
      if (walking(o) && steps(w, id, bed)) launch(m, id, bed);
      continue;
    }
    // Stopped or idle on the cushion: a short moment, then up.
    if (++w.bedT[id] >= BOING.stand) launch(m, id, bed);
  }
}
