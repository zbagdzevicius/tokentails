/**
 * Hazard registry (iteration 2 contract; the tracks lane owns the hazards). A `HazardDef` per `HazardKind`,
 * registered with `registerHazard` from `src/tracks/install.ts`. `createHazardSystem(track)` builds the sim plugin for
 * a track's `TrackDef.hazards`; a track without hazards (or with kinds nobody registered yet) gets none.
 *
 * Rules for hazard code (it runs inside the sim): GDD 3.1 math only, randomness only from `RaceState.rngHazards`,
 * state only in `RaceState.hazards` (plain data), hits only through `applyHit`, telegraph ≥ 0.6 s, cost ≤ ~1.5 s.
 */
import type { HazardKind, HazardSpot, RaceState, TrackDef } from '../../types';
import type { HazardSystem, SimContext } from '../../core/sim/plugins';
import { fnvFloat, fnvInt } from '../../core/sim/hash';

export interface HazardDef {
  kind: HazardKind;
  /** called once per spot at race start; `state` is this spot's plain-data slot */
  init?(ctx: SimContext, spot: HazardSpot, id: number, state: Record<string, number>): void;
  /** one tick */
  step(ctx: SimContext, spot: HazardSpot, id: number, state: Record<string, number>): void;
}

const defs = new Map<HazardKind, HazardDef>();

export function registerHazard(kind: HazardKind, def: HazardDef): void {
  defs.set(kind, def);
}

export function hazardDef(kind: HazardKind): HazardDef | undefined {
  return defs.get(kind);
}

/** Per-spot plain-data state, keyed by the spot index. */
function slots(st: RaceState): Record<string, Record<string, number>> {
  const s = st.hazards as { spots?: Record<string, Record<string, number>> };
  if (!s.spots) s.spots = {};
  return s.spots;
}

export function createHazardSystem(track: TrackDef): HazardSystem | null {
  const spots = (track.hazards ?? []).map((spot, id) => ({ spot, id, def: defs.get(spot.kind) })).filter((x) => !!x.def);
  if (!spots.length) return null;
  return {
    init(ctx) {
      const all = slots(ctx.st);
      for (const { spot, id, def } of spots) {
        all[id] = {};
        def!.init?.(ctx, spot, id, all[id]);
      }
    },
    step(ctx) {
      const all = slots(ctx.st);
      for (const { spot, id, def } of spots) def!.step(ctx, spot, id, (all[id] ??= {}));
    },
    hash(st, h) {
      const all = slots(st);
      for (const k of Object.keys(all).sort()) {
        h = fnvInt(h, Number(k));
        const o = all[k];
        for (const f of Object.keys(o).sort()) h = fnvFloat(h, o[f]);
      }
      return h;
    },
  };
}
