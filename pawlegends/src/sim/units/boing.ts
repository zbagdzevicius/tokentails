/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §2.1): Boing Beds. Springy cat beds at fixed spots (FUN_BY_MAP[map].beds, team
 * 0's side; team 1 has each one's reflection). Both teams may use every bed. From the gate barrier's drop, a hero whose
 * centre comes within BOING.reach of a bed while it has a move or attack-move order that was sent onto the bed or goes
 * on past it (its goal is nearer the landing than the bed) is launched: a FM.Leap flight of BOING.flight ticks to the
 * landing point, straight in the sim (the arc is render only). Nothing stops it (no CC, no other forced movement), the
 * hero cannot attack or cast, and it can still be hit. Then BOING.cooldown ticks before its next bed (`boingT`, hashed).
 */
import { BOING, FUN_BY_MAP } from '../../data/fun';
import { mirrorX, mirrorY } from '../../data/map';
import { TIMELINE } from '../../data/timeline';
import { dist2, iatan2 } from '../fixed';
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

/** Launch hero `id` off bed `out` (it lands at out[2], out[3]). */
function launch(m: MatchHandle, id: number, b: Int32Array, sent: boolean): void {
  const w = m.world;
  w.fmX[id] = b[2];
  w.fmY[id] = b[3];
  w.fmT[id] = BOING.flight;
  w.fmKind[id] = FM.Leap;
  fmClear(w, id);
  w.windup[id] = 0;
  w.pathLen[id] = 0;
  w.facing[id] = iatan2(b[3] - w.y[id], b[2] - w.x[id]);
  w.boingT[id] = BOING.flight + BOING.cooldown;
  // Sent onto the bed itself: it lands and stays (it would walk back to the bed otherwise).
  if (sent) {
    w.moveX[id] = b[2];
    w.moveY[id] = b[3];
  }
  m.events.push({ type: 'boing', tick: w.globals[G.Tick], id, x: w.x[id], y: w.y[id], tx: b[2], ty: b[3] });
}

/** Step 4 (after movement): cooldowns run down; heroes stepping onto a bed with a goal past it are launched. */
export function stepBoing(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) if (w.boingT[id] > 0) w.boingT[id]--;
  if (w.globals[G.Tick] < TIMELINE.barrierDrop) return;
  const n = bedCount(w);
  const reach = BOING.reach * BOING.reach;
  const aim = BOING.aim * BOING.aim;
  for (let k = RANGE.heroes; k < RANGE.minions; k++) {
    const id = heroAt(w, k);
    if (!free(w, id) || (w.order[id] !== Order.Move && w.order[id] !== Order.AttackMove)) continue;
    for (let i = 0; i < n; i++) {
      bedOf(w, i, bed);
      if (dist2(w.x[id], w.y[id], bed[0], bed[1]) > reach) continue;
      const gx = w.moveX[id];
      const gy = w.moveY[id];
      const sent = dist2(gx, gy, bed[0], bed[1]) <= aim;
      if (!sent && dist2(gx, gy, bed[2], bed[3]) >= dist2(gx, gy, bed[0], bed[1])) continue;
      launch(m, id, bed, sent);
      break;
    }
  }
}
