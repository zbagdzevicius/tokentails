import { useGame } from "@/context/GameContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useState } from "react";
import { PixelButton } from "../shared/PixelButton";
import { CloseButton } from "../shared/CloseButton";
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
      className={`flex flex-col items-center font-secondary rounded-xl w-24 p-2 bg-gradient-to-r ${bg}`}
    >
      <div className="text-p4">{title}</div>
      <div className="flex items-center gap-2 -mt-1">
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

  if (!profile) {
    return <></>;
  }
  return (
    <div>
      <div
        className={`fixed left-4 ${gameType === GameType.SHELTER ? 'pb-safe bottom-4 z-10' : 'top-2 z-10'} right-4 flex justify-between opacity-75`}
      >
        <div
          onClick={() => setModal(coinsText)}
          className="flex flex-col w-20 relative items-center font-secondary rounded-xl px-1 py-2 bg-gradient-to-b from-yellow-300 to-red-300"
        >
          <img className="w-6 h-6" src="/logo/coin.webp" />
          <div className="text-p4 flex items-center gap-1">
            <div>COINS</div>
          </div>
          <div className="flex items-center gap-2 -mt-1">
            <div className="text-p5">{profile?.catpoints?.toFixed(0) || 0}</div>
          </div>
        </div>
        <div
          onClick={() => setOpenedModal(GameModal.PROFILE)}
          className="flex flex-col w-20 relative items-center font-secondary rounded-xl px-1 py-2 bg-gradient-to-b from-yellow-300 to-red-300"
        >
          <img className="w-10 h-10" src={profile.cat?.catImg} />
          <div className="text-p4 flex items-center gap-1">
            <div>STATS</div>
          </div>
        </div>
      </div>
      {modal && (
        < div className="fixed inset-0 pt-safe w-full z-50 flex justify-center h-full">
          <div
            onClick={() => setModal(null)}
            className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
          ></div>
          <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-white absolute top-[4rem] md:top-[9rem] rounded-lg shadow h-fit">
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
      )
      }
    </div >
  );
};
