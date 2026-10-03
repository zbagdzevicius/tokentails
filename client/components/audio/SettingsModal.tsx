import { GameModal } from "@/components/ui/GameModal";
import { AudioSettingsPanel } from "./AudioControls";
import { GraphicsTierControl } from "./GraphicsTierControl";

/**
 * Settings (plan G14 "Audio", G7 "Render tiers"): sound (mute, music and effects volume) and the
 * graphics tier. Like every GameModal it suspends the games, but it keeps the music playing
 * (`keepAudio`) so the player hears the volume they set.
 */
export const SettingsModal = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  return (
    <GameModal open={open} onOpenChange={onOpenChange} title="SETTINGS" name="settings" size="sm" keepAudio>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h3 className="font-primary text-p4 uppercase tracking-wide text-tt-gold-400">Sound</h3>
          <AudioSettingsPanel />
        </div>
        <GraphicsTierControl />
      </div>
    </GameModal>
  );
};
