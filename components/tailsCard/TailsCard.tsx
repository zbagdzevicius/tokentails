import React, { useState } from "react";
import { ICat } from "@/models/cats";
import { fakeCat } from "./data";
import { CardWrapper } from "./CardWrapper";
import { CardFront } from "./CardFront";
import background from "./assets/backgrounds/sample.png";

type Props = {
  cat?: ICat;
};

export const TailsCard: React.FC<Props> = ({ cat = fakeCat }) => {
  const [flipped, setFlipped] = useState(false);

  const blessing = cat.blessing;
  const shelterName =
    typeof cat.shelter === "string" ? "" : cat.shelter?.name || "";

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

  return (
    <div
      onClick={() => setFlipped((prev) => !prev)}
      style={{
        perspective: "1000px",
        cursor: "pointer",
        display: "inline-block",
      }}
    >
      <div
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transition: "transform 0.6s",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          style={{
            backfaceVisibility: "hidden",
          }}
        >
          <CardWrapper>
            <CardFront
              cat={cat}
              blessing={blessing}
              shelterName={shelterName}
              getPlainText={getPlainText}
              limitWords={limitWords}
            />
          </CardWrapper>
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardWrapper>
            <div
              style={{
                backgroundImage: `url(${background.src})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                width: "100%",
                height: "618px",
              }}
            ></div>
          </CardWrapper>
        </div>
      </div>
    </div>
  );
};

export default TailsCard;
