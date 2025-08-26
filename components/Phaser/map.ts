import { cdnFile } from "@/constants/utils";

export enum Map {
  AUTUMN = "base/autumn.png",
  WINTER = "base/winter.png",
  SPRING = "base/spring.png",
  SUMMER = "base/summer.png",
  CONSTRUCTION = "base/construct.png",
  CANDY = "base/candy.png",
  CAMP = "base/camp.png",
  SUMMIT = "base/summit.png",
  STOCKS = "base/stocks.png",
}

export const CoreMap = Map.SPRING;

export const CatnipChaosLevelMap: Record<string, Map> = {
  "11": Map.CONSTRUCTION,
  "12": Map.CONSTRUCTION,
  "13": Map.CONSTRUCTION,
  "14": Map.CONSTRUCTION,
  "15": Map.CONSTRUCTION,
  "16": Map.CONSTRUCTION,
  "21": Map.SPRING,
  "22": Map.SPRING,
  "23": Map.SPRING,
  "24": Map.SPRING,
  "25": Map.SPRING,
  "26": Map.SPRING,
  "31": Map.SUMMER,
  "32": Map.SUMMER,
  "33": Map.SUMMER,
  "34": Map.SUMMER,
  "35": Map.SUMMER,
  "36": Map.SUMMER,
  "41": Map.CANDY,
  "42": Map.CANDY,
  "43": Map.CANDY,
  "44": Map.CANDY,
  "45": Map.CANDY,
  "46": Map.CANDY,
  "51": Map.CAMP,
  "52": Map.CAMP,
  "53": Map.CAMP,
  "54": Map.CAMP,
  "55": Map.CAMP,
  "56": Map.CAMP,
  "61": Map.SUMMIT,
  "62": Map.SUMMIT,
  "63": Map.SUMMIT,
  "64": Map.SUMMIT,
  "65": Map.SUMMIT,
  "66": Map.SUMMIT,
  "71": Map.STOCKS,
  "72": Map.STOCKS,
  "73": Map.STOCKS,
  "74": Map.STOCKS,
  "75": Map.STOCKS,
  "76": Map.STOCKS,
};

export const catnipChaosLevelsList: (keyof typeof CatnipChaosLevelMap)[] =
  Object.keys(CatnipChaosLevelMap).sort(
    (a, b) => parseInt(a) - parseInt(b)
  ) as (keyof typeof CatnipChaosLevelMap)[];

export const lastCatnipChaosLevel =
  catnipChaosLevelsList[catnipChaosLevelsList.length - 1];

export const getNextCatnipChaosLevel = (level: string) => {
  const index = catnipChaosLevelsList.indexOf(level);
  return catnipChaosLevelsList[index + 1];
};

export const catnipChaosChapterBGImage: Record<string, string> = {
  "1": cdnFile("backgrounds/bg-5.webp"),
  "2": cdnFile("backgrounds/bg-6.webp"),
  "3": cdnFile("backgrounds/bg-3.webp"),
  "4": cdnFile("backgrounds/bg-4.webp"),
  "5": cdnFile("backgrounds/bg-min-camp.webp"),
  "6": cdnFile("backgrounds/bg-min-summit.webp"),
};
