import { gameRun } from "@/analytics";
import { PawGuardHud, RunGate, RunHint } from "@/components/game/RunGate";
import { pawGuardAllowance, type PawGuards } from "@/components/Phaser/onboarding/checkpoint";
import { ftueStore } from "@/components/Phaser/onboarding/ftue-store";
import { purrsuitGate } from "@/components/Phaser/onboarding/hints";
import { clearedFlags, isInfiniteLevel, levelIndex, MODE_LEVELS } from "@/components/Phaser/onboarding/progress";
import { isExitKey } from "@/components/Phaser/onboarding/run-gate";
import { CloseButton } from "@/components/shared/CloseButton";
import { useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { GameType } from "@/models/game";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameEvents, type ILifeLostEvent, type IRunReadyEvent } from "../Phaser/events";
import { CatnipChaosLevels } from "./CatnipChaosLevels";
import { ProgressBar } from "./ProgressBar";
import type { PurrsuitRunOptions } from "./scenes/CatnipChaos";

const CatnipChaosGame = dynamic(() => import("./config"), { ssr: false });

const MODE = GameType.CATNIP_CHAOS;

function CatnipChaos() {
  const { cat } = useCat();
  const { profile } = useProfile();
  const { setLevel, level, progress } = useGame();

  const isGameLoaded = GameEvents.GAME_LOADED.use();

  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);

  // The scene asks at every (re)start, so a clear or an assist switched on in the DeathCard
  // applies to the next attempt without remounting the game.
  const latest = useRef({ profile, level });
  useEffect(() => {
    latest.current = { profile, level };
  });
  const getRunOptions = useCallback((): PurrsuitRunOptions => {
    const { profile: current, level: currentLevel } = latest.current;
    const flags = clearedFlags(current, MODE, ftueStore.localClears(MODE), ftueStore.pendingClears(MODE));
    const assists = ftueStore.assists();
    const index = levelIndex(MODE, currentLevel);
    return {
      guards: pawGuardAllowance({
        isFirstLevel: currentLevel === MODE_LEVELS[MODE].first,
        cleared: index >= 0 && !!flags[index],
        infinite: isInfiniteLevel(MODE, currentLevel),
        extraGuards: assists.extraGuards,
      }),
      teachEveryHazard: assists.slowMo,
    };
  }, []);

  // Paw Guards HUD: set by RUN_READY, counted down by LIFE_LOST.
  const [guards, setGuards] = useState<PawGuards | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const onReady = useCallback((event?: IRunReadyEvent) => {
    setRunning(false);
    setGuards(event && "guards" in event ? (event.guards as PawGuards) : undefined);
  }, []);
  const onLifeLost = useCallback((event?: ILifeLostEvent) => {
    if (event) setGuards(event.guardsLeft);
  }, []);
  const onBegin = useCallback(() => setRunning(true), []);
  const onStop = useCallback(() => setRunning(false), []);
  GameEvents.RUN_READY.use(onReady);
  GameEvents.LIFE_LOST.use(onLifeLost);
  GameEvents.RUN_BEGIN.use(onBegin);
  GameEvents.GAME_STOP.use(onStop);

  // Esc mid-run leaves the level like the close button (the gate handles its own Esc; an open
  // dialog, such as the DeathCard or an end-of-run panel, keeps Esc for itself).
  useEffect(() => {
    if (!level || !running) return;
    // (`running` is reset by RUN_READY of the next attempt and by GAME_STOP.)
    const onKey = (event: KeyboardEvent) => {
      if (!isExitKey(event) || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setLevel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [level, running, setLevel]);

  const leave = useCallback(() => {
    // Leaving from the gate, before the run began, is an abandoned first-run step.
    if (!running && level) gameRun.abandon({ mode: MODE, level }, "gate");
    setLevel(null);
  }, [setLevel, running, level]);

  return (
    <>
      <div id="app" className="relative z-20 overflow-y-auto max-h-screen">
        {!level && <CatnipChaosLevels setSelectedLevel={setLevel} />}
        {level && (
          <>
            <CatnipChaosGame level={level} getRunOptions={getRunOptions} />
            {level !== "01" && <ProgressBar progress={progress} />}
          </>
        )}
      </div>
      {level && (
        // The gate, hints, HUD and close button sit in their own layer above the mobile controls
        // (z-30, outside #app). The layer is pointer-events-none; only Back and the X take taps,
        // so a tap anywhere else reaches the scene (plan G10: the close stays clickable).
        <div className="pointer-events-none fixed inset-0 z-gate" data-testid="purrsuit-layer" data-run-surface="">
          <RunGate
            mode={MODE}
            level={level}
            copy={(input) => purrsuitGate(level, input)}
            guards={guards}
            endless={isInfiniteLevel(MODE, level)}
            onBack={leave}
          />
          <RunHint />
          <PawGuardHud
            guards={level ? guards : undefined}
            className="fixed left-[max(1rem,env(safe-area-inset-left))] top-[max(2.25rem,calc(env(safe-area-inset-top)+1.75rem))] lg:top-[3.25rem]"
          />
          <div
            className="pointer-events-auto fixed z-10 h-[60px] w-[60px] lg:h-[80px] lg:w-[80px]"
            style={{ top: "env(safe-area-inset-top)", right: "env(safe-area-inset-right)" }}
          >
            <CloseButton label="Leave level" onClick={leave} />
          </div>
        </div>
      )}
    </>
  );
}

export default CatnipChaos;
