/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §2.2): the Mega Yarn Balls. Each ball lies at its home spot from
 * FUN_BY_MAP[map].yarn.first. A hero with a move or attack-move order whose centre comes within YARN.kickReach kicks it
 * away from itself (heroes in `heroAt` order, so neither team always wins a same-tick kick): the ball rolls as a fun shot
 * (combat/funshot.ts) and rests where it stops for YARN.rest ticks. After YARN.kicks kicks it unravels and comes back
 * home YARN.respawn ticks later. State lives in `globals` (G.Yarn rows), so it is hashed.
 *
 * Sim v25 (founder report 2026-11-12: "hard to navigate through them"): a kick is a walk into the ball. The hero's body
 * touches the drawn ball (centre within YARN.kickReach = 1.35 m; v21–v24 1.6 m), it heads within 45° of the ball and
 * its goal is within YARN.near of it (a touch stick's look-ahead, a tap on the ball, a bot walking to it). The ball rolls
 * along the walk (goal − hero), not centre to centre, so a stick aims it; a hero brushing past or walking through to a
 * far goal leaves it resting.
 */
import { FUN_BY_MAP, YARN, YARN_BALLS } from '../../data/fun';
import { PROJECTILE_KIND } from '../../data/towers';
import { dist2, iatan2, withinCos } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, Order, RANGE, YARN_ROW, YARN_STATE, YF, heroAt, type World } from '../world';
import { PFLAG, fireSkillshot } from '../effects/projectile';
import { disabled } from '../effects/status';

/** Index in `globals` of field `f` of ball `b`. */
export const yarnAt = (b: number, f: number): number => G.Yarn + b * YARN_ROW + f;

/** Balls on the map of `w`. */
export const yarnCount = (w: World): number => Math.min(YARN_BALLS, FUN_BY_MAP[w.map].yarn.homes.length);

/** Match start: every ball is due at its home at `first`. */
export function initYarn(w: World): void {
  const y = FUN_BY_MAP[w.map].yarn;
  for (let b = 0; b < yarnCount(w); b++) {
    w.globals[yarnAt(b, YF.State)] = YARN_STATE.Away;
    w.globals[yarnAt(b, YF.X)] = y.homes[b][0];
    w.globals[yarnAt(b, YF.Y)] = y.homes[b][1];
    w.globals[yarnAt(b, YF.T)] = y.first;
    w.globals[yarnAt(b, YF.P)] = -1;
  }
}

/** Can hero `id` kick a ball now (walking, attack-moving or kiting (sim v23), free to act, not winding the cannon up)? */
function kicker(w: World, id: number): boolean {
  if (w.kind[id] !== Kind.Hero || w.alive[id] === 0 || w.hp[id] <= 0) return false;
  const o = w.order[id];
  if (o !== Order.Move && o !== Order.AttackMove && o !== Order.Kite) return false;
  if (w.fmKind[id] !== FM.None || disabled(w, id) || w.napT[id] > 0) return false;
  return !(w.globals[G.CannonBy] === id && w.globals[G.CannonWind] > 0);
}

/** Sim v25: does hero `id`'s walk go into the ball at (x, y): a goal within YARN.near of it, heading within 45° of it? */
function into(w: World, id: number, x: number, y: number): boolean {
  if (dist2(w.moveX[id], w.moveY[id], x, y) > YARN.near * YARN.near) return false;
  // On the ball's very centre any walk counts (the kick then goes along it).
  if (x === w.x[id] && y === w.y[id]) return w.moveX[id] !== x || w.moveY[id] !== y;
  return withinCos(w.moveX[id] - w.x[id], w.moveY[id] - w.y[id], x - w.x[id], y - w.y[id], YARN.coneBp);
}

function kick(m: MatchHandle, b: number, id: number): void {
  const w = m.world;
  const x = w.globals[yarnAt(b, YF.X)];
  const y = w.globals[yarnAt(b, YF.Y)];
  // Sim v25: along the kicker's walk (`into` made sure it is under 45° off the ball and not zero).
  const angle = iatan2(w.moveY[id] - w.y[id], w.moveX[id] - w.x[id]);
  const p = fireSkillshot(w, id, { kind: PROJECTILE_KIND.yarn, angle, speed: YARN.speed, range: YARN.range, radius: YARN.radius, dmg: 0, flags: PFLAG.Pierce });
  if (p < 0) return;
  w.pX[p] = x;
  w.pY[p] = y;
  w.pEffA[p] = b;
  w.pEffB[p] = 0;
  w.globals[yarnAt(b, YF.State)] = YARN_STATE.Rolling;
  w.globals[yarnAt(b, YF.P)] = p;
  w.globals[yarnAt(b, YF.Kicks)]++;
  m.events.push({ type: 'yarnKick', tick: w.globals[G.Tick], id, ball: b });
}

/** Step 4 (after movement): balls come home, rests run down, heroes walking into a resting ball kick it. */
export function stepYarn(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const reach = YARN.kickReach * YARN.kickReach;
  for (let b = 0; b < yarnCount(w); b++) {
    const state = w.globals[yarnAt(b, YF.State)];
    if (state === YARN_STATE.Away) {
      if (tick < w.globals[yarnAt(b, YF.T)]) continue;
      const home = FUN_BY_MAP[w.map].yarn.homes[b];
      w.globals[yarnAt(b, YF.State)] = YARN_STATE.Rest;
      w.globals[yarnAt(b, YF.X)] = home[0];
      w.globals[yarnAt(b, YF.Y)] = home[1];
      w.globals[yarnAt(b, YF.Kicks)] = 0;
      w.globals[yarnAt(b, YF.T)] = 0;
      continue;
    }
    if (state !== YARN_STATE.Rest) continue;
    if (w.globals[yarnAt(b, YF.T)] > 0) {
      w.globals[yarnAt(b, YF.T)]--;
      continue;
    }
    const x = w.globals[yarnAt(b, YF.X)];
    const y = w.globals[yarnAt(b, YF.Y)];
    for (let k = RANGE.heroes; k < RANGE.minions; k++) {
      const id = heroAt(w, k);
      if (!kicker(w, id) || dist2(w.x[id], w.y[id], x, y) > reach || !into(w, id, x, y)) continue;
      kick(m, b, id);
      break;
    }
  }
}

/** A rolling ball `b` stopped at (x, y): it rests there, or unravels after its last kick. */
export function yarnRest(m: MatchHandle, b: number, x: number, y: number): void {
  const w = m.world;
  if (b < 0 || b >= yarnCount(w)) return;
  w.globals[yarnAt(b, YF.P)] = -1;
  if (w.globals[yarnAt(b, YF.Kicks)] >= YARN.kicks) {
    const home = FUN_BY_MAP[w.map].yarn.homes[b];
    w.globals[yarnAt(b, YF.State)] = YARN_STATE.Away;
    w.globals[yarnAt(b, YF.T)] = w.globals[G.Tick] + YARN.respawn;
    w.globals[yarnAt(b, YF.X)] = home[0];
    w.globals[yarnAt(b, YF.Y)] = home[1];
    m.events.push({ type: 'yarnUnravel', tick: w.globals[G.Tick], ball: b, x, y });
    return;
  }
  w.globals[yarnAt(b, YF.State)] = YARN_STATE.Rest;
  w.globals[yarnAt(b, YF.X)] = x;
  w.globals[yarnAt(b, YF.Y)] = y;
  w.globals[yarnAt(b, YF.T)] = YARN.rest;
}
