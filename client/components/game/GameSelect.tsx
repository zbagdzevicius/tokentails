import { useState } from "react";
import { cdnFile } from "@/constants/utils";
import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameModal, GameType } from "@/models/game";
import { StatusType } from "@/models/status";
import classNames from "classnames";
import { useCallback } from "react";
import { GameEvents } from "../Phaser/events";
import { PixelButton } from "../shared/PixelButton";
import { StatusBar } from "../shared/game/StatusBar";
import { GameSelectModal } from "../shared/GameSelectModal";

interface IProps {
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
}

const gameTypeImages: Partial<Record<GameType, string>> = {
  [GameType.SHELTER]: cdnFile("game/select/shelter.webp"),
  [GameType.HOME]: cdnFile("game/select/home.webp"),
};

const GameSelectItem = ({
  gameType,
  setGameType,
}: {
  gameType: GameType;
  setGameType: (gameType: GameType | null) => void;
}) => {
  return (
    <div
      className={classNames(
        "flex flex-col gap-1 transition relative glow-box opacity-50 brightness-125 hover:opacity-100 hover:brightness-100",
        {
          "rotate-6 hover:rotate-0": [GameType.SHELTER].includes(gameType),
          "-rotate-6 hover:rotate-0": [GameType.HOME].includes(gameType),
        },
      )}
      onClick={() => setGameType(gameType)}
    >
      <img
        draggable={false}
        className="rem:w-[80px] hover:brightness-110 rem:min-w-[80px] rounded-xl hover:animate-hover border-[3px] border-yellow-900"
        src={gameTypeImages[gameType]}
      />
    </div>
  );
};

export const GameSelect = ({ setGameType, gameType }: IProps) => {
  const { cat } = useCat();
  const { profile } = useProfile();
  const { setOpenedModal } = useGame();
  const [showGameSelectModal, setShowGameSelectModal] = useState(false);

  const onFeedClick = useCallback(() => {
    GameEvents.CAT_EAT.push();
  }, []);
  return (
    <>
      <div
        className={classNames(
          "fixed left-1/2 right-1/2 translate-x-[50%] z-[30] flex flex-col gap-2 items-center pb-safe pt-2 lg:pt-10",
          {
            "top-1/2 -translate-y-1/2": gameType === GameType.HOME,
            "top-4": gameType && gameType !== GameType.HOME,
            "lg:top-20": !gameType,
          },
        )}
      >
        {gameType && (
          <span
            className={classNames("", {
              "mt-40 md:mt-36":
                gameType === GameType.HOME && (cat?.status.EAT || 0) >= 4,
              "mt-64 md:mt-56":
                gameType === GameType.HOME && (cat?.status.EAT || 0) < 4,
            })}
          >
            <PixelButton text="← GO BACK" onClick={() => setGameType(null)} />
          </span>
        )}
        {gameType === GameType.HOME && cat && (cat.status.EAT || 0) < 4 && (
          <div className="flex flex-col items-center gap-2">
            <PixelButton text="Feed To Control" onClick={onFeedClick} />

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
            <img
              src="/mascots/actions/play_games.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="hidden md:block fixed bottom-4 left-4 w-24 lg:w-36 -rotate-6 pointer-events-none select-none z-[20] drop-shadow-xl"
            />
            <img
              src="/mascots/tasks/celebrating_finishing_work.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="hidden md:block fixed bottom-4 right-4 w-24 lg:w-36 rotate-6 pointer-events-none select-none z-[20] drop-shadow-xl"
            />
            <div className="flex flex-col max-w-max md:gap-4 lg:gap-8 min-w-0 items-center lg:-mt-8 relative">
              {profile?.cat && (
                <div className="flex gap-36 mt-48 md:mt-20 lg:mt-40 items-end absolute">
                  <GameSelectItem
                    setGameType={setGameType}
                    gameType={GameType.SHELTER}
                  />

                  <GameSelectItem
                    setGameType={setGameType}
                    gameType={GameType.HOME}
                  />
                </div>
              )}
              {profile?.cat ? (
                <div className="relative w-24 min-w-24 flex flex-col items-center justify-center animate-appear">
                  <img
                    draggable={false}
                    src={cdnFile("logo/logo-text.webp")}
                    className="min-w-36 h-auto md:min-w-16 lg:min-w-64 z-10"
                  ></img>
                  <img
                    draggable={false}
                    className="w-28 min-w-28 h-28 -mx-4 -mb-9 md:-mt-4 lg:mt-0 relative z-10 pixelated"
                    src={profile.cat?.catImg}
                  />

                  <span className="pt-2 relative z-20">
                    <PixelButton
                      onClick={() => {
                        setOpenedModal(GameModal.CATS);
                      }}
                      text="MY PETS"
                    ></PixelButton>
                  </span>
                  <div className="flex flex-col gap-1 items-start mt-8 md:mt-4 lg:mt-8">
                    {/* <PixelButton
                      isBig
                      text="PLAY"
                      onClick={() => setGameType(GameType.CATNIP_CHAOS)}
                    /> */}
                    <PixelButton
                      isBig
                      text="PLAY"
                      onClick={() => setShowGameSelectModal(true)}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-48 md:mt-24 animate-pulse">
                  <img
                    src={cdnFile("logo/paw.webp")}
                    className="w-24 min-w-24 animate-spin-slow"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showGameSelectModal && (
        <GameSelectModal
          onClose={() => setShowGameSelectModal(false)}
          setGameType={setGameType}
        />
      )}
    </>
  );
};
