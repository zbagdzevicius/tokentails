import { ICat, Tier } from "@/models/cats";
import React, { useMemo } from "react";
import { CloseButton } from "../shared/CloseButton";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { TailsCard } from "./TailsCard";
import { cdnFile } from "@/constants/utils";

interface IProps extends ICat {
  onClose?: () => void;
  showSelect?: boolean;
  showStake?: boolean;
  profileCatId?: string;
  onSelect?: (cat: ICat) => void;
  onStake?: (cat: ICat) => void;
  onStakeRewards?: (cat: ICat) => void;
}

const getTailsCraft = (cat: ICat) => {
  if (!cat.blessing) {
    return 10;
  }
  if (cat.tier === Tier.COMMON) {
    return 100;
  }
  if (cat.tier === Tier.RARE) {
    return 500;
  }
  if (cat.tier === Tier.EPIC) {
    return 2000;
  }
  if (cat.tier === Tier.LEGENDARY) {
    return 10000;
  }
  return 10;
};

export const TailsCardModal: React.FC<IProps> = ({
  onClose,
  showSelect = false,
  showStake = false,
  profileCatId,
  onSelect,
  onStake,
  onStakeRewards,
  ...catData
}) => {
  const isSelected = useMemo(
    () => profileCatId === catData._id,
    [profileCatId, catData._id]
  );

  const isStaked = !!catData.staked;
  const canClaimRewards =
    isStaked &&
    catData.staked &&
    new Date(catData.staked).getTime() < new Date().getTime();

  return (
    <div
      className="flex justify-center w-full h-full fixed top-0 left-0 z-[101]"
      style={{
        backgroundImage: `url(${cdnFile("landing/card-bg.webp")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 z-0" onClick={() => onClose?.()}></div>
      <CloseButton absolute onClick={() => onClose?.()} />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-center h-full lg:gap-8 p-4">
        <div className="flex-shrink-0 md:scale-[0.65] lg:scale-100">
          <TailsCard cat={catData} />
        </div>

        {/* Action buttons section */}
        {(showSelect || showStake) && (
          <div className="flex flex-col items-center gap-2 md:gap-4">
            {/* Select button */}
            {showSelect && (
              <PixelButton
                active={isSelected}
                text={isSelected ? "IN-USE" : "USE"}
                onClick={() => onSelect?.(catData)}
              />
            )}

            {/* Stake functionality */}
            {showStake && (
              <>
                {!isStaked && (
                  <PixelButton
                    text={`CRAFT ${getTailsCraft(catData)} $TAILS`}
                    onClick={() => onStake?.(catData)}
                  />
                )}
                {isStaked && (
                  <>
                    {canClaimRewards ? (
                      <PixelButton
                        text="CLAIM REWARDS"
                        onClick={() => onStakeRewards?.(catData)}
                      />
                    ) : (
                      <div>
                        <Tag>Crafting</Tag>
                        {catData.staked && (
                          <Countdown
                            isDaysDisplayed
                            targetDate={new Date(catData.staked)}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
