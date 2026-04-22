import React from "react";

const OPENING_BACKGROUND = "/cards/backgrounds/opening-background.webp";
const WHITE_SPARKLE = "/cards/backgrounds/white-opening-sparkle.webp";
const GOLDEN_SPARKLE = "/cards/backgrounds/golden-opening-sparkle.webp";
const OPENING_PAW = "/cards/backgrounds/opening-paw.webp";

type OpeningAnimationProps = {
  isOpening: boolean;
};

export const OpeningAnimation: React.FC<OpeningAnimationProps> = ({
  isOpening,
}) => {
  const fixedFullscreenClass = "fixed inset-0 pointer-events-none";
  const openingSparkleBaseClass =
    "absolute w-[110vmax] h-[110vmax] pointer-events-none bg-contain bg-center bg-no-repeat [animation-fill-mode:forwards]";

  return (
    <>
      {/* Opening Background Overlay */}
      <div
        className={`${fixedFullscreenClass} z-[100] bg-cover bg-center overflow-hidden transition-opacity duration-500 ${
          isOpening ? "opacity-100" : "opacity-0"
        }`}
        style={{ backgroundImage: `url(${OPENING_BACKGROUND})` }}
      />

      {/* Opening Sparkles Container */}
      <div
        className={`${fixedFullscreenClass} z-[100] overflow-hidden flex items-center justify-center transition-opacity duration-500 ${
          isOpening ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`${openingSparkleBaseClass} ${
            isOpening ? "opacity-50 animate-spin-slow-reverse" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${GOLDEN_SPARKLE})` }}
        />
        <div
          className={`${openingSparkleBaseClass} ${
            isOpening ? "opacity-50 animate-spin-slow" : "opacity-0"
          }`}
          style={{ backgroundImage: `url(${WHITE_SPARKLE})` }}
        />
      </div>

      {/* Center Paw */}
      {isOpening && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-[102]">
          <div className="w-[90vw] max-w-[400px] aspect-[17/23]">
            <div
              className="w-full h-full bg-contain bg-center bg-no-repeat animate-paw-pulse"
              style={{ backgroundImage: `url(${OPENING_PAW})` }}
            />
          </div>
        </div>
      )}
    </>
  );
};
