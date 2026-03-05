import { GameType } from "./game";

export type IMatch = {
  type: GameType;
  points: number;
  score?: number;
  time: number;
  level?: string;
};
