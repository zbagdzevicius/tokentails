import { Window } from "./Window";
import { PixelButtonTiny } from "./PixelButtonTiny";
import { useState, useEffect } from "react";
import { CatCard } from "../CatCard";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { catsFetch } from "@/constants/api";
import { daysCoins } from "@/constants/utils";
import { Countdown } from "./Countdown";

interface AdventDay {
    image?: string;
    unlocked: boolean;
    isOpened: boolean;
    cat?: any;
}

const dataCat = {
    ability: "AQUAWHISKER",
    cardImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cards/LOVETAP/cleocatra.png",
    catImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hearted-red/JUMPING.gif",
    catpoints: 7,
    collectionType: "LOVETAP",
    createdAt: "2024-09-11T14:00:51.355Z",
    expiresAt: null,
    isBlueprint: true,
    name: "Cleocatra",
    origin: "PINKIE",
    price: 69,
    resqueStory:
        "A charming cat’s tail swishes create rainbows that make everyone smile, even on the rainiest of days.",
    spriteImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hearted-red.png",
    status: { EAT: 0 },
    tier: "MYTHICAL",
    type: "WATER",
    updatedAt: "2024-11-22T01:00:00.003Z",
    __v: 0,
    _id: "66e1a2931aaa57204c7863cc",
};

export const adventData: Record<number, AdventDay> = {
    1: { image: 'advent-calendar/angel.png', unlocked: false, isOpened: false, cat: dataCat },
    2: { image: 'advent-calendar/beard.png', unlocked: false, isOpened: false, cat: dataCat },
    3: { image: 'advent-calendar/bulps.png', unlocked: false, isOpened: false },
    4: { image: 'advent-calendar/wreath.png', unlocked: false, isOpened: false },
    5: { image: 'advent-calendar/candle.png', unlocked: false, isOpened: false },
    6: { image: 'advent-calendar/christmas-bell.png', unlocked: false, isOpened: false },
    7: { image: 'advent-calendar/christmas-sock.png', unlocked: false, isOpened: false },
    8: { image: 'advent-calendar/christmas-tree.png', unlocked: false, isOpened: false },
    9: { image: 'advent-calendar/cocoa.png', unlocked: false, isOpened: false },
    10: { image: 'advent-calendar/elf-hat.png', unlocked: false, isOpened: false },
    11: { image: 'advent-calendar/gift.png', unlocked: false, isOpened: false },
    12: { image: 'advent-calendar/ginger-bread.png', unlocked: false, isOpened: false },
    13: { image: 'advent-calendar/hat-jigle.png', unlocked: false, isOpened: false },
    14: { image: 'advent-calendar/hat-snowbubble.png', unlocked: false, isOpened: false },
    15: { image: 'advent-calendar/hat-star.png', unlocked: false, isOpened: false },
    16: { image: 'advent-calendar/winter-hat.png', unlocked: false, isOpened: false },
    17: { image: 'advent-calendar/nutcracker.png', unlocked: false, isOpened: false },
    18: { image: 'advent-calendar/polar-bear.png', unlocked: false, isOpened: false },
    19: { image: 'advent-calendar/rudolf.png', unlocked: false, isOpened: false },
    20: { image: 'advent-calendar/santa-green.png', unlocked: false, isOpened: false },
    21: { image: 'advent-calendar/santa-hat.png', unlocked: false, isOpened: false },
    22: { image: 'advent-calendar/santa-red.png', unlocked: false, isOpened: false },
    23: { image: 'advent-calendar/snowman.png', unlocked: false, isOpened: false },
    24: { image: 'advent-calendar/santa.png', unlocked: false, isOpened: false },
    25: { image: 'advent-calendar/jesus.png', unlocked: false, isOpened: false },
};


const getNextDayMidnight = () => {
    const now = new Date();
    const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return nextDay.toISOString();
};

export const AdventCalendar = () => {
    const [calendarData, setCalendarData] = useState(adventData);
    const [selectedCat, setSelectedCat] = useState<any | null>(null);
    const { profile } = useProfile();
    const { data: cats } = useQuery({
        queryKey: ["cats", profile?.cat],
        queryFn: () => catsFetch(),
    });


    const [currentDay, setCurrentDay] = useState<number>(() => {
        const now = new Date();
        const day = now.getUTCDate();
        return Math.min(day, 25);
    });

    useEffect(() => {
        const updateCurrentDay = () => {
            const newNow = new Date();
            const day = newNow.getUTCDate();
            setCurrentDay(Math.min(day, 25));
        };

        const now = new Date();
        const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
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
            return updatedData;
        });
    };

    const handleOpenModal = (day: number) => {
        const cat = calendarData[day]?.cat;
        if (cat) {
            setSelectedCat(cat);
        }
    };

    const handleCloseModal = () => {
        setSelectedCat(null);
    };
    const nextDayTargetDate = getNextDayMidnight();
    const nextDay = currentDay + 1;

    return (
        <div className="relative lg:mx-10 lg:my-16 mb-12 mt-20 mx-3">
            <div className="flex flex-wrap lg:gapx-4 lg:gap-y-8 gap-x-4 gap-y-8 justify-between">
                {Object.entries(calendarData).map(([day, content]) => {
                    const dayNumber = parseInt(day);
                    const isAdopted = content.cat && cats?.find((cat) => cat.name === content.cat.name);
                    return (
                        <div className="relative" key={day}>
                            {daysCoins[dayNumber] && (
                                <img
                                    className="absolute -top-5 -left-4 w-9 h-9 -rotate-[33deg] -z-10"
                                    src={daysCoins[dayNumber]}
                                    alt={`Coin for Day ${dayNumber}`}
                                />
                            )}

                            {dayNumber === nextDay && calendarData[currentDay].isOpened && nextDay <= 25 && (
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
                                    ${dayNumber <= currentDay ? '' : 'brightness-50'}
                                    ${dayNumber === currentDay && 'brightness-125 animated-garland'}`}
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
                                                    <span className="ml-1 lg:ml-2">{Math.min(dayNumber, 25)}</span>
                                                </>
                                            )}
                                        </h2>
                                        <img
                                            className="absolute lg:bottom-8 rem:bottom-[22px] lg:w-10 w-7 lg:h-10 h-7"
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
            {selectedCat && (
                <div>
                    <CatCard onClose={handleCloseModal} {...selectedCat} />
                </div>
            )}
        </div>
    );
};
