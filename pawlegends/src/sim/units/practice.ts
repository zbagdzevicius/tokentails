/**
 * Sim v27 (docs/plans/moba/V27.md §2): the Practice ground (the 'practice' mutator, data/practice.ts). The enemy heroes
 * are training dummies: they stand on their spots (or pace, enemy slot 1), never strike or cast, and respawn on their
 * spot. The bots never think, so the player's allies wait at the fountain. Op.Practice controls: reset (dummies back on
 * their spots at full HP, the player's HP, cooldowns and the towers' HP refilled), level up, reset cooldowns.
 */
import { PRACTICE } from '../../data/practice';
import { XP } from '../../data/xp';
import { HUMAN_SLOT, teamOfSlot } from '../api';
import { dist2 } from '../fixed';
import { mutOf } from '../mutator';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, G, Kind, Order, RANGE, UnitState, type World } from '../world';
import { levelUp } from '../progression/levels';

export const isPractice = (w: World): boolean => mutOf(w).practice;

/** Is hero `id` a training dummy (an enemy hero on the Practice ground)? */
export const isDummy = (w: World, id: number): boolean => mutOf(w).practice && w.kind[id] === Kind.Hero && w.team[id] !== teamOfSlot(HUMAN_SLOT);

/** The dummy's spot index (its slot within its team, 0..2), or −1. */
function dummyIndex(w: World, id: number): number {
  if (!isDummy(w, id)) return -1;
  const perTeam = (RANGE.minions - RANGE.heroes) >> 1;
  const k = id - RANGE.heroes - (w.team[id] === 0 ? 0 : perTeam);
  return k >= 0 && k < PRACTICE.spots.length ? k : -1;
}

/** Where a dummy stands (spawn and respawn), or null for any other hero. */
export function dummySpot(w: World, id: number): readonly [number, number] | null {
  const k = dummyIndex(w, id);
  return k < 0 ? null : PRACTICE.spots[k];
}

/** Step 2 on the Practice ground (instead of the bots): the walking dummy paces its lane. */
export function stepPractice(m: MatchHandle): void {
  const w = m.world;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (dummyIndex(w, id) !== 1 || w.alive[id] === 0 || w.order[id] !== Order.None) continue;
    const a = PRACTICE.spots[1];
    const b = PRACTICE.walkTo;
    const r2 = PRACTICE.turn * PRACTICE.turn;
    // stateless: walk to whichever end the dummy is not standing at (it starts on `a`)
    const toB = dist2(w.x[id], w.y[id], b[0], b[1]) > r2;
    const goal = toB ? b : a;
    if (dist2(w.x[id], w.y[id], goal[0], goal[1]) <= r2) continue;
    w.moveX[id] = goal[0];
    w.moveY[id] = goal[1];
    w.order[id] = Order.Move;
    w.state[id] = UnitState.Moving;
    w.pathLen[id] = 0;
    w.pathIdx[id] = 0;
    w.timer[id] = 0;
  }
}

/** Op.Practice from the player (slot 0). Outside the Practice ground it does nothing. */
export function practiceAction(m: MatchHandle, kind: number): void {
  const w = m.world;
  if (!isPractice(w)) return;
  const me = HUMAN_SLOT;
  const tick = w.globals[G.Tick];
  if (kind === 0) {
    for (let id = RANGE.heroes; id < RANGE.minions; id++) {
      if (dummyIndex(w, id) < 0) continue;
      // a dead dummy comes back on the next tick (the respawn places it on its spot)
      if (w.alive[id] === 0) {
        w.timer[id] = 1;
        continue;
      }
      const at = dummySpot(w, id)!;
      w.hp[id] = w.maxHp[id];
      w.x[id] = at[0];
      w.y[id] = at[1];
      w.moveX[id] = at[0];
      w.moveY[id] = at[1];
      w.order[id] = Order.None;
      w.state[id] = UnitState.Idle;
      w.pathLen[id] = 0;
      w.pathIdx[id] = 0;
    }
    for (let t = RANGE.towers; t < RANGE.cores; t++) if (w.alive[t] === 1) w.hp[t] = w.maxHp[t];
    if (w.alive[me] === 1) w.hp[me] = w.maxHp[me];
    for (let s = 0; s < COOLDOWN_SLOTS; s++) w.cooldowns[me * COOLDOWN_SLOTS + s] = 0;
  } else if (kind === 1) {
    if (w.level[me] >= XP.maxLevel || w.alive[me] === 0) return;
    w.xp[me] = Math.max(w.xp[me], XP.toLevel[w.level[me]]);
    levelUp(m, me);
  } else if (kind === 2) {
    for (let s = 0; s < COOLDOWN_SLOTS; s++) w.cooldowns[me * COOLDOWN_SLOTS + s] = 0;
  }
  m.events.push({ type: 'practice', tick, kind });
}

