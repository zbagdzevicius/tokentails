/** Authored tracks (GDD 6.1). Laundry Spin and Yarn Canyon land here later through the same TrackDef format. */
import type { TrackDef } from '../../../types';
import { KITCHEN } from './kitchen';
import { ROOFTOPS } from './rooftops';

export const TRACKS: readonly TrackDef[] = [KITCHEN, ROOFTOPS];

export function trackById(id: string | null | undefined): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? KITCHEN;
}

export { KITCHEN, ROOFTOPS };
