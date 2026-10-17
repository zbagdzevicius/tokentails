/**
 * Input gate (POC.md §11.3, §4.3 step 1): decides which human command, if any, the sim applies this tick.
 *
 * - The latest command of the tick wins.
 * - A `move` within MOVE_MIN_GAP ticks of the last applied move waits; a later waiting move replaces it, any other
 *   command drops it, and it applies on the first tick the gap allows (joystick moves coalesce).
 * - Once the logged stream would pass MAX_INPUT_BYTES, nothing more is applied (the replay always fits `/live`).
 *
 * Only applied commands are logged, and a logged stream passes the gate unchanged on replay (moves are spaced, the
 * budget holds), so a live match and its replay apply identical inputs.
 */
import { MAX_INPUT_BYTES, MOVE_MIN_GAP } from '../data/limits';
import { Op, type Command } from './api';
import { OP_SIZE, quantize } from './commands';
import { idiv } from './fixed';
import type { InputGate } from './state';

export function createGate(): InputGate {
  return { pending: null, lastMoveTick: -MOVE_MIN_GAP, lastLogTick: 0, bytes: 0 };
}

function varintSize(n: number): number {
  let size = 1;
  while (n >= 0x80) {
    n = idiv(n, 0x80);
    size++;
  }
  return size;
}

/** The command to apply at `tick`, or null. Updates the gate. */
export function gateCommand(g: InputGate, tick: number, commands: readonly Command[] | undefined): Command | null {
  let cmd: Command | null = commands && commands.length > 0 ? quantize(commands[commands.length - 1]) : null;
  if (cmd) {
    if (cmd.op === Op.Move && tick - g.lastMoveTick < MOVE_MIN_GAP) {
      g.pending = cmd;
      cmd = null;
    } else {
      g.pending = null;
    }
  } else if (g.pending && tick - g.lastMoveTick >= MOVE_MIN_GAP) {
    cmd = g.pending;
    g.pending = null;
  }
  if (!cmd) return null;
  const size = varintSize(tick - g.lastLogTick) + OP_SIZE[cmd.op];
  if (g.bytes + size > MAX_INPUT_BYTES) {
    g.pending = null;
    return null;
  }
  g.bytes += size;
  g.lastLogTick = tick;
  if (cmd.op === Op.Move) g.lastMoveTick = tick;
  return cmd;
}
