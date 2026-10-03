/**
 * Cupid Cat's first-session flags on the shared ftue-store (plan G10): tutorial seen per level,
 * first-seen hints, and local clears. The store is versioned, wrapped against blocked storage and
 * falls back to memory for the page, so a retry never replays the tutorial even in a private
 * window.
 */
import { ftueStore, type FtueStore } from "@/components/Phaser/onboarding/ftue-store";
import { GameType } from "@/models/game";
import { hintKey, tutorialKey, type CupidHintId } from "./ftue";

/** The ftue-store mode key for Cupid Cat. */
export const CUPID_FTUE_MODE = GameType.PIXEL_RESCUE;

/** The pre-G10 key TutorialManager wrote; players who saw the old tour keep it seen. */
const LEGACY_TUTORIAL_KEY = "pixelrescue_tutorial_completed_level_";

function legacyTutorialSeen(level: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(`${LEGACY_TUTORIAL_KEY}${level}`) === "true";
  } catch {
    return false;
  }
}

export function createCupidFtue(store: FtueStore = ftueStore) {
  return {
    tutorialSeen(level: string): boolean {
      return store.hintDone(CUPID_FTUE_MODE, tutorialKey(level)) || legacyTutorialSeen(level);
    },
    markTutorialSeen(level: string): void {
      store.markHintDone(CUPID_FTUE_MODE, tutorialKey(level));
    },
    hintSeen(id: CupidHintId): boolean {
      return store.hintDone(CUPID_FTUE_MODE, hintKey(id));
    },
    markHintSeen(id: CupidHintId): void {
      store.markHintDone(CUPID_FTUE_MODE, hintKey(id));
    },
    /** Wins this device saw: a cache for the level select until the profile shows the clear. */
    localClears(): string[] {
      return store.localClears(CUPID_FTUE_MODE);
    },
    recordLocalClear(level: string): void {
      store.addLocalClear(CUPID_FTUE_MODE, String(level));
    },
  };
}

export const cupidFtue = createCupidFtue();
