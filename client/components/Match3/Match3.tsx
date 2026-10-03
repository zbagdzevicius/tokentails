import { useEffect, useState, type CSSProperties } from "react";
import { CloseButton } from "@/components/shared/CloseButton";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import dynamic from "next/dynamic";
import { Match3Levels } from "./Match3Levels";
import { getMatch3LevelIndex, isMatch3LevelId, MATCH3_ARENA_BG } from "./match3.config";
import { isMatch3LevelCleared } from "./match3Rules";
import {
  MATCH3_GAME_ID,
  TT_SCENE_READY,
  type TTSceneReadyDetail,
} from "./sceneSignals";
import { SceneAnnouncer } from "./SceneAnnouncer";

const Match3Game = dynamic(() => import("./config"), { ssr: false });

/**
 * Room the Paw Match header leaves free on its right for the X (plan G14 "Close and modal"): an
 * 8 px viewport inset, the 44 px button and a 4 px gap. The X is fixed to the viewport's top
 * right (CloseButton `viewport`, safe-area aware), so on narrow screens the header must not draw
 * under it.
 */
export const MATCH3_HEADER_RESERVE_PX = 56;

/**
 * The contract with the scene (task 5c): this custom property is set on the play wrapper and
 * inherits down to the canvas, so `Match3Scene` reads it with
 * `parseFloat(getComputedStyle(this.game.canvas).getPropertyValue(MATCH3_HEADER_RESERVE_VAR))`
 * and keeps its header plate and cards out of that many CSS px on the right while the layout is
 * narrow. It already includes the safe-area inset on the right and the 20 px the X grows at `lg`
 * (76 px there), so the scene adds nothing.
 */
export const MATCH3_HEADER_RESERVE_VAR = "--tt-header-reserve-right";

/**
 * The safe-area insets as custom properties on the play wrapper, so the scene can read them from
 * the canvas in px (it lays the HUD out inside them and keeps the tutorial plate above the bottom
 * one, plan G12/G14). Names match `MATCH3_SAFE_AREA_PROPERTIES` in the scene.
 */
export const MATCH3_SAFE_AREA_VARS = {
  top: "--tt-safe-top",
  right: "--tt-safe-right",
  bottom: "--tt-safe-bottom",
  left: "--tt-safe-left",
} as const;

/**
 * Registers the reserve and the inset properties as typed `<length>`s, so their computed values
 * are resolved px ("103px") instead of the raw `calc(... env(...))` tokens an unregistered custom
 * property keeps. Runs once in the browser; a second registration (Fast Refresh) throws and is
 * ignored.
 */
export function registerHeaderReserveProperty(): void {
  if (typeof window === "undefined" || typeof CSS === "undefined" || !CSS.registerProperty) return;
  for (const name of [MATCH3_HEADER_RESERVE_VAR, ...Object.values(MATCH3_SAFE_AREA_VARS)]) {
    try {
      CSS.registerProperty({ name, syntax: "<length>", inherits: true, initialValue: "0px" });
    } catch {
      // Already registered.
    }
  }
}

/** The canvas fades in on `tt:scene-ready`; this is the fallback if the signal never comes. */
export const SCENE_READY_FALLBACK_MS = 3000;

registerHeaderReserveProperty();

interface Match3Props {
  /** CSS px the header reserves on its right for the X. Default MATCH3_HEADER_RESERVE_PX. */
  headerReservePx?: number;
}

/**
 * True once the scene says its first frame is laid out (or after the fallback delay). A new
 * `runKey` (another level, a remount, leaving to the level list) starts hidden again; the reset
 * happens during render, React's pattern for state derived from a changed prop.
 */
function useSceneReady(game: string, runKey: string | null) {
  const [state, setState] = useState<{ key: string | null; ready: boolean }>({ key: runKey, ready: false });
  if (state.key !== runKey) setState({ key: runKey, ready: false });
  useEffect(() => {
    if (!runKey) return;
    const markReady = () => setState((prev) => (prev.key === runKey ? { key: runKey, ready: true } : prev));
    const onReady = (event: Event) => {
      if ((event as CustomEvent<TTSceneReadyDetail>).detail?.game === game) markReady();
    };
    window.addEventListener(TT_SCENE_READY, onReady);
    const fallback = window.setTimeout(markReady, SCENE_READY_FALLBACK_MS);
    return () => {
      window.removeEventListener(TT_SCENE_READY, onReady);
      window.clearTimeout(fallback);
    };
  }, [game, runKey]);
  return state.key === runKey && state.ready;
}

/** `isRestart` from GameContext (PLAY AGAIN on the same level), where the context provides it. */
function useIsRestart(): boolean {
  const game = useGame() as ReturnType<typeof useGame> & { isRestart?: unknown };
  return game.isRestart === true;
}

/** The player's best score on `level` (0 when none or unknown); keys the game so a new best remounts it. */
function bestScoreForLevelOf(profile: { match3Score?: unknown } | null | undefined, level: string | null): number {
  if (!level || !isMatch3LevelId(level)) return 0;
  const levelIndex = getMatch3LevelIndex(level);
  if (levelIndex < 0) return 0;
  const rawScores = Array.isArray(profile?.match3Score) ? profile.match3Score : [];
  const numeric = Number(rawScores[levelIndex] ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function Match3({ headerReservePx = MATCH3_HEADER_RESERVE_PX }: Match3Props = {}) {
  const { level, setLevel } = useGame();
  const isRestart = useIsRestart();
  const { profile } = useProfile();
  const levelCleared = !!level && isMatch3LevelCleared(profile, level);
  const bestScoreForLevel = bestScoreForLevelOf(profile, level);
  const runKey = level && isMatch3LevelId(level) ? `${level}-${bestScoreForLevel}` : null;
  const sceneReady = useSceneReady(MATCH3_GAME_ID, runKey);

  useEffect(() => {
    if (level && !isMatch3LevelId(level)) {
      setLevel(null);
    }
  }, [level, setLevel]);

  return (
    <div
      id="app"
      className="relative z-20 max-h-screen overflow-y-auto"
      style={{
        backgroundImage: `url(${MATCH3_ARENA_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {!level && <Match3Levels setSelectedLevel={setLevel} />}
      {level && isMatch3LevelId(level) && (
        <div
          // The X grows from 44 to 64 px at `lg`; `--tt-close-grow` adds those 20 px to the reserve.
          className="relative h-screen max-h-screen w-full overflow-hidden lg:[--tt-close-grow:20px]"
          data-header-reserve-right={headerReservePx}
          style={
            {
              [MATCH3_HEADER_RESERVE_VAR]: `calc(${headerReservePx}px + var(--tt-close-grow, 0px) + env(safe-area-inset-right, 0px))`,
              [MATCH3_SAFE_AREA_VARS.top]: "env(safe-area-inset-top, 0px)",
              [MATCH3_SAFE_AREA_VARS.right]: "env(safe-area-inset-right, 0px)",
              [MATCH3_SAFE_AREA_VARS.bottom]: "env(safe-area-inset-bottom, 0px)",
              [MATCH3_SAFE_AREA_VARS.left]: "env(safe-area-inset-left, 0px)",
            } as CSSProperties
          }
        >
          <div
            className="h-full w-full transition-opacity duration-100 ease-out motion-reduce:transition-none"
            style={{ opacity: sceneReady ? 1 : 0 }}
            data-scene-ready={sceneReady ? "true" : "false"}
          >
            <Match3Game
              key={runKey ?? level}
              level={level}
              bestScore={bestScoreForLevel}
              isRestart={isRestart}
              levelCleared={levelCleared}
            />
          </div>
          <SceneAnnouncer game={MATCH3_GAME_ID} testId="match3-announcer" />
          <CloseButton
            placement="viewport"
            label="Back to levels"
            onClick={() => setLevel(null)}
            className="drop-shadow-[0_4px_10px_rgb(var(--tt-night-950)/0.6)]"
          />
        </div>
      )}
    </div>
  );
}

export default Match3;
