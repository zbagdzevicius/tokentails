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

export enum GameType {
  SHELTER = "SHELTER",
  HOME = "HOME",
  CATNIP_CHAOS = "CATNIP_CHAOS",
  PIXEL_RESCUE = "PIXEL_RESCUE",
  MATCH_3 = "MATCH_3",
}

/** Where a game was played. Mirrors `GamePlatform` in backend/src/game/game.schema.ts. */
export enum GamePlatform {
  WEB = "web",
  IOS = "ios",
  ANDROID = "android",
}

/** String value of a `GamePlatform`, as sent in API bodies and analytics events. */
export type GamePlatformValue = `${GamePlatform}`;

export const endScenePeriod = 500;
export const bossHitRewardsDebounceTime = 500;
export const catWalkSpeed = 420;
