import { CAT_API } from "@/api/cat-api";
import { useProfile } from "@/context/ProfileContext";
import { ICat } from "@/models/cats";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CatCardModal } from "../catCard/CatCardModal";
import { Web3Providers } from "../web3/Web3Providers";
import { CatMiniCard } from "./CatMiniCard";
import { CloseButton } from "./CloseButton";
import { Tag } from "./Tag";
import { GameModal } from "@/models/game";
import { useGame } from "@/context/GameContext";
import { bgStyle } from "@/constants/utils";

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
    <div className="px-4 pt-4 pb-8 md:px-16 flex flex-col justify-between items-center animate-appear">
      <Tag>CATS IN NEED</Tag>

      <div className="flex flex-wrap justify-center w-full gap-8 mt-8">
        {catsForSale?.["rozine-pedute"]?.map((cat) => (
          <CatMiniCard
            key={cat._id}
            cat={cat}
            hideBenefits
            onClick={() => setSelectedCat(cat)}
          />
        ))}
      </div>

      {selectedCat && (
        <Web3Providers>
          <CatCardModal onClose={handleCloseModal} {...selectedCat} />
        </Web3Providers>
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
