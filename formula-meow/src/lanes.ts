/**
 * Lane installation point (LANES.md). Each lane exposes one `install*` call here; the shell never imports lane
 * internals beyond the contracts (SimPlugins, JuiceBus, ShareHooks, TrackCodec, screens, app bus, result sections).
 * Iteration 2: the five lanes' lines are pre-wired; lanes fill their install files, nobody edits this file.
 */
import type { Shell } from './core/app/shell';
import { installItemsAi } from './items-ai/view/install';
import { installJuice } from './juice';
import { installShare } from './share';
import { installUgc } from './ugc/hub';
import { installModes } from './modes/install';
import { installTracks } from './tracks/install';
import { installFeel } from './core/render/install';
import { installProgression } from './progression/install';
import { installAudioUi } from './ui/install';
import { installIntegration } from './integration';

export function installLanes(shell: Shell): void {
  // v1 lanes
  installItemsAi(shell); // item views (the SimPlugins come from createSimPlugins(cfg), per race)
  installJuice(shell); // race audio + music, VFX, sky, hit-stop, quality auto-scaler
  installUgc(shell); // track codec, Tracks screen, Track Doodle editor
  installShare(shell); // dares, clip, Daily Cup, your cat, Pink Paw line
  // iteration 2 lanes (ITERATION-2.md section 2)
  installAudioUi(shell); // strings, HUD and menu look, audio
  installFeel(shell); // camera modes, animation, particles, post
  installTracks(shell); // hazards, coins, branches, new tracks
  installProgression(shell); // fish, unlocks, achievements, garage
  installModes(shell); // title, menu, GP, time trial, battle (last: it may put a screen in front of the race)
  installIntegration(shell); // the integrator's wiring between the lanes (src/integration.ts)
}
