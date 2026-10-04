import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import { useEffect, useState } from "react";

/*
 * The lobby RESCUE tile (plan G4 "Client", 2.13 row 29). Its badge shows the player's lifetime
 * paws, or NEW until the player has opened IMPACT once. The tile opens PROGRESS on the IMPACT tab;
 * its second action, MEET SHELTER CATS, opens the Shelter scene in one tap (its own tile).
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

/**
 * Tile frame shared by the lobby's four tiles (RESCUE, SHELTER, HOME, the daily spin): a square
 * `--lobby-tile` wide (the lobby layout sets it; 5rem by default), rounded, with a 3 px gold border,
 * the night drop shadow and a small lift on hover. No tilt: the tiles stand on the altar slab.
 * Every tile is a pastel card with a dark label on top and its icon under it, like the SHELTER and
 * MY HOME art: pink on the left (RESCUE, SHELTER), sky on the right (HOME, the daily spin).
 */
export const LOBBY_TILE_SIZE = "h-[var(--lobby-tile,5rem)] w-[var(--lobby-tile,5rem)] min-w-[var(--lobby-tile,5rem)]";
export const LOBBY_TILE =
  `relative flex ${LOBBY_TILE_SIZE} shrink-0 flex-col items-center overflow-visible rounded-xl border-[3px] border-tt-gold-500 shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_18px_rgb(var(--tt-gold-400)/0.18)] transition hover:-translate-y-0.5 hover:brightness-110 motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400`;

/** The pink card (the SHELTER art's sky): RESCUE. */
export const LOBBY_TILE_PINK = "bg-[linear-gradient(to_bottom,#fb84c1,#ffb8da_65%,#ffccfb)]";
/** The sky card (the MY HOME art's sky): the daily spin. */
export const LOBBY_TILE_SKY = "bg-[linear-gradient(to_bottom,#37dcff,#a5ddff_60%,#ffdafd)]";
/** Label, then icon, laid out like the art tiles. */
export const LOBBY_TILE_STACK =
  "justify-start gap-[calc(var(--lobby-tile,5rem)*0.07)] pt-[calc(var(--lobby-tile,5rem)*0.13)]";

/** The label inside a tile, at the top, in the art's dark ink: at least 12 px. */
export const LOBBY_TILE_LABEL =
  "font-primary text-[length:max(13px,0.85rem)] uppercase leading-none tracking-wide text-tt-night-950";

/** The small badge on a tile's corner (NEW, the paw count, READY). */
export const LOBBY_TILE_BADGE =
  "absolute -right-2.5 -top-3 min-w-[1.5rem] rounded-full border-2 border-tt-gold-shadow bg-tt-gold-400 px-1.5 py-0.5 font-primary text-[length:max(12px,0.75rem)] leading-none text-tt-gold-ink";

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
      className={clsx(LOBBY_TILE, LOBBY_TILE_PINK, LOBBY_TILE_STACK, className)}
    >
      <span className={LOBBY_TILE_LABEL}>RESCUE</span>
      {/* The heart in full red, never the pale art pink: it is a live button, not a greyed one. */}
      <img
        src={cdnFile("logo/heart.webp")}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-testid="rescue-heart"
        data-paused={paused || undefined}
        className={clsx(
          "h-[46%] w-[46%] pixelated brightness-[0.7] saturate-[8]",
          !paused && "motion-safe:animate-pulse",
        )}
      />
      {badge && (
        <span
          data-testid="rescue-badge"
          aria-hidden="true"
          className={LOBBY_TILE_BADGE}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

/**
 * MEET SHELTER CATS: the Shelter's art (it reads SHELTER) with MEET CATS on a band inside the
 * tile, so no tag hangs under it. The same tile on every screen; `testId` tells the phone and the
 * md+ placements apart for the e2e suite.
 */
export const ShelterTile = ({
  onOpen,
  className,
  testId = "shelter-tile",
}: {
  onOpen: () => void;
  className?: string;
  testId?: string;
}) => (
  <button
    type="button"
    data-testid={testId}
    aria-label="Meet shelter cats"
    onClick={onOpen}
    className={clsx(LOBBY_TILE, LOBBY_TILE_PINK, "overflow-hidden", className)}
  >
    {/* The art moves up a little so its heart clears the MEET CATS band. */}
    <img
      draggable={false}
      alt=""
      className="absolute inset-0 h-full w-full -translate-y-[10%] object-cover"
      src={cdnFile("game/select/shelter.webp")}
    />
    <span
      data-testid={testId === "shelter-tile" ? "shelter-tile-caption" : undefined}
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 bg-tt-night-800/90 py-0.5 text-center font-primary text-[length:max(12px,0.75rem)] uppercase leading-none tracking-wide text-tt-cream"
    >
      Meet cats
    </span>
  </button>
);

/** MEET SHELTER CATS on phones: the same tile, under its own test id. */
export const MeetShelterCatsButton = ({ onOpen, className }: { onOpen: () => void; className?: string }) => (
  <ShelterTile onOpen={onOpen} className={className} testId="meet-shelter-cats" />
);

export default RescueTile;
