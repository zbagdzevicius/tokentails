export enum Map {
  AUTUMN = "base/autumn.png",
  WINTER = "base/winter.png",
  SPRING = "base/spring.png",
  SUMMER = "base/summer.png",
  CONSTRUCTION = "base/construct.png",
  CANDY = "base/candy.png",
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
};

export const catnipChaosLevelsList: (keyof typeof CatnipChaosLevelMap)[] =
  Object.keys(CatnipChaosLevelMap).sort(
    (a, b) => parseInt(a) - parseInt(b)
  ) as (keyof typeof CatnipChaosLevelMap)[];

export const catnipChaosChapterBGImage: Record<string, string> = {
  "1": "/backgrounds/bg-6.png",
  "2": "/backgrounds/bg-night.png",
};
