/**
 * Input gate (POC.md §11.3, §4.3 step 1): decides which human command, if any, the sim applies this tick.
 *
 * - The latest command of the tick wins.
 * - A `move` within MOVE_MIN_GAP ticks of the last applied move waits; a later waiting move replaces it, any other
 *   command drops it, and it applies on the first tick the gap allows (joystick moves coalesce).
 * - Once the logged stream would pass MAX_INPUT_BYTES, nothing more is applied (the replay always fits `/live`).
 * - Sim v10 (GAPS B1): pings are gated on their own. The latest ping of the tick applies (`g.ping`) if PING.minGap
 *   ticks passed since the last applied one and fewer than PING.maxPerMatch applied; else it is dropped. A ping never
 *   drops a waiting move, and it is logged before the tick's other command (both may share a tick).
 * - Sim v10 (GAPS B2): a forfeit applies (`g.forfeit`) from `forfeitFrom` (0 = never) and is logged after the tick's
 *   other command; earlier it is dropped and touches nothing else. The other commands leave FORFEIT_RESERVE_BYTES of
 *   the budget free, so a forfeit always fits.
 *
 * Only applied commands are logged, and a logged stream passes the gate unchanged on replay (moves are spaced, the
 * budget holds), so a live match and its replay apply identical inputs.
 */
import { FORFEIT_RESERVE_BYTES, MAX_INPUT_BYTES, MOVE_MIN_GAP } from '../data/limits';
import { PING } from '../data/pings';
import { Op, type Command } from './api';
import { OP_SIZE, quantize } from './commands';
import { idiv } from './fixed';
import type { InputGate } from './state';

export function createGate(): InputGate {
  return { pending: null, lastMoveTick: -MOVE_MIN_GAP, lastLogTick: 0, bytes: 0, ping: null, lastPingTick: -PING.minGap, pings: 0, forfeit: false };
}

function varintSize(n: number): number {
  let size = 1;
  while (n >= 0x80) {
    n = idiv(n, 0x80);
    size++;
  }
  return size;
}

/** Room for `op` at `tick` in the byte budget (all of it for a forfeit, else less FORFEIT_RESERVE_BYTES)? Takes it when there is. */
function spend(g: InputGate, tick: number, op: number): boolean {
  const size = varintSize(tick - g.lastLogTick) + OP_SIZE[op];
  if (g.bytes + size > (op === Op.Forfeit ? MAX_INPUT_BYTES : MAX_INPUT_BYTES - FORFEIT_RESERVE_BYTES)) return false;
  g.bytes += size;
  g.lastLogTick = tick;
  return true;
}

/**
 * The command to apply at `tick` (not a ping or a forfeit), or null; the tick's ping, if one applies, is left in
 * `g.ping` (null otherwise). Updates the gate.
 */
export function gateCommand(g: InputGate, tick: number, commands: readonly Command[] | undefined): Command | null {
  g.ping = null;
  let last: Command | null = null;
  let lastPing: Command | null = null;
  if (commands) {
    for (let i = commands.length - 1; i >= 0 && (last === null || lastPing === null); i--) {
      const op = commands[i].op;
      if (op === Op.Forfeit) continue;
      if (op === Op.Ping) lastPing ??= commands[i];
      else last ??= commands[i];
    }
  }
  if (lastPing && tick - g.lastPingTick >= PING.minGap && g.pings < PING.maxPerMatch && spend(g, tick, Op.Ping)) {
    g.ping = quantize(lastPing);
    g.lastPingTick = tick;
    g.pings++;
  }
  let cmd: Command | null = last ? quantize(last) : null;
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
  if (!spend(g, tick, cmd.op)) {
    g.pending = null;
    return null;
  }
  if (cmd.op === Op.Move) g.lastMoveTick = tick;
  return cmd;
}

/**
 * Sim v10 (GAPS B2): does a forfeit among `commands` apply at `tick`? Only from `forfeitFrom` (0 = never), once, and
 * with room in the budget. Call after gateCommand (it is logged after the tick's other command). Sets `g.forfeit`.
 */
export function gateForfeit(g: InputGate, tick: number, commands: readonly Command[] | undefined, forfeitFrom: number): boolean {
  if (!commands || g.forfeit || forfeitFrom <= 0 || tick < forfeitFrom) return false;
  let asked = false;
  for (let i = 0; i < commands.length && !asked; i++) asked = commands[i].op === Op.Forfeit;
  if (!asked || !spend(g, tick, Op.Forfeit)) return false;
  g.forfeit = true;
  return true;
}
