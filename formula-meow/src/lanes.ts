/**
 * Lane installation point (LANES.md). Each lane exposes one `install*` call here; the shell never imports lane
 * internals beyond the contracts (SimPlugins, JuiceBus, ShareHooks, TrackCodec). Lanes add their line, nothing else.
 */
import type { Shell } from './core/app/shell';
import { installItemsAi } from './items-ai/view/install';

export function installLanes(shell: Shell): void {
  // items-ai: SimPlugins come from createSimPlugins() (src/items-ai/index.ts), created per race by the shell.
  installItemsAi(shell);
  // juice:    shell.bus.add(listener) for audio / music / VFX (the starter audio + feel are already added).
  // share:    setShareHooks({ onResult, resolveRoute }) from src/share/hooks.ts.
  // ugc:      setTrackCodec(codec) from src/ugc/codec/track-codec.ts.
  void shell;
}
