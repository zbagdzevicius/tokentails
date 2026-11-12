import { useEffect } from "react";
import { acquireGameSuspension } from "@/lib/game/gameRegistry";

/**
 * Suspends every registered Phaser game while `active` is true (plan F3.5): keyboard off, key
 * capture released so form fields get every key, loop asleep, sounds paused. Reversed when
 * `active` turns false or the component unmounts. GameModal calls it for `suspendGame` modals.
 */
export function useSuspendGame(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquireGameSuspension();
  }, [active]);
}

export default useSuspendGame;
