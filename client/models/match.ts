import type { LiveGameOutcome } from "@/shared-contracts/enums";
import { GamePlatformValue, GameType } from "./game";

export type IMatch = {
  type: GameType;
  points: number;
  score?: number;
  time: number;
  level?: string;
  /** Where the run was played. Stored on the `Game` row. */
  platform?: GamePlatformValue;
  /** How the run ended (plan F6). `won` on a non-INFINITE level records the clear. */
  outcome?: LiveGameOutcome;
};
