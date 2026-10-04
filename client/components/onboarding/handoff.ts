import { useGame } from "@/context/GameContext";
import { isCupidSeason } from "@/components/game/seasons";
import { GameType } from "@/models/game";
import { useCallback, useEffect, useRef } from "react";
import { onboardingStore } from "./store";
import { useLatest } from "./useLatest";

/**
 * Where a new player goes after Meet your cat (decision #96): Cupid Cat (PIXEL_RESCUE) level 1,
 * behind its full RunGate (a first visit always gets the full card, see components/game/RunGate)
 * and with the starter shield (`starterShield`). The flag is descriptive: Cupid Cat derives the
 * shield itself from the cleared state (`starterShieldFor` in PixelRescue/ftue.ts, task 5b: on
 * uncleared levels 1-2), so the hand-off passes nothing to the mode and no flag can go stale.
 *
 * Purrsuit 1-1 becomes the default only once G10's soft deaths ship AND decision #94 is settled.
 * Task 5a shipped the soft deaths (Paw Guard, unlimited on uncleared 1-1); #94 (is Purrsuit frozen
 * or getting new levels) is still open, so the default stays Cupid Cat. `PURRSUIT_FIRST_MODE` is
 * the drop-in replacement once the founder settles #94.
 */
export interface FirstMode {
  gameType: GameType;
  level: string;
  label: string;
  /** Start the first run with the starter shield (Cupid Cat). */
  starterShield: boolean;
}

export const FIRST_MODE: Readonly<FirstMode> = Object.freeze({
  gameType: GameType.PIXEL_RESCUE,
  level: "1",
  label: "Cupid Cat · Day 1",
  starterShield: true,
});

/**
 * The alternative default for after decision #94 (see above), and the first mode outside Cupid
 * Cat's season (January to March, `components/game/seasons`): Purrsuit 1-1 has G10's soft deaths.
 */
export const PURRSUIT_FIRST_MODE: Readonly<FirstMode> = Object.freeze({
  gameType: GameType.CATNIP_CHAOS,
  level: "11",
  label: "Purrsuit · 1-1",
  starterShield: false,
});

/** The first mode for a new player today: Cupid Cat in its season, Purrsuit 1-1 otherwise. */
export function firstModeFor(now: Date = new Date()): Readonly<FirstMode> {
  return isCupidSeason(now) ? FIRST_MODE : PURRSUIT_FIRST_MODE;
}

/**
 * How long the lobby shows the named starter in its hero slot before the first mode opens. Long
 * enough to read "{name}" and see the cat; short enough to feel like one motion.
 */
export const LOBBY_BEAT_MS = 1800;

export interface HandoffOptions {
  /** Override the lobby beat (tests, or 0 to open the mode at once). */
  beatMs?: number;
}

/**
 * The hand-off from Meet your cat into play: shows the lobby (with the hero slot), then selects
 * the first mode and level. Returns `start` and `cancel`; a pending hand-off is cancelled on unmount.
 */
export function useOnboardingHandoff(): { start: (options?: HandoffOptions) => void; cancel: () => void } {
  const { setGameType } = useGame();
  // The game context hands out new functions each render; the timer must call the latest ones.
  const latest = useLatest({ setGameType });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    onboardingStore.set({ firstRunLabel: null });
  }, []);

  const start = useCallback(
    (options: HandoffOptions = {}) => {
      cancel();
      const beat = Math.max(0, options.beatMs ?? LOBBY_BEAT_MS);
      const first = firstModeFor();
      onboardingStore.set({ justFinished: true, firstRunLabel: first.label });
      latest.current.setGameType(null);
      const open = () => {
        timer.current = null;
        // The post-ceremony entrance is over: the lobby animates normally from now on.
        onboardingStore.set({ firstRunLabel: null, justFinished: false });
        // Mode and level in one call: one `select`, no first-time routing in between (review #10).
        latest.current.setGameType(first.gameType, first.level);
      };
      if (beat === 0) open();
      else timer.current = setTimeout(open, beat);
    },
    [cancel, latest],
  );

  useEffect(() => cancel, [cancel]);

  return { start, cancel };
}
