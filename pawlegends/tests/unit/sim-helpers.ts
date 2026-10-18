/** Helpers for sim scenario tests: a quiet match (before the first wave) and hand-placed units. */
import type { Difficulty } from '../../src/data/bots';
import { MINIONS, MINION_KINDS, type MinionKind } from '../../src/data/minions';
import { createMatch, fillPicks, type MatchHandle } from '../../src/sim/index';
import { G, Kind, NEVER, RANGE, UnitState, allocMinion } from '../../src/sim/world';

/** Switch the in-sim bots off (scenario tests place and drive every hero themselves). */
export function botsOff(m: MatchHandle): MatchHandle {
  m.world.globals[G.BotsOff] = 1;
  return m;
}

/** A match with idle bots (the M1/M2 scenario baseline); `bots: true` keeps the bots thinking. */
export function quietMatch(seed = 1, bots = false, difficulty: Difficulty = 'easy'): MatchHandle {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty });
  return bots ? m : botsOff(m);
}

/** Place a minion of `team` at (x, y); returns its id. */
export function putMinion(m: MatchHandle, team: 0 | 1, x: number, y: number, kind: MinionKind = 'melee'): number {
  const w = m.world;
  const id = allocMinion(w);
  const d = MINIONS[kind];
  w.kind[id] = Kind.Minion;
  w.team[id] = team;
  w.alive[id] = 1;
  w.sub[id] = MINION_KINDS.indexOf(kind);
  w.x[id] = x;
  w.y[id] = y;
  w.hp[id] = d.hp;
  w.maxHp[id] = d.hp;
  w.armour[id] = d.armour;
  w.state[id] = UnitState.Idle;
  w.target[id] = -1;
  w.lastHitBy[id] = -1;
  w.hurtTick[id] = NEVER;
  w.waypoint[id] = 1;
  return id;
}

/** Move hero `slot` to (x, y). */
export function putHero(m: MatchHandle, slot: number, x: number, y: number): number {
  m.world.x[slot] = x;
  m.world.y[slot] = y;
  m.world.moveX[slot] = x;
  m.world.moveY[slot] = y;
  return slot;
}

/** Tower ids: team × 4 + k, k in TOWER_SPOTS order (0 Sunny outer, 1 Sunny inner, 2 Puddle outer, 3 Puddle inner). */
export const towerId = (team: 0 | 1, k: number): number => RANGE.towers + team * 4 + k;
export const coreId = (team: 0 | 1): number => RANGE.cores + team;
