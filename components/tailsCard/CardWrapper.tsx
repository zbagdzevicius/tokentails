import React, { useRef } from "react";
import background from "./assets/backgrounds/fire.png";

type CardWrapperProps = {
  children: React.ReactNode;
};

export const CardWrapper: React.FC<CardWrapperProps> = ({ children }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerCardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

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
        {children}
      </div>
    </div>
  );
};

export default CardWrapper;
