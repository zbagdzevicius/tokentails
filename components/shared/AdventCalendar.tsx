import { catsFetch, catsForSaleFetch, setAdventDay } from "@/constants/api";
import { daysCoins } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { CatType, ICat } from "@/models/cats";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Countdown } from "./Countdown";
import { PixelButtonTiny } from "./PixelButtonTiny";
import { Window } from "./Window";

interface AdventDay {
  image?: string;
  unlocked: boolean;
  isOpened: boolean;
  cat?: any;
}

const catNamesMap: Record<number, string> = {
  1: "Jesus",
  2: "Santa Paws",
  3: "Angel Whiskers",
  4: "Candy cane",
  5: "Tangled Lights",
  6: "Divine Furritude",
  7: "Beanie Paws",
  8: "Tree Hopper",
  9: "Blitzen Whiskers",
  10: "Elf Whiskers",
  11: "Merry Whiskers",
  12: "Purr-esent",
  13: "Gingernap",
  14: "Hot Cocoa",
  15: "Mistletoe Paws",
  16: "Nutty",
  17: "Polar Paws",
  18: "Jolly Green",
  19: "Krispurr Kringle",
  20: "Snow Globe Paws",
  21: "Snowtop Paws",
  22: "Socky Paws",
  23: "Twinkle Whiskers",
  24: "Holly Halo",
  25: "Token tails",
};

export const adventData: Record<number, AdventDay> = {
  1: {
    image: "advent-calendar/angel.png",
    unlocked: false,
    isOpened: false,
  },
  2: {
    image: "advent-calendar/beard.png",
    unlocked: false,
    isOpened: false,
  },
  3: { image: "advent-calendar/bulps.png", unlocked: false, isOpened: false },
  4: { image: "advent-calendar/wreath.png", unlocked: false, isOpened: false },
  5: { image: "advent-calendar/candle.png", unlocked: false, isOpened: false },
  6: {
    image: "advent-calendar/christmas-bell.png",
    unlocked: false,
    isOpened: false,
  },
  7: {
    image: "advent-calendar/christmas-sock.png",
    unlocked: false,
    isOpened: false,
  },
  8: {
    image: "advent-calendar/christmas-tree.png",
    unlocked: false,
    isOpened: false,
  },
  9: { image: "advent-calendar/cocoa.png", unlocked: false, isOpened: false },
  10: {
    image: "advent-calendar/elf-hat.png",
    unlocked: false,
    isOpened: false,
  },
  11: { image: "advent-calendar/gift.png", unlocked: false, isOpened: false },
  12: {
    image: "advent-calendar/ginger-bread.png",
    unlocked: false,
    isOpened: false,
  },
  13: {
    image: "advent-calendar/hat-jigle.png",
    unlocked: false,
    isOpened: false,
  },
  14: {
    image: "advent-calendar/hat-snowbubble.png",
    unlocked: false,
    isOpened: false,
  },
  15: {
    image: "advent-calendar/hat-star.png",
    unlocked: false,
    isOpened: false,
  },
  16: {
    image: "advent-calendar/winter-hat.png",
    unlocked: false,
    isOpened: false,
  },
  17: {
    image: "advent-calendar/nutcracker.png",
    unlocked: false,
    isOpened: false,
  },
  18: {
    image: "advent-calendar/polar-bear.png",
    unlocked: false,
    isOpened: false,
  },
  19: { image: "advent-calendar/rudolf.png", unlocked: false, isOpened: false },
  20: {
    image: "advent-calendar/santa-green.png",
    unlocked: false,
    isOpened: false,
  },
  21: {
    image: "advent-calendar/santa-hat.png",
    unlocked: false,
    isOpened: false,
  },
  22: {
    image: "advent-calendar/santa-red.png",
    unlocked: false,
    isOpened: false,
  },
  23: {
    image: "advent-calendar/snowman.png",
    unlocked: false,
    isOpened: false,
  },
  24: { image: "advent-calendar/santa.png", unlocked: false, isOpened: false },
  25: { image: "advent-calendar/jesus.png", unlocked: false, isOpened: false },
};

const getNextDayMidnight = () => {
  const now = new Date();
  const nextDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return nextDay.toISOString();
};

interface IProps {
  setSelectedCat: (cat: ICat) => void;
}

export const AdventCalendar = ({ setSelectedCat }: IProps) => {
  const [calendarData, setCalendarData] = useState(adventData);
  const { profile, setProfileUpdate } = useProfile();
  const [currentDay, setCurrentDay] = useState<number>(() => {
    const now = new Date();
    const day = now.getUTCDate();
    if (day > 28) {
      return 1;
    }
    return day;
  });
  const { data: adventCats } = useQuery({
    queryKey: ["advent", currentDay],
    queryFn: () => catsForSaleFetch(CatType.EXCLUSIVE),
  });
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => catsFetch(),
  });
  useEffect(() => {
    Object.keys(calendarData).forEach((key: any) => {
      calendarData[key].unlocked = currentDay >= key;
      calendarData[key].isOpened = (profile?.adventDayRedeemed || 0) >= key;
      calendarData[key].cat = adventCats?.find(
        (adventCat) => adventCat.name === catNamesMap[key]
      );
    });
    setCalendarData({ ...calendarData });
  }, [profile?.adventDayRedeemed, adventCats, currentDay]);

  useEffect(() => {
    const updateCurrentDay = () => {
      const newNow = new Date();
      const day = newNow.getUTCDate();
      if (day > 28) {
        setCurrentDay(day);
        return;
      }
      setCurrentDay(day);
    };

    const now = new Date();
    const nextMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      updateCurrentDay();
      const interval = setInterval(updateCurrentDay, 24 * 60 * 60 * 1000);
      return () => clearInterval(interval);
    }, timeUntilMidnight);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setCalendarData((prevData) => {
      const updatedData = { ...prevData };
      Object.entries(updatedData).forEach(([day, content]) => {
        const dayNumber = parseInt(day);
        if (dayNumber <= currentDay) {
          updatedData[dayNumber] = { ...content, unlocked: true };
        }
      });
      return updatedData;
    });
  }, [currentDay]);

  const handleOpenDay = (day: number) => {
    setCalendarData((prevData) => {
      const updatedData = { ...prevData };
      if (updatedData[day].unlocked && !updatedData[day].isOpened) {
        updatedData[day] = { ...updatedData[day], isOpened: true };
      }
      setAdventDay();
      setProfileUpdate({ adventDayRedeemed: currentDay });
      return updatedData;
    });
  };

  const handleOpenModal = (day: number) => {
    const cat = calendarData[day]?.cat;
    if (cat) {
      setSelectedCat(cat);
    }
  };

  const nextDayTargetDate = getNextDayMidnight();
  const nextDay = currentDay + 1;

  return (
    <div className="relative lg:mx-10 lg:my-16 mb-12 mt-20 mx-3">
      <div className="flex flex-wrap lg:gapx-4 lg:gap-y-8 gap-x-4 gap-y-8 justify-between">
        {Object.entries(calendarData).map(([day, content]) => {
          const dayNumber = parseInt(day);
          const isAdopted =
            content.cat && cats?.find((cat) => cat.name === content.cat.name);
          return (
            <div className="relative" key={day}>
              {daysCoins[dayNumber] && (
                <img
                  className="absolute -top-5 -left-4 w-9 h-9 -rotate-[33deg] -z-10"
                  src={daysCoins[dayNumber]}
                  alt={`Coin for Day ${dayNumber}`}
                />
              )}

              {dayNumber === nextDay &&
                calendarData[currentDay].isOpened &&
                nextDay <= 25 && (
                  <div className="absolute -top-7 lg:right-7 right-0">
                    <Countdown targetDate={nextDayTargetDate} />
                  </div>
                )}
              <Window
                key={day}
                isOpened={content.isOpened}
                isUnlocked={content.unlocked}
              >
                <div
                  className={`relative w-full h-full 
                                    ${dayNumber <= currentDay
                      ? ""
                      : "brightness-50"
                    }
                                    ${dayNumber === currentDay &&
                    "brightness-125 animated-garland"
                    }`}
                >
                  <div className="flex items-center justify-center h-full">
                    <img
                      className="absolute w-full h-full"
                      src="advent-calendar/calendar-note.png"
                    />
                    <h2 className="absolute lg:text-2xl text-md uppercase font-secondary text-black font-bold w-full text-center top-[33%] left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      {dayNumber >= 25 ? (
                        "Christmas"
                      ) : (
                        <>
                          <span>DAY</span>
                          <span className="ml-1 lg:ml-2">
                            {Math.min(dayNumber, 25)}
                          </span>
                        </>
                      )}
                    </h2>
                    <img
                      className={`absolute aspect-square ${content.isOpened && content.cat
                          ? "lg:bottom-8 rem:bottom-[22px] w-16 lg:w-20 -mb-6"
                          : "lg:bottom-8 rem:bottom-[22px] lg:w-10 w-7"
                        }`}
                      src={
                        content.isOpened && content.cat
                          ? content.cat.catImg
                          : content.image
                      }
                    />
                  </div>
                  <div className="absolute bottom-0">
                    <PixelButtonTiny
                      text={
                        content.isOpened
                          ? isAdopted
                            ? "ADOPTED"
                            : "ADOPT"
                          : "OPEN"
                      }
                      onClick={() =>
                        content.isOpened
                          ? handleOpenModal(dayNumber)
                          : handleOpenDay(dayNumber)
                      }
                      active={content.isOpened && isAdopted}
                    />
                  </div>
                </div>
              </Window>
            </div>
          );
        })}
      </div>
    </div>
  );
};
