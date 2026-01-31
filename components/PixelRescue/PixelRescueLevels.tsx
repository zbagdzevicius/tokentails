import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";

import { PixelRescueLevelMap, pixelRescueLevelsList } from "../Phaser/map";
import { Countdown } from "../shared/Countdown";

const NOW_DATE: Date | null = new Date();

const getTomorrowsDateAtZeroAtMidnight = (): Date => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return new Date(tomorrow.setHours(0, 0, 0, 0));
};

const isLevelUnlockedByDate = (levelIndex: number): boolean => {
  const now = NOW_DATE;

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
  const now = NOW_DATE;
  const currentYear = now.getFullYear();
  const unlockDay = levelIndex + 1;

  const unlockDate = new Date(currentYear, 1, unlockDay);
  console.log(unlockDate);
  console.log(now);
  console.log(new Date());
  if (now >= unlockDate) {
    console.log("unlocked");
    return 0;
  }

  const diffTime = unlockDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  console.log(diffDays);

  return diffDays;
};

export const PixelRescueLevels = ({
  setSelectedLevel,
}: {
  setSelectedLevel: (level: string) => void;
}) => {
  const { profile } = useProfile();
  const showToast = useToast();

  const unlockedLevels = [...(profile?.seasonEvent || [])].filter(
    (level) => level > 0
  ).length;

  const selectLevel = (level: string, index: number) => {
    if (!isLevelUnlockedByDate(index)) {
      const daysUntil = getDaysUntilUnlock(index);
      showToast({
        message: `This level unlocks on February ${index + 1}`,
        img: cdnFile("purrquest/sprites/key.png"),
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
    <div className="flex h-screen flex-col items-center gap-4 mb-20 pt-24 lg:pt-32 pb-20 animate-opacity ">
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
            {profile?.seasonEventCount || 0} / 47
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
            {profile?.seasonEventCount || 0}
            <span>/{Object.keys(PixelRescueLevelMap).length}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          backgroundImage: `url(${cdnFile(
            "pixel-rescue/images/bg-paws.webp"
          )})`,
        }}
        className="flex justify-center items-center flex-wrap glow-box-FIRE pt-16 md:px-8 gap-2 relative justify-items-center max-w-[40rem] rounded-2xl py-8 w-full mt-8 md:mt-16 animate-appear"
      >
        <img
          src={cdnFile("pixel-rescue/images/banner.webp")}
          className="absolute  -top-8 md:-top-20 left-0 right-0 w-[80%] h-auto mx-auto"
          draggable={false}
        />
        <img
          src={cdnFile("pixel-rescue/images/cuppid.webp")}
          className="absolute -top-16 md:-top-22 -right-8 w-32 md:w-36 h-auto"
          draggable={false}
        />
        {pixelRescueLevelsList.map((level, i) => {
          const isDateUnlocked = isLevelUnlockedByDate(i);
          const isProgressionUnlocked = unlockedLevels >= i;
          const isFullyUnlocked = isDateUnlocked && isProgressionUnlocked;
          const daysUntilUnlock = getDaysUntilUnlock(i);
          const isCleared = (profile?.seasonEvent?.[i] || 0) > 0;

          let imageSrc = `pixel-rescue/images/day-${i + 1}.webp`;
          if (isCleared) {
            imageSrc = `pixel-rescue/images/cleared.webp`;
          } else if (isFullyUnlocked) {
            imageSrc = `pixel-rescue/images/unlocked.webp`;
          }

          return (
            <div
              key={i}
              className="flex flex-col items-center justify-center flex-wrap animate-appear"
            >
              <div
                onClick={() => selectLevel(level, i)}
                className="hover:brightness-110 clickable relative hover:scale-110 transition-all flex flex-col items-center justify-center w-24 md:w-32"
              >
                <img
                  src={cdnFile(imageSrc)}
                  alt={`Day ${i + 1}`}
                  className="w-full h-full object-contain rounded-lg"
                  draggable={false}
                />

                {isCleared && (
                  <div className="absolute -top-3 md:-top-4 -left-3 md:-left-4 z-20 flex items-center justify-center w-12 h-12 md:w-16 md:h-16">
                    <img
                      src={cdnFile("pixel-rescue/images/heart.webp")}
                      className="w-full h-full object-contain"
                      alt="Heart"
                      draggable={false}
                    />
                    <div className="absolute font-primary text-p4 mt-0.5 text-yellow-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                      {i + 1}
                    </div>
                  </div>
                )}
                {daysUntilUnlock === 1 && (
                  <div className="absolute flex inset-0 justify-center items-center">
                    <Countdown
                      targetDate={getTomorrowsDateAtZeroAtMidnight()}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex items-center justify-center flex-col max-w-28">
          <img
            src={cdnFile("pixel-rescue/images/gift.webp")}
            alt="Gift"
            className="w-20 h-20 z-20 pixelated hover:brightness-125 hover:scale-110 transition-all duration-300"
            draggable={false}
          />
          <div className="text-p6 font-primary text-yellow-900 leading-0 text-balance text-center">
            <p className="glow font-bold text-p4 -mb-2">
              {Object.keys(PixelRescueLevelMap).length -
                (profile?.seasonEvent?.reduce((a, b) => a + b, 0) || 0)}{" "}
              LEVELS
            </p>{" "}
            TO UNLOCK A GIFT
          </div>
        </div>
      </div>
    </div>
  );
};
