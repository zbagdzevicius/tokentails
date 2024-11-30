import { useState, useEffect } from "react";

interface CountdownProps {
    targetDate: string | Date;
    isDaysDisplayed?: boolean;
    isBig?: boolean;
}

export const Countdown = ({ targetDate, isDaysDisplayed, isBig }: CountdownProps) => {
    const [timeValues, setTimeValues] = useState({
        days: "00",
        hours: "00",
        minutes: "00",
        seconds: "00",
    });

    useEffect(() => {
        const targetCountdownDate = new Date(targetDate).getTime();

        function updateCountdown() {
            const now = new Date().getTime();
            const distance = targetCountdownDate - now;

            if (distance < 0) {
                setTimeValues({ days: "00", hours: "00", minutes: "00", seconds: "00" });
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24)).toString().padStart(2, "0");
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                .toString()
                .padStart(2, "0");
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
                .toString()
                .padStart(2, "0");
            const seconds = Math.floor((distance % (1000 * 60)) / 1000)
                .toString()
                .padStart(2, "0");

            setTimeValues({ days, hours, minutes, seconds });
        }

        const interval = setInterval(updateCountdown, 1000);
        updateCountdown();
        return () => clearInterval(interval);
    }, [targetDate]);

    return (
        <div
            className={`flex justify-center items-center h-9 w-full`}
        >
            <div className={` w-1 bg-black ${isBig ? "h-12" : "h-5"}`}></div>
            <div className={` w-1 flex flex-col bg-red-500  border-black ${isBig ? "h-14 border-y-4" : "rem:border-y-[3px] h-7"}`}>
                <div className={` bg-red-500 ${isBig ? "h-14" : "h-6"}`}></div>
                <div className="h-1 bg-yellow-300"></div>
            </div>
            <div className={` flex flex-row  border-black bg-red-500 ${isBig ? "h-16 border-y-4" : "h-7 rem:border-y-[3px]"}`}>
                <div className={` bg-red-500  font-secondary flex items-center ${isBig ? "h-14 px-2" : "h-6 px-px"}`}>
                    <div className="flex flex-row items-center justify-around bg-red-500 text-white w-full h-full">
                        {isDaysDisplayed &&
                            <div className={`" ${isBig ? "flex-col flex items-center justify-center" : "flex-row flex items-center justify-center"}"`}>
                                <p className={` ${isBig ? "text-2xl" : "text-sm pr-[2px]"}`}>{timeValues.days}</p>
                                <p className={` ${isBig ? "text-md" : "text-sm"}`}>{isBig ? "DAYS" : "D"}</p>
                            </div>}
                        {isDaysDisplayed && <div className={`w-[1px]  bg-white  ${isBig ? "h-7 mx-2" : "h-5 rem:mx-[2px]"}`}></div>}
                        <div className={`" ${isBig ? "flex-col flex items-center justify-center" : "flex-row flex items-center justify-center"}"`}>
                            <p className={` ${isBig ? "text-2xl" : "text-sm pr-[2px]"}`}>{timeValues.hours}</p>
                            <p className={`${isBig ? "text-md" : "text-sm"}`}>{isBig ? "Hours" : "H"}</p>
                        </div>
                        <div className={`w-[1px]  bg-white  ${isBig ? "h-9 mx-2" : "h-5 rem:mx-[2px]"}`}></div>
                        <div className={`" ${isBig ? "flex-col flex items-center justify-center" : "flex-row flex items-center justify-center"}"`}>
                            <p className={` ${isBig ? "text-2xl" : "text-sm pr-[2px]"}`}>{timeValues.minutes}</p>
                            <p className={` ${isBig ? "text-md" : "text-sm"}`}>{isBig ? "Minutes" : "M"}</p>
                        </div>
                        <div className={`w-[1px]  bg-white  ${isBig ? "h-9 mx-2" : "h-5 rem:mx-[2px]"}`}></div>
                        <div className={`" ${isBig ? "flex-col flex items-center justify-center" : "flex-row flex items-center justify-center"}"`}>
                            <p className={` ${isBig ? "text-2xl" : "text-sm pr-[2px]"}`}>{timeValues.seconds}</p>
                            <p className={` ${isBig ? "text-md" : "text-sm"}`}>{isBig ? "Seconds" : "S"}</p>
                        </div>
                    </div>
                </div>
                {isBig && <div className="h-1 bg-yellow-300"></div>}
            </div>
            <div className={` w-1 flex flex-col bg-red-500  border-black ${isBig ? "h-14 border-y-4" : "h-7 rem:border-y-[4px]"}`}>
                {isBig && <div className="h-6 w-1 bg-yellow-300"></div>}
            </div>
            <div className={`  w-1 bg-black ${isBig ? "h-12" : "h-5"}`}></div>
        </div>

    );
};
