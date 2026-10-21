/**
 * Catnip Bushes and what each team sees (POC.md §7.3, §15 item 9). No fog in the POC: everything is visible except
 *
 * - a unit in a bush, unless an enemy unit is within BRUSH_REVEAL_MM or in the same bush;
 * - a stealthed unit, unless an enemy unit is within EFFECTS.stealthReveal;
 *
 * and a revealed (`mark`) unit is visible regardless. `refreshVision` writes the result into `w.seen` (bit t = team t
 * sees it); `snapshot(team)` and every targeting check read only that, so bots and auto-attacks can never act on a
 * unit the team's snapshot leaves out. Adding the MVP fog grid changes `hiddenFrom` only.
 */
import { EFFECTS } from '../../data/effects';
import { BRUSH_REVEAL_MM, BUSHES, mirrorX } from '../../data/map';
import { dist2 } from '../fixed';
import { Buff, FM, Kind, RANGE, SEEN_ALL, TEAM_NEUTRAL, type World } from '../world';

/** Bush index at (x, y): 0..n−1 Purrhaven side, n..2n−1 the mirrored Woof side; −1 outside. */
export function bushAt(x: number, y: number): number {
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < BUSHES.length; k++) {
      const b = BUSHES[k];
      const cx = side === 0 ? b.x : mirrorX(b.x);
      if (Math.abs(x - cx) * 2 <= b.w && Math.abs(y - b.y) * 2 <= b.h) return side * BUSHES.length + k;
    }
  }
  return -1;
}

/** Is `id` hidden from `team` now? */
function hiddenFrom(w: World, id: number, team: number): boolean {
  if (w.revealT[id] > 0) return false;
  const bush = w.bush[id];
  const stealthed = w.stealthT[id] > 0;
  if (bush < 0 && !stealthed) return false;
  const rb = BRUSH_REVEAL_MM * BRUSH_REVEAL_MM;
  const rs = EFFECTS.stealthReveal * EFFECTS.stealthReveal;
  let brushSeen = bush < 0;
  let stealthSeen = !stealthed;
  for (let e = 0; e < RANGE.end && !(brushSeen && stealthSeen); e++) {
    if (w.alive[e] === 0 || w.team[e] !== team || w.kind[e] === Kind.Fountain) continue;
    const d2 = dist2(w.x[e], w.y[e], w.x[id], w.y[id]);
    if (!brushSeen && (d2 <= rb || w.bush[e] === bush)) brushSeen = true;
    if (!stealthSeen && d2 <= rs) stealthSeen = true;
  }
  return !(brushSeen && stealthSeen);
}

/** Refresh bush membership and `seen` for every unit. */
export function refreshVision(w: World): void {
  for (let id = 0; id < RANGE.end; id++) {
    if (w.kind[id] === 0) continue;
    w.bush[id] = w.alive[id] === 1 && (w.kind[id] === Kind.Hero || w.kind[id] === Kind.Minion) ? bushAt(w.x[id], w.y[id]) : -1;
  }
  for (let id = 0; id < RANGE.end; id++) {
    if (w.kind[id] === 0) continue;
    if (w.alive[id] === 0 || w.team[id] === TEAM_NEUTRAL) {
      w.seen[id] = SEEN_ALL;
      continue;
    }
    const own = w.team[id];
    const other = 1 - own;
    w.seen[id] = (1 << own) | (hiddenFrom(w, id, other) ? 0 : 1 << other);
  }
}

/** Can `team` see entity `id`? Neutral viewers (team 2) see everything. */
export const visibleTo = (w: World, id: number, team: number): boolean => team > 1 || ((w.seen[id] >> team) & 1) === 1;

/** Snapshot buff bits from the status timers (the Invulnerable bit belongs to the structure step). */
export function refreshFlags(w: World): void {
  for (let id = 0; id < RANGE.end; id++) {
    if (w.kind[id] === 0) continue;
    let b = w.buffs[id] & Buff.Invulnerable;
    if (w.alive[id] === 1) {
      if (w.stealthT[id] > 0) b |= Buff.Stealth;
      if (w.untargT[id] > 0) b |= Buff.Untargetable;
      if (w.ccImmT[id] > 0) b |= Buff.Purrified;
      if (w.stunT[id] > 0) b |= Buff.Stunned;
      if (w.rootT[id] > 0) b |= Buff.Rooted;
      if (w.fearT[id] > 0) b |= Buff.Feared;
      if (w.slowT[id] > 0) b |= Buff.Slowed;
      if (w.hasteT[id] > 0) b |= Buff.Hasted;
      if (w.bush[id] >= 0) b |= Buff.InBrush;
      if (w.revealT[id] > 0) b |= Buff.Marked;
      if (w.tether[id] >= 0) b |= Buff.Tethered;
      if (w.fmKind[id] === FM.Knock) b |= Buff.Stunned;
      let shield = w.shield[id];
      if (id < RANGE.minions) {
        shield += w.kHonour[id];
        if (w.napT[id] > 0 || (w.castPhase[id] === 2 && w.castT[id] > 0)) b |= Buff.Channeling;
        if (w.kWT[id] > 0) b |= Buff.Blocking; // Clem's The Stand, Sir Brutus's Front Guard
        if (w.zoomT[id] > 0) b |= Buff.Zoomies;
        if (w.frenzyT[id] > 0) b |= Buff.Frenzy;
        if (w.nineT[id] > 0) b |= Buff.NineLives;
        if (w.packT[id] > 0) b |= Buff.Pack;
      }
      if (shield > 0) b |= Buff.Shielded;
    }
    w.buffs[id] = b;
  }
}
