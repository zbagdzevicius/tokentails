import { useEffect, useMemo, useState } from "react";
import { cdnFile } from "./utils";
import { GameType } from "@/models/game";

const bgImages = [
  `url(${cdnFile("backgrounds/bg-1.webp")})`,
  `url(${cdnFile("backgrounds/bg-2.webp")})`,
  `url(${cdnFile("backgrounds/bg-3.webp")})`,
  `url(${cdnFile("backgrounds/bg-4.webp")})`,
  `url(${cdnFile("backgrounds/bg-5.webp")})`,
  `url(${cdnFile("backgrounds/bg-6.webp")})`,
  `url(${cdnFile("backgrounds/bg-7.webp")})`,
  `url(${cdnFile("backgrounds/bg-8.webp")})`,
  `url(${cdnFile("backgrounds/bg-10.webp")})`,
  `url(${cdnFile("backgrounds/bg-1.webp")})`,
  `url(${cdnFile("backgrounds/bg-1.webp")})`,
  `url(${cdnFile("backgrounds/bg-2.webp")})`,
  `url(${cdnFile("backgrounds/bg-3.webp")})`,
  `url(${cdnFile("backgrounds/bg-4.webp")})`,
  `url(${cdnFile("backgrounds/bg-5.webp")})`,
  `url(${cdnFile("backgrounds/bg-6.webp")})`,
  `url(${cdnFile("backgrounds/bg-7.webp")})`,
  `url(${cdnFile("backgrounds/bg-8.webp")})`,
  `url(${cdnFile("backgrounds/bg-10.webp")})`,
  `url(${cdnFile("backgrounds/bg-1.webp")})`,
  `url(${cdnFile("backgrounds/bg-2.webp")})`,
  `url(${cdnFile("backgrounds/bg-3.webp")})`,
  `url(${cdnFile("backgrounds/bg-4.webp")})`,
  `url(${cdnFile("backgrounds/bg-5.webp")})`,
  `url(${cdnFile("backgrounds/bg-6.webp")})`,
];

const chaptersBackgroundImages = {
  "0": `url(${cdnFile("backgrounds/bg-10.webp")})`,
  "1": `url(${cdnFile("backgrounds/bg-5.webp")})`,
  "2": `url(${cdnFile("backgrounds/bg-6.webp")})`,
  "3": `url(${cdnFile("backgrounds/bg-3.webp")})`,
  "4": `url(${cdnFile("backgrounds/bg-4.webp")})`,
  "5": `url(${cdnFile("backgrounds/bg-1.webp")})`,
  "6": `url(${cdnFile("backgrounds/bg-2.webp")})`,
  "7": `url(${cdnFile("backgrounds/bg-7.webp")})`,
  "8": `url(${cdnFile("backgrounds/bg-8.webp")})`,
  "9": `url(${cdnFile("backgrounds/bg-6.webp")})`,
};

export const useBackground = ({
  level,
  gameType,
}: {
  level?: string | null;
  gameType?: GameType | null;
}) => {
  const bgImage = useMemo(() => {
    if (gameType === GameType.HOME) {
      return `url(${cdnFile("backgrounds/bg-2.webp")})`;
    }
    if (gameType === GameType.SHELTER) {
      return `url(${cdnFile("backgrounds/bg-10.webp")})`;
    }
    return null;
  }, [gameType]);
  const bgHour = useMemo(() => {
    const coreBg = {
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
      backgroundPosition: "center bottom",
    };
    return {
      ...coreBg,
      backgroundImage: bgImage
        ? bgImage
        : level
        ? chaptersBackgroundImages[
            level[0] as keyof typeof chaptersBackgroundImages
          ]
        : `url(${cdnFile("landing/game-bg-2.webp")})`,
    };
  }, [level, gameType]);

  return bgHour;
};
