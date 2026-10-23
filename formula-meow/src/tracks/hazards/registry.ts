/**
 * Hazard registry (iteration 2 contract; the tracks lane owns the hazards). A `HazardDef` per `HazardKind`,
 * registered with `registerHazard` (kinds.ts registers all six). `createHazardSystem(track)` builds the sim plugin
 * for a track: its hazard spots (`TrackDef.hazards` plus UGC "hazard" stickers, core/track/hazard-spots.ts), the
 * track rules (rules.ts: open bridges, branch gaps, solid props) and the AI's branch plans (core/track/branch-ai.ts)
 * all live in `RaceState.hazards` and are hashed here. A track with none of them gets no system.
 *
 * Rules for hazard code (it runs inside the sim): GDD 3.1 math only, randomness only from `RaceState.rngHazards`,
 * state only in `RaceState.hazards` (plain data), hits only through `applyHit`, telegraph ≥ 0.6 s, cost ≤ ~1.5 s.
 */
import type { HazardKind, HazardSpot, RaceState, TrackDef } from '../../types';
import type { HazardSystem, SimContext } from '../../core/sim/plugins';
import { fnvFloat, fnvInt } from '../../core/sim/hash';
import { hazardSpotsOf } from '../../core/track/hazard-spots';
import { extrasOf } from '../../core/track/tracks/extras';
import { hasRules, stepRules } from './rules';
import { registerDefaultHazards } from './kinds';

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

/** Might this track need the system (spots, branches, extras, stickers)? Decided from the def alone. */
function needsSystem(track: TrackDef): boolean {
  if (hazardSpotsOf(track).length || track.branches?.length) return true;
  if (track.features.some((f) => f.kind === 'shortcut')) return true;
  const e = extrasOf(track.id);
  return !!(e.voids?.length || e.gaps?.length || e.blocks?.length);
}

export function createHazardSystem(track: TrackDef): HazardSystem | null {
  if (!needsSystem(track)) return null;
  registerDefaultHazards();
  const spots = hazardSpotsOf(track)
    .map((spot, id) => ({ spot, id, def: defs.get(spot.kind) }))
    .filter((x) => !!x.def);
  let rules = false;
  return {
    init(ctx) {
      const all = slots(ctx.st);
      for (const { spot, id, def } of spots) {
        all[id] = {};
        def!.init?.(ctx, spot, id, all[id]);
      }
      rules = hasRules(ctx.track);
    },
    step(ctx) {
      const all = slots(ctx.st);
      for (const { spot, id, def } of spots) {
        if (!ctx.track.hazards.some((h) => h.id === id)) continue; // a spot on a branch that did not build
        def!.step(ctx, spot, id, (all[id] ??= {}));
      }
      if (rules) stepRules(ctx);
    },
    hash(st, h) {
      const all = slots(st);
      for (const k of Object.keys(all).sort()) {
        h = fnvInt(h, Number(k));
        const o = all[k];
        for (const f of Object.keys(o).sort()) h = fnvFloat(h, o[f]);
      }
      const x = st.hazards as { rules?: { pend: number[]; wcd: number[] }; plan?: number[] };
      if (x.rules) for (const a of [x.rules.pend, x.rules.wcd]) for (const v of a) h = fnvInt(h, v);
      if (x.plan) for (const v of x.plan) h = fnvInt(h, v);
      return h;
    },
  };
}
