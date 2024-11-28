import { useState } from "react";
import { adventData } from "./AdventCalendar";
import { AdventCalendar } from "./AdventCalendar";
import { CloseButton } from "./CloseButton";

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
const currentDay = new Date().getDate()
const backgroundUrl = daysBackgrounds[currentDay] || daysBackgrounds[1]

export const Calendar = () => {
    const [isCalendarOpen, setCalendarOpen] = useState(false);
    const today = new Date().getDate();

    const getCurrentAdventDay = () => {
        const day = Math.min(today, 25);
        return adventData[day] || null;
    };

    const currentDayData = getCurrentAdventDay();

    const handleCalendarClick = () => {
        setCalendarOpen(!isCalendarOpen);
    };

    return (
        <div className="relative">
            <div
                className="absolute right-0 top-36 lg:w-40 w-28 lg:h-28 h-20 flex items-center justify-center m-5 cursor-pointer"
                onClick={handleCalendarClick}
            >
                <img
                    className="relative"
                    src="advent-calendar/calendar.png"
                    alt="Advent calendar"
                />
                <h2 className="absolute lg:text-p3 text-p4 uppercase font-quanternary text-yellow-200 font-bold w-full text-center lg:top-[35%] top-[35%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 lg:text-outline-medium text-outline">
                    {today >= 25 ? "Christmas" : `${Math.min(today, 25)} DAY`}
                </h2>
                {currentDayData && (
                    <img
                        className="absolute  bottom-2 lg:w-10 w-8 lg:h-10 h-8"
                        src={currentDayData.image}
                        alt={`Day ${Math.min(today, 25)} image`}
                    />
                )}
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
