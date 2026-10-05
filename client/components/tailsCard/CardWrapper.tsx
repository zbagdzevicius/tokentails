import {
  CatAbilityType,
  Tier,
  cardsBackground,
  cardsBorderColor,
  cardsGradient,
} from "@/models/cats";
import React, { useRef, useCallback, useMemo } from "react";
import { CardEffects } from "./CardEffects";
import { DivineGlowEffect } from "./cardEffects/DivineGlowEffect";
import {
  LegendaryElectricBorder,
  LegendaryElectricBorderSVG,
} from "./cardEffects/LegendaryElectricBorder";
import { cdnFile } from "@/constants/utils";

type CardWrapperProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  /**
   * Mint number and edition size. Shown only when both are given and real: no caller has a
   * true mint number today, so the footer shows the tier alone (no "1 / 200" placeholder).
   */
  cardNumber?: number;
  totalCards?: number;
  catType: CatAbilityType;
  isBackSide?: boolean;
  tier: Tier;
  /**
   * "static" skips the animated tier effects (canvas borders, particles) and draws a still tier
   * glow instead: for cards in lists and grids, where dozens of animated effects cost frames.
   */
  effects?: "animated" | "static";
};

/** The still tier glow for `effects="static"`: the tier stays readable without animation. */
const STATIC_TIER_GLOW: Partial<Record<Tier, string>> = {
  [Tier.RARE]: "0 0 2.5cqw 0.6cqw rgba(110, 190, 255, 0.55)",
  [Tier.EPIC]: "0 0 3cqw 0.8cqw rgba(214, 120, 255, 0.6)",
  [Tier.LEGENDARY]: "0 0 3.5cqw 1cqw rgba(255, 205, 90, 0.7)",
};

const DROP_SHADOW_COLOR = "rgba(0, 0, 0, 0.3)";
// 15 px on the 400 px card, in cqw so a small card gets a proportionally small shadow. The
// shadow is applied on hover and kept after it (a filter at rest on every My Pets card costs
// paint time on phones; the old `[drop-shadow:...]` class was not valid CSS and did nothing).
const SHADOW_BLUR = "3.75cqw";
const RESET_DROP_SHADOW = `drop-shadow(0 ${SHADOW_BLUR} ${SHADOW_BLUR} ${DROP_SHADOW_COLOR})`;
// Footer text: white with a tight dark halo, readable on every card colour.
const FOOTER_INK =
  "text-white [text-shadow:0_0_0.6cqw_rgba(0,0,0,0.85),0_0.3cqw_0_rgba(0,0,0,0.6)]";
const RESET_TRANSFORM = "rotateY(0deg) rotateX(0deg) scale(1)";
const GLARE_HIDE_DELAY = 200;
const SPARKLE_IMAGE = cdnFile("cards/backgrounds/sparkle.webp");

const patternImages: Record<Tier, string> = {
  [Tier.COMMON]: cdnFile("cards/backgrounds/pattern-COMMON.webp"),
  [Tier.RARE]: cdnFile("cards/backgrounds/pattern-RARE.webp"),
  [Tier.EPIC]: cdnFile("cards/backgrounds/pattern-EPIC.webp"),
  [Tier.LEGENDARY]: cdnFile("cards/backgrounds/pattern-LEGENDARY.webp"),
};

export const CardWrapper: React.FC<CardWrapperProps> = ({
  children,
  style,
  cardNumber,
  totalCards,
  catType,
  isBackSide = false,
  tier,
  effects = "animated",
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerCardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  // Memoize lookups
  const backgroundImage = useMemo(() => cardsBackground[catType], [catType]);
  const borderColor = useMemo(() => cardsBorderColor[catType], [catType]);
  const bodyGradient = useMemo(() => cardsGradient[catType], [catType]);

  const calculateAngle = useCallback(
    (e: React.MouseEvent, item: HTMLDivElement, parent: HTMLDivElement) => {
      // Get bounding rect and mouse position relative to card
      const rect = item.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const halfWidth = rect.width / 2;
      const halfHeight = rect.height / 2;

      // Glare image reveal effect - blob light follows cursor
      if (glareRef.current) {
        // Calculate cursor position as percentage of card
        const xPercent = (mouseX / rect.width) * 100;
        const yPercent = (mouseY / rect.height) * 100;
        // Blob size and softness
        const blobRadius = Math.max(rect.width, rect.height) * 0.22; // 22% of card size
        const blobSoft = blobRadius * 0.7;
        // Radial gradient mask centered at cursor
        const maskGradient = `radial-gradient(circle ${blobRadius}px at ${xPercent}% ${yPercent}%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.6) ${blobSoft}px, transparent 100%)`;
        glareRef.current.style.maskImage = maskGradient;
        glareRef.current.style.webkitMaskImage = maskGradient;
        glareRef.current.style.opacity = "1";
        glareRef.current.style.transition =
          "opacity 0.15s ease-out, mask-image 0.1s";
      }

      const perspective = halfWidth * 6;
      parent.style.perspective = `${perspective}px`;
      item.style.perspective = `${perspective}px`;

      // This transform makes the corner under the cursor uplifted (correct direction)
      const transformValue = `rotateX(${
        (mouseY - halfWidth) / 10
      }deg) rotateY(${-(mouseX - halfHeight) / 10}deg) scale(1.04)`;
      item.style.transform = transformValue;
      item.style.webkitTransform = transformValue;

      const calcShadowX = (mouseX - halfWidth) / 3;
      const calcShadowY = (mouseY - halfHeight) / 6;

      item.style.filter = `drop-shadow(${-calcShadowX}px ${-calcShadowY}px ${SHADOW_BLUR} ${DROP_SHADOW_COLOR})`;
    },
    []
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (innerCardRef.current && cardRef.current) {
        calculateAngle(e, innerCardRef.current, cardRef.current);
      }
    },
    [calculateAngle]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (innerCardRef.current && cardRef.current) {
        calculateAngle(e, innerCardRef.current, cardRef.current);
      }
    },
    [calculateAngle]
  );

  const handleMouseLeave = useCallback(() => {
    if (innerCardRef.current) {
      innerCardRef.current.style.transform = RESET_TRANSFORM;
      innerCardRef.current.style.webkitTransform = RESET_TRANSFORM;
      innerCardRef.current.style.filter = RESET_DROP_SHADOW;
    }

    // Hide glare overlay naturally
    if (glareRef.current) {
      glareRef.current.style.opacity = "0";
      setTimeout(() => {
        if (glareRef.current) {
          glareRef.current.style.maskImage = "none";
          glareRef.current.style.webkitMaskImage = "none";
        }
      }, GLARE_HIDE_DELAY);
    }
  }, []);

  return (
    <>
      {/* SVG Filter Definition - Always mounted */}
      <LegendaryElectricBorderSVG />
      <div
        ref={cardRef}
        // A size container: everything inside is sized in `cqw` (1 cqw = 1% of the card's width),
        // so a 144 px My Pets card is an exact scale model of the 400 px full card. Reference:
        // 1 px on the 400 px card = 0.25cqw. See CARD_REFERENCE_WIDTH in cardScale.ts.
        className="relative w-[90vw] max-w-[400px] aspect-[17/23] [container-type:inline-size] [transform-style:preserve-3d] [backface-visibility:hidden]"
        data-tails-card=""
        style={{
          WebkitTransformStyle: "preserve-3d",
          WebkitBackfaceVisibility: "hidden",
          ...style,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={innerCardRef}
          className={`relative w-full h-full glow-box-${catType} bg-cover bg-center rounded-[5cqw] transition-[transform,filter] duration-150 ease-out [transform-style:preserve-3d] [will-change:transform,filter] [backface-visibility:hidden]`}
          style={{
            backgroundImage: `url(${backgroundImage})`,
            transform: "rotateX(0deg) rotateY(0deg) scale(1)",
            WebkitTransform: "rotateX(0deg) rotateY(0deg) scale(1)",
            WebkitTransformStyle: "preserve-3d",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          {effects === "animated" && <DivineGlowEffect tier={tier} />}
          {effects === "animated" && tier === Tier.LEGENDARY && (
            <LegendaryElectricBorder borderColor={borderColor} />
          )}
          {!isBackSide && (
            <div className="absolute inset-[6%] rounded-[5cqw] bg-[#0b0b2a]" />
          )}
          <div className="absolute inset-[6%]">
            <img
              draggable={false}
              src={SPARKLE_IMAGE}
              alt="Sparkle"
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[18%] h-auto"
            />
            <img
              draggable={false}
              src={SPARKLE_IMAGE}
              alt="Sparkle"
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-[100] w-[18%] h-auto"
            />
            <img
              draggable={false}
              src={SPARKLE_IMAGE}
              alt="Sparkle"
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[12%] h-auto"
            />
            <img
              draggable={false}
              src={SPARKLE_IMAGE}
              alt="Sparkle"
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 z-[100] w-[12%] h-auto"
            />
            {effects === "animated" ? (
              <CardEffects tier={tier} />
            ) : STATIC_TIER_GLOW[tier] ? (
              <span
                aria-hidden="true"
                data-testid="card-static-glow"
                className="pointer-events-none absolute inset-0 rounded-[3cqw]"
                style={{ boxShadow: STATIC_TIER_GLOW[tier] }}
              />
            ) : null}
            <div
              className="relative w-full h-full overflow-hidden cursor-pointer flex items-center justify-center rounded-[3cqw] border-[max(1px,0.75cqw)]"
              style={{
                background: isBackSide ? "transparent" : bodyGradient,
                borderColor: borderColor,
              }}
            >
              <div
                ref={glareRef}
                className="absolute inset-0 pointer-events-none z-[1] mix-blend-color-dodge opacity-0 transition-opacity duration-150 ease-out"
              >
                <img
                  draggable={false}
                  src={patternImages[tier]}
                  alt="Card pattern"
                  className="absolute inset-0 object-cover opacity-100"
                />
              </div>
              {children}
            </div>
          </div>

          {/* Footer: 12 px and 18 px on the 400 px card, scaled with the card (never the viewport).
              Under 260 px wide (My Pets, the payout pages) the tier label would be under 8 px and
              unreadable, so it is hidden and "TOKEN TAILS" is centred; the tier still shows in the
              card's border. White ink with a dark halo: the tier colour on its own border had
              almost no contrast on the light (ice, sky) cards. */}
          <div
            data-card-footer=""
            className="absolute inset-x-[8%] bottom-[0.9%] flex items-baseline justify-between [@container(max-width:260px)]:justify-center gap-[2cqw] font-primary font-bold leading-none pointer-events-none"
          >
            <span
              data-card-tier=""
              className={`text-[length:3cqw] whitespace-nowrap [@container(max-width:260px)]:hidden ${FOOTER_INK}`}
            >
              {tier}
              {cardNumber != null && totalCards != null
                ? `: ${cardNumber} / ${totalCards}`
                : null}
            </span>
            <span
              className={`text-[length:4.5cqw] whitespace-nowrap ${FOOTER_INK}`}
            >
              TOKEN TAILS
            </span>
          </div>
        </div>
      </div>
    </>
  );
};
