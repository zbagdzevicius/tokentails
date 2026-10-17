/**
 * Orders → sim commands (POC.md §9, §11.3). The input devices say what the player wants (move here, attack that,
 * cast Q there); this turns it into `Command`s in sim units and handles "out of range walks in, then casts" for
 * point and unit aims. The sim stays the judge: it quantises, checks cooldowns and ranges, and may ignore a command.
 */
import { MAP } from '../data/map';
import { NO_TARGET, Op, type CastSlot, type Command, type HeroId, type TalentTier, type TrickId } from '../sim/api';
import { aimFor, trickAim, ULT_LEVEL, type AimSpec } from './abilities';
import { BODY_MM, type Unit } from './targeting';
import { cellOf, centreX, centreY, createGrid, snapCell, type NavGrid } from '../sim/map/grid';

let walls: NavGrid | null = null;

/**
 * A move goal the sim can reach (input side, static walls only): the sim snaps a blocked goal to walkable ground
 * within 6 m (NAV.snapCells) and ignores it beyond that, so a right-click deep into a hedge did nothing. Here the
 * goal walks back along the line toward the hero until the sim's snap would land, like LoL's "walk to the nearest
 * reachable point". Pure apart from the cached wall grid; floats are fine (the command carries integers).
 */
export function reachableGoal(fromX: number, fromY: number, x: number, y: number): { x: number; y: number } {
  walls ??= createGrid();
  if (snapCell(walls, cellOf(x, y)) >= 0) return { x, y };
  const d = Math.hypot(x - fromX, y - fromY);
  const steps = Math.max(1, Math.ceil(d / 500));
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const px = x + (fromX - x) * t;
    const py = y + (fromY - y) * t;
    const c = snapCell(walls, cellOf(px, py));
    if (c >= 0) return { x: centreX(c), y: centreY(c) };
  }
  return { x, y };
}

export interface OrderEnv {
  send(cmd: Command): void;
  /** Current units (interpolated, mm). */
  units(): readonly Unit[];
  meId: number;
  hero: HeroId;
  trick: TrickId;
  /** Ticks left per slot (Q W E R Trick), or null when the sim does not report them. */
  cooldowns(): readonly number[] | null;
  level(): number;
  nowMs(): number;
}

export type CastIndex = CastSlot | 4;

interface Pending {
  slot: CastIndex;
  x: number;
  y: number;
  id: number;
  since: number;
  lastMove: number;
}

const clampX = (x: number): number => Math.max(0, Math.min(MAP.width, Math.round(x)));
const clampY = (y: number): number => Math.max(0, Math.min(MAP.height, Math.round(y)));
const WALK_IN_TIMEOUT_MS = 6000;
const REMOVE_MS = 220;

export class Orders {
  private pending: Pending | null = null;
  /** Count of commands sent (tests, analytics). */
  sent = 0;
  /** Last order kind, for tips. */
  last: Command['op'] | 0 = 0;

  constructor(private readonly env: OrderEnv) {}

  /** The last ops sent, newest last (at most 16; tests and the e2e telemetry). */
  readonly recent: number[] = [];
  /** Cast and trick commands sent. */
  casts = 0;

  private emit(cmd: Command): void {
    this.sent++;
    this.last = cmd.op;
    this.recent.push(cmd.op);
    if (cmd.op === Op.Cast || cmd.op === Op.Trick) this.casts++;
    if (this.recent.length > 16) this.recent.shift();
    this.env.send(cmd);
  }

  private me(): Unit | null {
    return this.env.units().find((u) => u.id === this.env.meId) ?? null;
  }

  aimSpec(slot: CastIndex): AimSpec {
    return slot === 4 ? trickAim(this.env.trick) : aimFor(this.env.hero, slot);
  }

  /** Ready = off cooldown, unlocked (R from level 4), hero alive. */
  ready(slot: CastIndex): boolean {
    const me = this.me();
    if (!me || me.state === 'dead') return false;
    if (slot === 3 && this.env.level() < ULT_LEVEL) return false;
    const cd = this.env.cooldowns();
    return !cd || (cd[slot] ?? 0) === 0;
  }

  move(x: number, y: number): void {
    this.pending = null;
    const me = this.env.units().find((u) => u.id === this.env.meId);
    const g = me ? reachableGoal(me.x, me.y, clampX(x), clampY(y)) : { x, y };
    this.emit({ op: Op.Move, x: clampX(g.x), y: clampY(g.y) });
  }

  attackMove(x: number, y: number): void {
    this.pending = null;
    this.emit({ op: Op.AttackMove, x: clampX(x), y: clampY(y) });
  }

  attack(id: number): void {
    this.pending = null;
    this.emit({ op: Op.Attack, id });
  }

  stop(): void {
    this.pending = null;
    this.emit({ op: Op.Stop });
  }

  nap(): void {
    this.pending = null;
    this.emit({ op: Op.Nap });
  }

  talent(tier: TalentTier, choice: 0 | 1): void {
    this.emit({ op: Op.Talent, tier, choice });
  }

  /** Is a walk-in cast in progress? */
  get walkingIn(): CastIndex | null {
    return this.pending?.slot ?? null;
  }

  cancelWalkIn(): void {
    this.pending = null;
  }

  /**
   * Cast `slot` at a point (mm) and optional target id. Self casts go at once; directions go at once along the
   * aim; point and unit aims out of range walk in first. Returns false when the ability is not ready.
   */
  cast(slot: CastIndex, x: number, y: number, id: number = NO_TARGET): boolean {
    if (!this.ready(slot)) return false;
    const me = this.me();
    if (!me) return false;
    const aim = this.aimSpec(slot);
    if (aim.kind === 'self') {
      this.fire(slot, me.x, me.y, NO_TARGET);
      return true;
    }
    if (aim.kind === 'dir') {
      let px = x;
      let py = y;
      if (Math.hypot(px - me.x, py - me.y) < 200) {
        px = me.x + aim.range;
        py = me.y;
      }
      this.fire(slot, px, py, NO_TARGET);
      return true;
    }
    if (aim.kind === 'unit') {
      const t = this.env.units().find((u) => u.id === id);
      if (!t) return false;
      if (this.inReach(me, t.x, t.y, aim.range + BODY_MM[t.kind])) this.fire(slot, t.x, t.y, t.id);
      else this.walkIn(slot, t.x, t.y, t.id);
      return true;
    }
    // point
    if (this.inReach(me, x, y, aim.range)) this.fire(slot, x, y, NO_TARGET);
    else this.walkIn(slot, x, y, NO_TARGET);
    return true;
  }

  private inReach(me: Unit, x: number, y: number, r: number): boolean {
    return Math.hypot(x - me.x, y - me.y) <= r;
  }

  private fire(slot: CastIndex, x: number, y: number, id: number): void {
    this.pending = null;
    if (slot === 4) this.emit({ op: Op.Trick, x: clampX(x), y: clampY(y) });
    else this.emit({ op: Op.Cast, slot, x: clampX(x), y: clampY(y), id });
  }

  private walkIn(slot: CastIndex, x: number, y: number, id: number): void {
    const now = this.env.nowMs();
    this.pending = { slot, x, y, id, since: now, lastMove: now };
    this.emit({ op: Op.Move, x: clampX(x), y: clampY(y) });
  }

  /** Per frame: finish or refresh a walk-in cast. */
  update(): void {
    const p = this.pending;
    if (!p) return;
    const now = this.env.nowMs();
    const me = this.me();
    if (!me || me.state === 'dead' || now - p.since > WALK_IN_TIMEOUT_MS || !this.ready(p.slot)) {
      this.pending = null;
      return;
    }
    const aim = this.aimSpec(p.slot);
    let tx = p.x;
    let ty = p.y;
    let reach = aim.range;
    if (aim.kind === 'unit') {
      const t = this.env.units().find((u) => u.id === p.id && u.state !== 'dead');
      if (!t) {
        this.pending = null;
        return;
      }
      tx = t.x;
      ty = t.y;
      p.x = tx;
      p.y = ty;
      reach += BODY_MM[t.kind];
    }
    if (this.inReach(me, tx, ty, reach)) {
      this.fire(p.slot, tx, ty, p.id);
      return;
    }
    if (now - p.lastMove > REMOVE_MS) {
      p.lastMove = now;
      this.emit({ op: Op.Move, x: clampX(tx), y: clampY(ty) });
      this.pending = p;
    }
  }
}
