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
const CATNIP_CHAOS = dynamic(
  () => import("@/components/CatnipChaos/CatnipChaos"),
  {
    ssr: false,
  }
);
export const Game = () => {
  const { gameType, isStarted } = useGame();
  const { profile } = useProfile();
  const background = useBackground();
  useBodyOverflowHidden();

  return (
    <div className="w-full max-h-screen h-full absolute" style={background}>
      {!isStarted && <Snowfall />}
      {gameType === GameType.HOME && profile && <Base />}
      {gameType === GameType.SHELTER && profile && <Adopt />}
      {gameType === GameType.CATNIP_CHAOS && profile && <CATNIP_CHAOS />}
    </div>
  );
};
