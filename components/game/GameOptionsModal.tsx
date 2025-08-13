import { USER_API } from "@/api/user-api";
import { getNextDayMidnight } from "@/constants/utils";
import { useToast } from "@/context/ToastContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useCallback, useMemo } from "react";
import { GameStatsSection } from "../catbassadors/GameStatsSection";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";

interface IProps {
  profile: IProfile;
  gameType: GameType | null;
  setProfileUpdate: (profile: Partial<IProfile>) => void;
  setOpenedModal: (modal: GameModal) => void;
}

export const GameOptionsModal = ({
  profile,
  gameType,
  setProfileUpdate,
  setOpenedModal,
}: IProps) => {
  const numberOfPointsToRedeem = useMemo(() => {
    const referralsPoints = (profile?.referralsCount || 0) * 50;
    const streakPoints = (profile?.streak || 0) * 25;
    const basePoints = 250;

    return referralsPoints + streakPoints + basePoints;
  }, [profile?.referralsCount, profile?.streak]);
  const toast = useToast();

  const numberOfLivesToRedeem = useMemo(() => {
    return (profile?.referralsCount || 0) + 3;
  }, [profile?.referralsCount]);

  const nextDayTargetDate = getNextDayMidnight();

  const redeemLives = useCallback(async () => {
    await USER_API.redeem();
    setProfileUpdate({
      canRedeemLives: false,
      streak: (profile.streak || 0) + 1,
      catpoints: (profile.catpoints || 0) + numberOfPointsToRedeem,
      catbassadorsLives:
        (profile.catbassadorsLives || 0) + numberOfLivesToRedeem,
      monthStreak: (profile.monthStreak || 0) + 1,
    });
    toast({
      message: `You got ${numberOfPointsToRedeem} coins + ${numberOfLivesToRedeem} lives`,
      img: "/logo/chest.webp",
    });
  }, []);

  return (
    <>
      <GameStatsSection profile={profile} setOpenedModal={setOpenedModal} />
      {!gameType && (
        <div className="fixed z-10 bottom-8 md:bottom-4 lg:bottom-8 xl:bottom-12 left-4 right-4 pb-safe flex justify-between md:justify-center md:gap-8 items-end">
          <div className="relative">
            <span className="z-10 relative">
              <PixelButton
                onClick={() => {
                  setOpenedModal(GameModal.INVITE);
                }}
                text="GIFTS"
              ></PixelButton>
            </span>
            <div className="absolute -top-5 left-2 -rotate-12 z-0">
              <Tag isSmall> NEW</Tag>
            </div>
          </div>
          <div className="flex flex-col items-center">
            {profile.canRedeemLives && (
              <div
                className="flex w-26 flex-col font-secondary text-p2 px-2 pt-2 pb-1 rounded-t-xl gap-1 font-bold"
                style={{
                  backgroundImage: "url(/backgrounds/bg-min-6.webp)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="flex items-center gap-1">
                  <img
                    draggable={false}
                    className="w-6 z-10"
                    src="/base/heart.png"
                  />
                  <div className="text-p5">3 LIVES</div>
                </div>
                <div className="flex items-center gap-1">
                  <img
                    draggable={false}
                    className="w-6 z-10"
                    src="/logo/coin.webp"
                  />
                  <div className="text-p5 mt-1">
                    {numberOfPointsToRedeem} COINS
                  </div>
                </div>
              </div>
            )}
            {!profile.canRedeemLives && (
              <Countdown targetDate={nextDayTargetDate} />
            )}
            <PixelButton
              isDisabled={!profile.canRedeemLives}
              onClick={() => (profile.canRedeemLives ? redeemLives() : {})}
              text={profile.canRedeemLives ? "DAILY CHECK-IN" : "CHECKED-IN"}
            ></PixelButton>
          </div>
          <span className="relative">
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.QUESTS);
              }}
              text="QUESTS"
            ></PixelButton>
            <div className="absolute -top-8 flex-col items-center left-1/2 -translate-x-1/2">
              {![GameType.SHELTER, GameType.HOME].includes(gameType!) && (
                <div
                  onClick={() => setOpenedModal(GameModal.OFFER_WALL)}
                  className="flex flex-col items-center font-primary bg-blue-300 hover:scale-110 transition-all hover:mt-1 hover:border-yellow-300 hover:border-4 hover:rounded-xl px-2 rounded-t-xl relative"
                >
                  <img src="/logo/logo.webp" className="h-8 -mb-1 -mt-3" />
                  <div className="text-p5 pt-1 -mt-1 -mb-1 whitespace-nowrap">
                    EARN $TAILS
                  </div>
                </div>
              )}
            </div>
          </span>
        </div>
      )}
    </>
  );
};
