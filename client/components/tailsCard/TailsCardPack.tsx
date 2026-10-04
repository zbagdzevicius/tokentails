import { ICat } from "@/models/cats";
import React, { useCallback, useEffect, useState } from "react";
import { CardPackImage } from "./CardPackImage";
import { OpeningAnimation } from "./OpeningAnimation";
import { RevealAnimation } from "./RevealAnimation";
import { VideoPlayer } from "./VideoPlayer";
import { PackType } from "@/models/order";
import { CAT_API } from "@/api/cat-api";
import { ModalButton } from "@/components/ui/modal";
import { useRouter } from "next/router";

// Animation timing constants (in milliseconds)
const ANIMATION_SPIN_DURATION = 1500;
const VIDEO_CLEANUP_DELAY = 50;
const REVEAL_OVERLAY_FADE_DELAY = 1000;

type TailsCardPackProps = {
  packType: PackType;
  cat?: ICat;
  showGoToGame?: boolean;
  /** The "one cat card is inside" line under the button. Off where the modal already says it. */
  showHint?: boolean;
};

const setAsOpened = async (cat: ICat) => {
  if (cat?._id) {
    await CAT_API.setAsOpened(cat._id!);
  }
};

export const TailsCardPack: React.FC<TailsCardPackProps> = ({
  packType,
  cat,
  showGoToGame = false,
  showHint = true,
}) => {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showRevealOverlay, setShowRevealOverlay] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (showCard && cat?._id) {
      setAsOpened(cat);
    }
  }, [cat, showCard]);

  const handleCardClick = useCallback(() => {
    setIsOpening(true);

    setTimeout(() => {
      setIsOpening(false);
      setIsVideoPlaying(true);
    }, ANIMATION_SPIN_DURATION);
  }, []);

  const handleVideoEnded = useCallback(() => {
    setShowCard(true);
    setShowRevealOverlay(true);

    setTimeout(() => {
      setIsVideoPlaying(false);
    }, VIDEO_CLEANUP_DELAY);

    setTimeout(() => {
      setShowRevealOverlay(false);
    }, REVEAL_OVERLAY_FADE_DELAY);
  }, []);

  const isInteractionDisabled = isVideoPlaying || isOpening;

  const handleGoToGame = useCallback(() => {
    router.push("/game");
  }, [router]);

  return (
    <>
      {showCard ? (
        <RevealAnimation cat={cat} showRevealOverlay={showRevealOverlay} />
      ) : (
        // The button sits right under the pack (no gap pushing it to the bottom of the panel).
        <div className="flex flex-col items-center justify-center gap-3 py-4">
          <CardPackImage
            packType={packType}
            isOpening={isOpening}
            onClick={handleCardClick}
            disabled={isInteractionDisabled}
          />
          {/* The pack is tappable too; this is the clear, keyboard-reachable way to open it. */}
          <div
            className={`relative z-10 flex flex-col items-center gap-2 transition-opacity duration-300 motion-reduce:transition-none ${
              isInteractionDisabled ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <ModalButton
              variant="primary"
              icon="gift"
              onClick={handleCardClick}
              disabled={isInteractionDisabled}
              data-testid="open-pack"
            >
              Open pack
            </ModalButton>
            {showHint && (
              <p className="bg-tt-night-950/60 px-2 py-0.5 font-sans text-p6 font-bold text-tt-cream">
                One cat card is inside.
              </p>
            )}
          </div>
        </div>
      )}

      {showCard && showGoToGame && (
        <div className="relative z-reveal flex justify-center">
          <ModalButton variant="primary" icon="gamepad" onClick={handleGoToGame}>
            Go to game
          </ModalButton>
        </div>
      )}

      <OpeningAnimation isOpening={isOpening} />

      <VideoPlayer isPlaying={isVideoPlaying} onEnded={handleVideoEnded} />
    </>
  );
};
