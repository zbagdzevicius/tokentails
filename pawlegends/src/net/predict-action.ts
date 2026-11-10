/**
 * Predicted action start (LATENCY-PLAN N1, MULTIPLAYER.md §4.3), client only. A Cast or Trick sent in party play starts
 * its wind-up pose and wind-up sound on the next render frame instead of one input latency later; an Attack turns the
 * hero at once (the session already does: `turnToInput`) and is tracked the same way so it never double-fires.
 *
 * Only the look is predicted: damage, effects, cooldowns and the hero's real cast stay authoritative. A prediction
 * whose own `windup` or `cast` event arrives within the input latency plus STALL_MS is confirmed (the director keeps
 * the clip it already plays and rebinds it to the sim's ticks: no restart); otherwise it is cancelled and faded out.
 *
 * Gate (from the newest snapshot of the own hero): alive, not napping, not stunned, rooted into a cast lock, feared or
 * charmed, not channeling, and the slot's cooldown at 0. Range is the input's job (Orders fires a cast only in reach,
 * else it walks in first). This hero kit has no mana.
 */
import { BuffFlag, Op, type Command, type EntitySnap, type SimEvent } from '../sim/api';
import { STALL_MS } from './predict';

export type ActionKind = 'cast' | 'trick' | 'attack';

export interface PredictedAction {
  kind: ActionKind;
  /** Cast slot 0..3 (Q W E R), 4 for the Trick, −1 for an attack. */
  slot: number;
  x: number;
  y: number;
  /** Target entity id (an attack, a targeted cast), else 255. */
  id: number;
  atMs: number;
  state: 'pending' | 'shown' | 'confirmed' | 'cancelled';
}

/** Hard crowd control that stops a cast: stun, fear, charm (charm is the `charmed` flag). Root does not stop a cast. */
const NO_CAST = BuffFlag.Stunned | BuffFlag.Feared;

/** The newest snapshot's own hero allows `cmd` to start now. Pure. */
export function canPredict(v: EntitySnap | null | undefined, cmd: Command): boolean {
  if (cmd.op !== Op.Cast && cmd.op !== Op.Trick && cmd.op !== Op.Attack) return false;
  if (!v || v.kind !== 'hero' || v.hp <= 0 || v.state === 'dead' || v.state === 'napping') return false;
  if ((v.buffs & NO_CAST) !== 0 || v.charmed === true || v.channel === true) return false;
  if (cmd.op === Op.Attack) return true;
  const slot = cmd.op === Op.Trick ? 4 : cmd.slot;
  const cd = v.cooldowns?.[slot];
  // no cooldown table (an older snapshot, the other team): never guess
  return cd === 0;
}

export class ActionPredictor {
  private readonly live: PredictedAction[] = [];
  private readonly toShow: PredictedAction[] = [];
  private readonly toCancel: PredictedAction[] = [];

  /** A command went out: start a prediction when the gate allows it (one per slot; a newer one replaces it). */
  start(cmd: Command, self: EntitySnap | null | undefined, nowMs: number): PredictedAction | null {
    if (!canPredict(self, cmd)) return null;
    const kind: ActionKind = cmd.op === Op.Cast ? 'cast' : cmd.op === Op.Trick ? 'trick' : 'attack';
    const slot = cmd.op === Op.Cast ? cmd.slot : cmd.op === Op.Trick ? 4 : -1;
    // a second press of the same slot while the first is still unconfirmed: the first stays (no restart)
    const same = this.live.find((p) => p.slot === slot && p.state !== 'confirmed');
    if (same) return null;
    const p: PredictedAction = {
      kind,
      slot,
      x: 'x' in cmd ? cmd.x : 0,
      y: 'y' in cmd ? cmd.y : 0,
      id: 'id' in cmd ? cmd.id : 255,
      atMs: nowMs,
      state: 'pending',
    };
    this.live.push(p);
    this.toShow.push(p);
    return p;
  }

  /** Something waits for takeShown or takeCancelled (a cheap per-frame check). */
  get hasQueued(): boolean {
    return this.toShow.length > 0 || this.toCancel.length > 0;
  }

  /** The predictions to draw this frame (each once). */
  takeShown(): PredictedAction[] {
    const out = this.toShow.splice(0);
    for (const p of out) if (p.state === 'pending') p.state = 'shown';
    return out.filter((p) => p.state === 'shown');
  }

  /** The predictions given up since the last call (each once): fade their pose out. */
  takeCancelled(): PredictedAction[] {
    return this.toCancel.splice(0);
  }

  /**
   * The local sim's events for the own slot: a `windup` or `cast` of a predicted slot (or a basic `hit` from the own
   * hero for an attack) confirms it. Returns the confirmed predictions.
   */
  confirm(events: readonly SimEvent[], mySlot: number): PredictedAction[] {
    const out: PredictedAction[] = [];
    if (!this.live.length) return out;
    for (const ev of events) {
      let slot: number | null = null;
      if ((ev.type === 'windup' || ev.type === 'cast') && ev.src === mySlot) slot = ev.slot;
      else if (ev.type === 'hit' && ev.kind === 'basic' && ev.src === mySlot) slot = -1;
      if (slot === null) continue;
      const i = this.live.findIndex((p) => p.slot === slot && p.state !== 'confirmed');
      if (i < 0) continue;
      const p = this.live[i];
      p.state = 'confirmed';
      this.live.splice(i, 1);
      out.push(p);
    }
    return out;
  }

  /** Give up predictions older than `windowMs` (the input latency plus STALL_MS) with no sim event. */
  expire(nowMs: number, windowMs: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      if (nowMs - p.atMs <= windowMs) continue;
      this.live.splice(i, 1);
      const wasShown = p.state === 'shown';
      p.state = 'cancelled';
      const q = this.toShow.indexOf(p);
      if (q >= 0) this.toShow.splice(q, 1);
      if (wasShown) this.toCancel.push(p);
    }
  }

  /** The hero died or the match reset: drop everything (cancel what is drawn). */
  reset(): void {
    for (const p of this.live) {
      if (p.state === 'shown') this.toCancel.push(p);
      p.state = 'cancelled';
    }
    this.live.length = 0;
    this.toShow.length = 0;
  }

  /** An unconfirmed prediction of `slot`, if any. */
  pendingOf(slot: number): PredictedAction | null {
    return this.live.find((p) => p.slot === slot) ?? null;
  }

  get size(): number {
    return this.live.length;
  }
}

/** The confirm window: the measured input latency plus the walker's stall margin (ms). */
export const confirmWindowMs = (inputLatencyMs: number): number => inputLatencyMs + STALL_MS;
