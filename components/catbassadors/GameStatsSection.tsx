import { useGame } from "@/context/GameContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useState } from "react";
import { PixelButton } from "../shared/PixelButton";
import { CloseButton } from "../shared/CloseButton";
import { useToast } from "@/context/ToastContext";
interface IGameStat {
  title: string;
  image: string;
  stat: string | number;
  bg: string;
  text: string;
  onClick: () => void;
}

export const GameStatSection = ({
  title,
  image,
  stat,
  bg,
  onClick,
}: IGameStat) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center font-secondary rounded-xl w-16 p-1 bg-gradient-to-r ${bg}`}
    >
      <div className="text-p4">{title}</div>
      <div className="flex items-center gap-1 -mt-1">
        <img className="w-6 h-6" src={image} />
        <div className="text-p2">{stat}</div>
      </div>
    </button>
  );
};

const coinsText = `Earn coins to receive $TAILS airdrop
Top the leaderboard to win extra prizes every week.`;

export const GameStatsSection = ({
  profile,
  setOpenedModal,
}: {
  profile: IProfile;
  setOpenedModal: (modal: GameModal) => void;
}) => {
  const [modal, setModal] = useState<null | string>(null);
  const { gameType } = useGame();
  const toast = useToast();

  if (!profile) {
    return <></>;
  }
  return (
    <div>
      <div className="fixed flex-col pb-safe top-4 z-10 right-4 flex justify-between">
        <div
          onClick={() => setOpenedModal(GameModal.PROFILE)}
          className="flex hover:brightness-110 flex-col w-20 relative items-center font-secondary rounded-xl px-1 py-2"
          style={{
            backgroundImage: "url(/base/bg.gif)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {profile.cat && (
            <div className="relative -mb-2">
              <img className="w-12 h-12" src={profile.cat?.catImg} />
              {!!profile.cat?.blessings?.length && (
                <img
                  className="absolute inset-0 l object-cover w-12 h-12"
                  src={`/flare-effect/${profile.cat.blessings[0].ability}.gif`}
                ></img>
              )}
            </div>
          )}
          <div className="text-p4 flex items-center gap-1">
            <div>STATS</div>
          </div>
        </div>
        <div className="flex flex-col items-center">
          {![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
            <div
              onClick={() =>
                toast({
                  message:
                    "To earn lives - Redeem daily rewards, invite friends and feed your cat at Home",
                })
              }
              className="flex flex-col items-center font-secondary text-p2 bg-purple-300 bg-opacity-80 hover:bg-opacity-100 px-2 rounded-b-xl"
            >
              <div className="">{profile.catbassadorsLives || 0}</div>
              <div className="flex items-center -mt-2">
                <img className="w-5 z-10 pr-1" src="/base/heart.png" />
                <div className="text-p5">LIVES</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="fixed left-4 pb-safe top-4 z-10 flex justify-between">
        <div
          onClick={() => setModal(coinsText)}
          className="flex hover:brightness-110 flex-col w-20 relative items-center font-secondary rounded-xl px-1 py-2"
          style={{
            backgroundImage: "url(/base/bg-6.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <img className="w-6 h-6" src="/logo/coin.webp" />
          <div className="text-p4 flex items-center gap-1">
            <div>COINS</div>
          </div>
          <div className="flex items-center gap-2 -mt-1">
            <div className="text-p5">{profile?.catpoints?.toFixed(0) || 0}</div>
          </div>
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 mt-safe w-full z-50 flex justify-center h-full">
          <div
            onClick={() => setModal(null)}
            className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
          ></div>
          <div className="z-50 rem:w-[350px] md:w-[480px] max-w-full bg-yellow-300 absolute top-1/2 -translate-y-1/2 rounded-xl shadow h-fit animate-appear">
            <div className="pb-safe rem:min-h-[100px] p-8 text-gray-500 flex flex-col gap-8 justify-between items-center">
              <p className="text-p3 font-secondary whitespace-pre-line text-center">
                {modal}
              </p>
              <PixelButton
                onClick={() => setModal(null)}
                text="Okey"
              ></PixelButton>
            </div>
            <CloseButton onClick={() => setModal(null)} />
          </div>
        </div>
      )}
    </div>
  );
};
