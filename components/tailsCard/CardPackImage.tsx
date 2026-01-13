import { cdnFile } from "@/constants/utils";
import React, { useRef, useCallback } from "react";
import { PackType } from "@/models/order";

// 3D effect constants
const PERSPECTIVE_MULTIPLIER = 6;
const ROTATION_DIVISOR = 10;
const HOVER_SCALE = 1.04;
const SHADOW_X_DIVISOR = 3;
const SHADOW_Y_DIVISOR = 6;
const SHADOW_BLUR = 15;
const DROP_SHADOW_COLOR = "rgba(0, 0, 0, 0.3)";

const RESET_DROP_SHADOW = `drop-shadow(0 ${SHADOW_BLUR}px ${SHADOW_BLUR}px ${DROP_SHADOW_COLOR})`;
const RESET_TRANSFORM = "rotateY(0deg) rotateX(0deg) scale(1)";

type CardPackImageProps = {
  packType: PackType;
  isOpening?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

const calculateAngle = (
  e: React.MouseEvent,
  item: HTMLDivElement,
  parent: HTMLDivElement
) => {
  const rect = item.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  const perspective = halfWidth * PERSPECTIVE_MULTIPLIER;
  parent.style.perspective = `${perspective}px`;
  item.style.perspective = `${perspective}px`;

  const rotateX = (mouseY - halfWidth) / ROTATION_DIVISOR;
  const rotateY = -(mouseX - halfHeight) / ROTATION_DIVISOR;
  const transformValue = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${HOVER_SCALE})`;
  item.style.transform = transformValue;
  item.style.webkitTransform = transformValue;

  const calcShadowX = (mouseX - halfWidth) / SHADOW_X_DIVISOR;
  const calcShadowY = (mouseY - halfHeight) / SHADOW_Y_DIVISOR;
  item.style.filter = `drop-shadow(${-calcShadowX}px ${-calcShadowY}px ${SHADOW_BLUR}px ${DROP_SHADOW_COLOR})`;
};

export const CardPackImage: React.FC<CardPackImageProps> = ({
  packType,
  isOpening,
  onClick,
  disabled = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerCardRef = useRef<HTMLDivElement>(null);

  const handleMouseInteraction = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!innerCardRef.current || !cardRef.current) return;
      calculateAngle(e, innerCardRef.current, cardRef.current);
    },
    [calculateAngle]
  );

  const handleMouseLeave = useCallback(() => {
    if (!innerCardRef.current) return;

    innerCardRef.current.style.transform = RESET_TRANSFORM;
    innerCardRef.current.style.webkitTransform = RESET_TRANSFORM;
    innerCardRef.current.style.filter = RESET_DROP_SHADOW;
  }, []);

  const preserve3dClass =
    "[transform-style:preserve-3d] [backface-visibility:hidden] [-webkit-transform-style:preserve-3d] [-webkit-backface-visibility:hidden]";

  return (
    <div
      ref={cardRef}
      className={`relative w-[90vw] max-w-[400px] m-auto aspect-[17/23] ${preserve3dClass} cursor-pointer ${
        isOpening ? "z-[101]" : ""
      }`}
      onMouseEnter={handleMouseInteraction}
      onMouseMove={handleMouseInteraction}
      onMouseLeave={handleMouseLeave}
      onClick={!disabled ? onClick : undefined}
    >
      <div
        ref={innerCardRef}
        className={`relative w-full h-full bg-contain bg-center bg-no-repeat transition-[transform,filter] duration-150 ease-out ${preserve3dClass} [will-change:transform,filter] [drop-shadow:0_15px_15px_rgba(0,0,0,0.3)] ${
          isOpening ? "animate-shake opacity-0" : "opacity-100"
        }`}
        style={{
          backgroundImage: `url(${cdnFile(`cards/packs/${packType}.webp`)})`,
          transform: RESET_TRANSFORM,
          WebkitTransform: RESET_TRANSFORM,
          transition: isOpening
            ? "opacity 1.5s ease-out, transform 150ms ease-out, filter 150ms ease-out"
            : "transform 150ms ease-out, filter 150ms ease-out",
        }}
      />
    </div>
  );
};
