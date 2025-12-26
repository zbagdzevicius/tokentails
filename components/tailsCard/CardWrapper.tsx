import {
  CatAbilityType,
  cardsBackground,
  cardsBorderColor,
  cardsGradient,
} from "@/models/cats";
import React, { useRef, useCallback, useMemo } from "react";

type CardWrapperProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  cardNumber?: number;
  totalCards?: number;
  catType: CatAbilityType;
  isBackSide?: boolean;
};

// Extract constants outside component
const DROP_SHADOW_COLOR = "rgba(0, 0, 0, 0.3)";
const RESET_DROP_SHADOW = "drop-shadow(0 15px 15px rgba(0, 0, 0, 0.3))";
const RESET_TRANSFORM = "rotateY(0deg) rotateX(0deg) scale(1)";
const GLARE_HIDE_DELAY = 200;
const SPARKLE_IMAGE = "/cards/backgrounds/sparkle.webp";
const PATTERN_IMAGE = "/cards/backgrounds/pattern-mini-2.webp";

export const CardWrapper: React.FC<CardWrapperProps> = ({
  children,
  style,
  cardNumber = 1,
  totalCards = 200,
  catType,
  isBackSide = false,
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

      item.style.filter = `drop-shadow(${-calcShadowX}px ${-calcShadowY}px 15px ${DROP_SHADOW_COLOR})`;
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
    <div
      ref={cardRef}
      className="relative w-[90vw] max-w-[400px] aspect-[17/23] [transform-style:preserve-3d] [backface-visibility:hidden]"
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
        className={`relative w-full h-full glow-box-${catType} bg-cover bg-center rounded-[20px] transition-[transform,filter] duration-150 ease-out [transform-style:preserve-3d] [will-change:transform,filter] [backface-visibility:hidden] [drop-shadow:0_15px_15px_rgba(0,0,0,0.3)]`}
        style={{
          backgroundImage: `url(${backgroundImage})`,
          transform: "rotateX(0deg) rotateY(0deg) scale(1)",
          WebkitTransform: "rotateX(0deg) rotateY(0deg) scale(1)",
          WebkitTransformStyle: "preserve-3d",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {!isBackSide && (
          <div className="absolute inset-[6%] rounded-[20px] bg-[#0b0b2a]" />
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
          <div
            className="relative w-full h-full overflow-hidden cursor-pointer flex items-center justify-center rounded-xl border-[3px]"
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
                src={PATTERN_IMAGE}
                alt="Card pattern"
                className="absolute inset-0 object-cover opacity-50"
              />
            </div>
            {children}
          </div>
        </div>

        <div
          className="absolute left-[10%] bottom-[1.25%] font-primary font-bold text-[clamp(12px,2.5vw,12px)]"
          style={{ color: borderColor }}
        >
          C{cardNumber} / {totalCards}
        </div>

        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[0.5%] font-primary font-bold text-[clamp(14px,3vw,18px)] whitespace-nowrap [text-shadow:0_2px_4px_rgba(0,0,0,0.3)]"
          style={{ color: borderColor }}
        >
          TOKEN TAILS
        </div>
      </div>
    </div>
  );
};
