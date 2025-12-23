import React, { useRef } from "react";
import Image from "next/image";
import {
  CatAbilityType,
  cardsBackground,
  cardsBorderColor,
  cardsGradient,
} from "@/models/cats";
import sparkle from "@/public/cards/backgrounds/sparkle.png";

type CardWrapperProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
  cardNumber?: number;
  totalCards?: number;
  catType: CatAbilityType;
};

export const CardWrapper: React.FC<CardWrapperProps> = ({
  children,
  style,
  cardNumber = 1,
  totalCards = 200,
  catType,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerCardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
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

    const x = Math.abs(item.getBoundingClientRect().x - e.clientX);
    const y = Math.abs(item.getBoundingClientRect().y - e.clientY);

    const halfWidth = item.getBoundingClientRect().width / 2;
    const halfHeight = item.getBoundingClientRect().height / 2;

    const calcAngleX = (x - halfWidth) / 6;
    const calcAngleY = (y - halfHeight) / 14;

    const gX = (1 - x / (halfWidth * 2)) * 100;
    const gY = (1 - y / (halfHeight * 2)) * 100;

    if (glareRef.current) {
      glareRef.current.style.background = `radial-gradient(circle at ${gX}% ${gY}%, rgb(199 198 243), transparent)`;
    }

    parent.style.perspective = `${halfWidth * 6}px`;
    item.style.perspective = `${halfWidth * 6}px`;

    item.style.transform = `rotateY(${calcAngleX}deg) rotateX(${-calcAngleY}deg) scale(1.04)`;

    const calcShadowX = (x - halfWidth) / 3;
    const calcShadowY = (y - halfHeight) / 6;

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
        <div
          ref={backfaceRef}
          className="absolute inset-[6%]"
          style={{
            background: "linear-gradient(45deg, #0b0b2a, #0b0b2a)",
            borderRadius: "20px",
          }}
        />
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
              background: bodyGradient,
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
