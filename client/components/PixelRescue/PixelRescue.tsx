import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { GameEvents } from "../Phaser/events";
import { clearedFlags, firstTimeLevel } from "../Phaser/onboarding/progress";
import { catnipChaosChapterBGImage } from "../Phaser/map";
import { PixelRescueLevels } from "./PixelRescueLevels";
import { cdnFile } from "../../constants/utils";
import { recordsLocalClears, starterShieldFor } from "./ftue";
import { cupidFtue } from "./ftueStorage";
import { CupidHud, replayTutorialOn, useCupidFtue } from "./CupidHud";
import { cupidGate } from "./hints";
import { RunGate } from "../game/RunGate";
import { isExitKey } from "../Phaser/onboarding/run-gate";
import { CloseButton } from "../shared/CloseButton";

import dynamic from "next/dynamic";

const PixelRescueGame = dynamic(() => import("./config"), { ssr: false });

function PixelRescue() {
  const { cat } = useCat();
  const { profile } = useProfile();
  const { setLevel, level } = useGame();
  const isGameLoaded = GameEvents.GAME_LOADED.use();
  const scene = isGameLoaded?.scene;
  const ftue = useCupidFtue(scene);
  const onReplay = useCallback(() => {
    replayTutorialOn(scene);
  }, [scene]);

  // Cleared state on the shared G10 rules (server array, grandfathered fallback, local clears).
  const cleared = useMemo(
    () => clearedFlags(profile, GameType.PIXEL_RESCUE, cupidFtue.localClears()),
    [profile]
  );

  // First-time routing (plan G10): no clears in Cupid means straight to day 1's gate, once per
  // visit to the mode, so BACK still reaches the level map.
  const routed = useRef(false);
  useEffect(() => {
    if (level) {
      routed.current = true;
      return;
    }
    if (routed.current) return;
    routed.current = true;
    const first = firstTimeLevel(GameType.PIXEL_RESCUE, cleared);
    if (first) setLevel(first);
  }, [level, cleared, setLevel]);

  // The starter shield is decided when the level opens; a clear mid-session does not take it
  // away from the run in progress.
  const starterShield = useMemo(
    () => (level ? starterShieldFor(level, cleared) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level]
  );
  // Device-local clears only when the save cannot reach the server (see ftue.recordsLocalClears).
  const recordLocalClears = recordsLocalClears(
    profile as { transient?: boolean } | null
  );

  // Esc mid-run leaves the level, like the close button (plan G10: Esc reaches level select). The
  // gate handles its own Esc; an open dialog (end-of-run panel, DeathCard) keeps Esc for itself.
  const running = !!ftue?.clockBegun && !ftue.gameEnded;
  useEffect(() => {
    if (!level || !running) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isExitKey(event) || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]'))
        return;
      setLevel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [level, running, setLevel]);

  const gameUpdate = GameEvents.GAME_UPDATE.use();
  const healthUpdate = GameEvents.CAT_HEALTH_UPDATE.use();
  const objectiveUpdate = GameEvents.OBJECTIVE_UPDATE.use();
  const time = gameUpdate?.time ?? 90;

  useEffect(() => {
    if (cat && scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, scene]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div
        id="app"
        style={{
          backgroundImage: `url(${catnipChaosChapterBGImage["1"]})`,
          backgroundSize: "cover",
          backgroundPosition: "top",
        }}
        className="z-20 overflow-y-auto max-h-screen relative"
      >
        {!level && <PixelRescueLevels setSelectedLevel={setLevel} />}
        {level && isGameLoaded && objectiveUpdate && (
          <div className="fixed top-4 left-4 md:left-6 z-50 bg-gradient-to-br from-rose-900/60 to-pink-900/60 backdrop-blur-xl px-2 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl border border-pink-400/50 flex flex-col items-center shadow-[0_0_20px_rgba(244,114,182,0.5)] transition-all duration-300">
            <span className="text-pink-200/80 text-[7px] md:text-[9px] uppercase tracking-[0.1em] md:tracking-[0.15em] font-black mb-0.5 flex items-center gap-0.5">
              💝 Quest
            </span>
            <span className="text-xs md:text-base font-bold text-rose-100 drop-shadow-[0_2px_8px_rgba(251,113,133,0.7)] text-center leading-tight">
              {objectiveUpdate.objective}
            </span>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 md:w-10 h-0.5 bg-gradient-to-r from-transparent via-pink-400/50 to-transparent rounded-full" />
          </div>
        )}

        {level && isGameLoaded && (
          <div className="fixed top-4 right-[4.25rem] md:top-6 lg:right-[6rem] z-50 bg-gradient-to-br from-rose-900/60 to-pink-800/60 backdrop-blur-xl px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl border-2 border-pink-400/50 flex flex-col items-center shadow-[0_0_30px_rgba(244,114,182,0.6)] transition-all duration-300 hover:scale-105">
            <span className="text-pink-200/80 text-[6px] md:text-xs uppercase tracking-wider font-black mb-0.5 flex items-center gap-1">
              Time
            </span>
            <span
              className={`text-lg md:text-xl font-primary font-bold tabular-nums drop-shadow-[0_2px_10px_rgba(251,113,133,0.8)] ${
                time <= 10 ? "text-red-300 animate-pulse" : "text-rose-100"
              }`}
            >
              {formatTime(time)}
            </span>
          </div>
        )}

        {level && isGameLoaded && healthUpdate && (
          <div className="fixed top-20 left-4 md:left-6 z-50 flex items-center transition-all duration-300">
            <div className="relative w-8 h-8 md:w-12 md:h-12 z-10">
              <img
                src={cdnFile("pixel-rescue/items/heart.webp")}
                alt="Health"
                className="w-full h-full object-contain"
                style={{
                  imageRendering: "pixelated",
                }}
              />
            </div>
            <div className="relative -ml-4 -top-1">
              <div
                className="relative bg-black p-[2px] md:p-1 rounded-sm"
                style={{
                  imageRendering: "pixelated",
                }}
              >
                <div className="relative w-24 md:w-36 h-3 md:h-4 bg-gray-800 rounded-sm overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full transition-all duration-300"
                    style={{
                      width: `${
                        (healthUpdate.health / healthUpdate.maxHealth) * 100
                      }%`,
                      background:
                        "linear-gradient(to bottom, #fb7185 0%, #f43f5e 50%, #fb7185 100%)",
                      imageRendering: "pixelated",
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {level && isGameLoaded && (
          <CupidHud level={level} ftue={ftue} onReplay={onReplay} />
        )}

        {level && (
          <PixelRescueGame
            key={level}
            level={level}
            starterShield={starterShield}
            recordLocalClears={recordLocalClears}
          />
        )}
      </div>
      {level && (
        // The gate and the close button sit in their own layer above the mobile controls (z-30,
        // outside #app): inside #app (z-20) the controls bar covered the gate's Back on short
        // landscape screens. The layer is pointer-events-none; only Back and the close button take
        // taps, so the controls under the card still work.
        <div className="pointer-events-none fixed inset-0 z-gate">
          <RunGate
            mode={GameType.PIXEL_RESCUE}
            level={level}
            copy={(input) => cupidGate(level, input)}
            onBack={() => setLevel(null)}
            // While the gate is open the scene keeps the cat clear of the card: the card sits at the
            // bottom (above the mobile controls on phones in portrait), or at the top on short
            // landscape screens, where the controls fill the bottom corners.
            className={[
              "[&[data-variant=full]>div:last-child]:items-end",
              "[&[data-variant=full]>div:last-child]:pb-[max(4rem,8vh)]",
              "[@media(max-width:1023px)_and_(min-height:501px)]:[&[data-variant=full]>div:last-child]:pb-[max(13rem,calc(env(safe-area-inset-bottom)+12rem))]",
              "[@media(max-height:500px)]:[&[data-variant=full]>div:last-child]:items-start",
              "[@media(max-height:500px)]:[&[data-variant=full]>div:last-child]:pt-[max(0.5rem,env(safe-area-inset-top))]",
              "[@media(max-height:500px)]:[&[data-variant=full]>div:last-child]:pb-2",
            ].join(" ")}
          />
          {/* Leave the level at any time (plan G10), above the gate; GameModal (z-100) covers it.
              A button, so a tap on it never begins the run (onboarding/run-gate
              `isControlTarget`). */}
          <div
            className="pointer-events-auto fixed z-10 h-[60px] w-[60px] lg:h-[80px] lg:w-[80px]"
            style={{
              top: "env(safe-area-inset-top)",
              right: "env(safe-area-inset-right)",
            }}
          >
            <CloseButton label="Leave level" onClick={() => setLevel(null)} />
          </div>
        </div>
      )}
    </>
  );
}

export default PixelRescue;
