import { TailsCardPack } from "@/components/tailsCard/TailsCardPack";
import { GameModal } from "@/components/ui/GameModal";
import { cdnFile } from "@/constants/utils";
import { ICat } from "@/models/cats";
import { ART_PANEL_FULL_WIDTH, ART_PANEL_MAX_HEIGHT } from "./WheelModal";

/**
 * An unopened pack from MY PETS, opened over the Cats modal (nested layer). The card table is the
 * art, so the `art` surface; the X hangs off the table's corner.
 */
export const PackModal = ({ close, cat }: { close: () => void; cat: ICat }) => {
  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={`${cat.packType || "Card"} pack`}
      name="pack"
      surface="art"
      size="full"
      layer="modal-nested"
      className={`!h-auto ${ART_PANEL_FULL_WIDTH}`}
    >
      <div
        data-testid="pack-panel"
        className="relative isolate flex justify-center overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border-4 border-tt-gold-500"
        style={{
          height: ART_PANEL_MAX_HEIGHT,
          backgroundImage: `url(${cdnFile("landing/card-bg.webp")})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <TailsCardPack cat={cat} packType={cat.packType} />
      </div>
    </GameModal>
  );
};
