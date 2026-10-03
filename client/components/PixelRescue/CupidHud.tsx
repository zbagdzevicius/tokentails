import { useEffect, useState } from "react";
import { cdnFile } from "@/constants/utils";
import { CUPID_FTUE_EVENT, type ICupidFtueSnapshot } from "./ftue";

/** The slice of a Phaser scene the HUD needs; no Phaser import (this file renders on the server). */
interface FtueScene {
  game?: {
    events?: {
      on: (event: string, fn: (snapshot: ICupidFtueSnapshot) => void) => unknown;
      off: (event: string, fn: (snapshot: ICupidFtueSnapshot) => void) => unknown;
    };
  };
  ftueSnapshot?: () => ICupidFtueSnapshot;
  replayTutorial?: () => boolean;
}

/** Follows the scene's first-session state (`CUPID_FTUE_EVENT`). */
export function useCupidFtue(scene: unknown): ICupidFtueSnapshot | null {
  // Snapshots are kept per scene, so a new scene never shows the last one's state.
  const [state, setState] = useState<{ scene: unknown; snapshot: ICupidFtueSnapshot | null }>({
    scene: null,
    snapshot: null,
  });
  useEffect(() => {
    const target = scene as FtueScene | undefined;
    const events = target?.game?.events;
    if (!events) return;
    const onSnapshot = (snapshot: ICupidFtueSnapshot) => setState({ scene, snapshot });
    events.on(CUPID_FTUE_EVENT, onSnapshot);
    return () => {
      events.off(CUPID_FTUE_EVENT, onSnapshot);
    };
  }, [scene]);
  return state.scene === scene && scene ? state.snapshot : null;
}

/** "Replay tutorial" on the scene, if it has one. */
export function replayTutorialOn(scene: unknown): boolean {
  return !!(scene as FtueScene | undefined)?.replayTutorial?.();
}

/**
 * Cupid's first-session HUD (plan G10): the starter-shield chip while a shield is up, and
 * "Replay tutorial". It sits under the health bar at `z-hud`, below the RunGate (`z-gate`) and the
 * close button, so neither is ever covered.
 */
export function CupidHud({
  level,
  ftue,
  onReplay,
}: {
  level: string;
  ftue: ICupidFtueSnapshot | null;
  /**
   * Asks the scene for the tour. A callback, never the scene itself: React's dev render logging
   * walks object props, and a destroyed Phaser scene throws from its input getters.
   */
  onReplay: () => void;
}) {
  if (!ftue || ftue.level !== level || ftue.gameEnded) return null;
  // Only once the run has begun and no tour is playing: on a first visit the tour has not played
  // yet, and behind the gate the button would compete with the card.
  const canReplay = ftue.clockBegun && !ftue.tutorialActive;

  return (
    <div
      data-testid="cupid-hud"
      className="pointer-events-none fixed left-4 md:left-6 top-[7.5rem] md:top-[8.5rem] z-hud flex flex-col items-start gap-2"
    >
      {ftue.shieldActive && (
        <div
          data-testid="cupid-shield-chip"
          role="status"
          className="flex items-center gap-1.5 rounded-full border-2 border-tt-gold-500 bg-tt-night-900/85 px-2.5 py-1 font-primary text-p6 md:text-p5 text-tt-cream shadow-[0_0_14px_rgba(255,204,85,0.35)]"
        >
          <img
            src={cdnFile("pixel-rescue/items/hearth-shield.webp")}
            alt=""
            className="h-4 w-4 md:h-5 md:w-5"
            style={{ imageRendering: "pixelated" }}
            draggable={false}
          />
          {ftue.shieldSource === "starter" ? "Starter shield · blocks 1 hit" : "Shield · blocks 1 hit"}
        </div>
      )}
      {canReplay && (
        <button
          type="button"
          data-testid="cupid-replay-tutorial"
          data-run-ignore
          onClick={(event) => {
            event.stopPropagation();
            onReplay();
            (event.currentTarget as HTMLButtonElement).blur();
          }}
          className="pointer-events-auto min-h-[44px] rounded-full border-2 border-tt-night-500 bg-tt-night-900/80 px-3 font-primary text-p6 md:text-p5 text-tt-lilac hover:border-tt-gold-500 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
        >
          ↺ Replay tutorial
        </button>
      )}
    </div>
  );
}
