import { AltarScene } from "./AltarScene";

/**
 * The altar on its own, held over the lobby while a pending session waits for its backend profile
 * (review 4a #1). The intro curtain lifts after 2.5 s at most, and on a slow sign-in the profile
 * can come later: without this the lobby would show first and the ceremony open over it.
 *
 * It matches Meet your cat's `loading` step (same stage, same anchor), so the hand-over to the
 * ceremony is seamless. If the profile then says `done`, Game.tsx drops it and the lobby shows.
 */
export const AltarHold = ({ reducedMotion }: { reducedMotion: boolean }) => (
  <div
    data-testid="meet-altar-hold"
    role="status"
    className="fixed inset-0 z-modal flex flex-col overflow-hidden bg-tt-night-900"
  >
    <span className="sr-only">Getting your cat ready</span>
    <div className="relative min-h-[72px] flex-1">
      <AltarScene anchorY={0.82} reducedMotion={reducedMotion} />
    </div>
  </div>
);
