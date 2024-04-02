"use client";

import { CatGame } from "@/components/catGame/CatGame";
import ModalCard from "@/components/modalCard/ModalCard";
import { CatConsts } from "@/models/cats";
import { useState } from "react";

export default function Connect() {
  const [selectedCat, setSelectedCat] = useState<any>(null);

  const handleCatClick = (cat: {
    id: number;
    img: string;
    ability: string;
  }) => {
    setSelectedCat(cat);
  };

  const handleCloseModal = () => {
    setSelectedCat(null);
  };

  return (
    <div className="max-h-screen max-w-screen overflow-hidden relative">
      <div className="flex items-center justify-around fixed top-0 left-0 right-0 z-10 bg-green-700">
        <div className="flex items-center gap-4">
          <div className="font-primary">ADOPT A CAT</div>
          <a href="select">
            <button
              className="[clip-path:polygon(0%_0%,100%_0%,92%_100%,0%_100%)]
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-36 h-8 max-lg:w-24"
            >
              <span className="text-center text-lg max-lg:text-xs leading-4 font-primary">
                My Cats
              </span>
            </button>
          </a>
        </div>
        <w3m-button />
      </div>
      <CatGame catConsts={CatConsts} onClickCallback={handleCatClick} />
      {selectedCat && (
        <ModalCard
          onClose={handleCloseModal}
          img={selectedCat.img}
          name={selectedCat.name}
          ability={selectedCat.ability}
          resqueStory={selectedCat.story}
          isPlayable={selectedCat.isPlayable}
          isMintable={true}
          catHp={100}
        />
      )}
    </div>
  );
}
