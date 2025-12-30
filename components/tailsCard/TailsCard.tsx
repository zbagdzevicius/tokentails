import { CatAbilityType, CatAbilityTypes, ICat } from "@/models/cats";
import React, { useCallback, useState } from "react";
import { CardBack } from "./CardBack";
import { CardFront } from "./CardFront";
import { CardWrapper } from "./CardWrapper";
import { fakeCat } from "./data";

type Props = {
  cat?: ICat;
};

export const TailsCard: React.FC<Props> = ({ cat = fakeCat }) => {
  const [flipped, setFlipped] = useState(true);

  const blessing = cat.blessing;

  if (!CatAbilityTypes.includes(cat.type)) {
    cat.type = CatAbilityType.FAIRY;
  }

  const handleFlip = useCallback(() => {
    setFlipped((prev) => !prev);
  }, []);

  return (
    <>
      <div
        onClick={handleFlip}
        className="animate-opacity cursor-pointer inline-block [perspective:1000px]"
        style={{ WebkitPerspective: "1000px" }}
      >
        <div
          className="relative touch-none max-sm:pointer-events-none select-none transition-transform [transition-duration:0.6s] [transform-style:preserve-3d]"
          style={{
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            WebkitTransformStyle: "preserve-3d",
          }}
        >
          <div
            className="[backface-visibility:hidden] [transform:translateZ(0)]"
            style={{
              WebkitBackfaceVisibility: "hidden",
              WebkitTransform: "translateZ(0)",
            }}
          >
            <CardWrapper catType={cat.type}>
              <CardFront cat={cat} blessing={blessing} />
            </CardWrapper>
          </div>

          <div
            className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(0)]"
            style={{
              WebkitBackfaceVisibility: "hidden",
              WebkitTransform: "rotateY(180deg) translateZ(0)",
            }}
          >
            <CardWrapper catType={cat.type} isBackSide={true}>
              <CardBack cat={cat} blessing={blessing} />
            </CardWrapper>
          </div>
        </div>
      </div>
    </>
  );
};
