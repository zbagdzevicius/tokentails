import { USER_API } from "@/api/user-api";
import { REWARDS } from "@/constants/rewards";
import { bgStyle, cdnFile, getNextDayMidnight } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
import { useCallback } from "react";
import { GameStatsSection } from "../catbassadors/GameStatsSection";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";

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
  const toast = useToast();
  const { addNotification } = useGame();
  const nextDayTargetDate = getNextDayMidnight();

  const redeemLives = useCallback(async () => {
    await USER_API.redeem();
    setProfileUpdate({
      canRedeemLives: false,
      streak: (profile.streak || 0) + 1,
      tails: (profile.tails || 0) + REWARDS.DAILY_REWARD,
      monthStreak: (profile.monthStreak || 0) + 1,
    });

    addNotification({
      message: `You got ${REWARDS.DAILY_REWARD} $TAILS`,
      icon: cdnFile("logo/logo.webp"),
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
          </div>
          <div className="flex flex-col items-center">
            {profile.canRedeemLives && (
              <div
                className="flex w-26 flex-col font-secondary text-p2 px-2 pt-2 pb-1 rounded-t-xl gap-1 font-bold"
                style={bgStyle("min-6")}
              >
                <div className="flex items-center gap-1">
                  <img
                    draggable={false}
                    className="w-6 z-10"
                    src={cdnFile("logo/logo.webp")}
                  />
                  <div className="text-p5 mt-1">
                    {REWARDS.DAILY_REWARD} $TAILS
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
          </span>
        </div>
      )}
    </>
  );
};
