import { GameModal } from "@/components/ui/GameModal";
import { ICat } from "@/models/cats";
import clsx from "clsx";
import React, { useMemo, type CSSProperties } from "react";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { TailsCard } from "./TailsCard";
import { CAT_NAP_TAILS, formatTails } from "@/shared-contracts/copy";

interface IProps extends ICat {
  onClose?: () => void;
  showSelect?: boolean;
  showStake?: boolean;
  profileCatId?: string;
  onSelect?: (cat: ICat) => void;
  onStake?: (cat: ICat) => void;
  onStakeRewards?: (cat: ICat) => void;
}

/** The card follows `--tt-card-w`, set on the modal's layout below; the 17:23 ratio stays. */
const CARD_STYLE: CSSProperties = { width: "var(--tt-card-w)", maxWidth: "none" };

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
    // The card is the art, so the `art` surface: no frame, the X hangs off the card area's corner.
    // Nested layer: it opens from the Cats modal and from the Shelter scene's NPC tap.
    <GameModal
      open
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
      title={catData.name || "Cat card"}
      name="tails-card"
      surface="art"
      size="lg"
      layer="modal-nested"
      // Shrink-wrap the card and its buttons, so the outside X hangs off the card area's corner.
      className="!w-fit max-w-full"
      // No overflow clip: the card tilts in 3D and glows past its box. It is sized to the
      // viewport below, so nothing needs to scroll.
    >
      <div
        className={clsx(
          // Phones: 24 px top and right padding so the outside X (only an 8 px overhang there)
          // clears the card's top-right corner and its sparkle instead of covering them.
          "flex flex-col items-center justify-center gap-4 p-2 pr-6 pt-6 md:flex-row md:gap-8 md:p-4",
          // The card's own size is 90vw up to 400 px at 17:23, taller than a landscape phone or
          // a short laptop. Cap it by the viewport height too (minus safe areas, the padding and,
          // in the phone column, the buttons under it), so the whole card shows without scrolling.
          showSelect || showStake
            ? "[--tt-card-w:min(84vw,400px,calc((100dvh-276px-env(safe-area-inset-top)-env(safe-area-inset-bottom))*17/23))]"
            : "[--tt-card-w:min(84vw,400px,calc((100dvh-96px-env(safe-area-inset-top)-env(safe-area-inset-bottom))*17/23))]",
          "md:[--tt-card-w:min(400px,calc((100dvh-96px-env(safe-area-inset-top)-env(safe-area-inset-bottom))*17/23))]"
        )}
      >
        <div className="flex-shrink-0">
          <TailsCard cat={catData} cardStyle={CARD_STYLE} />
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
                    text={`CAT NAP: +${formatTails(CAT_NAP_TAILS)}`}
                    onClick={() => onStake?.(catData)}
                  />
                )}
                {isStaked && (
                  <>
                    {canClaimRewards ? (
                      <PixelButton
                        text="WAKE UP: COLLECT"
                        onClick={() => onStakeRewards?.(catData)}
                      />
                    ) : (
                      <div>
                        <Tag>Napping</Tag>
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
    </GameModal>
  );
};
