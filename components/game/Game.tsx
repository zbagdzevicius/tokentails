import CatnipChaos from "@/components/CatnipChaos/CatnipChaos";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useBodyOverflowHidden } from "@/hooks/useBodyOverflowHidden";
import { GameType } from "@/models/game";
import dynamic from "next/dynamic";
import { useBackground } from "../../constants/hooks";
import Snowfall from "../shared/Snowfall";
const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });
const Adopt = dynamic(() => import("@/components/shelter/Shelter"), {
  ssr: false,
});
export const Game = () => {
  const { gameType, isStarted, level } = useGame();
  const { profile } = useProfile();
  const background = useBackground({ level });
  useBodyOverflowHidden();

  return (
    <div className="w-full max-h-screen h-full absolute" style={background}>
      {!isStarted && <Snowfall />}
      {gameType === GameType.HOME && profile && <Base />}
      {gameType === GameType.SHELTER && profile && <Adopt />}
      {gameType === GameType.CATNIP_CHAOS && profile && <CatnipChaos />}
    </div>
  );
};
