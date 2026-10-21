/**
 * The `pinger` player-bot (sim v10, GAPS B1 measure): plays slot 0 like `normal` and also pings its allied bots the
 * way an attentive human would. GAPS §3: on Normal it should win 5–10 points more than `normal` (over 15 means pings
 * are mandatory). It reads only what slot 0 may know: its own team in full, the enemy through `seenEnemy`.
 *
 * Rules, first match wins, each kind with its own cooldown, within the sim's PING limits (PINGER.kinds switches kinds
 * off): outnumbered around slot 0 with an ally in the fight → Fall back; an enemy hero at an own inner tower or the
 * core with no ally near it → Defend base; Pudding wild, the team healthy and at most one enemy hero at it (once per
 * spawn) → Take Pudding; slot 0 hitting a hurt enemy hero with an ally close → Focus hero; PINGER.pushDown enemy
 * heroes down → Push slot 0's lane; one enemy hero down and an ally far → Group on me. Slot 0 goes along with its own
 * Take Pudding, Defend base, Fall back and Push (`SelfOrder`), as a human who pings would.
 *
 * Tuning (2026-10-20, 800 seeds a run on Normal, --hero random --trick random, against `normal` 50.9% on the same
 * seeds), after the stronger obey rules in bots/brain.ts: Focus −0.6, Take Pudding −0.5, Push +1.0, Defend −1.6,
 * Group +1.0, Fall back −3.8, all kinds −2.6; the default mask Focus + Take Pudding + Push (0x9c) +0.7. Every figure is
 * inside the noise (about ±1.8 points at 800 seeds): pings are control and depth, not an edge. See the B1 note and
 * Your call 19 in docs/plans/moba/GAPS.md.
 */
import { BOT_AI, PINGER } from '../../data/bots';
import { nearLane } from '../map/grid';
import { CAPS, MAP, TOWER_SPOTS } from '../../data/map';
import { PING, PING_KIND, PING_KINDS } from '../../data/pings';
import { PUD_STATE } from '../../data/pudding';
import { HUMAN_SLOT, NO_TARGET, Op, type Command } from '../api';
import { dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, RANGE, type World } from '../world';
import type { SelfOrder } from './brain';
import { hpBp, seenEnemy } from './sense';

/** The pinger's own memory (outside the world, like a human's). */
export interface PingerMem {
  /** Next tick each ping kind may be sent again. */
  next: Int32Array;
  /** Last ping tick, pings sent, the Pudding spawn already pinged. */
  last: number;
  sent: number;
  pudSpawn: number;
  /** What slot 0 itself does after its own ping (Take Pudding, Defend base, Fall back): it goes along. */
  mine: SelfOrder;
}

export const createPingerMem = (): PingerMem => ({
  next: new Int32Array(PING_KINDS.length),
  last: -PING.minGap,
  sent: 0,
  pudSpawn: -1,
  mine: { kind: -1, until: -1, x: 0, y: 0, target: -1 },
});

/** Kinds slot 0 follows itself (the others it leads: Group on me, Focus hero, Go here, Push). */
const SELF_KINDS: readonly number[] = [PING_KIND.Pudding, PING_KIND.Defend, PING_KIND.FallBack, PING_KIND.PushSunny, PING_KIND.PushPuddle];

/** The own core or inner tower with an enemy hero `team` can see within PINGER.baseRange, or −1. */
function raidedBase(w: World, team: number): number {
  const r2 = PINGER.baseRange * PINGER.baseRange;
  const base = RANGE.towers + team * TOWER_SPOTS.length;
  for (let s = 0; s <= TOWER_SPOTS.length; s++) {
    const id = s === TOWER_SPOTS.length ? RANGE.cores + team : base + s;
    if (w.alive[id] === 0 || (s < TOWER_SPOTS.length && TOWER_SPOTS[s].tier !== 'inner')) continue;
    for (let e = RANGE.heroes; e < RANGE.minions; e++) if (seenEnemy(w, team, e) && dist2(w.x[e], w.y[e], w.x[id], w.y[id]) <= r2) return id;
  }
  return -1;
}

/** Enemy heroes `team` can see within `r` of (x, y). */
function enemiesNear(w: World, team: number, x: number, y: number, r: number): number {
  let n = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) if (seenEnemy(w, team, e) && dist2(w.x[e], w.y[e], x, y) <= r * r) n++;
  return n;
}

/** The ping slot 0 sends this think, or null. */
export function pingerPing(m: MatchHandle, pm: PingerMem): Command | null {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const h = HUMAN_SLOT;
  if (w.alive[h] === 0 || pm.sent >= PING.maxPerMatch || tick - pm.last < PING.minGap) return null;
  const team = w.team[h];
  const send = (kind: number, x: number, y: number, id: number, cd: number): Command => {
    pm.next[kind] = tick + cd;
    pm.last = tick;
    pm.sent++;
    if (SELF_KINDS.includes(kind)) {
      pm.mine.kind = kind;
      pm.mine.until = tick + (kind === PING_KIND.FallBack ? PING.fallBackTicks : PING.orderTicks);
      pm.mine.x = x;
      pm.mine.y = y;
      pm.mine.target = id;
    }
    return { op: Op.Ping, kind, x, y, id };
  };
  const ready = (kind: number): boolean => tick >= pm.next[kind] && ((PINGER.kinds >> kind) & 1) === 1;
  // Fall back: outnumbered around slot 0 with an ally in the fight (save the ally).
  if (ready(PING_KIND.FallBack)) {
    const x = w.x[h];
    const y = w.y[h];
    const foes = enemiesNear(w, team, x, y, PINGER.fightRange);
    if (foes > 0 && allyNear(w, team, x, y, PINGER.fightRange) && foes > alliesNear(w, team, x, y, PINGER.fightRange)) {
      return send(PING_KIND.FallBack, x, y, NO_TARGET, PING.fallBackTicks);
    }
  }
  // Defend base: raiders at an own inner tower or the core, and no ally near it yet.
  const raided = ready(PING_KIND.Defend) ? raidedBase(w, team) : -1;
  if (raided >= 0 && !allyNear(w, team, w.x[raided], w.y[raided], PINGER.farRange)) {
    return send(PING_KIND.Defend, w.x[raided], w.y[raided], NO_TARGET, PING.orderTicks);
  }
  // Take Pudding: once per spawn, the whole team healthy and at most one enemy hero in view at it.
  const pud = RANGE.pudding;
  const spawns = w.globals[G.PudSpawns];
  if (
    ready(PING_KIND.Pudding) &&
    w.globals[G.PudState] === PUD_STATE.Wild &&
    w.alive[pud] === 1 &&
    pm.pudSpawn !== spawns &&
    hpBp(w, h) >= PINGER.groupHpBp &&
    healthy(w, team) &&
    enemiesNear(w, team, w.x[pud], w.y[pud], PINGER.farRange) <= 1
  ) {
    pm.pudSpawn = spawns;
    return send(PING_KIND.Pudding, w.x[pud], w.y[pud], NO_TARGET, PING.orderTicks);
  }
  // Focus hero: slot 0 hits a hurt enemy hero with an ally close to it.
  const t = w.target[h];
  if (ready(PING_KIND.Focus) && t >= 0 && t < CAPS.heroes && seenEnemy(w, team, t) && hpBp(w, t) < PINGER.focusHpBp && allyNear(w, team, w.x[t], w.y[t], PINGER.focusRange)) {
    return send(PING_KIND.Focus, w.x[t], w.y[t], t, PING.focusTicks);
  }
  // Push: two enemy heroes down, slot 0 healthy in a lane: the whole team pushes that lane.
  const lane = w.y[h] >= MAP.height >> 1 ? PING_KIND.PushSunny : PING_KIND.PushPuddle;
  if (ready(lane) && enemiesDown(w, team) >= PINGER.pushDown && hpBp(w, h) >= PINGER.groupHpBp && nearLane(w.x[h], w.y[h], BOT_AI.leashLane)) {
    pm.next[PING_KIND.PushSunny + PING_KIND.PushPuddle - lane] = tick + PING.orderTicks;
    return send(lane, w.x[h], w.y[h], NO_TARGET, PING.orderTicks);
  }
  // Group on me: an enemy hero is down, slot 0 is healthy in a lane and an ally is far away (push the numbers).
  if (ready(PING_KIND.Group) && enemiesDown(w, team) > 0 && hpBp(w, h) >= PINGER.groupHpBp && nearLane(w.x[h], w.y[h], BOT_AI.leashLane) && allyFar(w, team)) {
    return send(PING_KIND.Group, w.x[h], w.y[h], NO_TARGET, PING.orderTicks);
  }
  return null;
}

/** Enemy heroes of `team` dead now (the scoreboard shows it). */
function enemiesDown(w: World, team: number): number {
  let n = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) if (w.team[e] !== team && w.alive[e] === 0) n++;
  return n;
}

/** Heroes of `team` alive within `r` of (x, y), slot 0 included. */
function alliesNear(w: World, team: number, x: number, y: number, r: number): number {
  let n = 0;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) if (w.team[id] === team && w.alive[id] === 1 && dist2(w.x[id], w.y[id], x, y) <= r * r) n++;
  return n;
}

/** An allied bot alive within `r` of (x, y). */
function allyNear(w: World, team: number, x: number, y: number, r: number): boolean {
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (id === HUMAN_SLOT || w.team[id] !== team || w.alive[id] === 0) continue;
    if (dist2(w.x[id], w.y[id], x, y) <= r * r) return true;
  }
  return false;
}

/** Both allied bots alive above PINGER.groupHpBp. */
function healthy(w: World, team: number): boolean {
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (id === HUMAN_SLOT || w.team[id] !== team) continue;
    if (w.alive[id] === 0 || hpBp(w, id) < PINGER.groupHpBp) return false;
  }
  return true;
}

/** An allied bot alive further than PINGER.farRange from slot 0. */
function allyFar(w: World, team: number): boolean {
  const r2 = PINGER.farRange * PINGER.farRange;
  for (let id = RANGE.heroes; id < RANGE.minions; id++) {
    if (id === HUMAN_SLOT || w.team[id] !== team || w.alive[id] === 0) continue;
    if (dist2(w.x[id], w.y[id], w.x[HUMAN_SLOT], w.y[HUMAN_SLOT]) > r2) return true;
  }
  return false;
}
