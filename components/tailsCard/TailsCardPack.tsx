import { ICat } from "@/models/cats";
import React, { useCallback, useEffect, useState } from "react";
import { CardPackImage } from "./CardPackImage";
import { OpeningAnimation } from "./OpeningAnimation";
import { RevealAnimation } from "./RevealAnimation";
import { VideoPlayer } from "./VideoPlayer";
import { PackType } from "@/models/order";
import { CAT_API } from "@/api/cat-api";

// Animation timing constants (in milliseconds)
const ANIMATION_SPIN_DURATION = 1500;
const VIDEO_CLEANUP_DELAY = 50;
const REVEAL_OVERLAY_FADE_DELAY = 1000;

type TailsCardPackProps = {
  packType: PackType;
  cat?: ICat;
};

const setAsOpened = async (cat: ICat) => {
  if (cat?._id) {
    await CAT_API.setAsOpened(cat._id!);
  }
};

export const TailsCardPack: React.FC<TailsCardPackProps> = ({
  packType,
  cat,
}) => {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showRevealOverlay, setShowRevealOverlay] = useState(false);

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

  return (
    <>
      {showCard ? (
        <RevealAnimation cat={cat} showRevealOverlay={showRevealOverlay} />
      ) : (
        <CardPackImage
          packType={packType}
          isOpening={isOpening}
          onClick={handleCardClick}
          disabled={isInteractionDisabled}
        />
      )}

      <OpeningAnimation isOpening={isOpening} />

      <VideoPlayer isPlaying={isVideoPlaying} onEnded={handleVideoEnded} />
    </>
  );
};
