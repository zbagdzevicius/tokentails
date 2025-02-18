import { useCat } from "@/context/CatContext";
import { useToast } from "@/context/ToastContext";
import { GameType } from "@/models/game";
import classNames from "classnames";
import { useCallback } from "react";
import { GameEvents } from "../Phaser/events";
import { PixelButton } from "../shared/PixelButton";
import { StatusBar } from "../shared/game/StatusBar";
import { StatusType } from "@/models/status";

interface IProps {
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
}

export const GameSelect = ({ setGameType, gameType }: IProps) => {
  const { cat } = useCat();
  const toast = useToast();

  const onFeedClick = useCallback(() => {
    GameEvents.CAT_EAT.push();
  }, []);

  return (
    <div
      className={classNames("fixed left-1/2 right-1/2 translate-x-[50%] z-[11] flex flex-col gap-2 items-center pb-safe", {
        "top-1/2 -translate-y-1/2 pt-48": gameType === GameType.HOME,
        "top-4": gameType !== GameType.HOME,
      })}
    >
      {gameType && cat && (cat.status.EAT || 0) >= 4 && (
        <PixelButton
          text="TO THE GAME ZONE →"
          active={cat?.status.EAT !== 4}
          onClick={() => {
            if (cat?.status?.EAT !== 4) {
              toast({ message: "You must feed your cat first" });
            } else {
              setGameType(null);
            }
          }}
        />
      )}
      {gameType === GameType.HOME && cat && (cat.status.EAT || 0) < 4 && (
        <div className="flex flex-col items-center gap-2">
          <PixelButton text="Feed" onClick={onFeedClick} />

          {cat && (
            <div className="w-36">
              <StatusBar
                status={cat.status[StatusType.EAT]!}
                type={StatusType.EAT}
              />
            </div>
          )}
        </div>
      )}
      {!gameType && (
        <>
          <div
            className="font-secondary whitespace-nowrap rem:w-[200px] md:rem:w-[400px] text-center text-p1 md:text-h5 px-2 rounded-lg py-1 animate-appear"
            style={{
              backgroundImage: "url(/base/bg-2.gif)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            GAME ZONES
          </div>
          <div className="flex min-w-0 gap-2 justify-center">
            <img
              onClick={() => setGameType(GameType.CATBASSADORS)}
              className="h-full hover:brightness-110 rem:min-w-[96px] md:rem:min-w-[196px] rounded-xl hover:animate-hover"
              src="/game/select/catbassadors.jpg"
            />
            <img
              onClick={() => setGameType(GameType.PURRQUEST)}
              className="h-full hover:brightness-110 rem:min-w-[96px] md:rem:min-w-[196px] rounded-xl hover:animate-hover"
              src="/game/select/purrquest.jpg"
            />
          </div>
          <div className="flex min-w-0">
            <img
              onClick={() => setGameType(GameType.SHELTER)}
              className="rem:min-w-[200px] md:rem:min-w-[400px] h-full hover:brightness-110 rounded-xl hover:animate-hover"
              src="/game/select/shelter-wide.jpg"
            />
          </div>
          {/* <div className="flex min-w-0">
            <img
              onClick={() => setGameType(GameType.STORYMODE)}
              className="rem:min-w-[200px] md:rem:min-w-[400px] h-full hover:brightness-110 rounded-xl hover:animate-hover"
              src="/game/select/shelter-wide.jpg"
            />
          </div> */}
        </>
      )}
    </div>
  );
};
