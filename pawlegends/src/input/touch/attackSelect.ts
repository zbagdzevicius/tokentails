/**
 * Hold-to-select on the touch Attack button (founder ask, Wild Rift style; original implementation). A quick tap keeps
 * the smart auto-target (attackPreview). Pressing and holding shows the enemies within the acquire reach; dragging the
 * thumb off the button points a direction and the selection snaps to the enemy closest to it (an enemy hero wins over a
 * minion or structure unless the thumb points right at that one); releasing locks the selection (PickLock) and sends
 * Attack{id} on it; dragging back to where the thumb landed (the inner ring) cancels. Client only: it only decides which id an existing
 * Attack command carries (no sim change). Floats are fine here (never in the replay).
 */
import { ATTACK_SEEK_MM, edgeGap, isEnemy, type Unit } from '../targeting';
import { LOCK } from './assist';

export const ATK_SELECT = Object.freeze({
  /** A held (not dragged) Attack button shows the candidates after this long (ms). */
  holdMs: 200,
  /**
   * A press becomes a selection drag past this many px (a release inside it is a tap). Wider than the cancel zone
   * (backPx), so a thumb that slips while spamming Attack never lands straight on the red cancel ring.
   */
  dragPx: 32,
  /** A drag that comes back within this many px of where the thumb landed cancels the selection. */
  backPx: 24,
  /**
   * The acquire reach: this far (mm, edge to edge) past the hero's attack range, but never shorter than the Attack
   * tap's own walk-in (ATTACK_SEEK_MM: every unit the ATK ring can show is offered, so a melee hero sweeping toward a
   * ringed unit 6 m away finds it) and never past the lock range (LOCK.rangeMm). See selectReach.
   */
  reachMm: 2500,
  /** Hysteresis: the unit already selected stays a candidate this much (mm) past the reach, so it never flickers off. */
  keepMm: 1500,
  /** At most this many candidates are highlighted (heroes first, then the nearest others). */
  max: 6,
  /** An enemy hero within this angle (rad) of the pointed direction wins over any non-hero not pointed right at. */
  heroCone: (Math.PI * 50) / 180,
  /** A minion, monster or structure within this angle (rad) of the direction counts as pointed at. */
  point: (Math.PI * 8) / 180,
  /** Two candidates this close in angle (rad) tie: the nearer one wins. */
  tie: (Math.PI * 3) / 180,
});

/** V20-CHASE.md I1: edge to edge (both bodies), as the sim measures attack range. */
const edge = (u: Unit, me: { x: number; y: number }): number => edgeGap(me, u);

/** Absolute angle between two directions (rad), 0..π. */
export function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/** The selector's reach (mm, edge to edge) for a basic attack `range`: range + reachMm, at least the tap's walk-in, at most LOCK.rangeMm. */
export function selectReach(range: number): number {
  return Math.min(LOCK.rangeMm, Math.max(ATTACK_SEEK_MM, range + ATK_SELECT.reachMm));
}

/**
 * The enemies the selector offers: attackable, alive, within selectReach(`range`) edge to edge (the unit
 * already selected, `keep`, ATK_SELECT.keepMm further: a lane fight at the reach edge must not flicker the selection
 * off just as the thumb lets go); every hero in reach first (nearest first), then the nearest others, at most
 * ATK_SELECT.max.
 */
export function selectCandidates(units: readonly Unit[], me: Unit, myTeam: number, range: number, keep: number | null = null): Unit[] {
  const reach = selectReach(range);
  const inReach = units.filter((u) => u.id !== me.id && isEnemy(u, myTeam) && edge(u, me) <= reach + (u.id === keep ? ATK_SELECT.keepMm : 0));
  inReach.sort((a, b) => (a.kind === 'hero' ? 0 : 1) - (b.kind === 'hero' ? 0 : 1) || edge(a, me) - edge(b, me));
  return inReach.slice(0, ATK_SELECT.max);
}

/**
 * The candidate the thumb points at: `angle` is the drag direction in sim space (rad). The candidate with the smallest
 * angle gap wins (a near tie goes to the nearer one); an enemy hero within ATK_SELECT.heroCone wins over it unless that
 * one is a non-hero pointed right at (within ATK_SELECT.point) and closer in angle than the hero. Null with no candidates.
 */
export function snapTarget(cands: readonly Unit[], me: { x: number; y: number }, angle: number): number | null {
  let best: Unit | null = null;
  let bestGap = Infinity;
  let hero: Unit | null = null;
  let heroGap = Infinity;
  const better = (u: Unit, gap: number, cur: Unit | null, curGap: number): boolean =>
    !cur || gap < curGap - ATK_SELECT.tie || (gap <= curGap + ATK_SELECT.tie && edge(u, me) < edge(cur, me));
  for (const u of cands) {
    const gap = angleGap(Math.atan2(u.y - me.y, u.x - me.x), angle);
    if (better(u, gap, best, bestGap)) {
      best = u;
      bestGap = gap;
    }
    if (u.kind === 'hero' && better(u, gap, hero, heroGap)) {
      hero = u;
      heroGap = gap;
    }
  }
  if (!best) return null;
  if (best.kind === 'hero' || !hero || heroGap > ATK_SELECT.heroCone) return best.id;
  // a hero in the cone wins, unless the thumb points right at the minion or structure (and the hero is clearly off it)
  return bestGap <= ATK_SELECT.point && heroGap > bestGap + ATK_SELECT.tie ? best.id : hero.id;
}

/**
 * What a release locks: the selection the last step highlighted (`sel`), else, when that step found nothing (the wave
 * moved off the thumb's line, a unit left the snapshot for a frame), the last unit the drag highlighted (`last`), as
 * long as it is still a living enemy in the snapshot; null when neither is (the release then cancels). The release
 * never re-picks from where the thumb lifted, so it never swaps to a unit the player was not shown.
 */
export function releasePick(sel: number | null, last: number | null, units: readonly Unit[], myTeam: number): number | null {
  for (const id of [sel, last]) {
    if (id === null) continue;
    const u = units.find((q) => q.id === id);
    if (u && isEnemy(u, myTeam)) return id;
  }
  return null;
}

/** Is the drag (dx, dy px from where the thumb landed) back there (cancel), past the drag threshold, or neither? */
export function dragZone(dx: number, dy: number, dragging: boolean): 'press' | 'aim' | 'cancel' {
  const d = Math.hypot(dx, dy);
  if (!dragging) return d > ATK_SELECT.dragPx ? 'aim' : 'press';
  return d <= ATK_SELECT.backPx ? 'cancel' : 'aim';
}

/**
 * The unit chosen with the selector (any attackable enemy, hero or not): it wins the Attack button and the idle
 * auto-attack while it holds. It lets go after LOCK.ms, when the unit dies or leaves the snapshot, or once it was
 * within `breakMm` of the player and then got further than that (as TargetLock does for heroes).
 */
export class PickLock {
  id: number | null = null;
  private since = 0;
  private reached = false;

  set(id: number, now: number): void {
    this.id = id;
    this.since = now;
    this.reached = false;
  }

  clear(): void {
    this.id = null;
  }

  check(units: readonly Unit[], me: Unit | null, myTeam: number, now: number, breakMm = Infinity): number | null {
    if (this.id === null) return null;
    const u = units.find((q) => q.id === this.id);
    if (!me || me.state === 'dead' || !u || !isEnemy(u, myTeam) || now - this.since >= LOCK.ms || Math.hypot(u.x - me.x, u.y - me.y) > LOCK.rangeMm) {
      this.clear();
      return null;
    }
    const d = edge(u, me);
    if (d <= breakMm) this.reached = true;
    else if (this.reached) {
      this.clear();
      return null;
    }
    return this.id;
  }

  /** Share of the lock time left, 0..1 (the Attack button's draining ring). */
  left(now: number): number {
    return this.id === null ? 0 : Math.max(0, Math.min(1, 1 - (now - this.since) / LOCK.ms));
  }
}
