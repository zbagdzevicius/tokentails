import { cdnFile } from "@/constants/utils";

export const MATCH3_ARENA_BG = cdnFile("landing/game-bg-2.webp");

export const MATCH3_TILE_ASSETS = [
  { type: "CATNIP", src: cdnFile("logo/catnip.webp"), label: "Catnip" },
  { type: "HEART", src: cdnFile("logo/heart.webp"), label: "Heart" },
  { type: "TAILS", src: cdnFile("logo/logo.webp"), label: "$TAILS" },
  { type: "PAW", src: cdnFile("logo/paw.webp"), label: "Paw" },
  { type: "FIRE", src: cdnFile("ability/FIRE.png"), label: "Fire" },
  { type: "WATER", src: cdnFile("ability/WATER.png"), label: "Water" },
  { type: "NATURE", src: cdnFile("ability/NATURE.png"), label: "Nature" },
] as const;

export type Match3TileType = (typeof MATCH3_TILE_ASSETS)[number]["type"];
export type Match3LevelId = string;

export interface IMatch3LevelDefinition {
  id: Match3LevelId;
  name: string;
  subtitle: string;
  timeLimit: number;
  targetScore: number;
  catnipCap: number;
  tilePoolSize: number;
  objectiveType: Match3TileType;
  objectiveTarget: number;
  feverProgressGate: number;
  lastChanceProgressGate: number;
}

const MATCH3_LEVEL_COUNT = 30;
export const MATCH3_LEVELS_PER_WORLD = 5;
const OBJECTIVE_ROTATION: Match3TileType[] = [
  "CATNIP",
  "HEART",
  "TAILS",
  "PAW",
  "FIRE",
  "WATER",
  "NATURE",
];
const LEVEL_NAME_BY_WORLD = [
  "KITTEN STARTER",
  "WHISKER RUN",
  "SHELTER SPRINT",
  "MOON PAWS",
  "STAR NIP",
  "LEGEND CLAWS",
];

const roundToInt = (value: number) => Math.max(0, Math.round(value));

const buildMatch3Level = (levelNumber: number): IMatch3LevelDefinition => {
  const world = Math.floor((levelNumber - 1) / 5);
  const step = ((levelNumber - 1) % 5) + 1;
  const difficulty = levelNumber - 1;

  const catnipCap = roundToInt(Math.min(85, 9 + levelNumber * 2 + Math.floor(difficulty / 4)));
  const timeLimit = roundToInt(
    Math.max(68, 132 - world * 6 - ((levelNumber - 1) % 5) * 2),
  );
  const targetScore = roundToInt(230 + levelNumber * 26 + world * 20);
  const tilePoolSize = Math.min(MATCH3_TILE_ASSETS.length, 5 + Math.floor(difficulty / 6));
  const objectiveType = OBJECTIVE_ROTATION[difficulty % OBJECTIVE_ROTATION.length];
  const objectiveTarget = roundToInt(10 + Math.floor(difficulty / 3) * 2 + (difficulty % 2));
  const feverProgressGate = Number((Math.min(0.8, 0.6 + world * 0.025)).toFixed(2));
  const lastChanceProgressGate = Number((Math.min(0.95, 0.84 + world * 0.018)).toFixed(2));

  return {
    id: String(levelNumber),
    name: `${LEVEL_NAME_BY_WORLD[Math.min(world, LEVEL_NAME_BY_WORLD.length - 1)]} ${step}`,
    subtitle: `Beat the board and secure up to ${catnipCap} catnip`,
    timeLimit,
    targetScore,
    catnipCap,
    tilePoolSize,
    objectiveType,
    objectiveTarget,
    feverProgressGate,
    lastChanceProgressGate,
  };
};

export const MATCH3_LEVELS: IMatch3LevelDefinition[] = Array.from(
  { length: MATCH3_LEVEL_COUNT },
  (_, index) => buildMatch3Level(index + 1),
);

export const MATCH3_LEVEL_BY_ID: Record<string, IMatch3LevelDefinition> =
  MATCH3_LEVELS.reduce(
    (acc, level) => {
      acc[level.id] = level;
      return acc;
    },
    {} as Record<string, IMatch3LevelDefinition>,
  );

export const MATCH3_WORLD_COUNT = Math.ceil(
  MATCH3_LEVELS.length / MATCH3_LEVELS_PER_WORLD,
);

export const getMatch3LevelIndex = (levelId: Match3LevelId) => {
  return MATCH3_LEVELS.findIndex((level) => level.id === levelId);
};

export const getNextMatch3LevelId = (
  levelId: Match3LevelId,
): Match3LevelId | null => {
  const levelIndex = getMatch3LevelIndex(levelId);
  if (levelIndex < 0 || levelIndex >= MATCH3_LEVELS.length - 1) {
    return null;
  }
  return MATCH3_LEVELS[levelIndex + 1].id;
};

export const getMatch3WorldByLevelId = (levelId: Match3LevelId) => {
  const levelIndex = getMatch3LevelIndex(levelId);
  if (levelIndex < 0) {
    return 0;
  }
  return Math.floor(levelIndex / MATCH3_LEVELS_PER_WORLD);
};

export const MATCH3_TILE_BY_TYPE: Record<Match3TileType, (typeof MATCH3_TILE_ASSETS)[number]> =
  MATCH3_TILE_ASSETS.reduce(
    (acc, tile) => {
      acc[tile.type] = tile;
      return acc;
    },
    {} as Record<Match3TileType, (typeof MATCH3_TILE_ASSETS)[number]>,
  );

export const isMatch3LevelId = (level: string): level is Match3LevelId => {
  return Object.prototype.hasOwnProperty.call(MATCH3_LEVEL_BY_ID, level);
};
