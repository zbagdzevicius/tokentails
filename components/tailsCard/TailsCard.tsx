import React, { useState } from "react";
import { ICat, CatAbilityType } from "@/models/cats";
import { fakeCat } from "./data";
import { CardWrapper } from "./CardWrapper";
import { CardFront } from "./CardFront";
import { CardBack } from "./CardBack";

type Props = {
  cat?: ICat;
};

export const TailsCard: React.FC<Props> = ({ cat = fakeCat }) => {
  const [flipped, setFlipped] = useState(false);
  const [selectedType, setSelectedType] = useState<CatAbilityType>(cat.type);

  const blessing = cat.blessing;
  const shelterName = cat.shelter?.name || "";

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

  // Create cat with selected type for testing
  const testCat = { ...cat, type: selectedType };

  return (
    <div>
      {/* Type Selector for Testing */}
      <div style={{ marginBottom: "20px", textAlign: "center" }}>
        <label
          htmlFor="catType"
          style={{ marginRight: "10px", fontWeight: "bold" }}
        >
          Cat Type:
        </label>
        <select
          id="catType"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as CatAbilityType)}
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: "2px solid #ccc",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          {Object.values(CatAbilityType).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

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
            <CardWrapper catType={selectedType}>
              <CardFront
                cat={testCat}
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
            <CardWrapper catType={selectedType} isBackSide={true}>
              <CardBack cat={testCat} />
            </CardWrapper>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TailsCard;
