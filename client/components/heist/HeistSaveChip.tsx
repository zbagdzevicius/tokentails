import clsx from "clsx";
import { useEffect } from "react";
import type { DuplicateOwner } from "./heistSaves";

export type SaveChipKind = "saving" | "saved" | "device" | "retry" | "signed-out" | "rejected" | "stale" | "duplicate";

export interface SaveChipState {
  kind: SaveChipKind;
  /** The save went to a registered account (not a guest). */
  account?: boolean;
  /** Stale runs purged. */
  count?: number;
  /** For `duplicate` (a 409): whose row the stored run is. */
  duplicate?: DuplicateOwner;
  /** When it was shown (restarts the timer for a repeat of the same message). */
  at?: number;
}

/** The chip's text for a state. */
export function saveChipText(state: SaveChipState): string {
  switch (state.kind) {
    case "saving":
      return "Saving your heist…";
    case "saved":
      return state.account ? "Heist saved to your account" : "Heist saved";
    case "device":
      return "Saved on this device. Sign in to keep it.";
    case "retry":
      return "Couldn't reach Token Tails. We'll try again.";
    case "signed-out":
      return "Sign in again to save this heist.";
    case "rejected":
      return "This heist couldn't be saved.";
    case "duplicate":
      // Another account's row: nothing was added here, so never "saved".
      return state.duplicate === "other"
        ? "This heist is already saved on another account."
        : state.account
          ? "Already saved to your account."
          : "Already saved.";
    case "stale": {
      const n = state.count ?? 1;
      return `${n === 1 ? "1 heist" : `${n} heists`} from an older version of the game couldn't be saved.`;
    }
  }
}

const HIDE_AFTER_MS: Record<SaveChipKind, number | null> = {
  saving: null,
  saved: 3_500,
  device: 6_000,
  retry: 5_000,
  "signed-out": 6_000,
  rejected: 5_000,
  stale: 8_000,
  duplicate: 5_000,
};

const TONE: Record<SaveChipKind, string> = {
  saving: "border-tt-gold-400/60",
  saved: "border-tt-gold-400",
  device: "border-tt-gold-400/60",
  retry: "border-tt-gold-400/60",
  "signed-out": "border-tt-gold-400/60",
  rejected: "border-tt-rust/80",
  stale: "border-tt-rust/80",
  duplicate: "border-tt-gold-400/60",
};

/**
 * The host's save status over the Heist (plan G2 layer 1, `role="status"`). The live region stays
 * mounted so screen readers hear every change; the visible pill shows only while there is a message.
 */
export const HeistSaveChip = ({
  state,
  onDismiss,
}: {
  state: SaveChipState | null;
  onDismiss: () => void;
}) => {
  const hideAfter = state ? HIDE_AFTER_MS[state.kind] : null;
  useEffect(() => {
    if (!state || hideAfter === null) return;
    const timer = setTimeout(onDismiss, hideAfter);
    return () => clearTimeout(timer);
  }, [state, hideAfter, onDismiss]);

  const text = state ? saveChipText(state) : "";
  return (
    <div
      // Phones: top centre, above the results banner. From md: top right, left of the Heist's
      // corner buttons, clear of the banner.
      className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-4 md:justify-end md:pr-24"
      style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <p
        role="status"
        aria-live="polite"
        data-testid="heist-save-chip"
        data-kind={state?.kind}
        className={clsx(
          "max-w-[min(92vw,26rem)] rounded-md border-2 bg-tt-night-950/90 px-3 py-1.5 text-center font-sans text-p6 leading-snug text-tt-cream shadow-[0_3px_0_rgb(var(--tt-night-950))] transition-opacity duration-200 motion-reduce:transition-none md:text-p5",
          state
            ? clsx("opacity-100", state.kind === "duplicate" && state.duplicate === "other" ? TONE.rejected : TONE[state.kind])
            : "border-transparent opacity-0"
        )}
      >
        {text}
      </p>
    </div>
  );
};

export default HeistSaveChip;
