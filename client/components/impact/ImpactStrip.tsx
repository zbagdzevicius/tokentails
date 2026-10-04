import type { PublicImpact } from "@/api/impact-api";
import { Claim } from "@/components/claims/Claim";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { publicFact } from "@/components/claims/facts";
import { PixelIcon } from "@/components/shared/PixelIcon";
import clsx from "clsx";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
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
  /** Fill the parent's width instead of the default `min(92vw, 54rem)`. */
  fill?: boolean;
  /** Narrow strips: the figures move to a second row under the paw and the buttons. */
  stacked?: boolean;
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
  fill = false,
  stacked = false,
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

  const actions = (
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
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 px-1 font-primary text-p6 uppercase text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400"
        >
          Proof <PixelIcon name="external-link" size={12} />
        </button>
      ) : (
        <Link
          href="/impact"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-1 font-primary text-p6 uppercase text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400"
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
        title={paused ? "Play the lobby animation" : "Pause the lobby animation"}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 border-tt-gold-500/60 bg-tt-night-900/60 text-tt-gold-400 hover:border-tt-gold-500 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400"
      >
        {/* Pixel pause bars / play triangle, drawn on a 7 px grid. */}
        <svg aria-hidden="true" viewBox="0 0 7 7" width="16" height="16" shapeRendering="crispEdges" fill="currentColor">
          {paused ? (
            <path d="M1 0h1v7H1zM2 1h1v5H2zM3 2h1v3H3zM4 3h1v1H4z" />
          ) : (
            <path d="M1 0h2v7H1zM4 0h2v7H4z" />
          )}
        </svg>
      </button>
    </div>
  );

  return (
    <section
      data-testid="impact-strip"
      data-stacked={stacked || undefined}
      aria-label="Rescue impact"
      aria-live="off"
      className={clsx(
        "pointer-events-auto flex items-center rounded-xl border-2 border-tt-gold-500/60 bg-tt-night-800/90 px-4 py-2 text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_24px_rgb(var(--tt-gold-400)/0.12)] backdrop-blur-sm lowfx:backdrop-blur-none",
        fill ? "w-full" : "w-[min(92vw,54rem)]",
        stacked ? "flex-wrap gap-x-4 gap-y-2" : "gap-4",
        // The tier chips grow with the lobby's root size, like the rest of the strip.
        "[&_[data-chip]]:text-[length:max(12px,0.75rem)]",
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
        className={stacked ? "min-w-0 flex-1" : "w-[15rem] shrink-0"}
      />
      {/* Narrow strips: today's paw and the buttons on the first row, the figures across the
          whole second row. */}
      {stacked && actions}
      <span
        aria-hidden="true"
        className={stacked ? "h-px basis-full bg-tt-gold-500/30" : "h-8 w-px shrink-0 bg-tt-gold-500/40"}
      />
      {/* Two lines: the direct donations (their date and tier chip never wrap apart), then the
          treat rail. On narrow strips the rail line ends in an ellipsis instead of wrapping. */}
      <div
        data-testid="impact-strip-text"
        className={clsx("min-w-0 font-secondary text-p5 leading-snug", stacked ? "basis-full" : "flex-1")}
      >
        {given && (
          <div>
            {/* claim: F-026 (its registry `short` wording; the drawer shows the full words).
                Its hit area reaches 44 px without moving the lines. */}
            <Claim
              id={GIVEN_DIRECTLY_ID}
              text={given}
              isApp={isApp}
              variant="inline"
              className="-my-[11px] py-[11px] text-left"
            />
          </div>
        )}
        <div
          data-testid="impact-strip-rail"
          className={stacked ? "truncate" : "[text-wrap:balance]"}
          title={stacked && figures.length === 0 ? "No treat-rail payouts yet. The first goes out when the rail opens." : undefined}
        >
          {given && (
            // Separates the direct donations from the rail figures, as /impact does (review 26 #3).
            <span
              data-testid="impact-strip-rail-label"
              className="whitespace-nowrap font-primary text-p6 uppercase tracking-wide text-tt-muted"
            >
              On the treat rail:
            </span>
          )}
          {given && "\u00a0"}
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
                className="mr-3 text-left"
              />
            ))
          ) : (
            // claim: L-treats (empty state: nothing is sent yet, so the line is future tense)
            <span data-testid="impact-strip-empty">
              No treat-rail payouts yet. The first goes out when the rail opens.
            </span>
          )}
        </div>
      </div>
      {!stacked && actions}
    </section>
  );
};

interface ImpactChipProps {
  paw: PawView;
  onOpenImpact: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The impact strip in one tap-sized line, for screens with no room for the strip (phones, short
 * landscape): MY IMPACT with today's paw (the run checklist and its line) and a chevron; a tap opens
 * the IMPACT tab, where the figures show with their dates and tier chips. It quotes no money figure
 * itself, because a figure always travels with its label and date (docs/CLAIMS.md R12).
 */
export const ImpactChip = ({ paw, onOpenImpact, className, style }: ImpactChipProps) => (
  <button
    type="button"
    data-testid="impact-chip"
    onClick={onOpenImpact}
    aria-label={`My impact. ${paw.text}`}
    style={style}
    className={clsx(
      "pointer-events-auto flex items-center gap-3 rounded-xl border-2 border-tt-gold-500/60 bg-tt-night-800/90 px-3 py-0.5 text-left text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950)),0_0_24px_rgb(var(--tt-gold-400)/0.12)] backdrop-blur-sm transition lowfx:backdrop-blur-none hover:border-tt-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400",
      className
    )}
  >
    <span aria-hidden="true" className="shrink-0 text-tt-pink">
      <PixelIcon name="heart" size={20} />
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-px">
      <span className="font-primary text-p5 uppercase leading-none tracking-wide text-tt-gold-400">My impact</span>
      <span data-testid="impact-chip-paw" className="line-clamp-2 font-secondary text-[length:max(12px,0.75rem)] leading-tight">
        {paw.text}
      </span>
    </span>
    {paw.runs && (
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
        {Array.from({ length: paw.runs.needed }, (_, i) => (
          <span
            key={i}
            className={clsx(
              "inline-flex h-4 w-4 items-center justify-center rounded-sm border-2",
              i < paw.runs!.done
                ? "border-tt-gold-400 bg-tt-gold-400 text-tt-gold-ink"
                : "border-tt-cream/50 bg-tt-night-900/70 text-transparent"
            )}
          >
            <PixelIcon name="check" size={10} />
          </span>
        ))}
      </span>
    )}
    <span aria-hidden="true" className="shrink-0 text-tt-gold-400">
      <PixelIcon name="chevron-right" size={16} />
    </span>
  </button>
);

export default ImpactStrip;
