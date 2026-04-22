import {
  BlessingStatusTexts,
  IBlessing,
  ICat,
  cardsBorderColor
} from '@/models/cats';
import React, { useMemo } from 'react';

type CardFrontProps = {
  cat: ICat;
  blessing: IBlessing;
};

export const CardFront: React.FC<CardFrontProps> = React.memo(
  ({ cat, blessing }) => {
    const borderColor = useMemo(() => cardsBorderColor[cat.type], [cat.type]);
    const imageUrl = useMemo(
      () => blessing?.image?.url || cat.catImg,
      [blessing?.image?.url, cat.catImg]
    );
    const imageAlt = useMemo(
      () => blessing?.name || cat.name,
      [blessing?.name, cat.name]
    );
    const displayName = useMemo(
      () => blessing?.name || cat.name,
      [blessing?.name, cat.name]
    );
    const description = useMemo(
      () => blessing?.description || cat.resqueStory?.replace(/<[^>]*>/g, ''),
      [blessing?.description, cat.resqueStory]
    );

    const shelterName = cat.shelter?.name || '';

    return (
      <div className="w-[88%] h-[93%] flex flex-col">
        <div className="flex-1 flex flex-col p-[3.5%]">
          <div className="flex justify-between items-center mb-[2.5%] gap-2">
            <h2 className="font-normal text-black drop-shadow-md flex-1 leading-tight font-primary text-[clamp(18px,4.5vw,28px)]">
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
                  cat.shelter?.country?.toLowerCase() || 'lt'
                }.webp`}
                alt="Country Flag"
                className="object-cover border-2 border-white rounded-[8px] flex-shrink-0 h-8 w-auto"
              />
            </div>
          </div>

          <div className="relative border-b-2 border-[#00000040] w-full aspect-[5/3] rounded-[12px] overflow-hidden mb-[4.5%] shadow-xl flex-shrink-0">
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
            <div className="absolute inset-[2px] rounded-[10px] overflow-hidden">
              <img
                draggable={false}
                src={imageUrl}
                alt={imageAlt}
                className={`object-cover w-full h-full scroll-image-animation ${
                  blessing ? '' : 'pixelated'
                }`}
              />
            </div>
          </div>

          <div className="flex justify-between mb-[4.5%]">
            <div>
              <h3 className="text-black mb-0.5 leading-tight font-primary text-[clamp(12px,3vw,22px)]">
                Shelter
              </h3>
              <p className="text-black leading-tight font-tertiary font-bold text-[clamp(11px,2.5vw,13px)]">
                {shelterName || 'Unknown'}
              </p>
            </div>
            <div>
              <h3 className="text-black mb-0.5 leading-tight font-primary text-[clamp(12px,3vw,22px)]">
                Status
              </h3>
              <p className="text-black leading-tight font-tertiary font-bold text-[clamp(11px,2.5vw,13px)]">
                {blessing?.status
                  ? BlessingStatusTexts[blessing?.status]
                  : 'Adopted'}
              </p>
            </div>
          </div>

          <div
            className="mb-[4.5%] rounded-full border-b-2 border-[#00000060] h-[5px]"
            style={{ backgroundColor: borderColor }}
          ></div>

          <div className="flex-1 min-h-0">
            <h3 className="text-black mb-0.5 leading-tight font-primary text-[clamp(14px,3.5vw,22px)]">
              Pet Story
            </h3>
            <div className="text-black leading-snug overflow-hidden font-tertiary font-bold text-[clamp(10px,2.2vw,13px)]">
              <p
                className="line-clamp-6"
                dangerouslySetInnerHTML={{ __html: description }}
              ></p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
