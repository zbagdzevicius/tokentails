import { bgStyle, cdnFile } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useState } from "react";
import { totalCatnip } from "../Phaser/map";
import { CloseButton } from "../shared/CloseButton";
import { PixelButton } from "../shared/PixelButton";
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
      <div className="text-p4 whitespace-nowrap">{title}</div>
      <div className="flex items-center gap-1 -mt-1">
        <img draggable={false} className="w-6 h-6" src={image} />
        <div className="text-p2">{stat}</div>
      </div>
    </button>
  );
};

const tailsText = `EARN $TAILS BY CRAFTING WITH YOUR CATS, INVITING FRIENDS, PLAYING AND DOING DAILY CHECK-INS.
EARN CATNIP BY PLAYING CATNIP CHAOS.
`;

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
          style={bgStyle("min-4")}
        >
          {profile.cat && (
            <div className="relative -mb-2">
              <img
                draggable={false}
                className="w-20 h-20 -mt-6 pixelated"
                src={profile.cat?.catImg}
              />
              {!!profile.cat?.blessings?.length && (
                <img
                  draggable={false}
                  className="absolute inset-0 l object-cover w-20 h-20 -mt-6 pixelated"
                  src={cdnFile(`flare-effect/${profile.cat.type}.gif`)}
                ></img>
              )}
            </div>
          )}
          <div className="text-p4 font-bold flex items-center gap-1">
            <div>ABOUT ME</div>
          </div>
        </div>
      </div>
      <div className="fixed left-4 pb-safe top-4 z-10 flex flex-col justify-between">
        <div
          onClick={() => setModal(tailsText)}
          className="flex hover:brightness-110 flex-col w-20 relative items-center font-secondary rounded-xl px-1 py-1"
          style={bgStyle("min-5")}
        >
          <div className="text-p4 font-bold flex items-center gap-1">
            <img
              draggable={false}
              className="h-5"
              src={cdnFile("logo/logo.webp")}
            />
            <div>$TAILS</div>
          </div>
          <div className="flex items-center gap-2 -mt-1">
            <div className="text-p5">{profile?.tails?.toFixed(0) || 0}</div>
          </div>
          <div className="text-p4 font-bold flex items-center gap-1">
            <img
              draggable={false}
              className="w-5 h-5"
              src={cdnFile("logo/catnip.webp")}
            />
            <div>CATNIP</div>
          </div>
          <div className="flex items-center -mt-1 -mb-1 text-p5">
            {profile?.catnipChaos?.reduce((a, b) => a + b, 0) || 0} /{" "}
            {totalCatnip}
          </div>
        </div>
        <div className="flex flex-col items-center">
          {![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
            <div
              onClick={() => setOpenedModal(GameModal.CODEX)}
              className="flex flex-col items-center font-primary text-p2 bg-blue-300 hover:scale-110 transition-all hover:mt-1 hover:border-yellow-300 hover:border-4 px-2 rounded-b-xl hover:rounded-xl relative"
            >
              <img
                src={cdnFile("codex/codex-1.webp")}
                className="h-10 -my-1 -mb-1"
              />
              <div className="text-p4 pt-1 -mt-1 -mb-1">CODEX</div>
            </div>
          )}
        </div>
      </div>
      {modal && (
        <div className="fixed inset-0 mt-safe w-full z-50 flex justify-center h-full">
          <div
            onClick={() => setModal(null)}
            className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
          ></div>
          <div
            className="z-50 rem:w-[350px] md:w-[480px] max-w-full absolute top-1/2 -translate-y-1/2 rounded-xl shadow animate-appear pb-4"
            style={bgStyle("5")}
          >
            <CloseButton onClick={() => setModal(null)} />
            <div className="pb-safe rem:min-h-[100px] p-8 flex flex-col gap-2 justify-between items-center">
              <p className="text-p3 font-secondary whitespace-pre-line text-center">
                {modal}
              </p>
              <PixelButton
                onClick={() => setModal(null)}
                text="Okey"
              ></PixelButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
