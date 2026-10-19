/**
 * Extension points of the sim (GDD 16 lane contracts). The core lane owns SimWorld; the items-ai lane plugs in
 * through these interfaces only. Everything a plugin does must follow the sim math rules (types.ts header) and
 * draw randomness only from the kart's `rngItems` / `rngAi` streams or `RaceState.rngHazards`.
 */
import type { ItemId, RaceConfig, RaceEvent, RaceState, TickInput } from '../../types';
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

export interface SimPlugins {
  ai: AIDriver;
  items: ItemSystem;
}
