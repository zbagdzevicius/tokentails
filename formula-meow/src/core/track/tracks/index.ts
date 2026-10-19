/**
 * Authored tracks (GDD 6.1, ITERATION-2.md lane "tracks"). `TRACKS` is the race rotation (Next, Daily Cup): the six
 * circuits in cup order. `ALL_TRACKS` adds the battle arena; `trackById` finds every one of them.
 */
import type { TrackDef } from '../../../types';
import { KITCHEN } from './kitchen';
import { ROOFTOPS } from './rooftops';
import { ARENAS, CAFE, LAUNDRY, RUG, SHELTER, STUB_TRACKS, YARN } from './stubs';

export const TRACKS: readonly TrackDef[] = [KITCHEN, LAUNDRY, ROOFTOPS, YARN, CAFE, SHELTER];

/** Every track and arena by id (content/ids.ts TRACK_IDS + ARENA_IDS). */
export const ALL_TRACKS: readonly TrackDef[] = [...TRACKS, ...ARENAS];

export function trackById(id: string | null | undefined): TrackDef {
  return ALL_TRACKS.find((t) => t.id === id) ?? KITCHEN;
}

export { KITCHEN, ROOFTOPS, LAUNDRY, YARN, CAFE, SHELTER, RUG, STUB_TRACKS, ARENAS };
