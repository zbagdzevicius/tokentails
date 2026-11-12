/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §1): the Kibble Cannon. One at a time, on the river at a spot equally far from
 * both cores (FUN_BY_MAP[map].cannon), first at `first` and `respawn` ticks after each shot or fizzle; none spawns
 * once Sudden Death started. A `cannonSoon` warning comes CANNON.warn ticks before.
 *
 * - Underdog Cannon: a team that meets the COMEBACK trigger at the warning (3+ structures or 8+ takedowns behind) gets
 *   it `underdog` mm toward its side, on the same line.
 * - Pick up: walk over it. Of the heroes in reach the one nearest its centre takes it; a tie between the teams goes to
 *   team (spawns so far & 1), so it alternates per spawn; a tie inside a team to the lower slot. The carrier moves CANNON.slowBp slower and both teams see it.
 * - Fuse: CANNON.fuse ticks while carried (paused on the ground and during the windup). At 0 it fizzles.
 * - Drop: the carrier's death or Nap drops it where it stood, for CANNON.dropTicks, takeable by either team, with at
 *   least CANNON.fuseFloor fuse left; nobody takes it, it fizzles.
 * - Fire (Op.Fire): a CANNON.windup-tick windup (the carrier is planted; a `windup` event with slot 5 and the aim).
 *   Stun, fear, charm or a knockback during it fumbles: the cannon drops at the carrier's feet. Then the kibble flies
 *   (combat/funshot.ts) and the respawn timer starts.
 *
 * State lives in `globals` (G.Cannon*), so it is hashed. G.CannonBy is the carrier, −1 for a fresh cannon on the
 * ground, and −2 − (last carrier) for a dropped one (so a pick-up knows a steal).
 */
import { CANNON, FUN_BY_MAP, type CannonData } from '../../data/fun';
import { COMEBACK } from '../../data/minions';
import { RADIUS } from '../../data/map';
import { PROJECTILE_KIND } from '../../data/towers';
import type { Team } from '../api';
import { TRIG_ONE, dist2, iatan2, icos, idiv, isin, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { CANNON_STATE, FM, G, Kind, Order, RANGE, UnitState, type World } from '../world';
import { PFLAG, fireSkillshot } from '../effects/projectile';
import { disabled, interrupt } from '../effects/status';
import { mutOf } from '../mutator';

/** Sim v22: a mutator may bring its own cannon row (Blitz: 0:20, then 40 s after each shot or fizzle). */
export const cannonData = (w: World): CannonData => mutOf(w).cannon ?? FUN_BY_MAP[w.map].cannon;

/** Is hero `id` carrying the cannon? Winding it up? */
export const carries = (w: World, id: number): boolean => w.globals[G.CannonState] === CANNON_STATE.Carried && w.globals[G.CannonBy] === id;
export const cannonWinding = (w: World, id: number): boolean => carries(w, id) && w.globals[G.CannonWind] > 0;

/** Match start: the first spawn is due. */
export function initCannon(w: World): void {
  w.globals[G.CannonAt] = cannonData(w).first;
}

/** The team the Underdog Cannon favours now (COMEBACK trigger), or −1. */
export function underdogTeam(w: World): number {
  let out = -1;
  for (let team = 0; team < 2; team++) {
    const towersBehind = w.globals[team === 0 ? G.Towers1 : G.Towers0] - w.globals[team === 0 ? G.Towers0 : G.Towers1];
    const killsBehind = w.globals[team === 0 ? G.Kills1 : G.Kills0] - w.globals[team === 0 ? G.Kills0 : G.Kills1];
    if (towersBehind >= COMEBACK.structuresBehind || killsBehind >= (mutOf(w).underdogTakedowns || COMEBACK.takedownsBehind)) out = out < 0 ? team : -2;
  }
  return out < 0 ? -1 : out;
}

/** Where the next cannon goes (spot in turn, plus the Underdog offset); sets G.CannonX/Y. Returns the favoured team. */
function chooseSpot(w: World): number {
  const d = cannonData(w);
  const s = d.spots[w.globals[G.CannonSpawns] % d.spots.length];
  let x = s[0];
  let y = s[1];
  const team = underdogTeam(w);
  if (team >= 0) {
    const len = Math.max(1, isqrt(d.underdogDx * d.underdogDx + d.underdogDy * d.underdogDy));
    const sign = team === 0 ? 1 : -1;
    x += sign * idiv(d.underdogDx * d.underdog, len);
    y += sign * idiv(d.underdogDy * d.underdog, len);
  }
  w.globals[G.CannonX] = x;
  w.globals[G.CannonY] = y;
  w.globals[G.CannonUnder] = team;
  return team;
}

/** Step 3: the warning and the spawn. */
export function spawnCannon(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const at = w.globals[G.CannonAt];
  if (at < 0 || w.globals[G.CannonState] !== CANNON_STATE.None) return;
  if (at >= w.globals[G.SuddenDeath]) {
    w.globals[G.CannonAt] = -1;
    return;
  }
  if (tick === at - CANNON.warn) {
    chooseSpot(w);
    m.events.push({ type: 'cannonSoon', tick, x: w.globals[G.CannonX], y: w.globals[G.CannonY] });
  }
  if (tick !== at) return;
  // The spot (and its Underdog team) was chosen at the warning; a match that starts inside the warning window chooses
  // it now.
  const team = at < CANNON.warn ? chooseSpot(w) : w.globals[G.CannonUnder];
  w.globals[G.CannonState] = CANNON_STATE.Ground;
  w.globals[G.CannonBy] = -1;
  w.globals[G.CannonFuse] = CANNON.fuse;
  w.globals[G.CannonDrop] = 0;
  w.globals[G.CannonWind] = 0;
  w.globals[G.CannonSpawns]++;
  w.globals[G.CannonAt] = -1;
  const x = w.globals[G.CannonX];
  const y = w.globals[G.CannonY];
  m.events.push(team >= 0 ? { type: 'cannonSpawn', tick, x, y, underdog: team as Team } : { type: 'cannonSpawn', tick, x, y });
}

/** The cannon is gone (fired or fizzled): the next one is due `respawn` ticks from now. */
function gone(w: World): void {
  w.globals[G.CannonState] = CANNON_STATE.None;
  w.globals[G.CannonBy] = -1;
  w.globals[G.CannonWind] = 0;
  w.globals[G.CannonDrop] = 0;
  w.globals[G.CannonAt] = w.globals[G.Tick] + cannonData(w).respawn;
}

function fizzle(m: MatchHandle, x: number, y: number): void {
  const w = m.world;
  m.events.push({ type: 'cannonFizzle', tick: w.globals[G.Tick], x, y });
  gone(w);
}

/** Carrier `id` drops it where it stands. */
function drop(m: MatchHandle, id: number, why: 'death' | 'nap' | 'fumble'): void {
  const w = m.world;
  w.globals[G.CannonState] = CANNON_STATE.Ground;
  w.globals[G.CannonBy] = -2 - id;
  w.globals[G.CannonX] = w.x[id];
  w.globals[G.CannonY] = w.y[id];
  w.globals[G.CannonDrop] = CANNON.dropTicks;
  w.globals[G.CannonWind] = 0;
  w.globals[G.CannonFuse] = Math.max(w.globals[G.CannonFuse], CANNON.fuseFloor);
  if (w.state[id] === UnitState.Casting && w.alive[id] === 1) w.state[id] = UnitState.Idle;
  m.events.push({ type: 'cannonDrop', tick: w.globals[G.Tick], id, x: w.x[id], y: w.y[id], why });
}

/** Can hero `id` take the cannon (alive, not airborne, not napping)? */
const taker = (w: World, id: number): boolean =>
  w.kind[id] === Kind.Hero && w.alive[id] === 1 && w.hp[id] > 0 && w.fmKind[id] !== FM.Leap && w.napT[id] === 0;

/** Step 4 (after movement): of the heroes standing on the cannon, the one nearest its centre takes it. */
export function collectCannon(m: MatchHandle): void {
  const w = m.world;
  if (w.globals[G.CannonState] !== CANNON_STATE.Ground) return;
  const reach = CANNON.reach + RADIUS.hero;
  const x = w.globals[G.CannonX];
  const y = w.globals[G.CannonY];
  // Ties between the teams alternate per spawn (team 1 wins the first spawn's tie, team 0 the second's, ...).
  const tieTeam = w.globals[G.CannonSpawns] & 1;
  let id = -1;
  let best = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (!taker(w, h)) continue;
    const d = dist2(w.x[h], w.y[h], x, y);
    if (d > reach * reach) continue;
    if (id >= 0 && (d > best || (d === best && (w.team[id] === w.team[h] || w.team[id] === tieTeam)))) continue;
    id = h;
    best = d;
  }
  if (id < 0) return;
  const prev = w.globals[G.CannonBy];
  const steal = prev <= -2 && w.team[-2 - prev] !== w.team[id];
  w.globals[G.CannonState] = CANNON_STATE.Carried;
  w.globals[G.CannonBy] = id;
  w.globals[G.CannonDrop] = 0;
  m.events.push({ type: 'cannonPick', tick: w.globals[G.Tick], id, team: w.team[id] as Team, steal });
}

/**
 * Step 4 (after the status timers): the carrier stays revealed and its fuse burns; its death or Nap drops the cannon;
 * a dropped cannon nobody takes fizzles.
 */
export function carryCannon(m: MatchHandle): void {
  const w = m.world;
  const state = w.globals[G.CannonState];
  if (state === CANNON_STATE.Ground) {
    if (w.globals[G.CannonDrop] > 0 && --w.globals[G.CannonDrop] === 0) fizzle(m, w.globals[G.CannonX], w.globals[G.CannonY]);
    return;
  }
  if (state !== CANNON_STATE.Carried) return;
  const id = w.globals[G.CannonBy];
  if (w.alive[id] === 0 || w.hp[id] <= 0) {
    drop(m, id, 'death');
    return;
  }
  if (w.napT[id] > 0) {
    drop(m, id, 'nap');
    return;
  }
  w.revealT[id] = Math.max(w.revealT[id], CANNON.revealTicks);
  if (w.globals[G.CannonWind] > 0) return;
  if (--w.globals[G.CannonFuse] <= 0) fizzle(m, w.x[id], w.y[id]);
}

/** Step 1 (Op.Fire from hero `id`): start the windup toward (x, y). Ignored unless `id` carries it and may act. */
export function orderFire(m: MatchHandle, id: number, x: number, y: number): void {
  const w = m.world;
  if (!carries(w, id) || w.globals[G.CannonWind] > 0) return;
  if (w.alive[id] === 0 || disabled(w, id) || w.fmKind[id] !== FM.None || w.castPhase[id] === 2 || w.napT[id] > 0) return;
  interrupt(w, id, false);
  // Aimed at its own feet: straight ahead.
  const atFeet = x === w.x[id] && y === w.y[id];
  if (!atFeet) w.facing[id] = iatan2(y - w.y[id], x - w.x[id]);
  w.globals[G.CannonAX] = atFeet ? w.x[id] + idiv(icos(w.facing[id]) * cannonData(w).range, TRIG_ONE) : x;
  w.globals[G.CannonAY] = atFeet ? w.y[id] + idiv(isin(w.facing[id]) * cannonData(w).range, TRIG_ONE) : y;
  w.globals[G.CannonWind] = CANNON.windup;
  w.order[id] = Order.None;
  w.target[id] = -1;
  w.pathLen[id] = 0;
  w.state[id] = UnitState.Casting;
  m.events.push({ type: 'windup', tick: w.globals[G.Tick], src: id, slot: 5, x: w.globals[G.CannonAX], y: w.globals[G.CannonAY], ticks: CANNON.windup });
}

/** Step 5 (after the casts): the windup runs; hard CC fumbles it; at its end the kibble flies. */
export function resolveCannon(m: MatchHandle): void {
  const w = m.world;
  if (w.globals[G.CannonState] !== CANNON_STATE.Carried || w.globals[G.CannonWind] <= 0) return;
  const id = w.globals[G.CannonBy];
  if (disabled(w, id)) {
    drop(m, id, 'fumble');
    return;
  }
  if (--w.globals[G.CannonWind] > 0) return;
  const ax = w.globals[G.CannonAX];
  const ay = w.globals[G.CannonAY];
  const angle = ax === w.x[id] && ay === w.y[id] ? w.facing[id] : iatan2(ay - w.y[id], ax - w.x[id]);
  w.facing[id] = angle;
  fireSkillshot(w, id, { kind: PROJECTILE_KIND.kibble, angle, speed: CANNON.speed, range: cannonData(w).range, radius: CANNON.radius, dmg: 0, flags: PFLAG.HeroStop });
  if (w.state[id] === UnitState.Casting) w.state[id] = UnitState.Idle;
  m.events.push({ type: 'cannonFire', tick: w.globals[G.Tick], id, x: w.x[id], y: w.y[id], ax, ay });
  gone(w);
}
