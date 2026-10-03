import { cdnFile } from "@/constants/utils";
import { GameModal as GameDialog } from "@/components/ui/GameModal";
import { EntityType } from "@/models/save";
import { useEffect, useState } from "react";
import { MysteryBoxCat } from "../mystery/MysteryBoxCat";
import { Web3Providers } from "../web3/Web3Providers";
import { Countdown } from "./Countdown";
import { PixelButton } from "./PixelButton";
import { useGame } from "@/context/GameContext";
import { GameModal } from "@/models/game";

export const InviteModalContent = () => {
  const [type, setType] = useState(EntityType.LOOT_BOX);
  const { setOpenedModal } = useGame();

  useEffect(() => {
    if (type === EntityType.PACK) {
      setOpenedModal(GameModal.PACKS);
    }
  }, [type, setOpenedModal]);

  return (
    <div className="pt-2 pb-4 text-tt-cream flex flex-col justify-between items-center animate-appear">
      <div className="py-2 flex justify-center gap-4">
        <PixelButton
          active={type === EntityType.LOOT_BOX}
          text="LOOT BOX"
          size="sm"
          onClick={() => setType(EntityType.LOOT_BOX)}
        ></PixelButton>
        <PixelButton
          active={type === EntityType.PACK}
          text="BUY CARDS PACKS"
          onClick={() => setType(EntityType.PACK)}
        ></PixelButton>
      </div>
      {type === EntityType.LOOT_BOX && (
        <Web3Providers>
          <MysteryBoxCat />
        </Web3Providers>
      )}
      {type === EntityType.PACK && (
        <div className="flex flex-col items-center justify-center animate-appear">
          <img
            src={cdnFile("tail/cat-celebrate.webp")}
            alt=""
            aria-hidden="true"
            className="w-32 -mb-4"
          />
          <Countdown size="lg" isDaysDisplayed targetDate={new Date(2026, 0, 15)} />
          <div className="text-h4 text-center font-primary mt-4">
            COMING SOON
          </div>
          <div className="text-p4 text-center font-primary -mt-2">
            STAY TUNED FOR MORE INFO ABOUT PACKS!
          </div>
        </div>
      )}
    </div>
  );
};

export const InviteModal = ({ close }: { close: () => void }) => {
  return (
    <GameDialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="SHOP"
      name="shop"
      size="md"
    >
      <InviteModalContent />
    </GameDialog>
  );
};
