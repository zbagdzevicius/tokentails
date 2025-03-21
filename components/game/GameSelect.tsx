import { ONBOARDING_MODAL_IDS } from "@/constants/onboarding";
import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameModal, GameType } from "@/models/game";
import { StatusType } from "@/models/status";
import classNames from "classnames";
import { useCallback } from "react";
import { GameEvents } from "../Phaser/events";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { StatusBar } from "../shared/game/StatusBar";

interface IProps {
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
}

const gameTypeImages: Record<GameType, string> = {
  [GameType.CATBASSADORS]: "/game/select/catbassadors.jpg",
  [GameType.PURRQUEST]: "/game/select/purrquest.jpg",
  [GameType.SHELTER]: "/game/select/shelter.jpg",
  [GameType.HOME]: "/game/select/home.jpg",
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
      className={classNames("flex flex-col gap-1 transition", {
        "rotate-6 hover:rotate-0": [
          GameType.SHELTER,
          GameType.PURRQUEST,
        ].includes(gameType),
        "-rotate-6 hover:rotate-0": [
          GameType.CATBASSADORS,
          GameType.HOME,
        ].includes(gameType),
      })}
    >
      <img
        draggable={false}
        onClick={() => setGameType(gameType)}
        className="rem:w-[120px] hover:brightness-110 rem:min-w-[120px] lg:w-[196px] lg:rem:min-w-[196px] rounded-xl hover:animate-hover"
        src={gameTypeImages[gameType]}
      />
    </div>
  );
};

export const GameSelect = ({ setGameType, gameType }: IProps) => {
  const { cat } = useCat();
  const { profile } = useProfile();
  const { setOpenedModal } = useGame();

  const onFeedClick = useCallback(() => {
    GameEvents.CAT_EAT.push();
  }, []);

  return (
    <div
      className={classNames(
        "fixed left-1/2 right-1/2 translate-x-[50%] z-[11] flex flex-col gap-2 items-center pb-safe md:pt-0 lg:pt-10",
        {
          "top-1/2 -translate-y-1/2": gameType === GameType.HOME,
          "top-4": gameType && gameType !== GameType.HOME,
          "top-40 md:top-4": !gameType,
        }
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
          <PixelButton
            text="TO THE GAME ZONE →"
            onClick={() => setGameType(null)}
          />
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
          <div className="flex max-w-max md:gap-4 lg:gap-8 min-w-0 justify-center items-center lg:mt-8">
            <div className="flex flex-col gap-1 items-start">
              <span id={ONBOARDING_MODAL_IDS.CATBASSADORS}>
                <GameSelectItem
                  setGameType={setGameType}
                  gameType={GameType.CATBASSADORS}
                />
              </span>
              <div className="flex z-10 -mt-4 -mb-2">
                <Tag>PLAY GAMES</Tag>
              </div>
              <GameSelectItem
                setGameType={setGameType}
                gameType={GameType.PURRQUEST}
              />
            </div>

            {profile?.cat ? (
              <div className="relative w-24 min-w-24 pixelated flex flex-col items-center justify-center animate-appear">
                <img
                  draggable={false}
                  className="w-24 h-24 -mb-6"
                  src={profile.cat?.catImg}
                />
                <img
                  id={ONBOARDING_MODAL_IDS.CAT}
                  draggable={false}
                  src="/logo/logo-text.webp"
                  className="absolute w-24 h-auto -top-36 md:-top-20 md:w-16 lg:w-24 lg:-top-36"
                ></img>
                {!!profile.cat?.blessings?.length && (
                  <img
                    draggable={false}
                    className="absolute inset-0 l object-cover w-12 h-12"
                    src={`/flare-effect/${profile.cat.blessings[0].ability}.gif`}
                  ></img>
                )}

                <PixelButton
                  id={ONBOARDING_MODAL_IDS.MY_CATS}
                  onClick={() => {
                    setOpenedModal(GameModal.CATS);
                  }}
                  text="CATS"
                ></PixelButton>
              </div>
            ) : (
              <img
                src="/icons/loader.webp"
                className="w-24 h-24 -mb-6 animate-spin pixelated"
              />
            )}
            <div className="flex flex-col gap-1 items-end">
              <span id={ONBOARDING_MODAL_IDS.SHELTER}>
                <GameSelectItem
                  setGameType={setGameType}
                  gameType={GameType.SHELTER}
                />
              </span>
              <div className="flex z-10 -mt-4 -mb-2">
                <Tag>SAVE CATS</Tag>
              </div>

              <GameSelectItem
                setGameType={setGameType}
                gameType={GameType.HOME}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
