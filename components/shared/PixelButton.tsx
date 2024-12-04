import { useHover } from "@uidotdev/usehooks";
import { useMemo, useEffect } from "react";

interface IProps {
  text: string;
  subtext?: string | number;
  active?: boolean;
  isBig?: boolean;
  isWidthFull?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
}

export const PixelButton = ({
  text,
  subtext,
  active,
  onClick,
  isBig,
  isWidthFull,
  isDisabled,
}: IProps) => {
  const [ref, hovering] = useHover();

  const handleClick = () => {
    if (isDisabled) return;
    const audio = new Audio("/audio/button/click-close.wav");
    audio.volume = 0.5;
    audio.play();
    if (onClick) onClick();
  };

  useEffect(() => {
    if (hovering && !isDisabled) {
      const audio = new Audio("/audio/button/modern-mix.wav");
      audio.volume = 0.5;
      audio.play();
    }
  }, [hovering, isDisabled]);

  return (
    <button
      onClick={handleClick}
      ref={ref}
      disabled={isDisabled}
      style={{
        ...(isWidthFull ? { width: "100% !important" } : {}),
        filter: isDisabled ? "brightness(0.7)" : undefined,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      className={`flex justify-center items-center h-12 ${isWidthFull && "w-full"
        } ${!active && !isDisabled ? "hover:brightness-125 hover:pb-1" : ""
        }`}
    >
      <div className="h-8 w-1 bg-black"></div>
      <div className="h-10 w-1 flex flex-col bg-red-500 border-y-4 border-black">
        <div className="h-6 bg-red-500"></div>
        <div className="h-1 bg-yellow-300"></div>
        {!active && <div className="h-2 bg-red-700"></div>}
      </div>
      <div className={`${isWidthFull && "w-full"}`}>
        <div
          className={`h-12 flex flex-col border-y-4 border-black bg-red-500 ${isWidthFull && "w-full"
            }'`}
        >
          <div
            className={`h-9 bg-red-500 px-4 font-secondary ${isWidthFull && "w-full justify-center items-center"
              } ${isBig ? "text-p3" : "text-p4"
              } flex items-center gap-2`}
          >
            <p className="text-yellow-300 whitespace-nowrap">{text}</p>
            {subtext && <p className="text-yellow-200">{subtext}</p>}
          </div>
          <div className="h-1 bg-yellow-300"></div>
          {!active && <div className="h-2 bg-red-700"></div>}
        </div>
      </div>
      <div className="h-10 w-1 flex flex-col bg-red-500 border-y-4 border-black">
        <div className="h-8 bg-yellow-300"></div>
        {!active && <div className="h-2 bg-red-700"></div>}
      </div>
      <div className="h-8 w-1 bg-black"></div>
    </button>
  );
};
