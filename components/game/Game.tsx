import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useBodyOverflowHidden } from "@/hooks/useBodyOverflowHidden";
import { GameType } from "@/models/game";
import dynamic from "next/dynamic";
import { useBackground } from "../../constants/hooks";
import Snowfall from "../shared/Snowfall";
import CatnipChaos from "@/components/CatnipChaos/CatnipChaos";
import { cdnFile } from "@/constants/utils";
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
      {!isStarted && <div className="absolute z-10 flex md:flex-col gap-2 pb-2 md:p-8 bottom-0 justify-center max-sm:left-0 right-0 opacity-60">
        <img draggable={false} className="h-4 lg:h-8" src={cdnFile("images/sponsor/mantle.webp")} />
        <img draggable={false} className="h-4 lg:h-8" src={cdnFile("images/sponsor/bga.webp")} />
        <img draggable={false} className="h-4 lg:h-8" src={cdnFile("images/sponsor/bybit.webp")} />
      </div>}
    </div>
  );
};
