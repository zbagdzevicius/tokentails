import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";

import { PixelRescueLevelMap, pixelRescueLevelsList } from "../Phaser/map";

const TEST_DATE: Date | null = new Date(2026, 1, 14);

const isLevelUnlockedByDate = (levelIndex: number): boolean => {
  //  TODO: remove TEST_DATE
  const now = TEST_DATE;
  // const now = new Date();

  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const unlockDay = levelIndex + 1;

  if (currentMonth > 1) {
    return true;
  } else if (currentMonth === 1) {
    return currentDay >= unlockDay;
  } else {
    return false;
  }
};
const getDaysUntilUnlock = (levelIndex: number): number => {
  //  TODO: remove TEST_DATE
  const now = TEST_DATE;
  // const now = new Date();
  const currentYear = now.getFullYear();
  const unlockDay = levelIndex + 1;

  const unlockDate = new Date(currentYear, 1, unlockDay);

  if (now >= unlockDate) {
    return 0;
  }

  const diffTime = unlockDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

const getHeartsForLevel = (levelIndex: number): number => {
  const level = levelIndex + 1;
  if (level <= 2) return 1;
  if (level <= 5) return 2;
  if (level <= 8) return 3;
  if (level <= 11) return 4;
  if (level <= 13) return 5;
  return 6;
};

export const PixelRescueLevels = ({
  setSelectedLevel,
}: {
  setSelectedLevel: (level: string) => void;
}) => {
  const { profile } = useProfile();
  const showToast = useToast();
  //TODO REMOVE mopckEventData
  const mockEventData = {
    event: {
      number: [3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      eventScore: 12,
    },
  };

  const eventData = profile?.event || mockEventData.event;

  const unlockedLevels = [...(eventData?.number || [])].filter(
    (level) => level > 0,
  ).length;

  const selectLevel = (level: string, index: number) => {
    if (!isLevelUnlockedByDate(index)) {
      const daysUntil = getDaysUntilUnlock(index);
      showToast({
        message: `💝 This level unlocks on February ${
          index + 1
        }! (${daysUntil} day${daysUntil !== 1 ? "s" : ""} to go)`,
        img: cdnFile("purrquest/sprites/key.webp"),
      });
      return;
    }

    if (index > unlockedLevels) {
      showToast({
        message: "💘 You need to complete previous levels to play this level",
        img: cdnFile("purrquest/sprites/key.png"),
      });
      return;
    }
    setSelectedLevel(level);
  };

  return (
    <div className="flex h-screen flex-col items-center gap-4 mb-20 pt-20 lg:pt-24 pb-20 animate-opacity ">
      <div className="flex flex-row items-center gap-8 font-primary">
        <div className="flex flex-col items-center gap-x-2 bg-yellow-300/50 rounded-lg px-2 pb-2 border-4 border-yellow-900">
          <div className="text-p4 flex items-center gap-1">
            <img
              draggable={false}
              className="w-4 h-4"
              src={cdnFile("pixel-rescue/items/heart.webp")}
            />
            <div>HEARTS</div>
          </div>
          <div className="flex items-center text-p5 bg-green-300/50 border border-yellow-900 rounded-lg w-full justify-center">
            {profile?.event?.number?.reduce((a, b) => a + b, 0) || 0} / 47
          </div>
        </div>

        <div className="flex flex-col items-center gap-x-2 bg-yellow-300/50 rounded-lg px-2 pb-2 border-4 border-yellow-900">
          <div className="text-p4 flex items-center gap-1">
            <img
              draggable={false}
              className="w-4 h-4"
              src={cdnFile("purrquest/sprites/key.png")}
            />
            <div>COMPLETED</div>
          </div>
          <div className="flex items-center text-p5 bg-yellow-900/20 border border-yellow-900 rounded-lg w-full justify-center">
            {profile?.event?.number?.length || 0}
            <span>/{Object.keys(PixelRescueLevelMap).length}</span>
          </div>
        </div>
      </div>

      <div
        className="grid glow-box-FIRE pt-16 px-8 grid-cols-4 gap-2 relative justify-items-center max-w-[48rem] rounded-2xl py-8  mt-8 md:mt-16"
        style={{
          background: "#f5e4cb",
        }}
      >
        <img
          src={cdnFile("pixel-rescue/images/banner.webp")}
          className="absolute  -top-8 md:-top-20 left-0 right-0 w-[80%] h-auto mx-auto"
        />
        <img
          src={cdnFile("pixel-rescue/images/cuppid.webp")}
          className="absolute -top-16 md:-top-22 -right-8 w-32 md:w-36 h-auto"
        />
        {pixelRescueLevelsList.map((level, i) => {
          const isDateUnlocked = isLevelUnlockedByDate(i);
          const isProgressionUnlocked = unlockedLevels >= i;
          const isFullyUnlocked = isDateUnlocked && isProgressionUnlocked;
          const daysUntilUnlock = getDaysUntilUnlock(i);
          const isCleared = (eventData?.number?.[i] || 0) > 0;
          const heartsRequired = getHeartsForLevel(i);

          let imageSrc = `pixel-rescue/images/day-${i + 1}.webp`;
          if (isCleared) {
            imageSrc = `pixel-rescue/images/cleared.webp`;
          } else if (isFullyUnlocked) {
            imageSrc = `pixel-rescue/images/unlocked.webp`;
          }

          return (
            <div key={i} className="flex flex-col items-center">
              <div
                onClick={() => selectLevel(level, i)}
                style={{
                  gridColumn: i === 12 ? 2 : i === 13 ? 3 : "auto",
                }}
                className="hover:brightness-110 clickable relative hover:scale-110 transition-all flex flex-col items-center justify-center  w-20 h-20 md:w-32 md:h-32 "
              >
                <img
                  src={cdnFile(imageSrc)}
                  alt={`Day ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-contain rounded-lg"
                />

                {isCleared && (
                  <div className="absolute -top-1 -left-2 md-top-2 md:-left-4 z-20 flex items-center justify-center w-10 h-10 md:w-16   md:h-16">
                    <img
                      src={cdnFile("pixel-rescue/images/heart.webp")}
                      className="w-full h-full object-contain"
                      alt="Heart"
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs md:text-lg font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                      {heartsRequired}
                    </span>
                  </div>
                )}

                {!isCleared && !isFullyUnlocked && (
                  <div className="z-10 text-center flex items-center justify-center text-p3 md:text-p1 leading-none font-primary">
                    <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] w-full text-center">
                      {i + 1}
                    </span>
                  </div>
                )}

                {isFullyUnlocked && !isCleared && (
                  <img
                    src={cdnFile("pixel-rescue/images/gift.webp")}
                    alt="Gift"
                    className="absolute -bottom-0 -right-2 w-8 h-8 md:w-10 md:h-10 z-20 pixelated"
                    draggable={false}
                  />
                )}

                <span className="font-primary text-p6 flex items-center pl-1 pr-1 bg-yellow-300/50">
                  <img
                    src={cdnFile("pixel-rescue/items/hearth-coin.webp")}
                    className="w-5 h-5 mr-1"
                  />
                  <span>{profile?.event?.number?.[i + 1] || 0}</span>
                </span>
              </div>
              <div className="text-[9px] md:text-base text-red-800 font-extrabold  leading-0">
                {daysUntilUnlock === 1
                  ? `Open in ${daysUntilUnlock} day`
                  : daysUntilUnlock > 1
                  ? `Open in ${daysUntilUnlock} days`
                  : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
