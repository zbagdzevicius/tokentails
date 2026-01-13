import React from "react";
import { TailsCard } from "./TailsCard";
import { ICat } from "@/models/cats";

const REVEAL_CARD_BG = "/cards/backgrounds/opening-reveal-card-bg.webp";
const REVEAL_SPARKLE_1 = "/cards/backgrounds/opening-reveal-sparkle1.webp";
const REVEAL_SPARKLE_2 = "/cards/backgrounds/opening-reveal-sparkle2.webp";
const REVEAL_BG = "/cards/backgrounds/opening-reveal-bg.webp";

type RevealAnimationProps = {
  cat?: ICat;
  showRevealOverlay: boolean;
};

export const RevealAnimation: React.FC<RevealAnimationProps> = ({
  cat,
  showRevealOverlay,
}) => {
  const opacityTransitionClass =
    "transition-opacity duration-[1500ms] ease-out";
  const sparkleBaseClass =
    "absolute w-[130vmax] h-[130vmax] pointer-events-none bg-contain bg-center bg-no-repeat";
  const fixedFullscreenClass = "fixed inset-0 pointer-events-none";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Reveal Background */}
      <div
        className={`${fixedFullscreenClass} z-[2] bg-cover bg-center bg-no-repeat ${opacityTransitionClass} ${
          showRevealOverlay ? "opacity-100" : "opacity-0"
        }`}
        style={{ backgroundImage: `url(${REVEAL_BG})` }}
      />

      {/* Reveal Sparkles */}
      <div
        className={`${fixedFullscreenClass} flex items-center justify-center overflow-hidden z-[3]`}
      >
        <div
          className={`${sparkleBaseClass} rotate-[30deg] animate-spin-reveal ${opacityTransitionClass} ${
            showRevealOverlay ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${REVEAL_SPARKLE_1})` }}
        />
        <div
          className={`${sparkleBaseClass} animate-spin-reveal-reverse ${opacityTransitionClass} ${
            showRevealOverlay ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${REVEAL_SPARKLE_2})` }}
        />
      </div>

      {/* TailsCard */}
      <div className="relative inline-block z-[1]">
        <TailsCard cat={cat} />
      </div>

      {/* Reveal card overlay */}
      <div
        className={`${fixedFullscreenClass} flex items-center justify-center z-[4]`}
      >
        <div
          className={`pointer-events-none w-[90vw] max-w-[400px] aspect-[17/23] bg-cover bg-center bg-no-repeat scale-[2] ${opacityTransitionClass} ${
            showRevealOverlay ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${REVEAL_CARD_BG})` }}
        />
      </div>
    </div>
  );
};
