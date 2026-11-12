/**
 * Heading casts (founder: "flash must go where we are heading, no friction"). A tap on a mobility blink or escape dash
 * (AimSpec.heading: Pounce, Raspberry's Live Wire, Clem's Tumble, Bengal's Camellia Hop, Gabby's Chase the Wind, Duchess's
 * Cushion Glide) fires on the press and goes the FULL distance along where the player is heading: the held joystick,
 * else the hero's movement, else the way it last walked (a facing turned by an attack is not a heading), else its
 * facing. Never at a smart target, never a shortened point.
 *
 * Input side only. The sim stays the judge: Pounce and Live Wire are `Aim.Dir` with reach 0 in the sim and `blink()`
 * clamps any point to the blink distance, and a dash only reads the angle, so the command carries a point past the
 * range (HEADING_OVERSHOOT_MM). The sim then lands the full distance from where the hero really is at that tick (the
 * drawn hero trails it a little while running, so a point at exactly the range would land short), and a talent
 * that lengthens the blink (Long Wire) is honoured without a client copy of the number.
 *
 * `landing` mirrors the sim's blink / dash clip (effects/blink.ts, effects/dash.ts clipTravel) on the client's wall
 * grid, for the ghost marker and the run-on after the cast. It cannot see arena tethers or a structure destroyed
 * mid-match; the sim decides, and the touch input re-reads the sim's position once the cast shows up.
 */
import { EFFECTS } from '../data/effects';
import { MAP, NAV } from '../data/map';
import { iatan2, icos, idiv, isin, isqrt, TRIG_ONE } from '../sim/fixed';
import { cellOf, walkable, type NavGrid } from '../sim/map/grid';
import { clientGrid } from './navMirror';
import { quantize } from '../sim/commands';
import { Op } from '../sim/api';
import type { AimSpec } from './abilities';

/** How far past the range (mm) a heading cast's command point goes (the sim clamps it back to the real distance). */
export const HEADING_OVERSHOOT_MM = 3000;
/**
 * Movement samples: the window (ms) the velocity is read over, the least travel (mm) that counts as moving, a jump
 * between two samples that starts the window again, and the longest jump that still reads as a blink (its direction
 * is kept as the last heading).
 */
export const MOTION = Object.freeze({ windowMs: 250, minMm: 120, jumpMm: 1500, blinkMm: 8000 });
/** A recent move order counts as the heading this long (ms) after it went, while the hero is moving. */
export const MOVE_ORDER_MS = 700;


/**
 * The hero's movement direction from its drawn positions (rad, sim convention), or null when it stands still. A jump
 * longer than MOTION.jumpMm in one sample (a blink, a respawn, Nap's trip home) starts the window again.
 */
export class MotionHeading {
  private xs: number[] = [];
  private ys: number[] = [];
  private ts: number[] = [];
  /** The last direction the hero travelled (rad), kept while it stands (an attack turns the facing, not this). */
  private lastA: number | null = null;

  sample(x: number, y: number, now: number): void {
    const n = this.ts.length;
    const jump = n > 0 ? Math.hypot(x - this.xs[n - 1], y - this.ys[n - 1]) : 0;
    if (jump > MOTION.jumpMm) {
      // a blink or dash keeps its direction as the last heading; a longer jump (Nap's trip home) forgets it
      this.lastA = jump <= MOTION.blinkMm ? Math.atan2(y - this.ys[n - 1], x - this.xs[n - 1]) : null;
      this.reset();
    }
    this.xs.push(x);
    this.ys.push(y);
    this.ts.push(now);
    while (this.ts.length > 2 && now - this.ts[1] >= MOTION.windowMs) {
      this.xs.shift();
      this.ys.shift();
      this.ts.shift();
    }
    const a = this.angle(now);
    if (a !== null) this.lastA = a;
  }

  /** Start the sample window again (the last direction travelled is kept). */
  reset(): void {
    this.xs.length = 0;
    this.ys.length = 0;
    this.ts.length = 0;
  }

  /** Forget everything, the last direction too (death, respawn). */
  clear(): void {
    this.reset();
    this.lastA = null;
  }

  /** The direction of travel over the last MOTION.windowMs, or null (standing, or too little data). */
  angle(now: number): number | null {
    const n = this.ts.length;
    if (n < 2 || now - this.ts[n - 1] > MOTION.windowMs) return null;
    const dx = this.xs[n - 1] - this.xs[0];
    const dy = this.ys[n - 1] - this.ys[0];
    return Math.hypot(dx, dy) >= MOTION.minMm ? Math.atan2(dy, dx) : null;
  }

  /** The last direction the hero travelled (a blink counts), or null when it has not moved since clear(). */
  last(): number | null {
    return this.lastA;
  }
}

export interface HeadingInputs {
  /** The held joystick's direction (rad), or null. */
  stick: number | null;
  /** The hero's movement direction (MotionHeading), or null. */
  motion: number | null;
  /** The newest move order's goal while the hero is still walking to it, or null. */
  moveGoal: { x: number; y: number } | null;
  /** The last direction the hero travelled while it now stands (MotionHeading.last), or null. */
  lastMotion?: number | null;
  /** The hero's facing (rad). */
  facing: number;
}

/**
 * Where the player is heading (rad): the joystick, else the movement, else the move order, else the way the hero last
 * walked (standing and trading in lane, the facing points at the enemy just hit: a tap to escape must not blink
 * into it), else the facing.
 */
export function headingAngle(me: { x: number; y: number }, h: HeadingInputs): number {
  if (h.stick !== null) return h.stick;
  if (h.motion !== null) return h.motion;
  const g = h.moveGoal;
  if (g && Math.hypot(g.x - me.x, g.y - me.y) > MOTION.minMm) return Math.atan2(g.y - me.y, g.x - me.x);
  if (h.lastMotion !== undefined && h.lastMotion !== null && Number.isFinite(h.lastMotion)) return h.lastMotion;
  return Number.isFinite(h.facing) ? h.facing : 0;
}

/**
 * The command point (mm) of a heading cast from `me` along `angle`: the range plus HEADING_OVERSHOOT_MM. When the map
 * edge cuts the overshoot but not the landing, the point stops at the edge on the same ray (the command clamps x and
 * y to the map one by one, which would bend a landing that is on the map). When the landing itself would be off the
 * map, the point stays where it is and the command's clamp bends it, exactly like a drag cast: the hero slides along
 * the edge (blink() and dash() then clip to the map as for any point).
 */
export function headingPoint(aim: AimSpec, me: { x: number; y: number }, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const full = aim.range + HEADING_OVERSHOOT_MM;
  let edge = Infinity;
  // the furthest distance along the ray that stays inside [0, width] × [0, height]
  if (c > 1e-9) edge = Math.min(edge, (MAP.width - me.x) / c);
  else if (c < -1e-9) edge = Math.min(edge, -me.x / c);
  if (s > 1e-9) edge = Math.min(edge, (MAP.height - me.y) / s);
  else if (s < -1e-9) edge = Math.min(edge, -me.y / s);
  const d = edge >= aim.range ? Math.min(full, edge) : full;
  return { x: me.x + c * d, y: me.y + s * d };
}

/**
 * Where a heading cast along `angle` lands (mm), the sim's way on the client's walls: the command point
 * (headingPoint, rounded and kept on the map like Orders does, quantised like the sim's input), then effects/blink.ts for a blink (`point` aims: up to
 * the range toward the point; a free destination is reached even across a wall, a blocked one stops at the last free
 * point on the way) or effects/dash.ts for a dash (`dir` aims: the range along the point's angle, stopping at the
 * first wall). For the ghost marker and the aim preview only.
 */
export function landing(aim: AimSpec, me: { x: number; y: number }, angle: number): { x: number; y: number } {
  const walls = clientGrid();
  const p = headingPoint(aim, me, angle);
  const ax = Math.round(me.x);
  const ay = Math.round(me.y);
  // the point as the sim reads it: kept on the map like Orders does, then quantised (COORD_QUANTUM) like every command
  const q = quantize({ op: Op.Trick, x: Math.max(0, Math.min(MAP.width, Math.round(p.x))), y: Math.max(0, Math.min(MAP.height, Math.round(p.y))) }) as { x: number; y: number };
  const tx = q.x;
  const ty = q.y;
  let dx = tx - ax;
  let dy = ty - ay;
  if (aim.kind === 'point') {
    const d = isqrt(dx * dx + dy * dy);
    if (d > aim.range) {
      dx = idiv(dx * aim.range, d);
      dy = idiv(dy * aim.range, d);
    }
  } else {
    const a = dx === 0 && dy === 0 ? 0 : iatan2(dy, dx);
    dx = idiv(icos(a) * aim.range, TRIG_ONE);
    dy = idiv(isin(a) * aim.range, TRIG_ONE);
  }
  const bx = ax + dx;
  const by = ay + dy;
  if (aim.kind === 'point' && walkable(walls, cellOf(bx, by))) return { x: bx, y: by };
  return clip(walls, ax, ay, bx, by);
}

/**
 * Raspberry's Live Wire return (sim heroes/aviete.ts): within `returnTicks` of a Live Wire (or of Short Circuit), E
 * blinks her back to where she cast it from and the sim ignores the point. The client sees only its own cast
 * events, so it keeps the window and the return point itself: the press then shows the ghost at the return point and
 * the run goes on from there, never from a made-up landing ahead.
 */
export class ReturnWindow {
  private until = 0;
  private from: { x: number; y: number } | null = null;

  /** A cast that opens the window: from (x, y) (mm), open until `until` (ms). */
  open(x: number, y: number, until: number): void {
    this.from = { x, y };
    this.until = until;
  }

  close(): void {
    this.until = 0;
    this.from = null;
  }

  /** Where the next E returns to while the window is open at `now`, else null. */
  point(now: number): { x: number; y: number } | null {
    return now < this.until ? this.from : null;
  }
}

/**
 * effects/dash.ts clipTravel without the arena: clamp to the map, cut at the first blocked cell (EFFECTS.wallStep).
 * Sim v16 (MAP-GAPS B1): from a blocked start, stop at the first walkable sample every NAV.losStep, else stay.
 */
function clip(g: NavGrid, ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  const tx = Math.max(0, Math.min(MAP.width, bx));
  const ty = Math.max(0, Math.min(MAP.height, by));
  const dx = tx - ax;
  const dy = ty - ay;
  const len = isqrt(dx * dx + dy * dy);
  if (!walkable(g, cellOf(ax, ay))) {
    const ne = idiv(len, NAV.losStep) + 1;
    for (let k = 1; k <= ne; k++) {
      const sx = ax + idiv(dx * k, ne);
      const sy = ay + idiv(dy * k, ne);
      if (walkable(g, cellOf(sx, sy))) return { x: sx, y: sy };
    }
    return { x: ax, y: ay };
  }
  const n = idiv(len, EFFECTS.wallStep) + 1;
  for (let k = 1; k <= n; k++) {
    const sx = ax + idiv(dx * k, n);
    const sy = ay + idiv(dy * k, n);
    if (!walkable(g, cellOf(sx, sy))) return { x: ax + idiv(dx * (k - 1), n), y: ay + idiv(dy * (k - 1), n) };
  }
  return { x: tx, y: ty };
}
