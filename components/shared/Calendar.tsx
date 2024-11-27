import { useState } from "react";
import { adventData } from "./AdventCalendar";
import { AdventCalendar } from "./AdventCalendar";

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
                className="absolute right-0 top-36 lg:w-40 w-28 lg:h-32 h-20 flex items-center justify-center m-5 cursor-pointer"
                onClick={handleCalendarClick}
            >
                <img
                    className="relative"
                    src="advent-calendar/calendar.png"
                    alt="Advent calendar"
                />
                <h2 className="absolute lg:text-p2 text-p4 uppercase font-secondary text-black font-bold w-full text-center lg:top-[35%] top-[35%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 ">
                    {today >= 25 ? "Christmas" : `${Math.min(today, 25)} DAY`}
                </h2>
                {currentDayData && (
                    <img
                        className="absolute lg:bottom-4 bottom-2 lg:w-12 w-8 lg:h-12 h-8"
                        src={currentDayData.image}
                        alt={`Day ${Math.min(today, 25)} image`}
                    />
                )}
            </div>
            {isCalendarOpen && (
                <div className="w-[90%] min-h-screen fixed z-[80] flex justify-center items-center ">
                    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full ">
                        <div
                            onClick={handleCalendarClick}
                            className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
                        ></div>
                        <div className="z-50 rem:w-full md:w-[90%] transition-from-bottom-animation max-w-full relative absolute inset-0 max-h-screen overflow-y-auto overflow-x-hidden h-fit lg:py-5">
                            <AdventCalendar close={handleCalendarClick} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
