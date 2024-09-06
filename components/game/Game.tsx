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

const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });
const Adopt = dynamic(() => import("@/components/game/Adopt"), { ssr: false });

export const Game = () => {
  const { gameType, timer } = useGame();
  const { profile } = useProfile();
  const background = useBackground();

  return (
    <div className="w-full h-screen" style={background}>
      {gameType === GameType.CATBASSADORS && profile && (
        <Catbassadors cat={profile?.cat} profile={profile} timer={timer} />
      )}
      {gameType === GameType.HOME && profile && (
        <CatProvider>
          <Base />
        </CatProvider>
      )}
      {gameType === GameType.SHELTER && profile && <Adopt />}
    </div>
  );
};
