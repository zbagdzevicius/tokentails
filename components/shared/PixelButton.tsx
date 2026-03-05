import { cdnFile } from "@/constants/utils";
import { useHover } from "@uidotdev/usehooks";
import { useEffect, useRef } from "react";

interface IProps {
  text: string;
  subtext?: string | number;
  active?: boolean;
  isBig?: boolean;
  isMedium?: boolean;
  isSmall?: boolean;
  isWidthFull?: boolean;
  id?: string;
  isDisabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export const PixelButton = ({
  text,
  subtext,
  active,
  onClick,
  isBig,
  isMedium,
  isWidthFull,
  isDisabled,
  isSmall,
  className,
  id,
}: IProps) => {
  const [ref, hovering] = useHover();
  const audioRefs = useRef<Record<"click" | "hover", HTMLAudioElement | null>>({
    click: null,
    hover: null,
  });

  useEffect(() => {
    const audioCache = {
      click: new Audio(cdnFile("audio/button/click-close.wav")),
      hover: new Audio(cdnFile("audio/button/modern-mix.wav")),
    };
    audioCache.click.volume = 0.04;
    audioCache.hover.volume = 0.5;
    audioRefs.current = audioCache;
  }, []);

  const handleClick = () => {
    if (isDisabled) return;
    onClick?.();
    try {
      const playPromise = audioRefs.current.click?.play();
      if (playPromise) {
        void playPromise.catch(() => {});
      }
    } catch {}
  };

  useEffect(() => {
    if (hovering && !isDisabled) {
      try {
        const playPromise = audioRefs.current.hover?.play();
        if (playPromise) {
          void playPromise.catch(() => {});
        }
      } catch {}
    }
  }, [hovering, isDisabled]);

  return (
    <button
      id={id}
      onClick={handleClick}
      ref={ref}
      disabled={isDisabled}
      style={{
        ...(isWidthFull ? { width: "100% !important" } : {}),
        filter: isDisabled ? "brightness(0.7)" : "none",
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      className={`flex justify-center relative items-center m-auto h-12 ${className} ${
        isWidthFull && "w-full"
      }
            ${isSmall && "scale-[0.675] hover:scale-75"}
            ${isMedium && "scale-[1.35] hover:scale-100"}
            ${
              isBig &&
              "glow-box scale-125 md:scale-[2] hover:scale-150 md:hover:scale-[2.5]"
            }
            ${!isBig && !isSmall && "hover:scale-105"}
         ${
           !active && !isDisabled
             ? "hover:brightness-125 hover:pb-1 transition-all"
             : ""
         }`}
    >
      <img
        src={cdnFile("landing/button-bg.webp")}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover mix-blend-darken brightness-125 rounded-xl animate-pulseWeak"
      />
      <div className="h-8 w-1 bg-yellow-900"></div>
      <div className="h-10 w-1 flex flex-col bg-yellow-300 border-y-4 border-yellow-900">
        <div className="h-6 bg-yellow-300"></div>
        <div className="h-1 bg-yellow-900"></div>
        {!active && <div className="h-2 bg-[#e2c05a]"></div>}
      </div>
      <div className={`${isWidthFull && "w-full"}`}>
        <div
          className={`h-12 flex flex-col border-y-4 border-yellow-900 bg-yellow-300 ${
            isWidthFull && "w-full"
          }'`}
        >
          <div
            className={`h-9 bg-yellow-300 px-4 font-primary font-normal uppercase ${
              isWidthFull && "w-full justify-center items-center"
            } ${isBig ? "text-p3" : "text-p4"} flex items-center gap-2`}
          >
            <p className="text-yellow-900 whitespace-nowrap">{text}</p>
            {subtext && <p className="text-yellow-800">{subtext}</p>}
          </div>
          <div className="h-1 bg-yellow-900"></div>
          {!active && <div className="h-2 bg-[#e2c05a]"></div>}
        </div>
      </div>
      <div className="h-10 w-1 flex flex-col bg-yellow-300 border-y-4 border-yellow-800">
        <div className="h-8 bg-yellow-900"></div>
        {!active && <div className="h-2 bg-[#e2c05a]"></div>}
      </div>
      <div className="h-8 w-1 bg-yellow-900"></div>
    </button>
  );
};
