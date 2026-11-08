/**
 * The concrete match behind the opaque `Match` handle, shared by every sim module (kept out of index.ts so the
 * unit modules can import it without a cycle).
 */
import type { DifficultyRules } from '../data/bots';
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
  /** Sim v10 (GAPS B1): the ping `gateCommand` let through this tick (applied before the other command), or null. */
  ping: Command | null;
  /** Tick of the last applied ping, and pings applied so far (PING.minGap, PING.maxPerMatch). */
  lastPingTick: number;
  pings: number;
  /** Sim v10 (GAPS B2): a forfeit applied (logged); the match ends at this tick's win check (match.ts). */
  forfeit: boolean;
}

/**
 * Party play (MULTIPLAYER.md §1.1): one input gate and one post-gate log per human slot >= 1 (slot 0 keeps `gate` and
 * `log`). Outside the world hash, like the gate.
 */
export interface PartyState {
  /** Human slots >= 1, ascending (1, 2 or both; sim v16 PvP: any of 1..5, always 3). */
  readonly slots: readonly number[];
  /** Indexed by hero slot (0 unused), 6 entries. */
  readonly gates: (InputGate | null)[];
  readonly logs: (TimedCommand[] | null)[];
}

/**
 * Sim v16 S-PvP (docs/plans/moba/V16.md §3.1.3, §3.1.4): team 1's lead (slot 3) state. NOT hashed, like `w.humans`:
 * it is derived from logged inputs and positions, which the hash already covers.
 */
export interface PvpState {
  /** Slot 3's command gated this tick (applied at its slot position after the ping and forfeit block), or null. */
  leadCmd: Command | null;
  /** Last tick slot 3 gave a command or moved (team 1's G.HumanActAt), and its last position. */
  actAt1: number;
  px1: number;
  py1: number;
}

export interface MatchHandle {
  readonly config: MatchConfig;
  readonly world: World;
  /** Derived from the world (walls + standing structures); not hashed. */
  readonly grid: NavGrid;
  /** Every applied human command, quantised: at most one per tick, plus (sim v10) at most one ping logged before it. */
  readonly log: TimedCommand[];
  readonly gate: InputGate;
  /** hash() every TIMELINE.hashEvery ticks (§4.3 step 9). */
  readonly trail: number[];
  /** Events of the last stepped tick. */
  events: SimEvent[];
  ended: MatchResult | null;
  readonly stats: SlotStats[];
  /** Party play: present only when `config.humans` names more than slot 0. */
  readonly party?: PartyState;
  /** Sim v16: the match rules, cached at createMatch (DIFFICULTY_RULES[difficulty], or PVP_RULES in PvP). */
  readonly rules: DifficultyRules;
  /** Sim v16 S-PvP: present only in a PvP match. */
  readonly pvp?: PvpState;
}
