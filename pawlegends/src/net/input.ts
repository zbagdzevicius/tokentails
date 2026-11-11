/**
 * Command coalescing for party play (MULTIPLAYER.md §4.1 input.ts, B4): at most one Move per turn (66.7 ms), the
 * latest wins, and the final Move of a drag is always sent (a timer flushes the pending one). Non-move commands are
 * never coalesced: they go at once and replace a pending Move (the sim's own gate drops a waiting move for any other
 * command). Sends on input, never on rAF.
 */
import { Op, type Command } from '../sim/api';

/** One turn: the relay keeps the newest Move per open turn anyway, so a faster drag only adds delay (was 2 turns). */
export const MOVE_EVERY_MS = 200 / 3;

/** A Move held back while the socket still has unsent bytes waits at most this long (ms), then goes anyway. */
export const BUSY_HOLD_MS = 400;

export interface CoalescerEnv {
  now(): number;
  /** The socket has bytes it has not sent yet (after an uplink stall): a coalesced Move waits, the newest wins. */
  busy?(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
}

export class MoveCoalescer {
  private lastMoveMs = -Infinity;
  private pending: Command | null = null;
  private timer: unknown = null;
  private pendingSince = 0;

  constructor(private readonly sendNow: (cmd: Command) => void, private readonly env: CoalescerEnv) {}

  send(cmd: Command): void {
    // KITE-FIX: a held stick's kite coalesces like its move would
    if (cmd.op !== Op.Move && cmd.op !== Op.Kite) {
      this.cancel();
      this.sendNow(cmd);
      return;
    }
    const now = this.env.now();
    const wait = this.lastMoveMs + MOVE_EVERY_MS - now;
    if (wait <= 0 && this.timer === null && !this.env.busy?.()) {
      this.lastMoveMs = now;
      this.sendNow(cmd);
      return;
    }
    if (this.pending === null) this.pendingSince = now;
    this.pending = cmd;
    if (this.timer === null) this.timer = this.env.setTimer(this.due, Math.max(1, wait));
  }

  /** The pending Move's turn came: send it, unless the socket is still backed up (then wait one more turn, capped). */
  private readonly due = (): void => {
    this.timer = null;
    if (this.pending && this.env.busy?.() && this.env.now() - this.pendingSince < BUSY_HOLD_MS) {
      this.timer = this.env.setTimer(this.due, MOVE_EVERY_MS);
      return;
    }
    this.flush();
  };

  /** Send the pending Move now (a drag ended). */
  flush(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = null;
    const p = this.pending;
    this.pending = null;
    if (p) {
      this.lastMoveMs = this.env.now();
      this.sendNow(p);
    }
  }

  private cancel(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = null;
    this.pending = null;
  }

  dispose(): void {
    this.cancel();
  }
}
