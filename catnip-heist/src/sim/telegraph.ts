/**
 * Sentry turn telegraph (render, audio and HUD helper; the sim itself does not use it).
 *
 * A turning sentry's facing is a pure function of the tick (`sentryFacing` in sim.ts), so the next
 * turn can be read off the schedule without touching the sim state or its hash. The renderer shows a
 * ghost cone in the next direction and the audio plays a tick for the last TELEGRAPH_TICKS before
 * each turn, so a player can see a sweep coming instead of being caught by it.
 *
 * Not imported by src/sim/server.ts, so the vendored backend sim does not change with it.
 */
import { type GuardDef, type GuardState, type LevelDef, type SimState, type Vec2i } from '../types';
import { NO_INPUT, SUBTILE } from '../types';
import { atCenter, centerOf, compileLevel, distanceField, lineOfSight, tileOf } from './grid';
import { catHidden, inCone, sentryFacing, sentryPeriod, stepSim } from './sim';

/**
 * How long before a sentry turn the warning shows: 36 ticks = 1.2 s at 30 Hz (was 24 = 0.8 s, too
 * short to plan a crossing in playtests).
 */
export const TELEGRAPH_TICKS = 36;

export interface SentryTurn {
  /** Ticks from `tick` until the facing changes (1 = it faces `next` on the next tick). */
  ticksLeft: number;
  /** Facing after the turn. */
  next: Vec2i;
}

/**
 * The next scheduled turn of a sentry after `tick`: the first later tick whose facing differs from
 * the facing at `tick`. Null for guards without a turn schedule (or a schedule that never turns).
 */
export function nextSentryTurn(def: GuardDef, tick: number): SentryTurn | null {
  const period = sentryPeriod(def);
  if (period === 0) return null;
  const now = sentryFacing(def, tick)!;
  // Walk the schedule from the segment that contains `tick`.
  const turns = def.turns!;
  let r = ((tick % period) + period) % period;
  let seg = 0;
  while (seg < turns.length - 1 && r >= turns[seg].ticks) {
    r -= turns[seg].ticks;
    seg++;
  }
  let left = turns[seg].ticks - r;
  for (let k = 1; k <= turns.length; k++) {
    const t = turns[(seg + k) % turns.length];
    if (t.facing.x !== now.x || t.facing.y !== now.y) return { ticksLeft: left, next: { x: t.facing.x, y: t.facing.y } };
    left += t.ticks;
  }
  return null;
}

/** True when the guard stands on its post on its schedule (the only time the schedule drives it). */
export function onSentryDuty(def: GuardDef, g: GuardState): boolean {
  if (sentryPeriod(def) === 0 || g.mode !== 'PATROL' || g.moving) return false;
  const post = centerOf(def.waypoints[0]);
  return g.pos.x === post.x && g.pos.y === post.y;
}

/**
 * Ticks until a sentry that is walking back to its post (after an investigation or an alert) gets
 * there and snaps to its scheduled facing, and that facing; null when it is not walking back, or
 * when it arrives already facing that way. Mirrors the sim: a guard finishes the tile move it is
 * in, walks the 4-neighbour BFS (plate doors count as closed) at SUBTILE / speed ticks per tile, and
 * takes the schedule's facing on the tick after it reaches the post centre.
 */
export function sentryReturnTurn(level: LevelDef, s: Pick<SimState, 'tick' | 'doorsOpen'>, def: GuardDef, g: GuardState): SentryTurn | null {
  if (sentryPeriod(def) === 0 || g.mode !== 'PATROL' || onSentryDuty(def, g)) return null;
  const c = compileLevel(level);
  const post = def.waypoints[0];
  const speed = Math.max(1, def.speed);
  let eta = 0;
  let from = tileOf(g.pos);
  if (!atCenter(g.pos)) {
    // Finishing the current tile move along `facing` (past the midpoint tileOf is already the target).
    const t = tileOf(g.pos);
    const c0 = centerOf(t);
    const leaving = (g.pos.x - c0.x) * g.facing.x + (g.pos.y - c0.y) * g.facing.y > 0;
    from = leaving ? { x: t.x + g.facing.x, y: t.y + g.facing.y } : t;
    const dest = centerOf(from);
    eta = Math.ceil((Math.abs(dest.x - g.pos.x) + Math.abs(dest.y - g.pos.y)) / speed);
  }
  const doors = s.doorsOpen.map((o, i) => o && level.doors[i].kind !== 'PLATE');
  const d = distanceField(c, post, doors)[from.y * c.w + from.x];
  if (d < 0) return null;
  eta += (d * SUBTILE) / speed + 1;
  const next = sentryFacing(def, s.tick + eta)!;
  // On its last step it faces along that step: no warning when the snap keeps that facing.
  if (d === 0 && next.x === g.facing.x && next.y === g.facing.y) return null;
  return { ticksLeft: eta, next: { x: next.x, y: next.y } };
}

/**
 * The next facing change of a sentry that the schedule decides: its next scheduled turn while it is
 * on duty, or the snap to its scheduled facing when it gets back to its post. Null otherwise.
 */
export function sentryTurnAhead(level: LevelDef, s: Pick<SimState, 'tick' | 'doorsOpen'>, gi: number, g: GuardState): SentryTurn | null {
  const def = level.guards[gi];
  if (!def || !g) return null;
  if (onSentryDuty(def, g)) return nextSentryTurn(def, s.tick);
  return sentryReturnTurn(level, s, def, g);
}

export interface SentryWarning extends SentryTurn {
  /** Index into level.guards / state.guards. */
  guard: number;
  /** 0 when the warning starts, 1 on the tick of the turn. */
  progress: number;
}

/** Sentries about to turn (within `lead` ticks) in this state, in guard order. */
export function sentryWarnings(level: LevelDef, s: Pick<SimState, 'tick' | 'guards' | 'doorsOpen'>, lead = TELEGRAPH_TICKS): SentryWarning[] {
  const out: SentryWarning[] = [];
  for (let gi = 0; gi < level.guards.length; gi++) {
    const g = s.guards[gi];
    if (!g) continue;
    const t = sentryTurnAhead(level, s, gi, g);
    if (!t || t.ticksLeft > lead) continue;
    out.push({ ...t, guard: gi, progress: 1 - (t.ticksLeft - 1) / lead });
  }
  return out;
}

/**
 * Warning for the parked cat: index of a guard that sees it now with one tile to spare, or will
 * see it after a telegraphed sentry turn; -1 when it is safe (or stunned, i.e. just respawned).
 */
export function partnerDanger(level: LevelDef, s: Pick<SimState, 'tick' | 'guards' | 'cats' | 'activeIndex' | 'doorsOpen'>): number {
  const cat = s.cats[s.activeIndex === 0 ? 1 : 0];
  if (!cat || catHidden(cat)) return -1;
  const c = compileLevel(level);
  const ct = tileOf(cat.pos);
  for (let gi = 0; gi < s.guards.length; gi++) {
    const g = s.guards[gi];
    const gt = tileOf(g.pos);
    if (inCone(g.pos, g.facing, cat.pos, g.visionTiles + 1) && lineOfSight(c, gt, ct, s.doorsOpen)) return gi;
    const t = sentryTurnAhead(level, s, gi, g);
    if (t && t.ticksLeft <= TELEGRAPH_TICKS && inCone(g.pos, t.next, cat.pos, g.visionTiles) && lineOfSight(c, gt, ct, s.doorsOpen)) return gi;
  }
  return -1;
}

/** How far ahead (ticks) the parked-cat warning looks for a guard walking into view: 2 s. */
export const PARTNER_LOOKAHEAD = 60;

/**
 * Early warning for the parked cat: runs the sim ahead from `s` with no input (the active cat
 * stands still) for up to `horizon` ticks and returns the first tick at which the PARKED cat would
 * be spotted, with the guard, or null when it stays unseen. Catches a patrol walking round a corner
 * towards the cat, which the cone test in partnerDanger only sees once it is already close.
 * Pure: `s` is not changed (the sim never mutates its input).
 */
export function partnerCatchAhead(level: LevelDef, s: SimState, horizon = PARTNER_LOOKAHEAD): { ticks: number; guard: number } | null {
  const idle = s.activeIndex === 0 ? 1 : 0;
  const cat = s.cats[idle];
  if (!cat || catHidden(cat) || s.won) return null;
  let cur = s;
  for (let k = 1; k <= horizon; k++) {
    cur = stepSim(level, cur, NO_INPUT);
    for (const e of cur.events) {
      if (e.type !== 'SPOTTED' || e.cat !== idle) continue;
      const gi = level.guards.findIndex((g) => g.id === e.id);
      return { ticks: k, guard: gi };
    }
    if (cur.won) return null;
  }
  return null;
}
