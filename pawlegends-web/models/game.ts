import type { GamePlatform } from "@/shared-contracts/enums";

// GameType and GamePlatform come from the generated copy of shared/enums.ts (plan F2), the same
// enums the backend uses. CATNIP_HEIST names the Heist; it is not one of the Phaser modes.
export { GamePlatform, GameType } from "@/shared-contracts/enums";

export enum GameModal {
  QUESTS = "QUESTS",
  PACKS = "PACKS",
  PROFILE = "PROFILE",
  LEADERBOARD = "LEADERBOARD",
  CATS = "CATS",
  INVITE = "INVITE",
  CONTROL_SETTINGS = "CONTROL_SETTINGS",
  MYSTERY_CAT = "MYSTERY_CAT",
  FEATURED_CAT = "FEATURED_CAT",
  SUPPORT = "SUPPORT",
  CODEX = "CODEX",
  OFFER_WALL = "OFFER_WALL",
  SPIN_WHEEL = "SPIN_WHEEL",
}

/** String value of a `GamePlatform`, as sent in API bodies and analytics events. */
export type GamePlatformValue = `${GamePlatform}`;

export const endScenePeriod = 500;
export const bossHitRewardsDebounceTime = 500;
export const catWalkSpeed = 420;
