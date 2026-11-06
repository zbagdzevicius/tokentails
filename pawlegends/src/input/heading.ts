/**
 * Heading casts (founder: "flash must go where we are heading, no friction"). A tap on a mobility blink or escape dash
 * (AimSpec.heading: Pounce, Avietė's Live Wire, Clem's Tumble, Bengas's Camellia Hop, Gabė's Chase the Wind, Duchess's
 * Cushion Glide) goes the FULL distance along where the player is heading: the held joystick, else the hero's movement,
 * else its facing. Never at a smart target, never a shortened point.
 *
 * Input side only. The sim stays the judge: Pounce and Live Wire are `Aim.Dir` with reach 0 in the sim and `blink()`
 * clamps any point to the blink distance, and a dash only reads the angle, so the command carries a point past the
 * range (HEADING_OVERSHOOT_MM). The sim then lands the full distance from where the hero really is at that tick (the
 * drawn hero trails the sim a little while running, so a point at exactly the range would land short), and a talent
 * that lengthens the blink (Long Wire) is honoured without a client copy of the number.
 *
 * `landing` mirrors the sim's blink / dash clip (effects/blink.ts, effects/dash.ts clipTravel) on the client's wall
 * grid, for the ghost marker only. It cannot see arena tethers or a structure destroyed mid-match; the sim decides.
 */
import { EFFECTS } from '../data/effects';
import { MAP } from '../data/map';
import { iatan2, icos, idiv, isin, isqrt, TRIG_ONE } from '../sim/fixed';
import { cellOf, createGrid, walkable, type NavGrid } from '../sim/map/grid';
import type { AimSpec } from './abilities';

/** How far past the range (mm) a heading cast's command point goes (the sim clamps it back to the real distance). */
export const HEADING_OVERSHOOT_MM = 3000;
/** Movement samples: the window (ms) the velocity is read over, and the least travel (mm) that counts as moving. */
export const MOTION = Object.freeze({ windowMs: 250, minMm: 120, jumpMm: 1500 });
/** A recent move order counts as the heading this long (ms) after it went, while the hero is moving. */
export const MOVE_ORDER_MS = 700;

let walls: NavGrid | null = null;

/**
 * The hero's movement direction from its drawn positions (rad, sim convention), or null when it stands still. A jump
 * longer than MOTION.jumpMm in one sample (a blink, a respawn, Nap's trip home) starts the window again.
 */
export class MotionHeading {
  private xs: number[] = [];
  private ys: number[] = [];
  private ts: number[] = [];

  sample(x: number, y: number, now: number): void {
    const n = this.ts.length;
    if (n > 0 && Math.hypot(x - this.xs[n - 1], y - this.ys[n - 1]) > MOTION.jumpMm) this.reset();
    this.xs.push(x);
    this.ys.push(y);
    this.ts.push(now);
    while (this.ts.length > 2 && now - this.ts[1] >= MOTION.windowMs) {
      this.xs.shift();
      this.ys.shift();
      this.ts.shift();
    }
  }

  reset(): void {
    this.xs.length = 0;
    this.ys.length = 0;
    this.ts.length = 0;
  }

  /** The direction of travel over the last MOTION.windowMs, or null (standing, or too little data). */
  angle(now: number): number | null {
    const n = this.ts.length;
    if (n < 2 || now - this.ts[n - 1] > MOTION.windowMs) return null;
    const dx = this.xs[n - 1] - this.xs[0];
    const dy = this.ys[n - 1] - this.ys[0];
    return Math.hypot(dx, dy) >= MOTION.minMm ? Math.atan2(dy, dx) : null;
  }
}

export interface HeadingInputs {
  /** The held joystick's direction (rad), or null. */
  stick: number | null;
  /** The hero's movement direction (MotionHeading), or null. */
  motion: number | null;
  /** The newest move order's goal while the hero is still walking to it, or null. */
  moveGoal: { x: number; y: number } | null;
  /** The hero's facing (rad). */
  facing: number;
}

/** Where the player is heading (rad): the joystick, else the movement, else the move order, else the facing. */
export function headingAngle(me: { x: number; y: number }, h: HeadingInputs): number {
  if (h.stick !== null) return h.stick;
  if (h.motion !== null) return h.motion;
  const g = h.moveGoal;
  if (g && Math.hypot(g.x - me.x, g.y - me.y) > MOTION.minMm) return Math.atan2(g.y - me.y, g.x - me.x);
  return Number.isFinite(h.facing) ? h.facing : 0;
}

/**
 * The command point (mm) of a heading cast from `me` along `angle`: the range plus HEADING_OVERSHOOT_MM, kept on the
 * map along the same ray (the command clamps x and y to the map, which would bend the direction at an edge).
 */
export function headingPoint(aim: AimSpec, me: { x: number; y: number }, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let d = aim.range + HEADING_OVERSHOOT_MM;
  // the furthest distance along the ray that stays inside [0, width] × [0, height]
  if (c > 1e-9) d = Math.min(d, (MAP.width - me.x) / c);
  else if (c < -1e-9) d = Math.min(d, -me.x / c);
  if (s > 1e-9) d = Math.min(d, (MAP.height - me.y) / s);
  else if (s < -1e-9) d = Math.min(d, -me.y / s);
  d = Math.max(0, d);
  // never closer than 200 mm: Orders reads a direction that close to the hero as "no direction"
  if (d < 250) d = 250;
  return { x: me.x + c * d, y: me.y + s * d };
}

/**
 * Where a heading cast along `angle` lands (mm), the sim's way on the client's walls: the command point
 * (headingPoint, rounded and kept on the map like Orders does), then effects/blink.ts for a blink (`point` aims: up to
 * the range toward the point; a free destination is reached even across a wall, a blocked one stops at the last free
 * point on the way) or effects/dash.ts for a dash (`dir` aims: the range along the point's angle, stopping at the
 * first wall). For the ghost marker and the aim preview only.
 */
export function landing(aim: AimSpec, me: { x: number; y: number }, angle: number): { x: number; y: number } {
  walls ??= createGrid();
  const p = headingPoint(aim, me, angle);
  const ax = Math.round(me.x);
  const ay = Math.round(me.y);
  const tx = Math.max(0, Math.min(MAP.width, Math.round(p.x)));
  const ty = Math.max(0, Math.min(MAP.height, Math.round(p.y)));
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

/** effects/dash.ts clipTravel without the arena: clamp to the map, cut at the first blocked cell (EFFECTS.wallStep). */
function clip(g: NavGrid, ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  const tx = Math.max(0, Math.min(MAP.width, bx));
  const ty = Math.max(0, Math.min(MAP.height, by));
  if (!walkable(g, cellOf(ax, ay))) return { x: tx, y: ty };
  const dx = tx - ax;
  const dy = ty - ay;
  const len = isqrt(dx * dx + dy * dy);
  const n = idiv(len, EFFECTS.wallStep) + 1;
  for (let k = 1; k <= n; k++) {
    const sx = ax + idiv(dx * k, n);
    const sy = ay + idiv(dy * k, n);
    if (!walkable(g, cellOf(sx, sy))) return { x: ax + idiv(dx * (k - 1), n), y: ay + idiv(dy * (k - 1), n) };
  }
  return { x: tx, y: ty };
}
