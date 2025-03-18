import React, { useState, useEffect } from "react";

export const CandyCaneProgress = ({}) => {
  const [progress, setProgress] = useState(0);
  const now = new Date();

  const utcDay = now.getUTCDate();
  useEffect(() => {
    setProgress(utcDay);
  }, [utcDay]);

  const maxProgress = 9;
  const effectiveProgress = Math.min(progress, maxProgress);
  const santaPosition = Math.min((effectiveProgress / maxProgress) * 100, 90);

  return (
    <div className="flex flex-row items-end mt-8 relative w-72">
      <img
        draggable={false}
        src="/icons/candy-cane.png"
        alt="Candy Cane"
        className="w-16 rem:h-[72px] object-contain absolute -left-11"
      />

      <progress
        value={progress}
        max={maxProgress}
        className="progress z-10 w-[90%]"
      ></progress>

      <img
        draggable={false}
        className="absolute w-16 h-16 z-20"
        src="/icons/running-santa.gif"
        style={{
          bottom: "0",
          left: `${santaPosition}%`,
          transform: "translateX(-50%)",
        }}
        alt="Running Santa"
      />
      <img
        draggable={false}
        src="./icons/gift.png"
        className="absolute w-8 h-8 -right-4 md:right-2 bottom-0"
        alt="Gift"
      />
    </div>
  );
};
