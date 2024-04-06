"use client";

import { CatGame } from "@/components/catGame/CatGame";
import ModalCard from "@/components/modalCard/ModalCard";
import { CatConsts, ICat } from "@/models/cats";
import { useState } from "react";

export default function Connect() {
  const [selectedCat, setSelectedCat] = useState<any>(null);

  const handleCatClick = (cat: Partial<ICat>) => {
    setSelectedCat(cat);
  };

  const handleCloseModal = () => {
    setSelectedCat(null);
  };

  return (
    <div className="max-h-screen max-w-screen overflow-hidden relative">
      <div className="flex gap-1 md:gap-4 items-center justify-around fixed top-0 left-0 right-0 z-10 h-12">
        <a className="flex-1 flex justify-end" href="/select">
          <button
            className="
                    bg-gradient-to-r from-main-ember to-main-rusty rounded w-36 h-8 max-lg:w-24"
          >
            <span className="text-center text-p6 md:text-p5 text-white">
              MY CATS
            </span>
          </button>
        </a>
        <div className="flex justify-center items-center gap-4">
          <div className="bg-gradient-to-r text-p6 md:text-p5 from-yellow-300 to-purple-300 h-8 flex items-center px-4 rounded-md break-keep whitespace-nowrap ">
            ADOPTION CENTER
          </div>
        </div>

        <div className="flex-1">
          <div className="w-fit flex items-center bg-gradient-to-r from-main-ember to-main-black rounded-full h-8 overflow-hidden">
            <w3m-button />
          </div>
        </div>
      </div>
      <CatGame cats={CatConsts} onClickCallback={handleCatClick} />
      {selectedCat && (
        <ModalCard
          onClose={handleCloseModal}
          {...selectedCat}
          isMintable={true}
        />
      )}
    </div>
  );
}
