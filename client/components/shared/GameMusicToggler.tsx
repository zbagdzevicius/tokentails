import { AudioSettingsPanel } from "@/components/audio/AudioControls";

/**
 * Sound settings in the profile sheet (plan G14 "Audio"): mute and the music and effects volumes,
 * the same store as the lobby HUD toggle and Settings. Replaces the old on/off music toggle and
 * its `gameMusic` key (read once by the store as a legacy mute).
 */
export const GameMusicToggle = () => (
  <div className="my-2 w-full max-w-xs">
    <AudioSettingsPanel />
  </div>
);
