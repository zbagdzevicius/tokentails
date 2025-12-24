import React, { useRef } from "react";
import Image from "next/image";
import {
  CatAbilityType,
  cardsBackground,
  cardsBorderColor,
  cardsGradient,
} from "@/models/cats";
import sparkle from "@/public/cards/backgrounds/sparkle.png";
import glare from "@/public/cards/backgrounds/glare.png";

type CardWrapperProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  cardNumber?: number;
  totalCards?: number;
  catType: CatAbilityType;
  isBackSide?: boolean;
};

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
  const rainbowRef = useRef<HTMLDivElement>(null);
  const backfaceRef = useRef<HTMLDivElement>(null);

  const backgroundImage = cardsBackground[catType];
  const borderColor = cardsBorderColor[catType];
  const bodyGradient = cardsGradient[catType];

  const calculateAngle = (
    e: React.MouseEvent,
    item: HTMLDivElement,
    parent: HTMLDivElement
  ) => {
    const dropShadowColor = "rgba(0, 0, 0, 0.3)";

    // Get bounding rect and mouse position relative to card
    const rect = item.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;

    // Calculate angle from card center to mouse (0deg = right, 90deg = down)
    const dx = mouseX - halfWidth;
    const dy = mouseY - halfHeight;

    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 180;
    if (angle < 0) angle += 360;

    // Blob glare is always visible and follows cursor

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

    parent.style.perspective = `${halfWidth * 6}px`;
    item.style.perspective = `${halfWidth * 6}px`;

    // This transform makes the corner under the cursor uplifted (correct direction)
    item.style.transform = `rotateX(${(mouseY - halfWidth) / 10}deg) rotateY(${
      -(mouseX - halfHeight) / 10
    }deg) scale(1.04)`;

    const calcShadowX = (mouseX - halfWidth) / 3;
    const calcShadowY = (mouseY - halfHeight) / 6;

    item.style.filter = `drop-shadow(${-calcShadowX}px ${-calcShadowY}px 15px ${dropShadowColor})`;
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (innerCardRef.current && cardRef.current) {
      calculateAngle(e, innerCardRef.current, cardRef.current);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (innerCardRef.current && cardRef.current) {
      calculateAngle(e, innerCardRef.current, cardRef.current);
    }
  };

  const handleMouseLeave = () => {
    const dropShadowColor = "rgba(0, 0, 0, 0.3)";

    if (innerCardRef.current) {
      innerCardRef.current.style.transform =
        "rotateY(0deg) rotateX(0deg) scale(1)";
      innerCardRef.current.style.filter = `drop-shadow(0 15px 15px ${dropShadowColor})`;
    }

    // Hide glare overlay naturally
    if (glareRef.current) {
      glareRef.current.style.opacity = "0";
      setTimeout(() => {
        if (glareRef.current) {
          glareRef.current.style.maskImage = "none";
          glareRef.current.style.webkitMaskImage = "none";
        }
      }, 200); // matches transition duration
    }

    // Hide rainbow overlay naturally
    if (rainbowRef.current) {
      rainbowRef.current.style.opacity = "0";
      setTimeout(() => {
        if (rainbowRef.current) {
          rainbowRef.current.style.maskImage = "none";
          rainbowRef.current.style.webkitMaskImage = "none";
          rainbowRef.current.style.background = "none";
        }
      }, 200);
    }
  };

  return (
    <div
      ref={cardRef}
      className="relative w-[90vw] max-w-[400px]"
      style={{
        aspectRatio: "17 / 23",
        transformStyle: "preserve-3d",
        transition: "all 0.2s ease-out",
        ...style,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={innerCardRef}
        className="relative w-full h-full"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "40px",
          transformStyle: "preserve-3d",
          transform: "rotateX(0deg) rotateY(0deg) scale(1)",
          transition: "all 0.15s ease-out",
          willChange: "transform, filter",
          filter: "drop-shadow(0 15px 15px rgba(0, 0, 0, 0.3))",
        }}
      >
        {/* Glare image reveal effect - shows glare image in 1/4 cone */}
        <div
          ref={glareRef}
          className="absolute inset-0 pointer-events-none z-[200]"
          style={{
            borderRadius: "40px",
            overflow: "hidden",
            opacity: 0,
            transition: "opacity 0.15s ease-out",
          }}
        >
          <Image
            src={glare}
            alt="Glare Effect"
            fill
            style={{
              objectFit: "cover",
              mixBlendMode: "plus-lighter",
              opacity: 0.5,
            }}
          />
        </div>

        {/* Rainbow overlay effect - follows same angle as glare */}
        <div
          ref={rainbowRef}
          className="absolute inset-0 pointer-events-none z-[201]"
          style={{
            borderRadius: "40px",
            overflow: "hidden",
            opacity: 0,
            transition: "opacity 0.15s ease-out",
            mixBlendMode: "color-dodge",
          }}
        />

        {!isBackSide && (
          <div
            ref={backfaceRef}
            className="absolute inset-[6%]"
            style={{
              background: "linear-gradient(45deg, #0b0b2a, #0b0b2a)",
              borderRadius: "20px",
            }}
          />
        )}
        <div className="absolute inset-[6%]">
          <Image
            src={sparkle}
            alt="Sparkle"
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none", width: "18%", height: "auto" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none", width: "18%", height: "auto" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none", width: "12%", height: "auto" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none", width: "12%", height: "auto" }}
          />

          {/* Main Pink Card */}
          <div
            className="relative w-full h-full overflow-visible cursor-pointer flex items-center justify-center"
            style={{
              background: isBackSide ? "transparent" : bodyGradient,
              borderRadius: "20px",
              border: `3px solid ${borderColor}`,
            }}
          >
            {children}
          </div>
        </div>

        <div
          className="absolute left-[10%] bottom-[1.25%] font-primary"
          style={{
            color: borderColor,
            fontSize: "clamp(12px, 2.5vw, 12px)",
            fontWeight: "bold",
          }}
        >
          C{cardNumber} / {totalCards}
        </div>

        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[0.5%] font-primary"
          style={{
            color: borderColor,
            fontSize: "clamp(14px, 3vw, 18px)",
            fontWeight: "bold",
            textShadow: "0 2px 4px rgba(0,0,0,0.3)",
            whiteSpace: "nowrap",
          }}
        >
          TOKEN TAILS
        </div>
      </div>
    </div>
  );
};

export default CardWrapper;
