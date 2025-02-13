import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import dynamic from "next/dynamic";
import { useBackground } from "../../constants/hooks";
import Snowfall from "../shared/Snowfall";
const Catbassadors = dynamic(
  () => import("@/components/catbassadors/Catbassadors"),
  { ssr: false }
);
const PurrQuest = dynamic(() => import("@/components/purrquest/PurrQuest"), {
  ssr: false,
});
const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });
const Adopt = dynamic(() => import("@/components/shelter/Shelter"), {
  ssr: false,
});
const Story = dynamic(() => import("@/components/storyMode/StoryMode"), {
  ssr: false,
});
export const Game = () => {
  const { gameType, timer } = useGame();
  const { profile } = useProfile();
  const background = useBackground();

  return (
    <div className="w-full max-h-screen h-full absolute" style={background}>
      <div className="fixed inset-0 z-0">
        <Snowfall />
      </div>
      {gameType === GameType.CATBASSADORS && profile && (
        <Catbassadors cat={profile?.cat} timer={timer} />
      )}
      {gameType === GameType.HOME && profile && <Base />}
      {gameType === GameType.SHELTER && profile && <Adopt />}
      {gameType === GameType.PURRQUEST && profile && <PurrQuest />}
      {gameType === GameType.STORYMODE && profile && <Story />}
    </div>
  );
};
