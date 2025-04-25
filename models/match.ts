import { GameType } from "./game";

export type IMatch = {
  type: GameType;
  points: number;
  time: number;
  level?: string;
};
