import { LAYERS } from "@/design/tokens";
import { useEffect, useState, type ReactNode } from "react";
import { CrashPanel } from "./CrashPanel";
import { FALLBACK_COPY } from "./copy";
import { CrashProbe, markCrashRecovered } from "./crash-probe";
import { ErrorBoundary } from "./ErrorBoundary";
import { SCENE_STALL_EVENT } from "./events";

/**
 * Above the canvas and the run gate, below lobby modals. Not on the F3 scale
 * yet (a `scene-fallback` token is requested in alignment-log/1e.md), so it
 * sits between `gate` and `modal`.
 */
export const Z_SCENE_FALLBACK = (LAYERS.gate + LAYERS.modal) / 2;

interface SceneBoundaryProps {
  /** The mode, e.g. the `GameType` value. */
  name: string;
  /** Leaves the mode; the fallback's BACK TO MENU. */
  onBackToMenu: () => void;
  children?: ReactNode;
}

class SceneStallError extends Error {
  readonly alreadyReported = true;
  constructor() {
    super("Scene stopped rendering");
    this.name = "SceneStallError";
  }
}

/**
 * Wraps one Phaser mount (F9, G13). A render or effect crash, or a stall
 * reported by the Phaser crash guard, shows the scene fallback. TRY AGAIN
 * remounts the mode through a fresh key, which tears the old Phaser game
 * down and boots a new one. BACK TO MENU leaves the mode.
 */
export const SceneBoundary = ({ name, onBackToMenu, children }: SceneBoundaryProps) => {
  const [attempt, setAttempt] = useState(0);

  return (
    <ErrorBoundary
      name={name}
      level="scene"
      resetKey={name}
      onReset={() => markCrashRecovered("scene")}
      fallback={({ reset }) => (
        <CrashPanel
          variant="screen"
          zIndex={Z_SCENE_FALLBACK}
          modal={false}
          testId="scene-fallback"
          body={FALLBACK_COPY.scene}
          actions={[
            {
              label: FALLBACK_COPY.tryAgain,
              primary: true,
              testId: "scene-fallback-retry",
              onClick: () => {
                setAttempt((n) => n + 1);
                reset();
              },
            },
            {
              label: FALLBACK_COPY.backToMenu,
              testId: "scene-fallback-menu",
              onClick: () => {
                reset();
                onBackToMenu();
              },
            },
          ]}
        />
      )}
    >
      <CrashProbe target="scene" />
      <StallTrap />
      <SceneAttempt key={attempt}>{children}</SceneAttempt>
    </ErrorBoundary>
  );
};

const SceneAttempt = ({ children }: { children?: ReactNode }) => <>{children}</>;

/**
 * Turns a stall event from the crash guard into a render error, so the
 * boundary above shows the fallback. The guard has already reported it.
 */
const StallTrap = () => {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const onStall = () => setStalled(true);
    window.addEventListener(SCENE_STALL_EVENT, onStall);
    return () => window.removeEventListener(SCENE_STALL_EVENT, onStall);
  }, []);
  if (stalled) throw new SceneStallError();
  return null;
};

export default SceneBoundary;
