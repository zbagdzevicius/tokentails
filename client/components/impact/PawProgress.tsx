import { EvidenceChip } from "@/components/claims/EvidenceChip";
import { isAppBuild } from "@/components/claims/build";
import { PixelIcon } from "@/components/shared/PixelIcon";
import clsx from "clsx";
import { localClock, PawView, timeLeft } from "./pawView";
import { useClock } from "./useClock";

interface PawProgressProps {
  view: PawView;
  /** `compact`: one line for the lobby strip; `full`: dots, line and countdown on their own rows. */
  variant?: "compact" | "full";
  /** Test seam for the countdown. */
  now?: Date | null;
  className?: string;
}

/**
 * Today's paw (plan G4 "IMPACT tab ... today's paw progress with a local-time countdown"):
 * "N more run(s) for today's paw", run dots, and how long today's runs still count, in the
 * viewer's local time. Paws are in-game (IN-GAME chip), never money.
 */
export const PawProgress = ({ view, variant = "full", now: nowProp, className }: PawProgressProps) => {
  const ticking = useClock();
  const now = nowProp === undefined ? ticking : nowProp;
  const left = now ? timeLeft(view.closesAt, now) : null;
  const clock = view.closesAt && left ? localClock(view.closesAt) : null;
  const countdown = left ? `${left} left today${clock ? ` (until ${clock})` : ""}` : null;

  return (
    <div
      data-testid="paw-progress"
      data-paw-state={view.state}
      className={clsx(
        "flex min-w-0 items-center gap-2 font-secondary text-tt-cream",
        variant === "full" ? "flex-col text-center" : "flex-row flex-wrap",
        className
      )}
    >
      {view.runs && (
        <span
          className="flex items-center gap-1"
          role="img"
          aria-label={`${view.runs.done} of ${view.runs.needed} runs today`}
        >
          {Array.from({ length: view.runs.needed }, (_, i) => (
            <span
              key={i}
              className={clsx(
                "inline-flex h-5 w-5 items-center justify-center rounded-sm border-2",
                i < view.runs!.done
                  ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink"
                  : "border-tt-cream/50 bg-tt-night-900/70 text-transparent"
              )}
            >
              <PixelIcon name="check" size={12} />
            </span>
          ))}
        </span>
      )}
      <span className={clsx("leading-tight", variant === "full" ? "text-p4" : "text-p5")} data-testid="paw-text">
        {view.text}
      </span>
      {countdown && (
        <span className="whitespace-nowrap text-p6 text-tt-muted" data-testid="paw-countdown">
          {countdown}
        </span>
      )}
      {variant === "full" && <EvidenceChip kind="in-game" isApp={isAppBuild()} />}
    </div>
  );
};

export default PawProgress;
