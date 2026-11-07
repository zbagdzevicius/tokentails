/**
 * Orders → sim commands (POC.md §9, §11.3). The input devices say what the player wants (move here, attack that,
 * cast Q there); this turns it into `Command`s in sim units and handles "out of range walks in, then casts" for
 * point and unit aims. The sim stays the judge: it quantises, checks cooldowns and ranges, and may ignore a command.
 */
import { MAP } from '../data/map';
import { PING } from '../data/pings';
import { TICK_HZ } from '../data/timeline';
import { EFFECTS } from '../data/effects';
import { NO_TARGET, Op, type CastSlot, type Command, type HeroId, type SimEvent, type TalentTier, type TrickId } from '../sim/api';
import { aimFor, trickAim, ULT_LEVEL, type AimSpec } from './abilities';
import { BODY_MM, type Unit } from './targeting';
import { edgeGoal } from './touch/assist';
import { cellOf, centreX, centreY, createGrid, snapCell, walkable, type NavGrid } from '../sim/map/grid';

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

/** Is the ground clear (static walls) for `probe` mm from (x, y) along angle `a`? Sampled every 400 mm. */
function clearAlong(x: number, y: number, a: number, probe: number): boolean {
  walls ??= createGrid();
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  for (let d = 400; d <= probe; d += 400) {
    const px = x + cx * d;
    const py = y + cy * d;
    if (px < 0 || py < 0 || px >= MAP.width || py >= MAP.height || !walkable(walls, cellOf(px, py))) return false;
  }
  return true;
}

/**
 * Round 2 ("dragging up toward Sunny Lane walks into the trees beside the core and sticks there"): the joystick slides
 * along a wall. When the next `probe` mm along angle `a` hit a wall, the angle turns toward the open side in 20°
 * steps (up to 80°, the side nearer the stick first), so the input is projected onto the wall tangent instead of
 * pushing into it. Returns `a` when the way is clear or no side is.
 */
export function slideAngle(x: number, y: number, a: number, probe = 2400): number {
  if (clearAlong(x, y, a, probe)) return a;
  const step = Math.PI / 9;
  for (let k = 1; k <= 4; k++) {
    const l = a + step * k;
    const r = a - step * k;
    const lc = clearAlong(x, y, l, probe);
    const rc = clearAlong(x, y, r, probe);
    // both open: the side that stays open further (the wall's slope), else the left one
    if (lc && rc) return clearAlong(x, y, r, probe * 2) && !clearAlong(x, y, l, probe * 2) ? r : l;
    if (lc) return l;
    if (rc) return r;
  }
  return a;
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
  /** Sim v10 (GAPS B6): the hero took its level-6 shape branch, so a slot may aim differently. */
  branch?(): boolean;
  /** C2: a buffered cast ran out of time without going (the deny sound and flash belong here). */
  onDeny?(slot: CastIndex): void;
  /**
   * UX pass 2: the own hero in the NEWEST snapshot (the drawn frame trails it by the render lag, ~2 ticks): its
   * cooldowns and state. The flash reads readiness and busy from here, so a press is never held back by a stale
   * cooldown display or a windup the sim has already finished. Absent: the drawn frame (units, cooldowns).
   */
  simOwn?(): { cooldowns: readonly number[] | null; state: Unit['state'] } | null;
}

/**
 * FUN-PROGRESSION-V12 C2, the cast buffer (client only; the command format is unchanged). A cast pressed while the
 * hero is busy (winding up, dashing, a cast just sent and not seen yet) or within `nearReadyTicks` of the slot coming
 * off cooldown is kept (the newest wins) and sent as soon as the sim would take it, for up to `ms`. A sent cast the
 * sim did not take (no windup or cast event for it within `confirmMs`) is tried again inside the same window.
 */
export const CAST_BUFFER = Object.freeze({ ms: 400, nearReadyTicks: 3, confirmMs: 140, dashPadMs: 40 });

/**
 * The sim applies one non-move command a tick and the later one wins (sim/input.ts gateCommand; only a move gives way
 * to a cast). So a Stop (letting go of the joystick), an Attack or Nap sent close behind a cast could land in its
 * tick and eat it: the flash would never go. Such an order is held until the cast shows up in the sim's own events
 * (raw, not on the render clock) or is given up, and at most this long (ms). A newer order replaces it; a move drops
 * it (the move is the newer intent).
 */
export const HOLD_BEHIND_CAST_MS = 500;

export type CastIndex = CastSlot | 4;

interface Buffered {
  slot: CastIndex;
  x: number;
  y: number;
  id: number;
  /** Wall-clock ms the buffer gives up. */
  until: number;
  /** A sent cast the sim did not take, kept to send again (orders behind it keep waiting). */
  retry?: boolean;
}

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
/** GAPS B1: the client's ping debounce, the sim's PING.minGap in wall-clock ms (the sim would drop a faster one). */
export const PING_DEBOUNCE_MS = Math.ceil((PING.minGap * 1000) / TICK_HZ);

export class Orders {
  private pending: Pending | null = null;
  /** Count of commands sent (tests, analytics). */
  sent = 0;
  /** Last order kind, for tips. */
  last: Command['op'] | 0 = 0;
  /** C6: the newest move order's goal (mm) and when it went (ms): the own model turns to it at once. */
  lastMove: { x: number; y: number; at: number } | null = null;

  constructor(private readonly env: OrderEnv) {}

  /** C2: the cast waiting for the hero to be free, the last cast sent and not yet confirmed, and the busy end. */
  private buffered: Buffered | null = null;
  /** `seen`: the sim's raw events already show it applied (the render clock has not reached it yet). */
  private inflight: { slot: CastIndex; at: number; until: number; x: number; y: number; id: number; seen: boolean } | null = null;
  /** A stop, attack or Nap held behind a cast the sim has not shown yet (HOLD_BEHIND_CAST_MS). */
  private held: { cmd: Command; at: number } | null = null;
  /** Orders held behind a cast, and sent once it showed up or was given up (tests, e2e telemetry). */
  holds = 0;
  /** Called whenever a cast or trick command goes out (on the press, from the buffer, or a retry): slot, point (mm). */
  onFire: ((slot: CastIndex, x: number, y: number) => void) | null = null;
  private busyUntil = 0;
  /** Casts kept by the buffer, sent from it, and dropped when it ran out (tests, e2e telemetry). */
  buffers = { kept: 0, sent: 0, expired: 0, retried: 0 };

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
    return slot === 4 ? trickAim(this.env.trick) : aimFor(this.env.hero, slot, this.env.branch?.() ?? false);
  }

  /**
   * UX pass 2 (founder: "flash should be cast right after clicking instead of trying to force it"): is `slot` the
   * flash (Pounce)? It goes on the press whenever the newest snapshot says it is ready: never held for an earlier cast
   * the sim has not shown yet (the flash wins its tick, as the sim's newest non-move command does), never for the drawn
   * frame's cooldown or windup that trail the sim, never a walk-in (heading.ts: a point past the range is the full
   * blink). A press the sim still refuses (a windup or dash it really is in) is sent again as soon as it can go.
   */
  isFlash(slot: CastIndex): boolean {
    return slot === 4 && this.aimSpec(4).flash === true;
  }

  /** The own hero in the newest snapshot, else null (OrderEnv.simOwn). */
  private simOwn(): { cooldowns: readonly number[] | null; state: Unit['state'] } | null {
    return this.env.simOwn?.() ?? null;
  }

  /** Ready = off cooldown, unlocked (R from level 4), hero alive. The flash reads the newest snapshot (isFlash). */
  ready(slot: CastIndex): boolean {
    const own = this.isFlash(slot) ? this.simOwn() : null;
    if (own) return own.state !== 'dead' && (own.cooldowns?.[slot] ?? 0) === 0;
    const me = this.me();
    if (!me || me.state === 'dead') return false;
    if (slot === 3 && this.env.level() < ULT_LEVEL) return false;
    const cd = this.env.cooldowns();
    return !cd || (cd[slot] ?? 0) === 0;
  }

  /** C2: may a press of `slot` go now or into the buffer (ready, or within CAST_BUFFER.nearReadyTicks of it)? */
  canQueue(slot: CastIndex): boolean {
    if (this.ready(slot)) return true;
    const me = this.me();
    if (!me || me.state === 'dead') return false;
    if (slot === 3 && this.env.level() < ULT_LEVEL) return false;
    const own = this.isFlash(slot) ? this.simOwn() : null;
    const cd = (own ? own.cooldowns : this.env.cooldowns())?.[slot] ?? 0;
    return cd > 0 && cd <= CAST_BUFFER.nearReadyTicks;
  }

  /** Wall-clock ms per sim tick at the current match speed. */
  private tickMs(): number {
    return 1000 / TICK_HZ / Math.max(1, this.speed);
  }

  /** C2: would the sim refuse a cast right now (mid windup or dash, or a cast sent and not seen yet)? */
  busy(): boolean {
    return this.busyWhy() !== '';
  }

  /** UX pass 2: is the hero in a windup in the newest snapshot (the one thing the flash waits for)? */
  private flashBusy(): boolean {
    const own = this.simOwn();
    return (own ? own.state : this.me()?.state) === 'casting';
  }

  /** Press-to-command telemetry for the flash (tests, e2e): presses, sent on the press, kept for a windup. */
  flash = { presses: 0, atOnce: 0, kept: 0 };

  /** Why the hero is busy ('casting', 'dash', 'unseen': a cast sent and not seen yet), or '' (tests, e2e telemetry). */
  busyWhy(): '' | 'casting' | 'dash' | 'unseen' {
    const now = this.env.nowMs();
    const me = this.me();
    if (me?.state === 'casting') return 'casting';
    if (now < this.busyUntil) return 'dash';
    const f = this.inflight;
    return f && now - f.at < this.confirmMs() ? 'unseen' : '';
  }

  /** Smoothed wall-clock ms per frame (the render clock hands events over once a frame). */
  private frameMs = 16;

  /**
   * How long (ms) a sent cast may go unseen before it counts as refused: the command reaches the next sim tick, the
   * render clock reaches that tick (INTERP_LAG behind) and a frame hands the event over, so it scales with slow frames
   * (a retry of a cast the sim did take would recast it).
   */
  private confirmMs(): number {
    return Math.max(CAST_BUFFER.confirmMs / Math.max(1, Math.min(4, this.speed)), 3 * this.tickMs() + 3 * this.frameMs);
  }

  /** Ms left of the windup or dash the hero is busy with (e2e telemetry). */
  get busyLeftMs(): number {
    return Math.max(0, Math.round(this.busyUntil - this.env.nowMs()));
  }

  /**
   * Where a cast of `slot` stands: 'unseen' sent and not shown by the sim yet, 'seen' shown by the sim's raw events,
   * 'buffered' waiting to be sent (or sent again), or null (nothing of that slot in flight).
   */
  castState(slot: CastIndex): 'unseen' | 'seen' | 'buffered' | null {
    const f = this.inflight;
    if (f && f.slot === slot) return f.seen ? 'seen' : 'unseen';
    return this.buffered?.slot === slot ? 'buffered' : null;
  }

  /** Is a cast sent and not shown by the sim yet (or waiting to be sent again)? Orders behind it are held. */
  private castUnseen(): boolean {
    const f = this.inflight;
    return (f !== null && !f.seen) || this.buffered?.retry === true;
  }

  /**
   * The sim's own events as they arrive from the host (before the render clock plays them): a windup or cast of the
   * slot in flight shows the sim took it, so an order held behind it may go, and it is never sent again.
   */
  applied(ev: SimEvent): void {
    if (ev.type !== 'windup' && ev.type !== 'cast') return;
    if (ev.src !== this.env.meId) return;
    const f = this.inflight;
    if (f && f.slot === ev.slot) f.seen = true;
    if (this.buffered?.retry && this.buffered.slot === ev.slot) this.buffered = null;
    this.releaseHeld();
  }

  private releaseHeld(force = false): void {
    const h = this.held;
    if (!h || (!force && this.castUnseen() && this.env.nowMs() - h.at < HOLD_BEHIND_CAST_MS)) return;
    this.held = null;
    this.emit(h.cmd);
  }

  /** A stop, attack, attack-move or Nap: sent now, or held behind a cast the sim has not shown yet. */
  private order(cmd: Command): void {
    this.pending = null;
    if (this.castUnseen()) {
      this.held = { cmd, at: this.held?.at ?? this.env.nowMs() };
      this.holds++;
      return;
    }
    this.held = null;
    this.emit(cmd);
  }

  /** Is a cast waiting in the buffer (its slot), else null. */
  get queued(): CastIndex | null {
    return this.buffered?.slot ?? null;
  }

  /**
   * C2: own sim events. A windup or cast confirms the cast in flight; a windup keeps the hero busy for its ticks, a
   * dash for its travel time; a cast of the buffered slot itself clears the buffer (a double tap is not a deny).
   */
  onEvent(ev: SimEvent): void {
    if (ev.type !== 'windup' && ev.type !== 'cast') return;
    if (ev.src !== this.env.meId) return;
    const now = this.env.nowMs();
    if (this.inflight && this.inflight.slot === ev.slot) this.inflight = null;
    if (ev.type === 'windup') this.busyUntil = Math.max(this.busyUntil, now + ev.ticks * this.tickMs());
    else {
      const aim = this.aimSpec(ev.slot);
      if (aim.shape === 'dash') this.busyUntil = Math.max(this.busyUntil, now + ((aim.range / EFFECTS.dashSpeed) * 1000) / Math.max(1, this.speed) + CAST_BUFFER.dashPadMs);
      if (this.buffered && this.buffered.slot === ev.slot) this.buffered = null;
    }
  }

  move(x: number, y: number): void {
    this.pending = null;
    // a move is newer than an order held behind a cast: it replaces it (the cast still wins its tick over the move)
    this.held = null;
    const me = this.env.units().find((u) => u.id === this.env.meId);
    // the map edge and the enemy fountain stop a move (fun plan F3): no walking into a corner
    const team = me ? (me.team === 1 ? 1 : 0) : 0;
    const e = me ? edgeGoal(me.x, me.y, x, y, team) : { x, y };
    if (!e) return;
    const g = me ? reachableGoal(me.x, me.y, clampX(e.x), clampY(e.y)) : { x, y };
    this.lastMove = { x: g.x, y: g.y, at: this.env.nowMs() };
    this.emit({ op: Op.Move, x: clampX(g.x), y: clampY(g.y) });
  }

  attackMove(x: number, y: number): void {
    this.order({ op: Op.AttackMove, x: clampX(x), y: clampY(y) });
  }

  attack(id: number): void {
    this.order({ op: Op.Attack, id });
  }

  stop(): void {
    this.order({ op: Op.Stop });
  }

  nap(): void {
    this.order({ op: Op.Nap });
  }

  talent(tier: TalentTier, choice: 0 | 1): void {
    this.emit({ op: Op.Talent, tier, choice });
  }

  /** Pings sent this match, and when the last one went (ms). */
  pings = 0;
  private lastPingMs = -1e9;
  /** Wall-clock ms per sim tick ratio: the match speed (e2e runs faster), so the debounce tracks the sim's gap. */
  speed = 1;

  /** May a ping go now (debounce and the per-match cap)? The paw button greys out while not. */
  pingReady(): boolean {
    return this.pings < PING.maxPerMatch && this.env.nowMs() - this.lastPingMs >= PING_DEBOUNCE_MS / Math.max(1, this.speed);
  }

  /**
   * GAPS B1: a command ping to the allied bots. Debounced on the client before it is sent (and so logged), so the
   * sim's own gate (one per PING.minGap ticks, PING.maxPerMatch a match) rarely drops one. Returns false when held.
   */
  ping(kind: number, x: number, y: number, id: number = NO_TARGET): boolean {
    if (!this.pingReady()) return false;
    this.lastPingMs = this.env.nowMs();
    this.pings++;
    this.emit({ op: Op.Ping, kind, x: clampX(x), y: clampY(y), id });
    return true;
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
    if (!this.canQueue(slot)) return false;
    // Audit CF-07: a unit-target cast with no living target is refused here (it was buffered, then dropped silently)
    if (this.aimSpec(slot).kind === 'unit' && !this.env.units().some((u) => u.id === id && u.state !== 'dead')) return false;
    if (this.isFlash(slot)) {
      this.flash.presses++;
      if (this.ready(slot) && !this.flashBusy()) {
        this.flash.atOnce++;
        return this.castNow(slot, x, y, id);
      }
      this.flash.kept++;
    }
    if (!this.ready(slot) || (this.isFlash(slot) ? this.flashBusy() : this.busy())) {
      // C2: keep the newest press and send it the moment the hero is free (never two buffered casts)
      this.buffered = { slot, x, y, id, until: this.env.nowMs() + CAST_BUFFER.ms };
      this.buffers.kept++;
      return true;
    }
    return this.castNow(slot, x, y, id);
  }

  private castNow(slot: CastIndex, x: number, y: number, id: number, until = this.env.nowMs() + CAST_BUFFER.ms): boolean {
    if (!this.ready(slot)) return false;
    const me = this.me();
    if (!me) return false;
    const aim = this.aimSpec(slot);
    if (aim.kind === 'self') {
      this.fire(slot, me.x, me.y, NO_TARGET, until);
      return true;
    }
    if (aim.kind === 'dir') {
      let px = x;
      let py = y;
      if (Math.hypot(px - me.x, py - me.y) < 200) {
        px = me.x + aim.range;
        py = me.y;
      }
      this.fire(slot, px, py, NO_TARGET, until);
      return true;
    }
    if (aim.kind === 'unit') {
      const t = this.env.units().find((u) => u.id === id);
      if (!t) return false;
      if (this.inReach(me, t.x, t.y, aim.range + BODY_MM[t.kind])) this.fire(slot, t.x, t.y, t.id, until);
      else this.walkIn(slot, t.x, t.y, t.id);
      return true;
    }
    // point; a heading blink (Pounce, Live Wire) never walks in: the sim casts it where the hero stands and clamps the
    // point to the blink distance, so a point past the range is the full blink (heading.ts)
    if (aim.heading || this.inReach(me, x, y, aim.range)) this.fire(slot, x, y, NO_TARGET, until);
    else this.walkIn(slot, x, y, NO_TARGET);
    return true;
  }

  private inReach(me: Unit, x: number, y: number, r: number): boolean {
    return Math.hypot(x - me.x, y - me.y) <= r;
  }

  private fire(slot: CastIndex, x: number, y: number, id: number, until = 0): void {
    this.pending = null;
    if (this.buffered && this.buffered.slot === slot) this.buffered = null;
    this.inflight = until > 0 ? { slot, at: this.env.nowMs(), until, x, y, id, seen: false } : null;
    if (slot === 4) this.emit({ op: Op.Trick, x: clampX(x), y: clampY(y) });
    else this.emit({ op: Op.Cast, slot, x: clampX(x), y: clampY(y), id });
    this.onFire?.(slot, x, y);
  }

  private walkIn(slot: CastIndex, x: number, y: number, id: number): void {
    const now = this.env.nowMs();
    this.pending = { slot, x, y, id, since: now, lastMove: now };
    this.emit({ op: Op.Move, x: clampX(x), y: clampY(y) });
  }

  /** Per frame: the cast buffer (C2), an order held behind a cast, then a walk-in cast. */
  update(): void {
    this.flushBuffer();
    this.releaseHeld();
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
      this.fire(p.slot, tx, ty, p.id, now + CAST_BUFFER.ms);
      return;
    }
    if (now - p.lastMove > REMOVE_MS) {
      p.lastMove = now;
      this.emit({ op: Op.Move, x: clampX(tx), y: clampY(ty) });
      this.pending = p;
    }
  }

  /** C2: send the buffered cast once the hero is free; retry a sent cast the sim did not take; expire the rest. */
  private lastFlush = 0;

  private flushBuffer(): void {
    const now = this.env.nowMs();
    // a stalled frame (a shader compile on the first cast, a hidden tab) does not eat the window: it is paused too
    const gap = now - this.lastFlush;
    this.lastFlush = now;
    if (gap > 0 && gap <= 100) this.frameMs += (gap - this.frameMs) * 0.2;
    if (gap > 100 && gap < 5000) {
      if (this.buffered) this.buffered.until += gap;
      if (this.inflight) {
        this.inflight.until += gap;
        this.inflight.at += gap;
      }
    }
    const f = this.inflight;
    if (f && !this.buffered && now - f.at >= this.confirmMs()) {
      // no windup or cast event for it: the sim refused it (a dash, a windup it could not see); try again in its window.
      // One the raw events already showed was taken is done (a slow render clock must not cast it twice).
      this.inflight = null;
      if (!f.seen && now < f.until && this.ready(f.slot)) {
        this.buffered = { slot: f.slot, x: f.x, y: f.y, id: f.id, until: f.until, retry: true };
        this.buffers.retried++;
      }
    }
    const b = this.buffered;
    if (!b) return;
    const me = this.me();
    if (!me || me.state === 'dead') {
      this.buffered = null;
      return;
    }
    if (now >= b.until) {
      this.buffered = null;
      this.buffers.expired++;
      this.env.onDeny?.(b.slot);
      return;
    }
    if ((this.isFlash(b.slot) ? this.flashBusy() : this.busy()) || !this.ready(b.slot)) return;
    this.buffered = null;
    this.buffers.sent++;
    this.castNow(b.slot, b.x, b.y, b.id, b.until);
  }
}
