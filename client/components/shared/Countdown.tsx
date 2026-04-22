import { useState, useEffect } from "react";

interface CountdownProps {
  targetDate: string | Date;
  isDaysDisplayed?: boolean;
  isBig?: boolean;
  onEnd?: () => void;
}

export const Countdown = ({
  targetDate,
  isDaysDisplayed,
  isBig,
  onEnd,
}: CountdownProps) => {
  const [timeValues, setTimeValues] = useState({
    days: "00",
    hours: "00",
    minutes: "00",
    seconds: "00",
  });

  useEffect(() => {
    const targetCountdownDate = new Date(targetDate).getTime();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function updateCountdown() {
      const now = new Date().getTime();
      const distance = targetCountdownDate - now;

      if (distance < 0) {
        setTimeValues((prev) => {
          const isAlreadyZero =
            prev.days === "00" &&
            prev.hours === "00" &&
            prev.minutes === "00" &&
            prev.seconds === "00";

          if (isAlreadyZero) {
            return prev;
          }

          return {
            days: "00",
            hours: "00",
            minutes: "00",
            seconds: "00",
          };
        });

        if (onEnd) onEnd();
        if (intervalId) {
          clearInterval(intervalId);
        }
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24))
        .toString()
        .padStart(2, "0");
      const hours = Math.floor(
        (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      )
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

    intervalId = setInterval(updateCountdown, 1000);
    updateCountdown();
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [targetDate, onEnd]);

  return (
    <div className="flex justify-center items-center h-9 w-full drop-shadow-[0_1.4px_1.2px_rgba(0,0,0,0.8)]">
      <div className={`w-1 bg-yellow-900 ${isBig ? "h-12" : "h-5"}`}></div>
      <div
        className={`w-1 flex flex-col bg-yellow-300 border-yellow-900 ${
          isBig ? "h-12 md:h-14 border-y-4" : "h-7 rem:border-y-[3px]"
        }`}
      >
        <div className={`bg-yellow-300 ${isBig ? "h-14" : "h-6"}`}></div>
      </div>
      <div
        className={`flex flex-row border-yellow-900 bg-yellow-300 ${
          isBig ? "h-16 border-y-4" : "h-7 rem:border-y-[3px]"
        }`}
      >
        <div
          className={`bg-yellow-300 font-secondary flex items-center ${
            isBig ? "h-14 px-2" : "h-6 px-px"
          }`}
        >
          <div className="flex flex-row items-center justify-around bg-yellow-300 text-yellow-900 w-full h-full">
            {isDaysDisplayed && (
              <div
                className={`${
                  isBig
                    ? "flex-col flex items-center justify-center"
                    : "flex-row flex items-center justify-center"
                }`}
              >
                <p
                  className={`${isBig ? "text-3xl -mb-2" : "text-sm pr-[2px]"}`}
                >
                  {timeValues.days}
                </p>
                <p className={`${isBig ? "text-lg" : "text-sm"}`}>
                  {isBig ? "DAYS" : "D"}
                </p>
              </div>
            )}
            {isDaysDisplayed && (
              <div
                className={`w-[1px] bg-yellow-900 ${
                  isBig ? "h-9 mx-1 md:mx-2" : "h-5 rem:mx-[2px]"
                }`}
              ></div>
            )}
            <div
              className={`${
                isBig
                  ? "flex-col flex items-center justify-center"
                  : "flex-row flex items-center justify-center"
              }`}
            >
              <p className={`${isBig ? "text-3xl -mb-2" : "text-sm pr-[2px]"}`}>
                {timeValues.hours}
              </p>
              <p className={`${isBig ? "text-lg" : "text-sm"}`}>
                {isBig ? "Hours" : "H"}
              </p>
            </div>
            <div
              className={`w-[1px] bg-yellow-900 ${
                isBig ? "h-9 mx-1 md:mx-2" : "h-5 rem:mx-[2px]"
              }`}
            ></div>
            <div
              className={`${
                isBig
                  ? "flex-col flex items-center justify-center"
                  : "flex-row flex items-center justify-center"
              }`}
            >
              <p className={`${isBig ? "text-3xl -mb-2" : "text-sm pr-[2px]"}`}>
                {timeValues.minutes}
              </p>
              <p className={`${isBig ? "text-lg" : "text-sm"}`}>
                {isBig ? "Minutes" : "M"}
              </p>
            </div>
            <div
              className={`w-[1px] bg-yellow-900 ${
                isBig ? "h-9 mx-1 md:mx-2" : "h-5 rem:mx-[2px]"
              }`}
            ></div>
            <div
              className={`${
                isBig
                  ? "flex-col flex items-center justify-center"
                  : "flex-row flex items-center justify-center"
              }`}
            >
              <p className={`${isBig ? "text-3xl -mb-2" : "text-sm pr-[2px]"}`}>
                {timeValues.seconds}
              </p>
              <p className={`${isBig ? "text-lg" : "text-sm"}`}>
                {isBig ? "Seconds" : "S"}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div
        className={`w-1 flex flex-col bg-yellow-300 border-yellow-900 ${
          isBig ? "h-14 border-y-4" : "h-7 rem:border-y-[4px]"
        }`}
      ></div>
      <div className={`w-1 bg-yellow-900 ${isBig ? "h-12" : "h-5"}`}></div>
    </div>
  );
};
