import { GamePlatformValue, GameType } from "./game";

export type IMatch = {
  type: GameType;
  points: number;
  score?: number;
  time: number;
  level?: string;
  /** Where the run was played. Stored on the `Game` row. */
  platform?: GamePlatformValue;
};
