/**
 * The concrete match behind the opaque `Match` handle, shared by every sim module (kept out of index.ts so the
 * unit modules can import it without a cycle).
 */
import type { Command, MatchConfig, MatchResult, SimEvent, SlotStats, TimedCommand } from './api';
import type { NavGrid } from './map/grid';
import type { World } from './world';

/** Input gate state (POC.md §11.3): outside the world hash, because only applied commands reach the world. */
export interface InputGate {
  /** A move waiting for MOVE_MIN_GAP to pass (latest wins), or null. */
  pending: Command | null;
  /** Tick of the last applied move. */
  lastMoveTick: number;
  /** Tick of the last logged command (varint delta base). */
  lastLogTick: number;
  /** Encoded size of `log` so far, bytes. */
  bytes: number;
}

export interface MatchHandle {
  readonly config: MatchConfig;
  readonly world: World;
  /** Derived from the world (walls + standing structures); not hashed. */
  readonly grid: NavGrid;
  /** Every applied human command, quantised, at most one per tick. */
  readonly log: TimedCommand[];
  readonly gate: InputGate;
  /** hash() every TIMELINE.hashEvery ticks (§4.3 step 9). */
  readonly trail: number[];
  /** Events of the last stepped tick. */
  events: SimEvent[];
  ended: MatchResult | null;
  readonly stats: SlotStats[];
}
