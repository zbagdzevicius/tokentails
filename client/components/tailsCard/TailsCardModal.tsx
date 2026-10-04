import { GameModal } from "@/components/ui/GameModal";
import { ICat } from "@/models/cats";
import clsx from "clsx";
import React, { useMemo, type CSSProperties } from "react";
import { Countdown } from "../shared/Countdown";
import { ModalButton, StatusPill } from "@/components/ui/modal";
import { TailsCard } from "./TailsCard";
import { CAT_NAP_DAYS, CAT_NAP_MAX_CATS, CAT_NAP_TAILS, formatTails } from "@/shared-contracts/copy";

interface IProps extends ICat {
  onClose?: () => void;
  showSelect?: boolean;
  showStake?: boolean;
  profileCatId?: string;
  onSelect?: (cat: ICat) => void;
  onStake?: (cat: ICat) => void;
  onStakeRewards?: (cat: ICat) => void;
  /** Extra actions beside the card (the Shelter's shelter-cat offer). */
  children?: React.ReactNode;
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
  children,
  ...catData
}) => {
  const hasActions = showSelect || showStake || !!children;
  const isSelected = useMemo(() => profileCatId === catData._id, [profileCatId, catData._id]);

  const isStaked = !!catData.staked;
  const canClaimRewards = isStaked && catData.staked && new Date(catData.staked).getTime() < new Date().getTime();

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
          "flex flex-col items-center justify-center gap-4 p-2 pr-6 pt-6 md:flex-row md:gap-12 md:p-4",
          // The card's own size is 90vw up to 400 px at 17:23, taller than a landscape phone or
          // a short laptop. Cap it by the viewport height too (minus safe areas, the padding and,
          // in the phone column, the buttons under it), so the whole card shows without scrolling.
          hasActions
            ? "[--tt-card-w:min(84vw,400px,calc((100dvh-372px-env(safe-area-inset-top)-env(safe-area-inset-bottom))*17/23))]"
            : "[--tt-card-w:min(84vw,400px,calc((100dvh-120px-env(safe-area-inset-top)-env(safe-area-inset-bottom))*17/23))]",
          "md:[--tt-card-w:min(400px,calc((100dvh-96px-env(safe-area-inset-top)-env(safe-area-inset-bottom))*17/23))]"
        )}
      >
        {/* Phones: 24 px more on top, so the outside X sits clear of the card's flip badge. */}
        <div className="flex-shrink-0 max-md:mt-6">
          {/* Opens on the cat (not the logo side): the player came to see this cat, or to buy it. */}
          <TailsCard cat={catData} cardStyle={CARD_STYLE} initialFlipped={false} />
        </div>

        {hasActions && (
          <div
            data-testid="tails-card-actions"
            // Above the card's glow and paw particles, which spill past the card's box.
            className="relative z-10 flex w-[min(84vw,20rem)] flex-col items-stretch gap-3 md:w-[18rem]"
          >
            {(showSelect || showStake) && (
              <div className="bg-tt-night-900">
                <div className="tt-card flex flex-col gap-3 p-3 md:p-4">
                  {showSelect && (
                    <div className="flex flex-col gap-1.5">
                      {isSelected ? (
                        <StatusPill tone="mint" icon="check" className="self-start">
                          Your cat now
                        </StatusPill>
                      ) : (
                        <ModalButton variant="primary" icon="paw" fullWidth onClick={() => onSelect?.(catData)}>
                          USE
                        </ModalButton>
                      )}
                      <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">
                        {isSelected
                          ? "This cat walks the lobby and plays your games."
                          : "Make this the cat that walks the lobby and plays your games."}
                      </p>
                    </div>
                  )}

                  {showSelect && showStake && <span aria-hidden="true" className="h-[2px] bg-tt-night-500/70" />}

                  {showStake && (
                    <div className="flex flex-col gap-1.5">
                      {!isStaked && (
                        <ModalButton
                          variant={isSelected || !showSelect ? "primary" : "secondary"}
                          icon="coins"
                          fullWidth
                          trailing={`+${formatTails(CAT_NAP_TAILS)}`}
                          onClick={() => onStake?.(catData)}
                        >
                          Cat nap
                        </ModalButton>
                      )}
                      {isStaked &&
                        (canClaimRewards ? (
                          <ModalButton
                            variant="primary"
                            icon="sparkles"
                            fullWidth
                            className="tt-claim-glow"
                            trailing={`+${formatTails(CAT_NAP_TAILS)}`}
                            onClick={() => onStakeRewards?.(catData)}
                          >
                            Wake up
                          </ModalButton>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <StatusPill tone="sky" icon="calendar">
                              Napping
                            </StatusPill>
                            {catData.staked && (
                              <div className="flex flex-col gap-1">
                                <span className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">
                                  Wakes up in
                                </span>
                                <Countdown isDaysDisplayed targetDate={new Date(catData.staked)} />
                              </div>
                            )}
                          </div>
                        ))}
                      <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">
                        {isStaked
                          ? canClaimRewards
                            ? `Your cat is rested. Wake it up to collect ${formatTails(CAT_NAP_TAILS)}.`
                            : `Napping cats earn ${formatTails(CAT_NAP_TAILS)} when they wake up.`
                          : `The cat sleeps for ${CAT_NAP_DAYS} days, then brings ${formatTails(
                              CAT_NAP_TAILS
                            )}. Up to ${CAT_NAP_MAX_CATS} cats can nap at once.`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {children}
          </div>
        )}
      </div>
    </GameModal>
  );
};
