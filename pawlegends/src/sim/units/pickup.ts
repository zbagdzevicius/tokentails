/**
 * Pickups (sim v4, data/pickups.ts): Frenzy Catnip and Fish Snack, in a small table of their own (`pk*`, outside
 * the entity ids). Slots 0 and 1 hold the Frenzy pair, slot 2 Purrhaven's Fish Snack, slot 3 Woof's.
 *
 * - Frenzy Catnip: at 0:45, then every 40 s, a mirrored pair (the river, then near Sunny or Puddle Lane in turn);
 *   a new pair replaces one nobody took. Anyone may take it: +25% damage and +20% move speed for 8 s, 20% max HP
 *   back at once.
 * - Fish Snack: every 30 s from 0:30, one per team behind its outer tower (Sunny and Puddle in turn; the inner tower
 *   once the outer fell). Only that team takes it: heals 35% max HP and refreshes Zoomies.
 *
 * Events: `pickupSpawn` when one appears, `pickup` and `buff` when a hero takes it.
 */
import { RADIUS, TOWER_SPOTS, mirrorX } from '../../data/map';
import { FRENZY_SPOTS, PICKUPS, PICKUP_KINDS, SNACK_BEHIND } from '../../data/pickups';
import { ZOOMIES } from '../../data/xp';
import type { Team } from '../api';
import { applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, RANGE, TEAM_NEUTRAL, type World } from '../world';

const FRENZY = 0;
const SNACK = 1;
const SNACK_SLOT = 2;

/** Nearest pickup hero `id` may take within `r` mm, or −1. */
export function nearestPickup(w: World, id: number, r: number, kind = -1): number {
  let best = -1;
  let bestD = 0;
  for (let i = 0; i < w.pkAlive.length; i++) {
    if (w.pkAlive[i] === 0 || (w.pkTeam[i] !== TEAM_NEUTRAL && w.pkTeam[i] !== w.team[id])) continue;
    if (kind >= 0 && w.pkKind[i] !== kind) continue;
    const d = dist2(w.x[id], w.y[id], w.pkX[i], w.pkY[i]);
    if (d > r * r) continue;
    if (best < 0 || d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

export const PICKUP_FRENZY = FRENZY;
export const PICKUP_SNACK = SNACK;

/** Match start: the first spawns are due. */
export function initPickups(w: World): void {
  w.globals[G.FrenzyAt] = PICKUPS.frenzy.first;
  w.globals[G.SnackAt] = PICKUPS.snack.first;
}

function place(m: MatchHandle, i: number, kind: number, team: number, x: number, y: number): void {
  const w = m.world;
  w.pkAlive[i] = 1;
  w.pkKind[i] = kind;
  w.pkTeam[i] = team;
  w.pkX[i] = x;
  w.pkY[i] = y;
  m.events.push({ type: 'pickupSpawn', tick: w.globals[G.Tick], index: i, kind: PICKUP_KINDS[kind], x, y });
}

/** Where `team`'s Fish Snack goes for lane `lane` (0 Sunny, 1 Puddle): behind its outer tower, else its inner one. */
function snackSpot(w: World, team: number, lane: number, out: Int32Array): void {
  const base = RANGE.towers + team * TOWER_SPOTS.length;
  const laneName = lane === 0 ? 'sunny' : 'puddle';
  let k = -1;
  for (let pass = 0; pass < 2 && k < 0; pass++) {
    const tier = pass === 0 ? 'outer' : 'inner';
    for (let j = 0; j < TOWER_SPOTS.length; j++) {
      if (TOWER_SPOTS[j].lane === laneName && TOWER_SPOTS[j].tier === tier && (w.alive[base + j] === 1 || pass === 1)) k = j;
    }
  }
  const spot = TOWER_SPOTS[k];
  const x = spot.x - SNACK_BEHIND;
  out[0] = team === 0 ? x : mirrorX(x);
  out[1] = spot.y;
}

const spot = new Int32Array(2);

/** Step 3: spawns due now. */
export function spawnPickups(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  if (tick === w.globals[G.FrenzyAt]) {
    const n = w.globals[G.FrenzySpawns]++;
    const s = FRENZY_SPOTS[n % FRENZY_SPOTS.length];
    place(m, 0, FRENZY, TEAM_NEUTRAL, s[0], s[1]);
    place(m, 1, FRENZY, TEAM_NEUTRAL, s[2], s[3]);
    w.globals[G.FrenzyAt] = tick + PICKUPS.frenzy.every;
  }
  if (tick === w.globals[G.SnackAt]) {
    const lane = w.globals[G.SnackSpawns]++ & 1;
    for (let team = 0; team < 2; team++) {
      snackSpot(w, team, lane, spot);
      place(m, SNACK_SLOT + team, SNACK, team, spot[0], spot[1]);
    }
    w.globals[G.SnackAt] = tick + PICKUPS.snack.every;
  }
}

/** Step 4 (after movement): heroes standing on a pickup take it, ascending hero id. */
export function collectPickups(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const reach = PICKUPS.radius + RADIUS.hero;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (w.alive[id] === 0 || w.hp[id] <= 0) continue;
    const i = nearestPickup(w, id, reach);
    if (i < 0) continue;
    w.pkAlive[i] = 0;
    const kind = w.pkKind[i];
    if (kind === FRENZY) {
      const f = PICKUPS.frenzy;
      w.frenzyT[id] = f.ticks;
      w.hp[id] = Math.min(w.maxHp[id], w.hp[id] + applyBp(w.maxHp[id], f.healBp));
      m.events.push({ type: 'pickup', tick, id, kind: 'frenzy', team: w.team[id] as Team });
      m.events.push({ type: 'buff', tick, id, kind: 'frenzy', ticks: f.ticks });
    } else {
      w.hp[id] = Math.min(w.maxHp[id], w.hp[id] + applyBp(w.maxHp[id], PICKUPS.snack.healBp));
      w.zoomT[id] = ZOOMIES.ticks;
      m.events.push({ type: 'pickup', tick, id, kind: 'snack', team: w.team[id] as Team });
      m.events.push({ type: 'buff', tick, id, kind: 'snack', ticks: ZOOMIES.ticks });
    }
  }
}
