/**
 * Extension points of the sim (GDD 16 lane contracts, frozen for iteration 2). SimWorld (integrator) calls these; the
 * lanes plug in through them only. Everything a plugin does must follow the sim math rules (types.ts header) and
 * draw randomness only from the kart's `rngItems` / `rngAi` streams or `RaceState.rngHazards`.
 *
 * Tick order (core/sim/world.ts): countdown → inputs (with the item buffer) → item use → kart physics → contacts
 * (+ wall re-clamp) → slipstream → coins → item boxes → items.step → hazards.step → mode.step → laps (skipped on
 * arenas) → positions → mode.isOver.
 */
import type { HitKind, ItemId, RaceConfig, RaceEvent, RaceState, TickInput } from '../../types';
import type { ClassTuning } from '../../tuning';
import type { BuiltTrack } from '../track/build';

/** What a plugin sees each tick. */
export interface SimContext {
  st: RaceState;
  track: BuiltTrack;
  cfg: RaceConfig;
  tun: ClassTuning;
  /** tick of GO (end of the countdown) */
  goTick: number;
  /** append to the race event log */
  emit(e: Omit<RaceEvent, 'tick'>): void;
  /** the race's plugins (applyHit and contacts call the mode rules through this) */
  plugins?: SimPlugins;
  /** each kart's `dist` at the start of this tick (sub-tick finish times), filled by SimWorld */
  prevDist?: Float64Array;
}

/** AI driver (items-ai lane): fills `out` for kart `k`. It may also set `st.karts[k].topScale` (rubber band, clamped by the core). */
export interface AIDriver {
  init?(ctx: SimContext): void;
  drive(ctx: SimContext, k: number, out: TickInput): void;
}

/** Item system (items-ai lane). */
export interface ItemSystem {
  init?(ctx: SimContext): void;
  /** called at box pickup; the result is hidden until the roulette ends (GDD 4) */
  roll(ctx: SimContext, k: number): ItemId;
  /** charges granted with a rolled item (Catnip ×3, else 1) */
  charges?(item: ItemId): number;
  /** use the held item of kart k (called on the item press edge once the roulette is over) */
  use(ctx: SimContext, k: number, back: boolean): void;
  /** projectiles, traps, area effects: runs after kart physics and contacts each tick */
  step?(ctx: SimContext): void;
  /** fold the items slot of RaceState into the state hash */
  hash?(st: RaceState, h: number): number;
}

/** Track hazards (tracks lane, src/tracks/hazards): state lives in `RaceState.hazards`, hits go through applyHit. */
export interface HazardSystem {
  init?(ctx: SimContext): void;
  step(ctx: SimContext): void;
  hash?(st: RaceState, h: number): number;
}

/** Mode rules (modes lane: battle balloons, time trial). State lives in `RaceState.mode`. */
export interface ModeRules {
  init?(ctx: SimContext): void;
  /** after items.step and hazards.step: battle balloons, eliminations, time limit */
  step?(ctx: SimContext): void;
  /** called by applyHit when a hit lands */
  onHit?(ctx: SimContext, victim: number, by: number, kind: HitKind): void;
  /** called by contacts with the pair and their relative closing speed (m/s) */
  onBump?(ctx: SimContext, a: number, b: number, vrel: number): void;
  /** true ends the race (phase 'done') */
  isOver?(ctx: SimContext): boolean;
  /** item weight row override for kart k (battle, tt); null = the normal table */
  itemRow?(ctx: SimContext, k: number): readonly number[] | null;
  hash?(st: RaceState, h: number): number;
}

export interface SimPlugins {
  ai: AIDriver;
  items: ItemSystem;
  /** tracks lane */
  hazards?: HazardSystem;
  /** modes lane (battle, tt) */
  mode?: ModeRules;
}
