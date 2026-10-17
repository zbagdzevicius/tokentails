import type { SaveNudgeTrigger } from "@/context/auth/saveNudge";
import { readLastMethod } from "@/context/auth/lastMethod";
import clsx from "clsx";
import { useSyncExternalStore } from "react";

/** Tailwind `md` (tailwind.config: 667px): below it the pill has room for one action only. */
export const PHONE_QUERY = "(max-width: 666px)";

const subscribePhone = (onChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
};
const isPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
const noSubscribe = () => () => {};
const hadAccountHere = () => !!readLastMethod();

interface IProps {
  /** Opens `requireAccount('save-progress')`. */
  onSave: () => void;
  /** Opens `requireAccount('returning')`: a player who had an account before signs back in. */
  onSignIn?: () => void;
  catName?: string;
  /** The starter's portrait, shown in the pill's badge. */
  catImg?: string;
  /** The anonymous sign-in failed: the pill offers sign-in instead of saving. */
  signedOut?: boolean;
  /** The one soft nudge of the session (decision #10), shown as a bubble under the pill. */
  nudge?: SaveNudgeTrigger | null;
  onDismissNudge?: () => void;
  className?: string;
}

const NUDGE_COPY: Record<SaveNudgeTrigger, string> = {
  "first-clear": "Nice run! Save your cat so this progress is never lost.",
  "first-codex-entry": "Your codex is growing. Save your cat to keep it on every device.",
  timer: "You've played a while. Save your cat to keep your runs and Tails.",
};

/**
 * The guest HUD pill (plan G1): "Guest · Save your cat". Sits on the HUD layer, opens the
 * AuthSheet on a deliberate tap, and carries the session's single soft save nudge.
 */
export const GuestPill = ({ onSave, onSignIn, catName, catImg, signedOut, nudge, onDismissNudge, className }: IProps) => {
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  // Read once per mount: the hint changes only when someone signs in, which unmounts the pill.
  const returningDevice = useSyncExternalStore(noSubscribe, hadAccountHere, () => false);
  // A second "Sign in" next to "Save your cat" (md and up). Phones have room for one action: a
  // device that signed in before gets "Sign in" (one tap back), any other "Save or sign in",
  // whose sheet has "Already have an account? Sign in".
  const showSignIn = !signedOut && !!onSignIn;
  const phoneSignIn = showSignIn && phone && returningDevice;
  const label = signedOut || phoneSignIn ? "Sign in" : showSignIn && phone ? "Save or sign in" : "Save your cat";
  const onMain = phoneSignIn ? onSignIn! : onSave;
  return (
    <div className={clsx("pointer-events-none flex flex-col items-center gap-2", className)} data-testid="guest-pill">
      <div className="flex items-center gap-2" data-pill-row>
      <button
        type="button"
        onClick={onMain}
        aria-label={signedOut ? "Not signed in. Sign in" : `Playing as a guest. ${label}`}
        data-testid="guest-pill-main"
        className={clsx(
          "pointer-events-auto relative flex min-h-[44px] items-center gap-2 rounded-full border-2 border-tt-gold-500 bg-tt-night-800/90 py-1 pl-2 pr-4",
          "shadow-[0_3px_0_rgb(var(--tt-night-950))] transition hover:border-tt-gold-400 hover:bg-tt-night-700",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
        )}
      >
        <span
          aria-hidden="true"
          className="grid h-[max(2rem,32px)] w-[max(2rem,32px)] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-tt-gold-400 bg-tt-night-600"
        >
          {catImg && !signedOut ? (
            <img src={catImg} alt="" draggable={false} className="h-full w-full scale-125 object-cover pixelated" />
          ) : (
            <span className="font-primary text-[15px] leading-none text-tt-gold-400">?</span>
          )}
        </span>
        <span className="flex whitespace-nowrap font-sans text-[length:max(14px,0.875rem)] font-extrabold leading-none text-tt-cream max-md:flex-col max-md:items-start max-md:gap-0.5">
          {/* Phones stack "Guest" over the action, so the pill stays as narrow as before. */}
          <span
            className="max-md:text-[12px] max-md:uppercase max-md:tracking-wider max-md:text-tt-lilac"
            data-testid="guest-pill-status"
          >
            {signedOut ? "Not signed in" : "Guest"}
          </span>
          <span aria-hidden="true" className="px-1.5 text-tt-muted max-md:hidden">
            ·
          </span>
          <span className="text-tt-gold-400">{label}</span>
        </span>
      </button>
      {showSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          aria-label="Already have an account? Sign in"
          data-testid="guest-pill-sign-in"
          className={clsx(
            "pointer-events-auto min-h-[44px] rounded-full border-2 border-tt-lilac/60 bg-tt-night-800/90 px-4 max-md:hidden",
            "font-sans text-[length:max(14px,0.875rem)] font-extrabold leading-none text-tt-cream shadow-[0_3px_0_rgb(var(--tt-night-950))]",
            "transition hover:border-tt-gold-400 hover:bg-tt-night-700",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
          )}
        >
          Sign in
        </button>
      )}
      </div>
      {nudge && !signedOut && (
        <div
          role="status"
          className="pointer-events-auto relative max-w-[280px] rounded-[6px] border-2 border-tt-gold-500 bg-tt-night-700 px-3 py-2 text-center shadow-[0_4px_0_rgb(var(--tt-night-950))]"
          data-testid="save-nudge"
        >
          <span
            aria-hidden="true"
            className="absolute -top-[7px] left-1/2 hidden h-3 w-3 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-tt-gold-500 bg-tt-night-700 md:block"
          />
          <p className="font-sans text-[14px] font-semibold leading-snug text-tt-cream">
            {catName ? NUDGE_COPY[nudge].replace("your cat", catName) : NUDGE_COPY[nudge]}
          </p>
          <div className="mt-1 flex justify-center gap-1">
            <button
              type="button"
              onClick={onSave}
              className="min-h-[44px] rounded-[4px] px-3 font-primary text-p5 uppercase text-tt-gold-400 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
            >
              Save now
            </button>
            <button
              type="button"
              onClick={onDismissNudge}
              className="min-h-[44px] rounded-[4px] px-3 font-sans text-[14px] text-tt-lilac underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuestPill;
