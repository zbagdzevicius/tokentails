import React from "react";
import { TailsCard } from "./TailsCard";
import { ICat } from "@/models/cats";
import { cdnFile } from "@/constants/utils";

const REVEAL_CARD_BG = cdnFile("cards/backgrounds/opening-reveal-card-bg.webp");
const REVEAL_SPARKLE_1 = cdnFile(
  "cards/backgrounds/opening-reveal-sparkle1.webp"
);
const REVEAL_SPARKLE_2 = cdnFile(
  "cards/backgrounds/opening-reveal-sparkle2.webp"
);
const REVEAL_BG = cdnFile("cards/backgrounds/opening-reveal-bg.webp");

type RevealAnimationProps = {
  cat?: ICat;
  showRevealOverlay: boolean;
  /**
   * No spinning sparkles and no long fades (plan G3: reduced motion shows no spin). The sparkle
   * art stays, still, so the moment still reads as a reveal.
   */
  reducedMotion?: boolean;
  /**
   * Rendered in place of the TailsCard (Meet your cat reveals a pixel starter, not a shelter
   * card), on a night backdrop with gold light and no card frame. Only the children take pointer
   * events; the root and every light layer let them through.
   */
  children?: React.ReactNode;
  /** Passed through to the root, for tests. */
  testId?: string;
};

/**
 * The full-screen reveal shared by card packs and Meet your cat, on the `z-reveal` layer (plan
 * F3.2: above the intro and the sheets, below celebrations and toasts).
 */
export const RevealAnimation: React.FC<RevealAnimationProps> = ({
  cat,
  showRevealOverlay,
  reducedMotion = false,
  children,
  testId,
}) => {
  const opacityTransitionClass = reducedMotion
    ? "transition-opacity duration-200 ease-out"
    : "transition-opacity duration-[1500ms] ease-out";
  const sparkleBaseClass =
    "absolute w-[130vmax] h-[130vmax] pointer-events-none bg-contain bg-center bg-no-repeat";
  const fixedFullscreenClass = "fixed inset-0 pointer-events-none";
  const spinClass = (spin: string) => (reducedMotion ? "" : spin);
  const shown = showRevealOverlay ? "opacity-100" : "opacity-0";
  // With children (Meet your cat), the root lets pointer events through to whatever sits beside it
  // in the caller's layer (its SKIP); only the children take them.
  const custom = children !== undefined && children !== null;

  if (custom) {
    // Night reveal (plan F3, review 4a #8): night-900 with a gold glow and gold rays instead of
    // the blue pack-opening art, and no card frame, so the caller's sprite sits at the centre.
    return (
      <div
        className="pointer-events-none fixed inset-0 z-reveal flex items-center justify-center bg-tt-night-900"
        data-testid={testId}
        data-reduced-motion={reducedMotion ? "true" : undefined}
      >
        <div
          aria-hidden="true"
          className={`${fixedFullscreenClass} z-[1]`}
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgb(var(--tt-gold-400) / 0.28), rgb(var(--tt-gold-500) / 0.1) 32%, transparent 62%)",
          }}
        />
        <div
          aria-hidden="true"
          className={`${fixedFullscreenClass} flex items-center justify-center overflow-hidden z-[2]`}
        >
          <div
            data-reveal-sparkle=""
            className={`${sparkleBaseClass} ${spinClass("animate-spin-reveal")} ${opacityTransitionClass} ${shown}`}
            style={{
              background:
                "repeating-conic-gradient(from 0deg at 50% 50%, rgb(var(--tt-gold-400) / 0.16) 0deg 6deg, transparent 6deg 24deg)",
              maskImage: "radial-gradient(closest-side, black 20%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(closest-side, black 20%, transparent 70%)",
            }}
          />
          <div
            data-reveal-sparkle=""
            className={`${sparkleBaseClass} ${spinClass("animate-spin-reveal-reverse")} ${opacityTransitionClass} ${shown}`}
            style={{
              background:
                "radial-gradient(circle at 30% 34%, rgb(var(--tt-gold-400) / 0.9) 0 2px, transparent 3px), radial-gradient(circle at 68% 30%, rgb(var(--tt-cream) / 0.8) 0 2px, transparent 3px), radial-gradient(circle at 62% 66%, rgb(var(--tt-gold-400) / 0.8) 0 2px, transparent 3px), radial-gradient(circle at 36% 70%, rgb(var(--tt-cream) / 0.7) 0 1.5px, transparent 2.5px)",
              backgroundSize: "28vmax 28vmax",
              backgroundRepeat: "repeat",
              maskImage: "radial-gradient(closest-side, black 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(closest-side, black 30%, transparent 75%)",
            }}
          />
        </div>
        <div className="pointer-events-auto relative z-[5] flex max-h-full w-full items-center justify-center">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-reveal flex items-center justify-center"
      data-testid={testId}
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      {/* Reveal Background */}
      <div
        className={`${fixedFullscreenClass} z-[2] bg-cover bg-center bg-no-repeat ${opacityTransitionClass} ${shown}`}
        style={{ backgroundImage: `url(${REVEAL_BG})` }}
      />

      {/* Reveal Sparkles */}
      <div
        className={`${fixedFullscreenClass} flex items-center justify-center overflow-hidden z-[3]`}
      >
        <div
          data-reveal-sparkle=""
          className={`${sparkleBaseClass} rotate-[30deg] ${spinClass("animate-spin-reveal")} ${opacityTransitionClass} ${shown}`}
          style={{ backgroundImage: `url(${REVEAL_SPARKLE_1})` }}
        />
        <div
          data-reveal-sparkle=""
          className={`${sparkleBaseClass} ${spinClass("animate-spin-reveal-reverse")} ${opacityTransitionClass} ${shown}`}
          style={{ backgroundImage: `url(${REVEAL_SPARKLE_2})` }}
        />
      </div>

      {/* TailsCard */}
      <div className="relative inline-block z-[1] md:scale-[0.65] lg:scale-100">
        <TailsCard cat={cat} />
      </div>

      {/* Reveal card overlay */}
      <div
        className={`${fixedFullscreenClass} flex items-center justify-center z-[4]`}
      >
        <div
          className={`pointer-events-none w-[90vw] max-h-[90vh] max-w-[400px] aspect-[17/23] bg-cover bg-center bg-no-repeat ${
            reducedMotion ? "scale-100" : "scale-[2]"
          } ${opacityTransitionClass} ${shown}`}
          style={{ backgroundImage: `url(${REVEAL_CARD_BG})` }}
        />
      </div>
    </div>
  );
};
