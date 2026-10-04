import { MATCH3_LEVEL_BY_ID } from "@/components/Match3/match3.config";
import { purrsuitLevelName } from "@/components/Phaser/onboarding/hints";
import { GameType } from "@/models/game";

/** The game's name, shown under the level in the panel's header. */
export const GAME_MODE_NAMES: Partial<Record<GameType, string>> = {
  [GameType.MATCH_3]: "Paw Match",
  [GameType.CATNIP_CHAOS]: "Purrsuit",
  [GameType.PIXEL_RESCUE]: "Cupid Cat",
  [GameType.CATNIP_HEIST]: "Catnip Heist",
};

/** "Level 1-2" for a two or three digit map level, "Infinite run" for the endless levels ("0…"). */
export const mapLevelName = (level: string) => {
  if (level.startsWith("0")) return "Infinite run";
  return `Level ${
    level.length === 3 ? `${level[0]}${level[1]}-${level[2]}` : level.split("").join("-")
  }`;
};

/** "KITTEN STARTER 1" (the level table's caps) as "Kitten Starter 1", to sit in a sentence-case line. */
const titleCase = (name: string) =>
  name === name.toUpperCase() ? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : name;

/**
 * The one name of a level, the same one its RunGate shows, on both end-of-run screens (the panel
 * and the DeathCard): `title` is short ("Level 3", "Level 1-2", "Day 4", "Infinite run") and
 * `detail` is the level's own name when it has one ("Kitten Starter 3").
 */
export function levelNameParts(level: string, gameType: GameType | string): { title: string; detail?: string } {
  if (gameType === GameType.MATCH_3) {
    const match3Level = MATCH3_LEVEL_BY_ID[level];
    return match3Level ? { title: `Level ${match3Level.id}`, detail: titleCase(match3Level.name) } : { title: `Level ${level}` };
  }
  if (gameType === GameType.PIXEL_RESCUE) return { title: `Day ${level}` };
  if (gameType === GameType.CATNIP_CHAOS) {
    return level.startsWith("0") ? { title: "Infinite run" } : { title: `Level ${purrsuitLevelName(level)}` };
  }
  return { title: mapLevelName(level) };
}

/** The full name in one line: "Level 3 · Kitten Starter 3", "Level 1-1", "Day 4". */
export const getGameLevelName = (level: string, gameType: GameType) => {
  const { title, detail } = levelNameParts(level, gameType);
  return detail ? `${title} · ${detail}` : title;
};

