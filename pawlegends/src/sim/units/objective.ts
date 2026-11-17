/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md, design MAPS-3V3.md §3–§6): the objectives of the 3v3 pool maps. State lives in
 * `w.ob` (OB / OBF), hashed last and empty on Crossing and Hearthwood, so every function here returns at once there
 * and those maps play exactly as in v33.
 *
 * - Fish Mill (Lanternfall Ridge): opens at 1:00, its pot fills 4 Fish a second; a team that stands alone in its disc
 *   for 4 s captures it: the pot split among its living heroes, XP, and Lantern Wave (its minions +25% to structures)
 *   for 45 s; then it closes for 45 s. At 4:30 it shuts for good and Pudding wakes in the pit.
 * - Paw Shrines (Twinbark Thicket): one per team half; unlock at 1:30; 3 s alone on one captures it (Fish and XP to
 *   the capturers inside), then it is locked 60 s. One shrine: Swift Paws (+10% move speed); both: Twin Blessing
 *   (heroes and minions +15% to structures).
 * - Catnip Gems (Geode Quarry): from 0:45 a gem every 6 s while fewer than 20 are in play, on a fixed ring round the
 *   Geode; a hero walking within 1.5 m takes it; a fallen hero drops all it carries. A team carrying 8 or more for
 *   12 s spends them on a Geode Surge (45 s: its minions take 70% and deal 130% to structures, its heroes 115%).
 * - Goals and crates (Pawball Park): the match ball (the Mega Yarn Ball) scores when its centre enters a goal mouth: the
 *   conceding team's weakest tower (or open core) loses 12% of its max HP, the scorers get Fish and XP, the ball is
 *   away 5 s and every crate regrows. A ball stopped by a crate cracks it (two cracks break it). At Sunset every crate
 *   crumbles for good.
 */
import { ACTIVE_MAP, MAP, RADIUS } from '../../data/map';
import { TIMELINE } from '../../data/timeline';
import { BP_ONE, applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { GEM_ROWS, G, Kind, OB, OBF, RANGE, SHRINE_ROW, heroAt, type World } from '../world';
import { grantFish } from '../progression/fish';
import { grantXp } from '../progression/levels';
import { coverRect } from '../map/grid';
import { dealDamage } from '../combat/damage';
import { isInvulnerable } from './kinds';
import { yarnAway } from './yarn';
import type { ObjSnap, Team } from '../api';
import { PROJECTILE_KIND } from '../../data/towers';
import { OBJECTIVE } from '../../data/objectives';

const O = (): number => OB.Obj;
const spec = () => ACTIVE_MAP.objective!;
/** The world has an objective table (a pool map). */
export const hasObjective = (w: World): boolean => w.ob.length > 0;

const RING = OBJECTIVE.gemRing;

/** Match start (after createWorld and initCamps). */
export function initObjective(m: MatchHandle): void {
  const w = m.world;
  if (!hasObjective(w)) return;
  const o = spec();
  const b = O();
  if (o.kind === 'mill') {
    w.ob[b + OBF.MillState] = 0;
    w.ob[b + OBF.MillAt] = o.first;
    w.ob[b + OBF.ProgTeam] = -1;
  } else if (o.kind === 'shrines') {
    for (let s = 0; s < 2; s++) {
      w.ob[b + s * SHRINE_ROW] = -1;
      w.ob[b + s * SHRINE_ROW + 2] = -1;
    }
  } else if (o.kind === 'gems') {
    w.ob[b + OBF.GemAt] = o.first;
    w.ob[b + OBF.Count0] = -1;
    w.ob[b + OBF.Count1] = -1;
  } else {
    w.ob[b + OBF.ResetAt] = -1;
    const n = crateCount();
    for (let k = 0; k < n * 2; k++) w.ob[b + OBF.Crate + k] = o.capture;
    for (let k = 0; k < n * 2; k++) coverCrate(m, k, 1);
  }
}

/** Step 4 (after the yarn balls): the map objective's tick. */
export function stepObjective(m: MatchHandle): void {
  const w = m.world;
  if (!hasObjective(w)) return;
  const k = spec().kind;
  if (k === 'mill') stepMill(m);
  else if (k === 'shrines') stepShrines(m);
  else if (k === 'gems') stepGems(m);
  else stepGoal(m);
}

/** Living heroes of each team within `r` of (x, y), into cnt[0], cnt[1]. */
const cnt = new Int32Array(2);
function countIn(w: World, x: number, y: number, r: number): void {
  cnt[0] = 0;
  cnt[1] = 0;
  const r2 = r * r;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.alive[h] === 0 || w.hp[h] <= 0 || w.napT[h] > 0) continue;
    if (dist2(w.x[h], w.y[h], x, y) <= r2) cnt[w.team[h]]++;
  }
}

/**
 * Capture progress at a disc: the team alone inside counts up (a new team starts from 0); contested or empty resets
 * (`decay` > 0: an empty disc counts down by it instead). Returns the team that completed a capture this tick, or −1.
 * `p` and `pt` are the ob indices of the progress and the capturing team; `blocked` = the team that may not capture.
 */
function progress(w: World, x: number, y: number, r: number, p: number, pt: number, need: number, decay: number, blocked: number): number {
  countIn(w, x, y, r);
  const t = cnt[0] > 0 && cnt[1] === 0 ? 0 : cnt[1] > 0 && cnt[0] === 0 ? 1 : -1;
  if (t < 0 || t === blocked) {
    if (cnt[0] === 0 && cnt[1] === 0 && decay > 0) {
      w.ob[p] = Math.max(0, w.ob[p] - decay);
      if (w.ob[p] === 0) w.ob[pt] = -1;
    } else {
      w.ob[p] = 0;
      w.ob[pt] = -1;
    }
    return -1;
  }
  if (w.ob[pt] !== t) {
    w.ob[pt] = t;
    w.ob[p] = 0;
  }
  if (++w.ob[p] < need) return -1;
  w.ob[p] = 0;
  w.ob[pt] = -1;
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Fish Mill

function stepMill(m: MatchHandle): void {
  const w = m.world;
  const o = spec();
  const b = O();
  const tick = w.globals[G.Tick];
  const state = w.ob[b + OBF.MillState];
  if (state === 3) return;
  if (o.endAt > 0 && tick >= o.endAt) {
    w.ob[b + OBF.MillState] = 3;
    w.ob[b + OBF.Pot] = 0;
    w.ob[b + OBF.Prog] = 0;
    w.ob[b + OBF.ProgTeam] = -1;
    return;
  }
  if (state !== 1) {
    if (tick < w.ob[b + OBF.MillAt]) return;
    w.ob[b + OBF.MillState] = 1;
    w.ob[b + OBF.Pot] = 0;
    m.events.push({ type: 'millOpen', tick });
  }
  if (tick % TIMELINE.second === 0) w.ob[b + OBF.Pot] = Math.min(o.potCap, w.ob[b + OBF.Pot] + o.potPerSecond);
  const t = progress(w, o.x, o.y, o.r, b + OBF.Prog, b + OBF.ProgTeam, o.capture, 0, -1);
  if (t < 0) return;
  let alive = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.kind[h] === Kind.Hero && w.team[h] === t && w.alive[h] === 1) alive++;
  const pot = w.ob[b + OBF.Pot];
  const each = alive > 0 ? idiv(pot, alive) : 0;
  let rest = pot - each * alive;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== t || w.alive[h] === 0) continue;
    grantFish(m, h, each + rest, 'pudding');
    rest = 0;
    grantXp(m, h, o.xp, 'camp');
  }
  w.ob[b + (t === 0 ? OBF.Lantern0 : OBF.Lantern1)] = tick + o.buffTicks;
  w.ob[b + OBF.MillState] = 2;
  w.ob[b + OBF.MillAt] = tick + o.cooldown;
  w.ob[b + OBF.Pot] = 0;
  m.events.push({ type: 'millCapture', tick, team: t as Team, fish: each });
}

// ---------------------------------------------------------------------------------------------------------------
// Paw Shrines

/** Shrine `s`'s centre x (shrine 0 is team 0's, shrine 1 its mirror). */
export const shrineX = (s: number): number => (s === 0 ? spec().x : MAP.width - spec().x);

function stepShrines(m: MatchHandle): void {
  const w = m.world;
  const o = spec();
  const b = O();
  const tick = w.globals[G.Tick];
  if (tick < o.first) return;
  for (let s = 0; s < 2; s++) {
    const r = b + s * SHRINE_ROW;
    if (tick < w.ob[r + 3]) continue;
    const owner = w.ob[r];
    const t = progress(w, shrineX(s), o.y, o.r, r + 1, r + 2, o.capture, 2, owner);
    if (t < 0) continue;
    w.ob[r] = t;
    w.ob[r + 3] = tick + o.cooldown;
    const r2 = o.r * o.r;
    for (let h = RANGE.heroes; h < RANGE.minions; h++) {
      if (w.kind[h] !== Kind.Hero || w.team[h] !== t || w.alive[h] === 0) continue;
      if (dist2(w.x[h], w.y[h], shrineX(s), o.y) > r2) continue;
      grantFish(m, h, o.fish, 'pudding');
      grantXp(m, h, o.xp, 'camp');
    }
    m.events.push({ type: 'shrineCapture', tick, shrine: s, team: t as Team });
  }
}

/** Shrines team `team` owns (0, 1 or 2). */
export function shrinesOf(w: World, team: number): number {
  if (!hasObjective(w) || spec().kind !== 'shrines') return 0;
  const b = O();
  return (w.ob[b] === team ? 1 : 0) + (w.ob[b + SHRINE_ROW] === team ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Catnip Gems

const gemRow = (g: number): number => O() + OBF.Ground + g * 3;
/** Gems hero `h` carries. */
export const gemsOf = (w: World, h: number): number => (hasObjective(w) && spec().kind === 'gems' ? w.ob[O() + OBF.Carry + h] : 0);
/** Gems team `team`'s living heroes carry. */
export function teamGems(w: World, team: number): number {
  let n = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === team && w.alive[h] === 1) n += w.ob[O() + OBF.Carry + h];
  return n;
}
function gemsInPlay(w: World): number {
  let n = 0;
  for (let g = 0; g < GEM_ROWS; g++) n += w.ob[gemRow(g)];
  for (let h = RANGE.heroes; h < RANGE.minions; h++) n += w.ob[O() + OBF.Carry + h];
  return n;
}
function placeGem(w: World, x: number, y: number): boolean {
  for (let g = 0; g < GEM_ROWS; g++) {
    const r = gemRow(g);
    if (w.ob[r] !== 0) continue;
    w.ob[r] = 1;
    w.ob[r + 1] = x;
    w.ob[r + 2] = y;
    return true;
  }
  return false;
}

function stepGems(m: MatchHandle): void {
  const w = m.world;
  const o = spec();
  const b = O();
  const tick = w.globals[G.Tick];
  if (tick >= w.ob[b + OBF.GemAt] && w.ob[b + OBF.GemAt] > 0) {
    w.ob[b + OBF.GemAt] = tick + o.cooldown;
    if (gemsInPlay(w) < o.gemCap) {
      const n = w.ob[b + OBF.GemN];
      const off = RING[n % RING.length];
      if (placeGem(w, o.x + off[0], o.y + off[1])) w.ob[b + OBF.GemN] = n + 1;
    }
  }
  // Pickups: every gem in reach of a living hero, heroes in heroAt order.
  const r2 = o.r * o.r;
  for (let k = RANGE.heroes; k < RANGE.minions; k++) {
    const h = heroAt(w, k);
    if (w.kind[h] !== Kind.Hero || w.alive[h] === 0 || w.hp[h] <= 0) continue;
    let got = 0;
    for (let g = 0; g < GEM_ROWS; g++) {
      const r = gemRow(g);
      if (w.ob[r] === 0 || dist2(w.x[h], w.y[h], w.ob[r + 1], w.ob[r + 2]) > r2) continue;
      w.ob[r] = 0;
      got++;
    }
    if (got === 0) continue;
    w.ob[b + OBF.Carry + h] += got;
    grantXp(m, h, o.xp * got, 'camp');
    m.events.push({ type: 'gemPick', tick, id: h, n: w.ob[b + OBF.Carry + h] });
  }
  // Countdowns and Surges.
  for (let t = 0; t < 2; t++) {
    const c = b + (t === 0 ? OBF.Count0 : OBF.Count1);
    const surge = b + (t === 0 ? OBF.Surge0 : OBF.Surge1);
    const enough = teamGems(w, t) >= o.gemNeed && tick >= w.ob[surge];
    if (!enough) {
      if (w.ob[c] >= 0) {
        w.ob[c] = -1;
        m.events.push({ type: 'gemCountdown', tick, team: t as Team, on: false });
      }
      continue;
    }
    if (w.ob[c] < 0) {
      w.ob[c] = tick + o.countdown;
      m.events.push({ type: 'gemCountdown', tick, team: t as Team, on: true });
      continue;
    }
    if (tick < w.ob[c]) continue;
    w.ob[c] = -1;
    for (let h = RANGE.heroes; h < RANGE.minions; h++) if (w.team[h] === t && w.alive[h] === 1) w.ob[b + OBF.Carry + h] = 0;
    w.ob[surge] = tick + o.buffTicks;
    m.events.push({ type: 'gemSurge', tick, team: t as Team });
  }
}

/** Step 7: hero `id` fell; on Geode Quarry it drops every gem it carries round where it fell. */
export function objectiveDeath(m: MatchHandle, id: number): void {
  const w = m.world;
  if (!hasObjective(w) || spec().kind !== 'gems') return;
  const c = O() + OBF.Carry + id;
  const n = w.ob[c];
  if (n <= 0) return;
  w.ob[c] = 0;
  for (let k = 0; k < n; k++) {
    const off = RING[k % RING.length];
    // 1.5 m ring (3/4 of the Geode's), clamped to the map
    const e = OBJECTIVE.gemEdge;
    const x = Math.min(MAP.width - e, Math.max(e, w.x[id] + ((off[0] * 3) >> 2)));
    const y = Math.min(MAP.height - e, Math.max(e, w.y[id] + ((off[1] * 3) >> 2)));
    placeGem(w, x, y);
  }
  m.events.push({ type: 'gemDrop', tick: w.globals[G.Tick], id, n, x: w.x[id], y: w.y[id] });
}

// ---------------------------------------------------------------------------------------------------------------
// Goals and crates

const crateCount = (): number => ACTIVE_MAP.crates?.length ?? 0;
/** Crate `k` (team 0's 0..n−1, then their mirrors) as [x0, y0, x1, y1]. */
export function crateRect(k: number, out: Int32Array): void {
  const n = crateCount();
  const c = ACTIVE_MAP.crates![k % n];
  if (k < n) {
    out[0] = c[0];
    out[1] = c[1];
    out[2] = c[2];
    out[3] = c[3];
  } else {
    out[0] = MAP.width - c[2];
    out[1] = c[1];
    out[2] = MAP.width - c[0];
    out[3] = c[3];
  }
}
const rect = new Int32Array(4);

/** Sim v34: the crate cover a match applied to its grid (derived from `ob`, rebuilt the same way in every replay). */
function coverCrate(m: MatchHandle, k: number, delta: 1 | -1): void {
  let cov = m.crateCov;
  if (!cov) {
    cov = new Uint8Array(crateCount() * 2);
    (m as { crateCov?: Uint8Array }).crateCov = cov;
  }
  if ((cov[k] === 1) === (delta === 1)) return;
  cov[k] = delta === 1 ? 1 : 0;
  crateRect(k, rect);
  coverRect(m.grid, rect[0], rect[1], rect[2], rect[3], delta);
}

function breakCrate(m: MatchHandle, k: number): void {
  const w = m.world;
  w.ob[O() + OBF.Crate + k] = 0;
  coverCrate(m, k, -1);
  m.events.push({ type: 'crateBreak', tick: w.globals[G.Tick], crate: k });
}

/** Is any unit's body inside crate `k` (it may not regrow over one)? */
function crateOccupied(w: World, k: number): boolean {
  crateRect(k, rect);
  for (let id = RANGE.heroes; id < RANGE.end; id++) {
    if (w.alive[id] === 0) continue;
    const r = id < RANGE.minions ? RADIUS.hero : RADIUS.minion;
    if (w.x[id] + r >= rect[0] && w.x[id] - r <= rect[2] && w.y[id] + r >= rect[1] && w.y[id] - r <= rect[3]) return true;
  }
  return false;
}

function stepGoal(m: MatchHandle): void {
  const w = m.world;
  const b = O();
  const tick = w.globals[G.Tick];
  const n = crateCount() * 2;
  if (w.ob[b + OBF.CratesGone] === 0 && tick >= w.globals[G.Sunset]) {
    w.ob[b + OBF.CratesGone] = 1;
    for (let k = 0; k < n; k++) if (w.ob[b + OBF.Crate + k] > 0) breakCrate(m, k);
  }
  if (w.ob[b + OBF.ResetAt] >= 0 && tick >= w.ob[b + OBF.ResetAt]) {
    w.ob[b + OBF.ResetAt] = -1;
    if (w.ob[b + OBF.CratesGone] === 0) {
      for (let k = 0; k < n; k++) {
        if (w.ob[b + OBF.Crate + k] > 0 || crateOccupied(w, k)) continue;
        w.ob[b + OBF.Crate + k] = spec().capture;
        coverCrate(m, k, 1);
      }
    }
  }
}

/** Which crate (index) a stopped ball at (x, y) rolling along (vx, vy) ran into, or −1. */
export function crateStop(m: MatchHandle, x: number, y: number, vx: number, vy: number): void {
  const w = m.world;
  if (!hasObjective(w) || spec().kind !== 'goal') return;
  const len = Math.max(1, Math.abs(vx) + Math.abs(vy));
  const ax = x + idiv(vx * OBJECTIVE.crateProbe, len);
  const ay = y + idiv(vy * OBJECTIVE.crateProbe, len);
  const sl = OBJECTIVE.crateSlack;
  const b = O();
  for (let k = 0; k < crateCount() * 2; k++) {
    if (w.ob[b + OBF.Crate + k] <= 0) continue;
    crateRect(k, rect);
    if (ax < rect[0] - sl || ax > rect[2] + sl || ay < rect[1] - sl || ay > rect[3] + sl) continue;
    if (--w.ob[b + OBF.Crate + k] <= 0) breakCrate(m, k);
    return;
  }
}

/**
 * A rolling ball (projectile `p`) at (x, y): inside a goal mouth it scores (returns true, the shot is over). Team 0's
 * mouth is where team 1 scores.
 */
export function ballInGoal(m: MatchHandle, p: number, x: number, y: number): boolean {
  const w = m.world;
  if (!hasObjective(w) || spec().kind !== 'goal' || w.pKind[p] !== PROJECTILE_KIND.yarn) return false;
  const g = ACTIVE_MAP.goalMouth!;
  if (y < g[1] || y > g[3]) return false;
  const team = x >= g[0] && x <= g[2] ? 1 : x >= MAP.width - g[2] && x <= MAP.width - g[0] ? 0 : -1;
  if (team < 0) return false;
  const o = spec();
  const b = O();
  const tick = w.globals[G.Tick];
  w.pAlive[p] = 0;
  yarnAway(m, w.pEffA[p], o.reset);
  w.ob[b + (team === 0 ? OBF.Goals0 : OBF.Goals1)]++;
  w.ob[b + OBF.ResetAt] = tick + o.reset;
  const by = w.pOwner[p];
  m.events.push({ type: 'goal', tick, team: team as Team, id: by >= 0 && by < RANGE.minions ? by : -1 });
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== team || w.alive[h] === 0) continue;
    grantFish(m, h, o.fish, 'pudding');
    grantXp(m, h, o.xp, 'camp');
  }
  // Goal Siege: the conceding team's standing, hittable tower with the lowest HP share (ties: the lower slot), else its
  // open core.
  const lose = 1 - team;
  let best = -1;
  for (let s = RANGE.towers; s < RANGE.cores; s++) {
    if (w.team[s] !== lose || w.alive[s] === 0 || isInvulnerable(w, s)) continue;
    if (best < 0 || w.hp[s] * w.maxHp[best] < w.hp[best] * w.maxHp[s]) best = s;
  }
  const core = RANGE.cores + lose;
  if (best < 0 && w.alive[core] === 1 && !isInvulnerable(w, core)) best = core;
  if (best >= 0) dealDamage(m, -1, team, Kind.None, best, Math.max(1, applyBp(w.maxHp[best], o.siegeBp)), 'chip', { pure: true });
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Buff hooks (neutral on Crossing and Hearthwood)

/** Extra move speed (bp) of hero `id` from the objective (Swift Paws). */
export function objSpeedBp(w: World, id: number): number {
  if (!hasObjective(w) || spec().kind !== 'shrines') return 0;
  return shrinesOf(w, w.team[id]) >= 1 ? spec().speedBp : 0;
}

/** Is `team`'s objective buff running (Lantern Wave, Twin Blessing, Geode Surge)? */
export function objBuffed(w: World, team: number): boolean {
  if (!hasObjective(w) || team > 1) return false;
  const o = spec();
  const b = O();
  const tick = w.globals[G.Tick];
  if (o.kind === 'mill') return tick < w.ob[b + (team === 0 ? OBF.Lantern0 : OBF.Lantern1)];
  if (o.kind === 'shrines') return shrinesOf(w, team) === 2;
  if (o.kind === 'gems') return tick < w.ob[b + (team === 0 ? OBF.Surge0 : OBF.Surge1)];
  return false;
}

/** Damage share (bp) a structure takes from a source of `srcTeam` and kind `srcKind` (BP_ONE: none). */
export function objStructBp(w: World, srcTeam: number, srcKind: number): number {
  if (!objBuffed(w, srcTeam)) return BP_ONE;
  const o = spec();
  if (srcKind === Kind.Minion) return o.minionStructBp;
  if (srcKind === Kind.Hero) return o.heroStructBp;
  return BP_ONE;
}

/** Damage share (bp) a minion of `team` takes (Geode Surge). */
export function objMinionTakenBp(w: World, team: number): number {
  return objBuffed(w, team) ? spec().minionTakenBp : BP_ONE;
}

// ---------------------------------------------------------------------------------------------------------------
// Snapshot

export function objectiveSnap(w: World): ObjSnap | undefined {
  if (!hasObjective(w)) return undefined;
  const o = spec();
  const b = O();
  const tick = w.globals[G.Tick];
  const left = (at: number): number => Math.max(0, at - tick);
  if (o.kind === 'mill') {
    const st = w.ob[b + OBF.MillState];
    return {
      kind: 'mill',
      mill: {
        state: (['shut', 'open', 'closed', 'done'] as const)[st],
        pot: w.ob[b + OBF.Pot],
        prog: w.ob[b + OBF.Prog],
        progTeam: w.ob[b + OBF.ProgTeam],
        need: o.capture,
        nextIn: st === 1 || st === 3 ? 0 : left(w.ob[b + OBF.MillAt]),
        lantern: [left(w.ob[b + OBF.Lantern0]), left(w.ob[b + OBF.Lantern1])],
      },
    };
  }
  if (o.kind === 'shrines') {
    const shrines: NonNullable<ObjSnap['shrines']> = [];
    for (let s = 0; s < 2; s++) {
      const r = b + s * SHRINE_ROW;
      shrines.push({ owner: w.ob[r], prog: w.ob[r + 1], progTeam: w.ob[r + 2], lock: left(w.ob[r + 3]) });
    }
    return { kind: 'shrines', shrines, shrineOpenIn: left(o.first) };
  }
  if (o.kind === 'gems') {
    const carried: number[] = [];
    for (let h = RANGE.heroes; h < RANGE.minions; h++) carried.push(w.ob[b + OBF.Carry + h]);
    const ground: { x: number; y: number }[] = [];
    for (let g = 0; g < GEM_ROWS; g++) if (w.ob[gemRow(g)] !== 0) ground.push({ x: w.ob[gemRow(g) + 1], y: w.ob[gemRow(g) + 2] });
    const c0 = w.ob[b + OBF.Count0];
    const c1 = w.ob[b + OBF.Count1];
    return {
      kind: 'gems',
      gems: {
        carried,
        total: [teamGems(w, 0), teamGems(w, 1)],
        count: [c0 < 0 ? -1 : left(c0), c1 < 0 ? -1 : left(c1)],
        surge: [left(w.ob[b + OBF.Surge0]), left(w.ob[b + OBF.Surge1])],
        ground,
        nextIn: left(w.ob[b + OBF.GemAt]),
        need: o.gemNeed,
      },
    };
  }
  const crates: number[] = [];
  for (let k = 0; k < crateCount() * 2; k++) crates.push(w.ob[b + OBF.Crate + k]);
  const reset = w.ob[b + OBF.ResetAt];
  return { kind: 'goal', goal: { score: [w.ob[b + OBF.Goals0], w.ob[b + OBF.Goals1]], crates, resetIn: reset < 0 ? 0 : left(reset) } };
}
