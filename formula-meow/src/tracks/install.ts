/**
 * Lane "tracks" install (iteration 2). Owns core/track/**, src/tracks/** (hazard sims and views, coin view, the
 * track view) and src/ugc/**.
 *
 * - Hazards: the six kinds register with `registerHazard` (src/tracks/hazards/kinds.ts); `createHazardSystem` also
 *   runs the track rules (open bridges, branch gaps, solid props) and keeps the AI's branch plans.
 * - Views: `TrackView` (a JuiceBus listener) adds the fish coins, the hazards and the theme dressing to each race.
 * - Strings: `TRACKS_EN` (track names, route signs, hazard and UGC sticker labels).
 */
import type { Shell } from '../core/app/shell';
import { registerStrings } from '../ui/i18n';
import { TRACKS_EN } from '../ui/strings/tracks.en';
import { registerDefaultHazards } from './hazards/kinds';
import { TrackView } from './view/track-view';

export function installTracks(shell: Shell): TrackView {
  registerStrings('en', TRACKS_EN);
  registerDefaultHazards();
  const view = new TrackView({
    race: () => (shell.view && shell.world ? { group: shell.view.world.group, track: shell.world.track, theme: shell.view.world.theme } : null),
    burst: (k, color, n, speed) => {
      const s = shell.world?.st.karts[k];
      if (s && shell.view) shell.view.burst(s.x, s.y + 0.5, s.z, color, n, speed);
    },
    retire: (fn) => shell.retire(fn),
  });
  shell.bus.add(view);
  (window as unknown as { __fmTracks?: TrackView }).__fmTracks = view;
  return view;
}
