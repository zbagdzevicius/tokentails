import { GameModal, type GameModalLayer } from "@/components/ui/GameModal";
import { ModalSection, ModalStack } from "@/components/ui/modal";
import { AudioSettingsPanel } from "./AudioControls";
import { GraphicsTierControl } from "./GraphicsTierControl";

/**
 * Settings (plan G14 "Audio", G7 "Render tiers"): sound (mute, music and effects volume) and the
 * graphics tier. Like every GameModal it suspends the games, but it keeps the music playing
 * (`keepAudio`) so the player hears the volume they set. ABOUT ME opens it on the nested layer.
 */
export const SettingsModal = ({
  open,
  onOpenChange,
  layer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layer?: GameModalLayer;
}) => {
  return (
    <GameModal
      open={open}
      onOpenChange={onOpenChange}
      title="SETTINGS"
      icon="settings-cog"
      description="Sound and graphics on this device."
      name="settings"
      size="sm"
      layer={layer}
      keepAudio
    >
      <ModalStack>
        <ModalSection title="Sound" icon="volume-2" helper="Turn all sound off, or set music and effects apart.">
          <AudioSettingsPanel />
        </ModalSection>
        <GraphicsTierControl />
      </ModalStack>
    </GameModal>
  );
};
