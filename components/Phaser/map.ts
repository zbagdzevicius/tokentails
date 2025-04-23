export enum Map {
  AUTUMN = "base/autumn.png",
  WINTER = "base/winter.png",
  SPRING = "base/spring.png",
  SUMMER = "base/summer.png",
  CONSTRUCTION = "base/construct.png",
  CANDY = "base/candy.png",
}

export const CoreMap = Map.SPRING;

export const LevelMap: Record<string, Map> = {
  "1-1": Map.CONSTRUCTION,
  "1-2": Map.CONSTRUCTION,
  "1-3": Map.CONSTRUCTION,
  "1-4": Map.CONSTRUCTION,
  "1-5": Map.CONSTRUCTION,
  "1-6": Map.CONSTRUCTION,
  "2-1": Map.SPRING,
  "2-2": Map.SPRING,
  "2-3": Map.SPRING,
  "2-4": Map.SPRING,
  "2-5": Map.SPRING,
  "2-6": Map.SPRING,
};
