import { TRedeemLives } from "@/constants/telegram-api";
import { IUtils } from "@/context/ProfileContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useCallback, useMemo } from "react";
import { PixelButton } from "../button/PixelButton";
import { GameStatsSection } from "../catbassadors/GameStatsSection";
import { useToast } from "@/context/ToastContext";

interface IProps {
  profile: IProfile;
  utils: IUtils | null;
  gameType: GameType | null;
  shareUrl?: string;
  setProfileUpdate: (profile: Partial<IProfile>) => void;
  setOpenedModal: (modal: GameModal) => void;
  setIsStarted: (isStarted: boolean) => void;
}

export const GameOptionsModal = ({
  utils,
  profile,
  gameType,
  shareUrl,
  setProfileUpdate,
  setOpenedModal,
  setIsStarted,
}: IProps) => {
  const numberOfPointsToRedeem = useMemo(() => {
    const referralsPoints = (profile?.referrals?.length || 0) * 50;
    const streakPoints = (profile?.streak || 0) * 25;
    const basePoints = 250;

    return referralsPoints + streakPoints + basePoints;
  }, [profile?.referrals, profile?.streak]);
  const toast = useToast();

  const numberOfLivesToRedeem = useMemo(() => {
    return (profile?.referrals?.length || 0) + 3;
  }, [profile?.referrals]);

  const redeemLives = useCallback(async () => {
    await TRedeemLives();
    setProfileUpdate({
      canRedeemLives: false,
      streak: (profile.streak || 0) + 1,
      catpoints: (profile.catpoints || 0) + numberOfPointsToRedeem,
      catbassadorsLives:
        (profile.catbassadorsLives || 0) + numberOfLivesToRedeem,
    });
  }, []);

  return (
    <>
      <GameStatsSection profile={profile} />
      <div className="fixed bottom-8 left-4 right-4 pb-safe flex justify-between items-end">
        <div className="flex flex-col items-center animate-hover">
          <div
            onClick={() =>
              toast({
                message:
                  "To earn lives - Redeem daily rewards, invite friends and feed your cat at Home",
              })
            }
            className="flex flex-col items-center font-secondary text-p2 opacity-75 bg-yellow-300 px-2 rounded-t-xl"
          >
            <img className="w-8 z-10 pt-2" src="/base/heart.png" />
            <div className="-mt-1">{profile.catbassadorsLives || 0}</div>
            <div className="-mt-2 text-p4">LIVES</div>
          </div>
          {gameType === GameType.CATBASSADORS && (
            <PixelButton
              active={!profile.catbassadorsLives}
              onClick={() =>
                profile.catbassadorsLives > 0
                  ? setIsStarted(true)
                  : toast({ message: "Earn more lives to play" })
              }
              text="Play"
            ></PixelButton>
          )}
        </div>
        {gameType !== GameType.HOME && (
          <div className="flex flex-col gap-4">
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.PROFILE);
              }}
              text="STATS"
            ></PixelButton>
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.QUESTS);
              }}
              text="QUESTS"
            ></PixelButton>
            <div className="relative">
              <div className="relative z-10 flex justify-center">
                <PixelButton
                  onClick={() => {
                    setOpenedModal(GameModal.LEADERBOARD_DAILY);
                  }}
                  text="CONTEST"
                ></PixelButton>
              </div>
              <img
                src="/logo/coin.webp"
                className="w-8 absolute top-2 left-0"
              />
              <img
                src="/logo/boss-coin.png"
                className="w-8 absolute top-2 right-0"
              />
            </div>
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.LEADERBOARD);
              }}
              text="LEADERBOARD"
            ></PixelButton>
          </div>
        )}

        {profile.canRedeemLives && gameType !== GameType.HOME && (
          <div className="flex flex-col items-center">
            <div className="flex flex-col items-center font-secondary text-p2 opacity-75 bg-white px-1 rounded-xl">
              <img className="w-8 z-10 -mt-2 pt-4" src="/logo/coin.webp" />
              <div>GRAB</div>
              <div className="-mt-2 text-p5">
                {numberOfPointsToRedeem} COINS
              </div>
              <div className="-mt-2 text-h3">+</div>
              <img className="w-6 md:w-8 z-10 -mt-2" src="/base/heart.png" />
              <div className="text-p5">{numberOfLivesToRedeem} FREE</div>
              <div className="-mt-2">LIVES</div>
              <img className="w-10 md:w-12" src="/logo/chest.webp" />
            </div>
            <PixelButton
              onClick={() => (profile.canRedeemLives ? redeemLives() : {})}
              text="REDEEM"
            ></PixelButton>
          </div>
        )}
        <div className="flex flex-col items-center">
          <div className="flex flex-col items-center font-secondary text-p2 opacity-75 bg-white px-1 rounded-t-xl">
            <img className="w-8 z-10 -mt-2 pt-4" src="/logo/coin.webp" />
            <div>EARN</div>
            <div className="-mt-2 text-p5">1000 COINS</div>
            <div className="-mt-2 text-h3">+</div>
            <img className="w-8 z-10 -mt-3" src="/base/heart.png" />
            <div className="-mt-1">GET</div>
            <div className="text-p5 -mt-2">+1 daily live</div>
          </div>
          <PixelButton
            onClick={() => {
              utils?.shareURL(shareUrl!);
            }}
            text="INVITE"
          ></PixelButton>
        </div>
      </div>
    </>
  );
};
