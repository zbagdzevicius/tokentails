/**
 * Puts the embedded Heist under the game suspension that GameModal applies (plan F3.5).
 *
 * GameModal (and the AuthSheet, which is built on it) suspends every game in `lib/game/gameRegistry`
 * while it is open. The Heist is not a Phaser game, so this registers a small stand-in whose "loop"
 * is the bridge: sleeping it sends `pause` to the Heist (and makes the iframe inert), waking it sends
 * `resume`. The registry needs no change and every modal pauses the Heist the same way.
 *
 * The stand-in never emits `poststep`, so the Phaser crash guard (installed only by Phaser mounts)
 * never arms a watchdog on it.
 */
import { registerGame, type RegistrableGame } from "@/lib/game/gameRegistry";

export interface HeistSuspensionHandlers {
  onSuspend(): void;
  onResume(): void;
}

/** Registers the Heist; returns the function that unregisters it (resuming it if it was asleep). */
export function registerHeistSuspension(handlers: HeistSuspensionHandlers): () => void {
  let running = true;
  const noop = () => undefined;
  const standIn: RegistrableGame & { events: RegistrableGame["events"] & { on: () => void; off: () => void } } = {
    isBooted: true,
    isRunning: true,
    loop: {
      get running() {
        return running;
      },
      sleep() {
        if (!running) return;
        running = false;
        handlers.onSuspend();
      },
      wake() {
        if (running) return;
        running = true;
        handlers.onResume();
      },
    },
    events: { once: noop, on: noop, off: noop },
    destroy: noop,
  };
  const unregister = registerGame(standIn);
  return () => {
    unregister();
    if (!running) {
      running = true;
      handlers.onResume();
    }
  };
}
