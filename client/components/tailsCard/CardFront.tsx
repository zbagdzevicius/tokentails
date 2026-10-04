import {
  BlessingStatusTexts,
  IBlessing,
  ICat,
  cardsBorderColor,
} from "@/models/cats";
import { catName } from "@/components/shelter-payouts/pinkPaw";
import { nameFont } from "@/lib/glyphs";
import { plainText } from "@/lib/plainText";
import React, { useMemo } from "react";

type CardFrontProps = {
  cat: ICat;
  blessing: IBlessing;
};

export const CardFront: React.FC<CardFrontProps> = React.memo(
  ({ cat, blessing }) => {
    const borderColor = useMemo(() => cardsBorderColor[cat.type], [cat.type]);
    const imageUrl = useMemo(
      () => blessing?.image?.url || cat.catImg,
      [blessing?.image?.url, cat.catImg],
    );
    const imageAlt = useMemo(
      () => blessing?.name || cat.name,
      [blessing?.name, cat.name],
    );
    // Shelters type names in any case ("meilyte", "JUDAS"); show them as the payout pages do.
    const displayName = useMemo(
      () => catName({ name: cat.name, blessing: { name: blessing?.name } }),
      [blessing?.name, cat.name],
    );
    const description = useMemo(
      // Plain text only: shelter-entered descriptions have carried pasted page markup, and they
      // are never rendered as HTML. Storefront and test cats can come without a rescue story.
      () => plainText(blessing?.description || cat.resqueStory || ""),
      [blessing?.description, cat.resqueStory],
    );

    const shelterName = cat.shelter?.name || "";

    return (
      <div className="w-[88%] h-[93%] flex flex-col">
        <div className="flex-1 flex flex-col p-[3.5%]">
          <div className="flex justify-between items-center mb-[2.5%] gap-[2cqw]">
            <h2 className={`font-normal text-black drop-shadow-md flex-1 leading-tight ${nameFont(displayName)} text-[length:7cqw]`}>
              {displayName}
            </h2>
            <div className="relative">
              {cat.shelter?.image?.url && (
                <div className="absolute inset-0 opacity-50 flex items-center">
                  <img
                    src={cat.shelter?.image?.url}
                    draggable={false}
                    className="object-contain w-full h-3/4 m-auto"
                  />
                </div>
              )}
              <img
                draggable={false}
                src={`/flags/${
                  cat.shelter?.country?.toLowerCase() || "lt"
                }.webp`}
                alt="Country Flag"
                className="object-cover border-[0.5cqw] border-white rounded-[2cqw] flex-shrink-0 h-[8cqw] w-auto"
              />
            </div>
          </div>

          <div className="relative border-b-[0.5cqw] border-[#00000040] w-full aspect-[5/3] rounded-[3cqw] overflow-hidden mb-[4.5%] shadow-xl flex-shrink-0">
            <img
              draggable={false}
              src={imageUrl}
              alt={imageAlt}
              className="object-cover object-top w-full h-full"
            />
            <div
              className="absolute inset-0 opacity-50"
              style={{ backgroundColor: borderColor }}
            />
            <div className="absolute inset-[0.5cqw] rounded-[2.5cqw] overflow-hidden">
              <img
                draggable={false}
                src={imageUrl}
                alt={imageAlt}
                className={`object-cover w-full h-full scroll-image-animation ${
                  blessing ? "" : "pixelated"
                }`}
              />
            </div>
          </div>

          <div className="flex justify-between mb-[4.5%]">
            <div>
              <h3 className="text-black mb-[0.5cqw] leading-tight font-primary text-[length:5.5cqw]">
                Shelter
              </h3>
              <p className="text-black leading-tight font-bold text-[length:3cqw]">
                {shelterName || "Unknown"}
              </p>
            </div>
            <div>
              <h3 className="text-black mb-[0.5cqw] leading-tight font-primary text-[length:5.5cqw]">
                Status
              </h3>
              <p className="text-black leading-tight font-bold text-[length:3cqw]">
                {blessing?.status
                  ? BlessingStatusTexts[blessing?.status]
                  : "Adopted"}
              </p>
            </div>
          </div>

          {/* No story (or only markup that strips to nothing): no empty "Pet Story" heading. */}
          {description.trim().length > 0 && (
            <>
              <div
                className="mb-[4.5%] rounded-full border-b-[0.5cqw] border-[#00000060] h-[1.25cqw]"
                style={{ backgroundColor: borderColor }}
              ></div>

              <div className="flex-1 min-h-0">
                <h3 className="text-black mb-[0.5cqw] leading-tight font-primary text-[length:5.5cqw]">
                  Pet Story
                </h3>
                <div className="text-black leading-snug overflow-hidden font-bold text-[length:3cqw]">
                  <p className="line-clamp-6">{description}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  },
);
