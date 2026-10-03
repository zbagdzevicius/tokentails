import { Codex } from "@/components/codex/Codex";
import type { SceneState } from "@/components/codex/explainer";
import { GameModal } from "@/components/ui/GameModal";
import { useGame } from "@/context/GameContext";

/**
 * The scene behind PROGRESS, for the Tails explainer (it opens only on a menu or a game-over
 * screen). Outside a GameProvider (tests, standalone pages) there is no scene: null.
 */
function useSceneState(): SceneState | null {
  try {
    // useGame calls useContext unconditionally and throws only after it, so hook order is stable.
    const { gameType, isStarted, gameStop } = useGame();
    return { gameType, isStarted, gameStop };
  } catch {
    return null;
  }
}

export const CodexModalContent = () => {
  const scene = useSceneState();
  return (
    <div className="pt-1 md:px-2 lg:px-4 text-tt-cream flex flex-col gap-3 animate-appear font-primary">
      <Codex scene={scene} />
    </div>
  );
};

/** PROGRESS (the button keeps that label, decision #42); IMPACT is its default tab. */
export const CodexModal = ({ close }: { close: () => void }) => {
  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="PROGRESS"
      name="codex"
      size="xl"
      className="md:!max-w-[min(96vw,1460px)]"
      bodyClassName="overflow-x-hidden"
    >
      <CodexModalContent />
    </GameModal>
  );
};
