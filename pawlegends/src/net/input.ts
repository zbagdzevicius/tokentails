/**
 * Command coalescing for party play (MULTIPLAYER.md §4.1 input.ts, B4): at most one Move per 2 turns (133 ms), the
 * latest wins, and the final Move of a drag is always sent (a timer flushes the pending one). Non-move commands are
 * never coalesced: they go at once and replace a pending Move (the sim's own gate drops a waiting move for any other
 * command). Sends on input, never on rAF.
 */
import { Op, type Command } from '../sim/api';

export const MOVE_EVERY_MS = 400 / 3;

export interface CoalescerEnv {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
}

export class MoveCoalescer {
  private lastMoveMs = -Infinity;
  private pending: Command | null = null;
  private timer: unknown = null;

  constructor(private readonly sendNow: (cmd: Command) => void, private readonly env: CoalescerEnv) {}

  send(cmd: Command): void {
    if (cmd.op !== Op.Move) {
      this.cancel();
      this.sendNow(cmd);
      return;
    }
    const now = this.env.now();
    const wait = this.lastMoveMs + MOVE_EVERY_MS - now;
    if (wait <= 0 && this.timer === null) {
      this.lastMoveMs = now;
      this.sendNow(cmd);
      return;
    }
    this.pending = cmd;
    if (this.timer === null) this.timer = this.env.setTimer(() => this.flush(), Math.max(1, wait));
  }

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
