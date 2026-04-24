import { bgStyle, cdnFile, getNextDayMidnight } from "@/constants/utils";
import { GameModal, GameType } from "@/models/game";
import { IProfile } from "@/models/profile";
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
  setOpenedModal,
}: IProps) => {
  const nextDayTargetDate = getNextDayMidnight();

  return (
    <>
      <GameStatsSection profile={profile} setOpenedModal={setOpenedModal} />
      {!gameType && (
        <div className="fixed z-10 bottom-8 md:bottom-4 lg:bottom-8 xl:bottom-12 left-4 right-4 pb-safe flex justify-between md:justify-center md:gap-8 items-end">
          <div className="relative">
            <img
              src="/mascots/tasks/checking_a_checklist.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="hidden md:block absolute -top-20 -left-6 w-20 -rotate-6 pointer-events-none select-none drop-shadow-xl"
            />
            <span className="z-10 relative">
              <PixelButton
                onClick={() => {
                  setOpenedModal(GameModal.PACKS);
                }}
                text="PACKS"
              ></PixelButton>
            </span>
          </div>
          <div className="flex flex-col items-center">
            {profile.canRedeemLives && (
              <div
                className="flex w-26 flex-col font-secondary text-p2 px-2 pt-2 pb-1 rounded-t-xl gap-1 font-bold"
                style={bgStyle("min-4")}
              >
                <div className="flex items-center gap-1 mb-3">
                  <img
                    draggable={false}
                    className="w-6 z-10"
                    src={cdnFile("logo/logo.webp")}
                  />
                  <div className="text-p5">WIN $TAILS</div>
                </div>
              </div>
            )}
            {!profile.canRedeemLives && (
              <Countdown targetDate={nextDayTargetDate} />
            )}
            <span className="-mt-4 -mb-2">
              <PixelButton
                isDisabled={!profile.canRedeemLives}
                onClick={() => setOpenedModal(GameModal.SPIN_WHEEL)}
                isSmall={!profile.canRedeemLives}
                text={profile.canRedeemLives ? "DAILY SPIN" : "SPINNED"}
              ></PixelButton>
            </span>
          </div>
          <span className="relative">
            <img
              src="/mascots/emotions/surprised.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="hidden md:block absolute -top-20 mt-2 -right-2 w-20 pointer-events-none select-none drop-shadow-xl"
            />
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.QUESTS);
              }}
              text="EVENTS"
            ></PixelButton>
          </span>
        </div>
      )}
    </>
  );
};
