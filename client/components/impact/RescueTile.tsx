import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import { useEffect, useState } from "react";

/*
 * The lobby RESCUE tile (plan G4 "Client", 2.13 row 29). Its badge shows the player's lifetime
 * paws, or NEW until the player has opened IMPACT once. The tile opens PROGRESS on the IMPACT tab;
 * its second action, MEET SHELTER CATS, opens the Shelter scene in one tap (a small button under
 * the tile on phones, its own tile from md up).
 */

export const RESCUE_SEEN_KEY = "tt.rescue.seen";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(RESCUE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markRescueSeen(): void {
  try {
    window.localStorage.setItem(RESCUE_SEEN_KEY, "1");
  } catch {
    // Private mode or blocked storage: the NEW badge just stays.
  }
}

/** The badge words: the paw count, NEW for a player who never opened IMPACT, or nothing. */
export function rescueBadge(lifetimePaws: number, seen: boolean): string | null {
  if (lifetimePaws > 0) return lifetimePaws > 99 ? "99+" : String(lifetimePaws);
  return seen ? null : "NEW";
}

/** Tile frame shared with the lobby HOME tile: 80 px square, rounded, 3 px border. */
export const LOBBY_TILE =
  "relative flex h-20 w-20 min-w-20 shrink-0 flex-col items-center justify-center overflow-visible rounded-xl border-[3px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400";

interface RescueTileProps {
  lifetimePaws: number;
  onOpen: () => void;
  /** The lobby's motion pause (the impact strip's pause control stops this heart too). */
  paused?: boolean;
  className?: string;
}

export const RescueTile = ({ lifetimePaws, onOpen, paused = false, className }: RescueTileProps) => {
  // Read after mount: the server and the hydrating render show no NEW, then the stored value.
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    // Storage is only readable after mount (hydration-safe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(readSeen());
  }, []);
  const badge = rescueBadge(lifetimePaws, seen);
  const label = [
    "Rescue: your impact",
    lifetimePaws > 0 ? `${lifetimePaws} paw${lifetimePaws === 1 ? "" : "s"} earned` : badge === "NEW" ? "new" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      data-testid="rescue-tile"
      aria-label={label}
      onClick={() => {
        markRescueSeen();
        setSeen(true);
        onOpen();
      }}
      className={clsx(
        LOBBY_TILE,
        "rotate-6 border-tt-gold-500 bg-gradient-to-b from-tt-night-600 to-tt-night-900 shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_18px_rgb(var(--tt-gold-400)/0.18)] hover:rotate-0 hover:brightness-110",
        className
      )}
    >
      <img
        src={cdnFile("logo/heart.webp")}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-testid="rescue-heart"
        data-paused={paused || undefined}
        className={clsx("h-9 w-9 pixelated", !paused && "motion-safe:animate-pulse")}
      />
      <span className="mt-0.5 font-primary text-p5 uppercase leading-none tracking-wide text-tt-cream">
        RESCUE
      </span>
      {badge && (
        <span
          data-testid="rescue-badge"
          aria-hidden="true"
          className="absolute -right-2 -top-2 min-w-[1.5rem] rounded-full border-2 border-tt-gold-shadow bg-tt-gold-400 px-1.5 py-0.5 font-primary text-[11px] leading-none text-tt-gold-ink"
        >
          {badge}
        </span>
      )}
    </button>
  );
};

/** MEET SHELTER CATS as the md+ lobby tile, next to HOME. */
export const ShelterTile = ({ onOpen, className }: { onOpen: () => void; className?: string }) => (
  <button
    type="button"
    data-testid="shelter-tile"
    aria-label="Meet shelter cats"
    onClick={onOpen}
    className={clsx(
      "group relative flex flex-col items-center opacity-90 transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
      "rotate-3 hover:rotate-0",
      className
    )}
  >
    <img
      draggable={false}
      alt=""
      className="h-20 w-20 min-w-20 rounded-xl border-[3px] border-tt-gold-500 hover:brightness-110"
      src={cdnFile("game/select/shelter.webp")}
    />
    {/* The words the phone button carries, visible under the art (the art itself reads SHELTER). */}
    <span
      data-testid="shelter-tile-caption"
      aria-hidden="true"
      className="mt-1.5 rounded-md bg-tt-night-800/90 px-1.5 py-0.5 text-center font-primary text-[11px] uppercase leading-tight tracking-wide text-tt-cream shadow-[0_2px_0_rgb(var(--tt-night-950))]"
    >
      Meet shelter
      <br />
      cats
    </span>
  </button>
);

/** MEET SHELTER CATS as the small second action under the RESCUE tile on phones. */
export const MeetShelterCatsButton = ({ onOpen, className }: { onOpen: () => void; className?: string }) => (
  <button
    type="button"
    data-testid="meet-shelter-cats"
    onClick={onOpen}
    className={clsx(
      "min-h-[44px] rounded-lg border-2 border-tt-gold-500/80 bg-tt-night-800/90 px-2 py-1 font-primary text-[11px] uppercase leading-tight tracking-wide text-tt-cream shadow-[0_3px_0_rgb(var(--tt-night-950))] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
      className
    )}
  >
    Meet shelter
    <br />
    cats
  </button>
);

export default RescueTile;
