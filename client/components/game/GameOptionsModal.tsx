import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { HUD_AUDIO_COLUMN, HUD_SETTINGS_RIGHT, HUD_SETTINGS_TOP } from "@/components/audio/hudPlacement";
import { SettingsButton } from "@/components/audio/SettingsButton";
import { SettingsModal } from "@/components/audio/SettingsModal";
import { useState } from "react";
import { GameStatsSection } from "../catbassadors/GameStatsSection";

interface IProps {
  profile: IProfile;
  gameType: GameType | null;
  setProfileUpdate: (profile: Partial<IProfile>) => void;
  setOpenedModal: (modal: GameModal) => void;
}

export const GameOptionsModal = ({
  profile,
  setOpenedModal,
}: IProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <GameStatsSection profile={profile} setOpenedModal={setOpenedModal} />
      {/* Settings (plan G14 "Audio"): sound and the graphics tier. */}
      <div className={HUD_AUDIO_COLUMN} style={{ top: HUD_SETTINGS_TOP, right: HUD_SETTINGS_RIGHT }}>
        <SettingsButton onClick={() => setSettingsOpen(true)} />
      </div>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      {/* PACKS, the daily spin and EVENTS are part of the lobby composition (GameSelect). */}
    </>
  );
};
