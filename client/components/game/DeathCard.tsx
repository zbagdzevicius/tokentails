import { CatnipIcon } from "@/components/shared/CatnipIcon";
import { ASSIST_COPY, deathTip, type DeathCause } from "@/components/Phaser/onboarding/hints";
import { PixelButton } from "@/components/shared/PixelButton";
import { PixelFrame } from "@/components/ui/PixelFrame";
import clsx from "clsx";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { PawGuardIcon, useInputKind } from "./RunGate";

/**
 * The card after a hard death (plan G10): no Paw Guard left, the clock ran out, or the endless run
 * ended. RETRY is focused and restarts the same level at once (GAME_RESTART, no reload, the
 * target is under 300 ms to the next gate); a contextual tip says what to try. After three hard
 * deaths on a level it suggests the "Extra guards" assist.
 *
 * It is not a GameModal on purpose: the run is over, so there is nothing to suspend, and opening
 * and closing a Radix dialog would cost the instant retry. It is still an `alertdialog` with its
 * own focus loop; Esc goes to the level map.
 */
const focusRetryIn = (container: HTMLElement | null) =>
  container?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });

export type DeathSaveState = "saving" | "saved" | "failed";

/** The line under the points for a new best: "saved" only after the save answered. */
export function newBestLine(saveState: DeathSaveState | undefined): string {
  if (saveState === "saved") return "New best, saved";
  if (saveState === "failed") return "New best, not saved";
  return "New best";
}

export interface DeathCardProps {
  mode: string;
  level: string | null;
  /** "Level 1-1", "Day 3". */
  levelName: string;
  outcome: "died" | "timeout";
  /** Points of this run (catnip or hearts), already clamped to the cap. */
  points: number;
  /** Best saved points on this level before the run. */
  best?: number;
  /** What ended the run, for the tip. */
  cause?: DeathCause;
  /** Label of the points ("catnip", "hearts"). */
  unit?: "catnip" | "hearts";
  onRetry: () => void;
  onLevels: () => void;
  /** Offer an assist (Purrsuit: after three hard deaths). */
  assist?: { name: keyof typeof ASSIST_COPY; on: boolean; onEnable: () => void } | null;
  /** This run beat the best (it is being saved). */
  newBest?: boolean;
  /** Where the new best's save is: "saved" only once `/live` answered (5a review #9). */
  saveState?: DeathSaveState;
  /** The endless run: its end is the normal finish, not a failure. */
  endless?: boolean;
}

export const DeathCard = ({
  mode,
  levelName,
  outcome,
  points,
  best,
  cause,
  unit = "catnip",
  onRetry,
  onLevels,
  assist,
  newBest,
  saveState,
  endless,
}: DeathCardProps) => {
  const input = useInputKind();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // RETRY takes focus so Enter or Space retries straight away.
    focusRetryIn(retryRef.current);
  }, []);
  const focusRetry = () => focusRetryIn(retryRef.current);
  // "Turn it on" goes away once clicked; focus moves to RETRY instead of dropping to the body.
  const enableAssist = () => {
    assist?.onEnable();
    focusRetry();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onLevels();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const title = outcome === "timeout" ? "Time's up" : endless ? "Run over" : "Ouch!";
  const tip = deathTip(mode, outcome === "timeout" ? "timeout" : cause, input);
  const assistCopy = assist ? ASSIST_COPY[assist.name] : null;

  return (
    <div
      className="fixed inset-0 z-gate flex items-center justify-center bg-tt-night-950/60 px-4 lowfx:bg-tt-night-950/80"
      data-testid="death-card"
      data-run-ignore=""
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="w-full max-w-[min(24rem,calc(100vw-2rem))]"
      >
        <PixelFrame
          className="w-full motion-safe:animate-[opacity_150ms_ease-out]"
          contentClassName="flex flex-col items-center gap-3 px-4 py-4 text-center"
          shadowClassName="drop-shadow-[0_10px_0_rgba(7,5,26,0.55)]"
        >
          <p className="font-secondary text-p5 uppercase tracking-wider text-tt-lilac">{levelName}</p>
          <h2 id={titleId} className="-mt-2 font-primary text-h6 leading-none text-tt-gold-400 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))]">
            {title}
          </h2>
          <div className="flex w-full items-center justify-center gap-3 rounded-md bg-tt-night-900/70 px-3 py-2 ring-1 ring-inset ring-tt-gold-500/30">
            {unit === "catnip" ? <CatnipIcon size={24} alt="" /> : <span aria-hidden="true">♥</span>}
            <p className="font-secondary text-p4 uppercase tracking-wide text-tt-cream">
              <strong className="font-primary font-normal text-tt-gold-400">{points}</strong> {unit}
              {typeof best === "number" && Math.max(best, points) > 0 && (
                <span className="ml-2 text-tt-muted">
                  · best <strong className="font-primary font-normal text-tt-cream">{Math.max(best, points)}</strong>
                </span>
              )}
            </p>
          </div>
          {newBest && (
            <p
              className={clsx(
                "-mt-1 font-secondary text-p5 uppercase tracking-wider",
                saveState === "failed" ? "text-tt-muted" : "text-tt-mint",
              )}
              data-testid="death-new-best"
              aria-live="polite"
            >
              {newBestLine(saveState)}
            </p>
          )}
          <p className="font-sans text-p5 font-bold leading-snug text-tt-cream" data-testid="death-tip">
            {tip}
          </p>
          {assist && assistCopy && (
            <div
              className={clsx(
                "flex w-full flex-col items-center gap-1 rounded-md px-3 py-2 ring-1 ring-inset",
                assist.on ? "bg-tt-mint/10 ring-tt-mint/50" : "bg-tt-pink/10 ring-tt-pink/50",
              )}
              data-testid="death-assist"
            >
              <p className="flex items-center gap-2 font-secondary text-p5 uppercase tracking-wider text-tt-pink">
                <PawGuardIcon size={16} /> {assistCopy.name}
              </p>
              <p className="font-sans text-p6 font-bold text-tt-cream">{assistCopy.line}</p>
              {assist.on ? (
                <p className="font-secondary text-p6 uppercase tracking-wider text-tt-mint">On for your next try</p>
              ) : (
                <button
                  type="button"
                  onClick={enableAssist}
                  className="min-h-[44px] px-3 font-secondary text-p5 uppercase tracking-wider text-tt-gold-400 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
                >
                  Turn it on
                </button>
              )}
            </div>
          )}
          <div ref={retryRef} className="mt-1 flex w-full flex-col items-center gap-1">
            <PixelButton text="RETRY" onClick={onRetry} id="death-card-retry" />
            <PixelButton text="LEVEL MAP" size="sm" onClick={onLevels} />
          </div>
        </PixelFrame>
      </div>
    </div>
  );
};
