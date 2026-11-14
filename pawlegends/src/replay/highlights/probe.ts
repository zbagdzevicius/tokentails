/**
 * The highlight probe (HIGHLIGHTS.md §1): the ONLY file of the highlight detector that reads sim internals. It reads
 * the match's world arrays (positions, HP, alive, state) of the hero slots and the towers, read-only, the same way
 * replay/core.ts reads `m.events`. tests/unit/highlights.test.ts pins it against the public `snapshot(m, team)`, so a
 * world layout change fails a test instead of silently breaking the highlights. Never writes to the match.
 */
import { snapshot } from '../../sim/index';
import { benched } from '../../sim/units/boss';
import { Kind, RANGE, UnitState, type World } from '../../sim/world';
import type { Match } from '../../sim/api';
import type { MatchHandle } from '../../sim/state';

export type UnitKind = 'hero' | 'minion' | 'tower' | 'core' | 'camp' | 'pudding' | 'boss' | 'other';

export interface HeroSample {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** 'napping' while it naps (the funny "nap interrupted"), else the coarse state. */
  napping: boolean;
  /** A mode benched this slot (Duel, Boss Weekend): it is not in the match. */
  benched: boolean;
}

export interface TowerSample {
  id: number;
  team: number;
  x: number;
  y: number;
  alive: boolean;
}

export interface ProbeSample {
  heroes: HeroSample[];
  towers: TowerSample[];
  /** Once a second: per hero slot, the player's team (team 0) can see it (the replay draws team 0's fog). */
  seen?: boolean[];
}

const worldOf = (m: Match): World => (m as MatchHandle).world;

/** Hero slots and towers now. `withSeen`: also the team-0 visibility of each hero (one public snapshot). */
export function probe(m: Match, slots: number, withSeen: boolean): ProbeSample {
  const w = worldOf(m);
  const heroes: HeroSample[] = [];
  for (let id = 0; id < slots; id++) {
    const alive = w.alive[id] === 1;
    heroes.push({ x: w.x[id], y: w.y[id], hp: w.hp[id], maxHp: w.maxHp[id], alive, napping: alive && w.state[id] === UnitState.Napping, benched: benched(w, id) });
  }
  const towers: TowerSample[] = [];
  for (let id = RANGE.towers; id < RANGE.cores; id++) if (w.kind[id] === Kind.Tower) towers.push({ id, team: w.team[id], x: w.x[id], y: w.y[id], alive: w.alive[id] === 1 });
  const out: ProbeSample = { heroes, towers };
  if (withSeen) {
    const vis = new Set(snapshot(m, 0).entities.map((e) => e.id));
    out.seen = heroes.map((_, id) => vis.has(id));
  }
  return out;
}

/** What kind of unit an id is (a killer, a hit's target). */
export function kindOf(m: Match): (id: number) => UnitKind {
  const w = worldOf(m);
  return (id: number): UnitKind => {
    if (id < 0 || id >= RANGE.end) return 'other';
    const k = w.kind[id];
    if (k === Kind.Hero) return 'hero';
    if (k === Kind.Minion) return 'minion';
    if (k === Kind.Tower) return 'tower';
    if (k === Kind.Core) return 'core';
    // Captain Grizzlechop is a camp monster that snapshots as 'boss'
    if (k === Kind.Camp) return w.sub[id] === 4 ? 'boss' : 'camp';
    if (k === Kind.Pudding) return 'pudding';
    return 'other';
  };
}
