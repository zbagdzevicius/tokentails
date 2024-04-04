import { CatGame } from "@/components/catGame/CatGame";
import ModalCard from "@/components/modalCard/ModalCard";
import { useMyCats } from "@/components/web3/minting/MyCats";
import { ICat } from "@/models/cats";
import { useState } from "react";

export default function Select() {
  const [selectedCat, setSelectedCat] = useState<any>(null);

  const { isConnected, isReady, cats } = useMyCats();

  const handleCatClick = (cat: Partial<ICat>) => {
    setSelectedCat(cat);
  };

  const handleCloseModal = () => {
    setSelectedCat(null);
  };

  return (
    <div className="max-h-screen max-w-screen overflow-hidden relative">
      <div className="flex items-center justify-around fixed top-0 left-0 right-0 z-10 bg-green-700 h-12">
        <div className="flex items-center gap-4">
          <a href="/adopt">
            <button
              className="[clip-path:polygon(0%_0%,100%_0%,92%_100%,0%_100%)]
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-36 h-8 max-lg:w-24"
            >
              <span className="text-center text-lg max-lg:text-xs leading-4 font-primary">
                ADOPT A CAT
              </span>
            </button>
          </a>
          <div className="font-primary">MY CATS</div>
        </div>
        <w3m-button />
      </div>
      {isReady && isConnected ? (
        <CatGame cats={cats} onClickCallback={handleCatClick} />
      ) : (
        <div className="pt-40 font-bold fixed inset-0 text-center">
          Cats are loading...
        </div>
      )}
      {selectedCat && <ModalCard onClose={handleCloseModal} {...selectedCat} />}
    </div>
  );
}
