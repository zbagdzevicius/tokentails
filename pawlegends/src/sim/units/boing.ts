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
 * - after BOING.stand ticks in the disc stopped or idle (Order.None, `bedT`, hashed; sim v25 below narrows both).
 * Not launched: a hero brushing the rim (centre outside the disc), one walking past to a far goal that is not toward the
 * landing (a lane walk over a bed beside the lane), and one fighting (Attack) on the cushion. After a launch, a goal
 * no nearer the landing than the bed becomes the landing, so the hero stays there instead of walking back over the bed.
 * v21 to v23 launched only a move whose goal was on the bed or nearer the landing than the bed, within 0.9 m: a touch
 * stick steering onto the bed from the side rarely qualified, and a hero stopped on the cushion never launched.
 *
 * Sim v25 (founder report 2026-11-12: "hard to navigate through them"): v24's 120° cone threw two in five touch walks
 * that only crossed a bed (the stick's look-ahead is always near), and its stand rule threw anyone pausing on one. Now:
 * - a near goal launches only a walk heading within 60° of the throw (onto the bed from behind, toward the landing); the
 *   far-goal rule (desktop clicks) is unchanged;
 * - a walk to a spot on the cushion (a tap on it from any side, a bot walking onto the bed) launches once the hero
 *   arrives and stops there, after BOING.stand ticks (0.5 s), as does a hero stopped on it otherwise;
 * - a walk across the disc to anywhere else, or a fight on it, marks the hero (`bedT` −1): stopping there afterwards does
 *   not launch it.
 * (A goal near the bed's centre cannot launch at once from the side: commands quantise goals and a stick's look-ahead
 * shrinks between sends, so a stick crossing the centre would qualify.)
 */
import { BOING, FUN_BY_MAP } from '../../data/fun';
import { mirrorX, mirrorY } from '../../data/map';
import { TIMELINE } from '../../data/timeline';
import { dist2, iatan2, isqrt, within60 } from '../fixed';
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
 * Sim v25: does hero `id`'s walk use bed `b`? A near goal (within BOING.near) the walk heads to within 60° of the bed's
 * throw (bed → landing), or a far goal at least half the throw's length nearer the landing than the bed, not walked away
 * from the landing.
 */
function steps(w: World, id: number, b: Int32Array): boolean {
  const gx = w.moveX[id];
  const gy = w.moveY[id];
  const d2 = dist2(gx, gy, b[0], b[1]);
  const hx = gx - w.x[id];
  const hy = gy - w.y[id];
  const lx = b[2] - b[0];
  const ly = b[3] - b[1];
  if (d2 <= BOING.near * BOING.near) return within60(hx, hy, lx, ly);
  // A far goal: the throw must bring it at least half the throw's length nearer (a walk across the map that only
  // grazes the bed is not thrown sideways into the jungle).
  const gain = isqrt(d2) - isqrt(dist2(gx, gy, b[2], b[3]));
  if (gain * 2 < isqrt(dist2(b[0], b[1], b[2], b[3]))) return false;
  return hx * lx + hy * ly >= 0;
}

/** Sim v25: is hero `id`'s move goal on bed `b`'s cushion and the hero within BOING.arrive of it? */
function arriving(w: World, id: number, b: Int32Array): boolean {
  const gx = w.moveX[id];
  const gy = w.moveY[id];
  return dist2(gx, gy, b[0], b[1]) <= BOING.reach * BOING.reach && dist2(gx, gy, w.x[id], w.y[id]) <= BOING.arrive * BOING.arrive;
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
    if (walking(o)) {
      if (steps(w, id, bed)) launch(m, id, bed);
      // Sim v25: arriving at a spot on the cushion (a tap on it): it launches once it stops there. Crossing it to
      // anywhere else, a stick's look-ahead or a kite: marked, so a stop on it afterwards does not throw it.
      else w.bedT[id] = o !== Order.Kite && arriving(w, id, bed) ? 0 : -1;
      continue;
    }
    if (o !== Order.None) {
      // Sim v25: fighting (or any other order) on the cushion marks the hero too.
      w.bedT[id] = -1;
      continue;
    }
    // Stopped or idle on the cushion, not marked: a short moment, then up.
    if (w.bedT[id] >= 0 && ++w.bedT[id] >= BOING.stand) launch(m, id, bed);
  }
}
