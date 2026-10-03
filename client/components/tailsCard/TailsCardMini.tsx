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
import { catName } from "@/components/shelter-payouts/pinkPaw";
import { nameFont } from "@/lib/glyphs";

const MINI_CARD_STYLE: React.CSSProperties = { width: "100%", maxWidth: "none" };

type Props = {
  cat?: ICat;
  onClick?: () => void;
};

export const TailsCardMini: React.FC<Props> = ({ cat, onClick }) => {
  if (!cat) return null;

  if (!CatAbilityTypes.includes(cat.type)) {
    // Known issue: this normalises the shared cat object in place, and game
    // scenes later read cat.type from the same object, so it is kept as is
    // rather than silently changing what they see. TailsCard normalises
    // without mutating.
    // eslint-disable-next-line react-hooks/immutability
    cat.type = CatAbilityType.FAIRY;
  }
  const borderColor = useMemo(() => cardsBorderColor[cat.type], [cat.type]);
  const typeIcon = useMemo(() => cardsIcon[cat.type], [cat.type]);

  return (
    <>
      {/* Fills its grid cell up to 180 px; the card inside scales in cqw, so any width works. */}
      <div className="flex flex-col items-center tails-card-mini-wrapper mx-auto w-full max-w-[180px] group">
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="animate-opacity cursor-pointer block w-full"
        >
          <CardWrapper
            tier={cat.tier}
            catType={cat.type}
            isBackSide={true}
            style={MINI_CARD_STYLE}
          >
            <div className="relative w-full h-full">
              {/* Custom mini card back without power section */}
              <div className="w-full h-full relative">
                {cat.blessing?.catAvatar?.url || !cat.catImg ? (
                  <img
                    draggable={false}
                    src={
                      cat.blessing?.catAvatar?.url ||
                      cdnFile("cards/backgrounds/card-placeholder.webp")
                    }
                    alt=""
                    className="opacity-90 w-full h-full object-cover"
                  />
                ) : (
                  // A starter cat has no card art: show its own pixel sprite, not the generic logo.
                  <span className="flex h-full w-full items-end justify-center bg-gradient-to-b from-tt-dusk-top via-tt-dusk-mid to-tt-dusk-horizon pb-[12%]">
                    <img
                      draggable={false}
                      src={cat.catImg}
                      alt=""
                      className="pixelated w-[70%] h-auto object-contain"
                      data-testid="mini-card-sprite"
                    />
                  </span>
                )}

                {/* Cat name and type icon, sized in cqw like the rest of the card (the
                    values keep the look this mini card was drawn at, 144 px wide). */}
                <div className="absolute top-[4%] left-[5%] flex items-center gap-[4.2cqw] z-10">
                  <div
                    className="w-[13.9cqw] h-[13.9cqw] rounded-full flex items-center justify-center"
                    style={{ backgroundColor: borderColor }}
                  >
                    <img
                      draggable={false}
                      src={typeIcon}
                      alt={cat.type}
                      className="object-contain w-[11.1cqw] h-[11.1cqw]"
                    />
                  </div>
                  <span
                    className={`text-black font-bold ${nameFont(catName(cat))} text-[length:8.3cqw] leading-none [text-shadow:0.7cqw_0.7cqw_1.4cqw_rgba(0,0,0,0.3)]`}
                    style={{
                      WebkitTextStroke: `0.35cqw ${borderColor}`,
                    }}
                  >
                    {catName(cat)}
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
