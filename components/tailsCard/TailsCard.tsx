import React, { useRef, useState } from "react";
import { ICat } from "@/models/cats";
import Image from "next/image";
import { fakeCat } from "./data";
import flag from "./assets/usa.png";
import background from "./assets/backgrounds/fire.png";
import ellipse from "./assets/backgrounds/ellipse.png";
import sparkle from "./assets/backgrounds/sparkle.png";

type Props = {
  cat?: ICat;
};

export const TailsCard = ({ cat = fakeCat }): Props => {
  const blessing = cat.blessing;
  const shelterName =
    typeof cat.shelter === "string" ? "" : cat.shelter?.name || "";

  const cardRef = useRef<HTMLDivElement>(null);
  const innerCardRef = useRef<HTMLDivElement>(null);
  const backfaceRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const [isAnimated, setIsAnimated] = useState(false);

  // Parse HTML description to plain text
  const getPlainText = (html: string) => {
    return html.replace(/<[^>]*>/g, "");
  };

  // Limit description to max words
  const limitWords = (text: string, maxWords: number = 50) => {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(" ") + "...";
  };

  const calculateAngle = (
    e: React.MouseEvent,
    item: HTMLDivElement,
    parent: HTMLDivElement
  ) => {
    const dropShadowColor = "rgba(0, 0, 0, 0.3)";

    // Get the x position of the users mouse, relative to the card itself
    const x = Math.abs(item.getBoundingClientRect().x - e.clientX);
    // Get the y position relative to the card
    const y = Math.abs(item.getBoundingClientRect().y - e.clientY);

    // Calculate half the width and height
    const halfWidth = item.getBoundingClientRect().width / 2;
    const halfHeight = item.getBoundingClientRect().height / 2;

    // Calculate angles
    const calcAngleX = (x - halfWidth) / 6;
    const calcAngleY = (y - halfHeight) / 14;

    const gX = (1 - x / (halfWidth * 2)) * 100;
    const gY = (1 - y / (halfHeight * 2)) * 100;

    if (glareRef.current) {
      glareRef.current.style.background = `radial-gradient(circle at ${gX}% ${gY}%, rgb(199 198 243), transparent)`;
    }

    // Set perspective
    parent.style.perspective = `${halfWidth * 6}px`;
    item.style.perspective = `${halfWidth * 6}px`;

    // Set the transform
    item.style.transform = `rotateY(${calcAngleX}deg) rotateX(${-calcAngleY}deg) scale(1.04)`;

    // Calculate shadow
    const calcShadowX = (x - halfWidth) / 3;
    const calcShadowY = (y - halfHeight) / 6;

    // Add drop shadow
    item.style.filter = `drop-shadow(${-calcShadowX}px ${-calcShadowY}px 15px ${dropShadowColor})`;
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsAnimated(true);
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
    setIsAnimated(false);
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
      {/* Outer Card Wrapper with Fire Background */}
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
        {/* Inner Card Backface */}
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
            width={100}
            height={100}
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            width={100}
            height={100}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            width={75}
            height={75}
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          <Image
            src={sparkle}
            alt="Sparkle"
            width={75}
            height={75}
            className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 z-[100]"
            style={{ pointerEvents: "none" }}
          />
          {/* Card Content */}
          <div className="relative p-6 pb-8 z-10">
            {/* Header with Name and Flag */}
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-4xl font-black text-black drop-shadow-md">
                {blessing?.name || cat.name}
              </h2>
              <Image
                src={flag}
                alt="Country Flag"
                width={64}
                height={48}
                className="object-cover"
              />
            </div>

            {/* Cat Image */}
            <div
              className="bg-white rounded-[20px] mb-6 shadow-xl"
              style={{ padding: "5px" }}
            >
              <div className="relative w-full aspect-[525/300] rounded-xl overflow-hidden">
                {/* Ellipse Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Image
                    src={ellipse}
                    alt="Ellipse"
                    className="object-contain"
                  />
                </div>
                {blessing?.image?.url ? (
                  <Image
                    src={blessing.image.url}
                    alt={blessing.name}
                    fill
                    className="object-cover relative z-10"
                  />
                ) : (
                  <Image
                    src={cat.catImg}
                    alt={cat.name}
                    fill
                    className="object-cover relative z-10"
                  />
                )}
              </div>
            </div>

            {/* Shelter and Status Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <h3 className="text-xl font-black text-black mb-1">Shelter</h3>
                <p className="text-base font-bold text-black">
                  {shelterName || "Unknown"}
                </p>
              </div>
              <div>
                <h3 className="text-xl font-black text-black mb-1">Status</h3>
                <p className="text-base font-bold text-black">
                  Waiting for home
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="h-1 bg-black/20 rounded-full mb-6"></div>

            {/* Pet Story */}
            <div>
              <h3 className="text-2xl font-black text-black mb-3">Pet Story</h3>
              <div className="text-sm font-semibold text-black leading-relaxed space-y-2">
                {blessing?.description ? (
                  <p>{limitWords(getPlainText(blessing.description))}</p>
                ) : (
                  <p>{limitWords(getPlainText(cat.resqueStory))}</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer with Token Count */}
        </div>
      </div>
    </div>
  );
};

export default TailsCard;
