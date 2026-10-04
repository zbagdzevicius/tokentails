import { Codex } from "@/components/codex/Codex";
import type { SceneState } from "@/components/codex/explainer";
import { GameModal } from "@/components/ui/GameModal";
import { useGame } from "@/context/GameContext";
import type { GameModal as LobbyModal } from "@/models/game";

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

/** Opens another lobby modal (the next step's PACKS, EVENTS or DAILY SPIN); none outside a GameProvider. */
function useOpenLobbyModal(): ((modal: LobbyModal) => void) | undefined {
  try {
    const { setOpenedModal } = useGame();
    return setOpenedModal;
  } catch {
    return undefined;
  }
}

export const CodexModalContent = () => {
  const scene = useSceneState();
  const openModal = useOpenLobbyModal();
  return (
    <div className="text-tt-cream animate-appear motion-reduce:animate-none">
      <Codex scene={scene} onOpenModal={openModal} />
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
      icon="chart"
      // The tab names say the same on a phone, where the header's height is better spent on content.
      description={<span className="max-sm:sr-only">Your impact, rewards and missions in one place.</span>}
      name="codex"
      size="xl"
      // One height for every tab, so switching tabs never makes the panel jump.
      className="h-[min(92dvh,900px)] md:!max-w-[min(96vw,1460px)] [&>div]:flex-1"
      bodyClassName="overflow-x-hidden"
    >
      <CodexModalContent />
    </GameModal>
  );
};
