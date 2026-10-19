/**
 * Hazard spots of a track (iteration 2, tracks lane): the authored `TrackDef.hazards` plus every UGC "hazard"
 * sticker (centred = a roomba crossing the road, on a side = a milk puddle there), with the default cycle per kind.
 * Pure and sim-safe: the hazard system (src/tracks/hazards) and the track build both read it.
 */
import { HAZARD_KINDS, type HazardKind, type HazardSpot, type TrackDef } from '../../types';

/** Seconds per cycle when a spot does not set `period` (GDD 3.6: every hazard telegraphs ≥ 0.6 s, costs ≤ ~1.5 s). */
export const HAZARD_PERIOD: Record<HazardKind, number> = {
  roomba: 8,
  laundry: 2.4,
  milk: 1,
  toaster: 4,
  steam: 6,
  drum: 3,
};

export function hazardSpotsOf(def: TrackDef): HazardSpot[] {
  const out: HazardSpot[] = [...(def.hazards ?? [])];
  for (const f of def.features) {
    if (f.kind !== 'hazard') continue;
    const side = f.side ?? 0;
    out.push(side === 0 ? { kind: 'roomba', s: f.s, side: 0 } : { kind: 'milk', s: f.s, side });
  }
  return out;
}

export const hazardIndex = (k: HazardKind): number => HAZARD_KINDS.indexOf(k);
