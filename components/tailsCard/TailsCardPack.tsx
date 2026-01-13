import React, { useState, useCallback } from "react";
import { ICat } from "@/models/cats";
import { CardPackImage } from "./CardPackImage";
import { OpeningAnimation } from "./OpeningAnimation";
import { RevealAnimation } from "./RevealAnimation";
import { VideoPlayer } from "./VideoPlayer";

const COMMON_CARD_PACK = "/cards/backgrounds/common-card-pack.webp";
const INFLUENCER_CARD_PACK = "/cards/backgrounds/influencer-card-pack.webp";
const LEGENDARY_CARD_PACK = "/cards/backgrounds/legendary-card-pack.webp";

// Animation timing constants (in milliseconds)
const ANIMATION_SPIN_DURATION = 1500;
const VIDEO_CLEANUP_DELAY = 50;
const REVEAL_OVERLAY_FADE_DELAY = 1000;

export type CardPackType = "common" | "influencer" | "legendary";

type TailsCardPackProps = {
  cardType: CardPackType;
  cat?: ICat;
};

const CARD_PACK_IMAGES: Record<CardPackType, string> = {
  common: COMMON_CARD_PACK,
  influencer: INFLUENCER_CARD_PACK,
  legendary: LEGENDARY_CARD_PACK,
};

const getCardPackImage = (cardType: CardPackType): string =>
  CARD_PACK_IMAGES[cardType] ?? COMMON_CARD_PACK;

export const TailsCardPack: React.FC<TailsCardPackProps> = ({
  cardType,
  cat,
}) => {
  const cardPackImage = getCardPackImage(cardType);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showRevealOverlay, setShowRevealOverlay] = useState(false);

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
      {showCard && (
        <RevealAnimation cat={cat} showRevealOverlay={showRevealOverlay} />
      )}

      <OpeningAnimation isOpening={isOpening} />

      <CardPackImage
        imageSrc={cardPackImage}
        isOpening={isOpening}
        onClick={handleCardClick}
        disabled={isInteractionDisabled}
      />

      <VideoPlayer isPlaying={isVideoPlaying} onEnded={handleVideoEnded} />
    </>
  );
};
