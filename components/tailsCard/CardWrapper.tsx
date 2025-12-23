import React, { useRef } from "react";
import Image from "next/image";
import background from "./assets/backgrounds/fire.png";
import sparkle from "./assets/backgrounds/sparkle.png";

type CardWrapperProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

const SPARKLE_TOP_BOTTOM_SIZE = 100;
const SPARKLE_SIDE_SIZE = 55;

export const CardWrapper: React.FC<CardWrapperProps> = ({
  children,
  style,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerCardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const backfaceRef = useRef<HTMLDivElement>(null);

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
      className="relative w-full max-w-md"
      style={{
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
          backgroundImage: `url(${background.src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "40px",
          padding: "45px",
          transformStyle: "preserve-3d",
          transform: "rotateX(0deg) rotateY(0deg) scale(1)",
          transition: "all 0.15s ease-out",
          willChange: "transform, filter",
          filter: "drop-shadow(0 15px 15px rgba(0, 0, 0, 0.3))",
        }}
      >
        <div
          ref={backfaceRef}
          className="absolute"
          style={{
            inset: "45px",
            background: "linear-gradient(45deg, #0b0b2a, #0b0b2a)",
            borderRadius: "20px",
          }}
        />

        {/* Main Pink Card */}
        <div
          className="relative w-full h-full overflow-visible cursor-pointer"
          style={{
            background:
              "radial-gradient(circle at 60% 30%, #FFDBF1 0%, #FF6F71 100%)",
            borderRadius: "20px",
            border: "5px solid #ffffffff",
          }}
        >
          {/* Sparkles on borders */}
          <Image
            src={sparkle}
            alt="Sparkle"
            width={SPARKLE_TOP_BOTTOM_SIZE}
            height={SPARKLE_TOP_BOTTOM_SIZE}
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            width={SPARKLE_TOP_BOTTOM_SIZE}
            height={SPARKLE_TOP_BOTTOM_SIZE}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            width={SPARKLE_SIDE_SIZE}
            height={SPARKLE_SIDE_SIZE}
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            width={SPARKLE_SIDE_SIZE}
            height={SPARKLE_SIDE_SIZE}
            className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          {children}
        </div>
      </div>
    </div>
  );
};

export default CardWrapper;
