export enum Map {
  AUTUMN = "base/autumn.png",
  WINTER = "base/winter.png",
  SPRING = "base/spring.png",
  SUMMER = "base/summer.png",
}

export const CoreMap = Map.SPRING;

export const LevelMap: Record<string, Map> = {
  "1-1": CoreMap,
  "1-2": CoreMap,
  "1-3": CoreMap,
  "1-4": CoreMap,
  "1-5": CoreMap,
  "1-6": CoreMap,
};
