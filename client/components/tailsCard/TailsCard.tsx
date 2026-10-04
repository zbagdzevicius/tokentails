import { CatAbilityType, CatAbilityTypes, ICat } from "@/models/cats";
import React, { useCallback, useContext, useState } from "react";
import { InsideCardActionContext } from "./CardAction";
import { CardBack } from "./CardBack";
import { CardFront } from "./CardFront";
import { CardWrapper } from "./CardWrapper";
import { fakeCat } from "./data";

type Props = {
  cat?: ICat;
  className?: string;
  cardStyle?: React.CSSProperties;
  /**
   * The gold "flip" corner badge that tells players the card has another side. On by default;
   * always off inside a CardAction (that card opens something and keeps its own "open" badge).
   */
  flipHint?: boolean;
};

/**
 * Flip badge, sized with the card: an overlay the size of the card is a size container, so the
 * badge is 48 px on the 400 px card (12cqw) and never under 28 px (the CardAction "sm" badge) on a
 * small one. It hangs a quarter of its size off the top-right corner like the CardAction badge,
 * so it never covers the card's name.
 */
const FlipBadge = ({ onFlip, flipped, ping }: { onFlip: () => void; flipped: boolean; ping: boolean }) => (
  <div className="pointer-events-none absolute inset-0 z-20 [container-type:inline-size]">
    <button
      type="button"
      aria-label="Flip card"
      title="Flip card to see the other side"
      data-card-flip-badge=""
      onClick={(e) => {
        e.stopPropagation();
        onFlip();
      }}
      className="group/flip pointer-events-auto absolute right-0 top-0 flex h-[clamp(28px,12cqw,48px)] w-[clamp(28px,12cqw,48px)] translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-[#fde047] focus-visible:ring-offset-2 focus-visible:ring-offset-tt-night-900"
    >
      {ping && (
        <span
          aria-hidden="true"
          data-card-flip-ping=""
          className="absolute inset-0 rounded-full bg-[#fde047]/60 motion-safe:animate-ping [animation-duration:2.4s]"
        />
      )}
      <span
        aria-hidden="true"
        className="relative flex h-full w-full items-center justify-center rounded-full border-2 border-tt-gold-shadow/80 bg-gradient-to-b from-yellow-200 to-yellow-400 text-tt-gold-shadow shadow-[0_2px_0_rgba(113,63,18,0.9),0_0_12px_rgba(253,224,71,0.6)] transition-transform duration-300 motion-safe:group-hover/flip:scale-110"
      >
        {/* Flip icon: two curved arrows around a circle. It turns half a turn with each flip. */}
        <svg
          viewBox="0 0 24 24"
          className={`h-1/2 w-1/2 motion-safe:transition-transform motion-safe:duration-500 ${flipped ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 11a8 8 0 0 0-14.3-4.9" />
          <path d="M5 3v4h4" />
          <path d="M4 13a8 8 0 0 0 14.3 4.9" />
          <path d="M19 21v-4h-4" />
        </svg>
      </span>
    </button>
  </div>
);

export const TailsCard: React.FC<Props> = ({
  cat = fakeCat,
  className,
  cardStyle,
  flipHint = true,
}) => {
  const [flipped, setFlipped] = useState(true);
  // Ping until the first flip; the badge itself stays so the player can flip back.
  const [hasFlipped, setHasFlipped] = useState(false);
  const insideCardAction = useContext(InsideCardActionContext);
  const showFlipHint = flipHint && !insideCardAction;

  const blessing = cat.blessing;
  const normalizedCatType = CatAbilityTypes.includes(cat.type)
    ? cat.type
    : CatAbilityType.FAIRY;

  const handleFlip = useCallback(() => {
    setFlipped((prev) => !prev);
    setHasFlipped(true);
  }, []);

  return (
    <>
      <div
        onClick={handleFlip}
        data-flipped={flipped ? "back" : "front"}
        className={`animate-opacity cursor-pointer relative inline-block [perspective:1000px] ${className || ""}`}
        style={{ WebkitPerspective: "1000px" }}
      >
        <div
          className="relative touch-none max-sm:pointer-events-none select-none transition-transform [transition-duration:0.6s] [transform-style:preserve-3d]"
          style={{
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            WebkitTransformStyle: "preserve-3d",
          }}
        >
          <div
            className="[backface-visibility:hidden] [transform:translateZ(0)]"
            style={{
              WebkitBackfaceVisibility: "hidden",
              WebkitTransform: "translateZ(0)",
            }}
          >
            <CardWrapper
              catType={normalizedCatType}
              tier={cat.tier}
              style={cardStyle}
            >
              <CardFront cat={cat} blessing={blessing} />
            </CardWrapper>
          </div>

          <div
            className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(0)]"
            style={{
              WebkitBackfaceVisibility: "hidden",
              WebkitTransform: "rotateY(180deg) translateZ(0)",
            }}
          >
            <CardWrapper
              catType={normalizedCatType}
              tier={cat.tier}
              isBackSide={true}
              style={cardStyle}
            >
              <CardBack cat={cat} blessing={blessing} />
            </CardWrapper>
          </div>
        </div>
        {showFlipHint && <FlipBadge onFlip={handleFlip} flipped={flipped} ping={!hasFlipped} />}
      </div>
    </>
  );
};
