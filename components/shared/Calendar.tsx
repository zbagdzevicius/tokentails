import { useState, useEffect } from "react";
import { adventData } from "./AdventCalendar";
import { AdventCalendar } from "./AdventCalendar";
import { CloseButton } from "./CloseButton";
import { Countdown } from "./Countdown";
import { currentDayCoin } from "@/constants/utils";
const daysBackgrounds: Record<number, string> = {
    1: "advent-calendar/background/1.webp",
    2: "advent-calendar/background/2.webp",
    3: "advent-calendar/background/3.webp",
    4: "advent-calendar/background/4.webp",
    5: "advent-calendar/background/5.webp",
    6: "advent-calendar/background/6.webp",
    7: "advent-calendar/background/7-2.webp",
    8: "advent-calendar/background/8.webp",
    9: "advent-calendar/background/9.webp",
    10: "advent-calendar/background/10.webp",
    11: "advent-calendar/background/11.webp",
    12: "advent-calendar/background/12.webp",
    13: "advent-calendar/background/13.webp",
    14: "advent-calendar/background/14.webp",
    15: "advent-calendar/background/15.webp",
    16: "advent-calendar/background/16.webp",
    17: "advent-calendar/background/17.webp",
    18: "advent-calendar/background/18.webp",
    19: "advent-calendar/background/19.webp",
    20: "advent-calendar/background/20.webp",
    21: "advent-calendar/background/21.webp",
    22: "advent-calendar/background/22.webp",
    23: "advent-calendar/background/23.webp",
    24: "advent-calendar/background/24.webp",
    25: "advent-calendar/background/25.webp",
};

const getNextMidnightUTC = () => {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return nextMidnight.toISOString();
};

export const Calendar = () => {
    const [isCalendarOpen, setCalendarOpen] = useState(false);
    const [currentDay, setCurrentDay] = useState<number>(() => {
        const today = new Date().getUTCDate();
        return Math.min(today, 25);
    });
    const [targetDate, setTargetDate] = useState<string>(getNextMidnightUTC);

    useEffect(() => {
        const now = new Date();
        const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
        const timeUntilMidnight = nextMidnight.getTime() - now.getTime();

        const timer = setTimeout(() => {
            const today = new Date().getUTCDate();
            setCurrentDay(Math.min(today, 25));
            setTargetDate(getNextMidnightUTC());
        }, timeUntilMidnight);

        return () => clearTimeout(timer);
    }, [targetDate]);

    const backgroundUrl = daysBackgrounds[currentDay] || daysBackgrounds[1];

    const handleCalendarClick = () => {
        setCalendarOpen(!isCalendarOpen);
    };

    const currentDayData = adventData[currentDay] || null;

    return (
        <div className="relative">
            <div
                className="absolute right-0 top-36 w-20 h-20 items-center justify-center m-5 cursor-pointer flex flex-col"
                onClick={handleCalendarClick}
            >
                <img
                    className="relative z-10"
                    src="advent-calendar/calendar.png"
                    alt="Advent calendar"
                />
                <img
                    className="absolute -left-5 -top-3 w-9 h-9 -rotate-[33deg] z-0"
                    src={currentDayCoin}
                    alt={`Coin of the day`}
                />
                <h2 className="absolute text-xl  z-10 uppercase font-secondary text-black font-bold w-full text-center top-[43%] left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    {currentDay >= 25 ? (
                        "Christmas"
                    ) : (
                        <>
                            <span>DAY</span>
                            <span className="ml-1 lg:ml-2">{currentDay}</span>
                        </>
                    )}
                </h2>
                {currentDayData && (
                    <img
                        className="absolute bottom-2 h-7 w-7  z-10"
                        src={currentDayData.image}
                        alt={`Day ${currentDay} image`}
                    />
                )}
            </div>
            <div className="absolute right-0 top-56 m-5 mt-6 w-20">
                <Countdown targetDate={targetDate} />
            </div>
            {isCalendarOpen && (
                <div
                    className="fixed inset-0 pt-safe w-full z-[100] flex justify-center items-center h-full"
                >
                    <div
                        onClick={handleCalendarClick}
                        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
                    ></div>
                    <div
                        className="z-50 w-full md:w-[592px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-yellow-300 to-purple-300 inset-0 max-h-[80vh] overflow-y-auto overflow-x-hidden rounded-lg shadow h-fit"
                        style={{
                            backgroundImage: `url(${backgroundUrl})`,
                            backgroundSize: "cover",
                            backgroundRepeat: "no-repeat",
                            backgroundAttachment: "absolute",
                        }}
                    >
                        <div className="sticky top-0 right-0 m-2 z-50">
                            <CloseButton onClick={handleCalendarClick} />
                        </div>
                        <AdventCalendar />
                    </div>
                </div>
            )}
        </div>
    );
};
