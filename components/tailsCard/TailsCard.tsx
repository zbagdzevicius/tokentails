import React from "react";
import { ICat } from "@/models/cats";
import { fakeCat } from "./data";
import { CardWrapper } from "./CardWrapper";
import { CardFront } from "./CardFront";

type Props = {
  cat?: ICat;
};

export const TailsCard: React.FC<Props> = ({ cat = fakeCat }) => {
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
    <CardWrapper>
      <CardFront
        cat={cat}
        blessing={blessing}
        shelterName={shelterName}
        getPlainText={getPlainText}
        limitWords={limitWords}
      />
    </CardWrapper>
  );
};

export default TailsCard;
