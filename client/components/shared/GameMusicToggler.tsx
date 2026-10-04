import { AudioIcon } from "@/components/audio/icons";
import { toggleMuted } from "@/components/audio/settings";
import { useAudioSettings } from "@/components/audio/useAudioSettings";
import { KeyValueRow, ModalButton } from "@/components/ui/modal";
import dynamic from "next/dynamic";
import { useState } from "react";

// Settings (sound and graphics) opens on top of the profile; loaded when asked for.
const SettingsModal = dynamic(
  () => import("@/components/audio/SettingsModal").then((module) => module.SettingsModal),
  { ssr: false }
);

/**
 * Sound in the profile (plan G14 "Audio"): what is set now, a one-tap mute, and the way into
 * Settings, which holds the volume sliders and the graphics options. The profile no longer repeats
 * the sliders. Same store as the lobby HUD toggle and Settings.
 */
export const GameMusicToggle = () => {
  const { muted } = useAudioSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const summary = muted ? "Muted" : "On";
  return (
    <>
      <KeyValueRow
        label="Sound"
        icon={<AudioIcon name={muted ? "sound-off" : "sound-on"} size={20} />}
        value={summary}
        data-testid="profile-sound"
        action={
          <div className="flex items-center gap-2">
            {/* Says what a tap does ("Mute", "Unmute"): the row's value already says the state, and
                the speaker icon is the row's own, so the button needs words, not a second speaker. */}
            <ModalButton
              variant="secondary"
              size="sm"
              data-testid="profile-mute"
              data-audio-control=""
              data-muted={muted}
              onClick={() => toggleMuted()}
            >
              {muted ? "Unmute" : "Mute"}
            </ModalButton>
            <ModalButton
              variant="secondary"
              size="sm"
              aria-haspopup="dialog"
              data-testid="profile-open-settings"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </ModalButton>
          </div>
        }
      />
      {settingsOpen && <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} layer="modal-nested" />}
    </>
  );
};
