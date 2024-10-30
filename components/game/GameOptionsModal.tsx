import { TRedeemLives } from "@/constants/telegram-api";
import { IUtils } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GameStatsSection } from "../catbassadors/GameStatsSection";
import { GameEvents } from "../Phaser/events";
import { PixelButton } from "../shared/PixelButton";

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
  const [isLoading, setIsLoading] = useState(true);

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
    toast({
      message: `You got ${numberOfPointsToRedeem} coins + ${numberOfLivesToRedeem} lives`,
    });
  }, []);
  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 2000);
  }, [gameType]);

  const onFeedClick = useCallback(() => {
    GameEvents.CAT_EAT.push();
  }, []);

  return (
    <>
      <GameStatsSection profile={profile} setOpenedModal={setOpenedModal} />
      <div className="fixed z-10 bottom-8 left-4 right-4 pb-safe flex justify-between items-end">
        <div className="flex flex-col items-center animate-hover">
          {[GameType.CATBASSADORS, GameType.PURRQUEST].includes(gameType!) && (
            <span className="mb-8 animate-pulse">
              <img className="h-8 rotate-90" src="icons/arrow.webp"></img>
            </span>
          )}
          {![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
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
          )}

          {[GameType.CATBASSADORS, GameType.PURRQUEST].includes(gameType!) && (
            <PixelButton
              active={!profile.catbassadorsLives}
              onClick={() =>
                isLoading
                  ? {}
                  : profile.catbassadorsLives > 0
                    ? setIsStarted(true)
                    : toast({ message: "Earn more lives to play" })
              }
              text={isLoading ? "READY" : "Play"}
            ></PixelButton>
          )}
        </div>
        {![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
          <div className="flex flex-col gap-4">
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.CATS);
              }}
              text="CATS"
            ></PixelButton>
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.QUESTS);
              }}
              text="QUESTS"
            ></PixelButton>
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.LEADERBOARD);
              }}
              text="CONTEST"
            ></PixelButton>
          </div>
        )}
        {gameType === GameType.HOME && (
          <div className="flex flex-col gap-4 m-auto">
            <PixelButton text="Feed" onClick={onFeedClick} />
          </div>
        )}

        {profile.canRedeemLives &&
          ![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
            <div className="flex flex-col items-center">
              <div className="flex w-16 flex-col items-center font-secondary text-p2 opacity-75 bg-white px-1 rounded-t-xl">
                <img className="w-8 z-10 pt-4 -mt-2" src="/logo/coin.webp" />
                <div className="text-p5 mt-1">
                  {numberOfPointsToRedeem} COINS
                </div>
                <div className="-mt-2 text-h3">+</div>
                <img className="w-6 md:w-8 z-10 -mt-2" src="/base/heart.png" />
                <div className="text-p5">3 LIVES</div>
              </div>
              <PixelButton
                onClick={() => (profile.canRedeemLives ? redeemLives() : {})}
                text="REDEEM"
              ></PixelButton>
            </div>
          )}
        {![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
          <div className="flex flex-col items-center">
            <div className="flex w-16 flex-col items-center font-secondary text-p2 opacity-75 bg-white px-1 rounded-t-xl">
              <img className="w-8 z-10 pt-4 -mt-2" src="/logo/coin.webp" />
              <div className="text-p5 mt-1">2000 COINS</div>
              <div className="-mt-2 text-h3">+</div>
              <img className="w-6 md:w-8 z-10 -mt-2" src="/base/heart.png" />
              <div className="text-p5">+DAILY LIVE</div>
            </div>
            <PixelButton
              onClick={() => {
                utils?.shareURL(shareUrl!);
              }}
              text="INVITE"
            ></PixelButton>
          </div>
        )}
      </div>
    </>
  );
};
