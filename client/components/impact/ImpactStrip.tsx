import type { PublicImpact } from "@/api/impact-api";
import { Claim } from "@/components/claims/Claim";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { publicFact } from "@/components/claims/facts";
import { PixelIcon } from "@/components/shared/PixelIcon";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { GIVEN_DIRECTLY_ID } from "./GivenDirectly";
import { stripFigures } from "./live";
import { PawProgress } from "./PawProgress";
import type { PawView } from "./pawView";

interface ImpactStripProps {
  impact: PublicImpact | null;
  paw: PawView;
  onOpenImpact: () => void;
  isApp?: boolean;
  /** Controlled pause, shared with the lobby's other motion (the RESCUE heart). */
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  className?: string;
}

/**
 * The registry's short wording of F-026 ("$40K+ donated in crypto and goods") for the strip, or null when the
 * entry is not public or has no short wording. The drawer still shows the full words.
 */
export function givenDirectlyShort(): string | null {
  return publicFact(GIVEN_DIRECTLY_ID)?.short ?? null;
}

/**
 * The md+ lobby impact strip (plan G4 "Client"): today's paw, then what Token Tails has sent, each
 * figure a <Claim> with its tier chip. It is static: nothing rotates or announces itself
 * (`aria-live="off"`). The only motion is the hearts' glow (this strip's and the RESCUE tile's), and the pause control stops both
 * (WCAG 2.2.2); reduced motion never starts it.
 */
export const ImpactStrip = ({
  impact,
  paw,
  onOpenImpact,
  isApp = isAppBuild(),
  paused: pausedProp,
  onPausedChange,
  className,
}: ImpactStripProps) => {
  const [pausedLocal, setPausedLocal] = useState(false);
  const paused = pausedProp ?? pausedLocal;
  const setPaused = (next: boolean) => {
    setPausedLocal(next);
    onPausedChange?.(next);
  };
  const figures = stripFigures(impact, isApp);
  const given = givenDirectlyShort();

  return (
    <section
      data-testid="impact-strip"
      aria-label="Rescue impact"
      aria-live="off"
      className={clsx(
        "pointer-events-auto flex w-[min(92vw,54rem)] items-center gap-4 rounded-xl border-2 border-tt-gold-500/60 bg-tt-night-800/90 px-4 py-2 text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_24px_rgb(var(--tt-gold-400)/0.12)] backdrop-blur-sm lowfx:backdrop-blur-none",
        className
      )}
    >
      <span
        aria-hidden="true"
        data-testid="impact-strip-heart"
        data-paused={paused || undefined}
        className={clsx(
          "shrink-0 text-tt-pink",
          !paused && "motion-safe:animate-pulse"
        )}
      >
        <PixelIcon name="heart" size={22} />
      </span>
      <PawProgress
        view={paw}
        variant="compact"
        className="w-[15rem] shrink-0"
      />
      <span
        aria-hidden="true"
        className="h-8 w-px shrink-0 bg-tt-gold-500/40"
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 font-secondary text-p5">
        {given && (
          // claim: F-026 (its registry `short` wording; the drawer shows the full words)
          <Claim
            id={GIVEN_DIRECTLY_ID}
            text={given}
            isApp={isApp}
            variant="inline"
            className="text-left"
          />
        )}
        {given && (
          // Separates the direct donations from the rail figures, as /impact does (review 26 #3).
          <span
            data-testid="impact-strip-rail-label"
            className="font-primary text-p6 uppercase tracking-wide text-tt-muted"
          >
            On the treat rail:
          </span>
        )}
        {figures.length > 0 ? (
          figures.map((f) => (
            <Claim
              key={f.id}
              id={f.id}
              values={f.values}
              liveAsOf={f.asOf}
              tier={f.tier}
              isApp={isApp}
              variant="inline"
              className="text-left"
            />
          ))
        ) : (
          // claim: L-treats (empty state: nothing is sent yet, so the line is future tense)
          <span data-testid="impact-strip-empty">
            No treat-rail payouts yet. The first goes out when the rail opens.
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenImpact}
          className="min-h-[44px] rounded-lg border-2 border-tt-gold-500 bg-tt-gold-400 px-3 font-primary text-p6 uppercase text-tt-gold-ink shadow-[0_3px_0_rgb(var(--tt-gold-shadow))] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream"
        >
          My impact
        </button>
        {isApp ? (
          <button
            type="button"
            onClick={() => void openWebImpact()}
            className="inline-flex min-h-[44px] items-center gap-1 px-1 font-primary text-p6 uppercase text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400"
          >
            Proof <PixelIcon name="external-link" size={12} />
          </button>
        ) : (
          <Link
            href="/impact"
            className="inline-flex min-h-[44px] items-center px-1 font-primary text-p6 uppercase text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400"
          >
            Proof
          </Link>
        )}
        <button
          type="button"
          data-testid="impact-strip-pause"
          aria-pressed={paused}
          aria-label={
            paused ? "Play the lobby animation" : "Pause the lobby animation"
          }
          onClick={() => setPaused(!paused)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-tt-night-500 font-primary text-p6 text-tt-cream hover:border-tt-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
        >
          <span aria-hidden="true">{paused ? "▶" : "II"}</span>
        </button>
      </div>
    </section>
  );
};

export default ImpactStrip;
