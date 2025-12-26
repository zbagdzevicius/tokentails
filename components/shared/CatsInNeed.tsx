import { CAT_API } from "@/api/cat-api";
import { bgStyle } from "@/constants/utils";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { ICat } from "@/models/cats";
import { GameModal } from "@/models/game";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TailsCardModal } from "../tailsCard/TailsCardModal";
import { CloseButton } from "./CloseButton";
import { Tag } from "./Tag";
import { MarketplaceItem } from "../marketplace/MarketplaceItem";

export const CatsInNeedModalContent = ({ close }: { close: () => void }) => {
  const { profile } = useProfile();
  const [selectedCat, setSelectedCat] = useState<ICat | null>(null);
  const { setOpenedModal } = useGame();

  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale", profile?._id],
    queryFn: () => CAT_API.catsForSale(),
  });

  const handleCloseModal = (gameModal?: GameModal) => {
    setSelectedCat(null);
    if (gameModal) {
      setOpenedModal(gameModal);
    }
  };

  return (
    <div className=" pt-4 pb-8 flex flex-col justify-between items-center animate-appear">
      <div className="font-paws text-h5 md:text-h2 mt-4">CATS IN NEED</div>

      <div className="flex flex-wrap justify-center w-full gap-8 mt-8 px-4 md:px-16">
        {catsForSale?.["rozine-pedute"]?.map((cat, key) => (
          <MarketplaceItem
            key={key}
            cat={cat}
            onClick={() => setSelectedCat(cat)}
          />
        ))}
      </div>

      {selectedCat && (
        <TailsCardModal
          onClose={() => handleCloseModal()}
          {...selectedCat}
        />
      )}
    </div>
  );
};

export const CatsInNeedModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div
        className="m-auto z-50 rem:w-[350px] md:w-[600px] max-w-full absolute inset-0 max-h-screen overflow-y-auto rounded-xl shadow"
        style={bgStyle("5")}
      >
        <CloseButton onClick={close} />
        <CatsInNeedModalContent close={close} />
      </div>
    </div>
  );
};
