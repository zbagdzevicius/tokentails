/**
 * Lane installation point (LANES.md). Each lane exposes one `install*` call here; the shell never imports lane
 * internals beyond the contracts (SimPlugins, JuiceBus, ShareHooks, TrackCodec). Lanes add their line, nothing else.
 */
import type { Shell } from './core/app/shell';
import { installJuice } from './juice';

export function installLanes(shell: Shell): void {
  // items-ai: SimPlugins come from createSimPlugins() (src/items-ai/index.ts), created per race by the shell.
  // juice:    shell.bus.add(listener) for audio / music / VFX (the starter audio + feel are already added).
  // share:    setShareHooks({ onResult, resolveRoute }) from src/share/hooks.ts.
  // ugc:      setTrackCodec(codec) from src/ugc/codec/track-codec.ts.
  installJuice(shell); // juice: race audio + music, VFX, sky, hit-stop, quality auto-scaler
  void shell;
}
