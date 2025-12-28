import { isProd } from "@/models/app";
import { CatAbilityType, CatAbilityTypes, ICat } from "@/models/cats";
import React, { useCallback, useMemo, useState } from "react";
import { CardBack } from "./CardBack";
import { CardFront } from "./CardFront";
import { CardWrapper } from "./CardWrapper";
import { fakeCat } from "./data";

type Props = {
  cat?: ICat;
};

export const TailsCard: React.FC<Props> = ({ cat = fakeCat }) => {
  const [flipped, setFlipped] = useState(true);
  const [selectedType, setSelectedType] = useState<CatAbilityType>(cat.type);

  const blessing = cat.blessing;

  if (!CatAbilityTypes.includes(cat.type)) {
    cat.type = CatAbilityType.FAIRY;
  }

  // Memoize testCat to prevent unnecessary re-renders
  const testCat = useMemo(
    () => ({ ...cat, type: selectedType }),
    [cat, selectedType]
  );

  const handleFlip = useCallback(() => {
    setFlipped((prev) => !prev);
  }, []);

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedType(e.target.value as CatAbilityType);
    },
    []
  );

  const catTypeOptions = useMemo(() => Object.values(CatAbilityType), []);

  return (
    <>
      {/* Type Selector for Testing */}
      {isProd && (
        <div className="pb-5 pt-[120px] text-center">
          <label htmlFor="catType" className="mr-2.5 font-bold">
            Cat Type:
          </label>
          <select
            id="catType"
            value={selectedType}
            onChange={handleTypeChange}
            className="px-3 py-2 rounded-lg border-2 border-gray-300 text-sm cursor-pointer"
          >
            {catTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      )}

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
            <CardWrapper catType={selectedType}>
              <CardFront cat={testCat} blessing={blessing} />
            </CardWrapper>
          </div>

          <div
            className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(0)]"
            style={{
              WebkitBackfaceVisibility: "hidden",
              WebkitTransform: "rotateY(180deg) translateZ(0)",
            }}
          >
            <CardWrapper catType={selectedType} isBackSide={true}>
              <CardBack cat={testCat} />
            </CardWrapper>
          </div>
        </div>
      </div>
    </>
  );
};
