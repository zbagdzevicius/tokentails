/**
 * Lane "tracks" install (iteration 2). Owns core/track/**, src/tracks/** (hazard sims and views, coin view, flyover
 * paths) and src/ugc/**.
 *
 * Extension points: `registerHazard(kind, def)` (src/tracks/hazards/registry.ts, run inside the sim), TrackDef's
 * optional `branches`, `hazards`, `coins`, `flyover`, `music` fields (types.ts), `queryTrack` (walls and branch per
 * point), and JuiceBus listeners for the hazard and coin views.
 */
import type { Shell } from '../core/app/shell';
import { registerStrings } from '../ui/i18n';
import { TRACKS_EN } from '../ui/strings/tracks.en';

export function installTracks(shell: Shell): void {
  registerStrings('en', TRACKS_EN);
  void shell;
}
