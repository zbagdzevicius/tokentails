import { CatProvider } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import dynamic from "next/dynamic";
import { useBackground } from "../catbassadors/hooks";

const Catbassadors = dynamic(
  () => import("@/components/catbassadors/Catbassadors"),
  { ssr: false }
);
const PurrQuest = dynamic(() => import("@/components/purrquest/PurrQuest"), {
  ssr: false,
});
const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });
const Adopt = dynamic(() => import("@/components/game/Adopt"), { ssr: false });

export const Game = () => {
  const { gameType, timer } = useGame();
  const { profile } = useProfile();
  const background = useBackground();

  return (
    <div className="w-full h-screen z-[9]" style={background}>
        <div className="fixed inset-0 z-[-1]">
          <img src="/assets/spooky.webp" className="w-16 m-auto draggable" />
        </div>
        {gameType === GameType.CATBASSADORS && profile && (
          <Catbassadors cat={profile?.cat} profile={profile} timer={timer} />
        )}
        {gameType === GameType.HOME && profile && <Base />}
        {gameType === GameType.SHELTER && profile && <Adopt />}
        {gameType === GameType.PURRQUEST && profile && (
          <PurrQuest cat={profile?.cat} />
        )}
    </div>
  );
};
