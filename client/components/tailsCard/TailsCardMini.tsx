import {
  CatAbilityType,
  CatAbilityTypes,
  ICat,
  cardsBorderColor,
  cardsIcon,
} from "@/models/cats";
import React, { useMemo } from "react";
import { CardWrapper } from "./CardWrapper";
import { cdnFile } from "@/constants/utils";

type Props = {
  cat?: ICat;
  onClick?: () => void;
};

export const TailsCardMini: React.FC<Props> = ({ cat, onClick }) => {
  if (!cat) return null;

  if (!CatAbilityTypes.includes(cat.type)) {
    cat.type = CatAbilityType.FAIRY;
  }
  const borderColor = useMemo(() => cardsBorderColor[cat.type], [cat.type]);
  const typeIcon = useMemo(() => cardsIcon[cat.type], [cat.type]);

  return (
    <>
      <style jsx global>{`
        .tails-card-mini-wrapper [class*="bottom-[1.25%]"],
        .tails-card-mini-wrapper [class*="bottom-[0.5%]"] {
          display: none !important;
        }
      `}</style>
      <div className="flex flex-col items-center tails-card-mini-wrapper w-36 group">
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="animate-opacity cursor-pointer inline-block"
        >
          <CardWrapper
            tier={cat.tier}
            catType={cat.type}
            isBackSide={true}
            style={{
              width: "144px", // w-36 = 9rem = 144px
              maxWidth: "144px",
            }}
          >
            <div className="relative w-full h-full">
              {/* Custom mini card back without power section */}
              <div className="w-full h-full relative">
                <img
                  draggable={false}
                  src={
                    cat.blessing?.catAvatar?.url ||
                    cdnFile("cards/backgrounds/card-placeholder.webp")
                  }
                  alt="Card Back"
                  className="opacity-90 w-full h-full object-cover"
                />

                {/* Cat name and type icon - reduced size */}
                <div className="absolute top-[4%] left-[5%] flex items-center gap-1.5 z-10">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: borderColor }}
                  >
                    <img
                      draggable={false}
                      src={typeIcon}
                      alt={cat.type}
                      className="object-contain w-4 h-4"
                    />
                  </div>
                  <span
                    className="text-black font-bold font-primary text-xs [text-shadow:1px_1px_2px_rgba(0,0,0,0.3)]"
                    style={{
                      WebkitTextStroke: `0.5px ${borderColor}`,
                    }}
                  >
                    {cat.name}
                  </span>
                </div>
              </div>
            </div>
          </CardWrapper>
        </div>
      </div>
    </>
  );
};
