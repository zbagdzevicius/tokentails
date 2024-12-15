import { catsForSaleFetch } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CatCard, CatCardModal } from "../CatCardModal";
import { CatGame } from "../CatGame";
import { PixelButton } from "../shared/PixelButton";
import { CatType } from "@/models/cats";

const catTypeNote: Record<
  CatType,
  { title: string; description: string; note: string }
> = {
  [CatType.REGULAR]: {
    title: "UP TO X3 REWARDS",
    description: "CAN BE ADOPTED USING EARNED COINS",
    note: "UNLIMITED SUPPLY",
  },
  [CatType.BLESSED]: {
    title: "UP TO X10 REWARDS",
    description: "LINKED WITH A REAL CAT, ADOPT TO SAVE",
    note: "INDIVIDUAL",
  },
  [CatType.EXCLUSIVE]: {
    title: "UP TO X5 REWARDS",
    description: "HANDCRAFTED FOR EVENTS",
    note: "LIMITED SUPPLY",
  },
};

function Adopt() {
  const [selectedCat, setSelectedCat] = useState<any>(null);
  const { profile } = useProfile();
  const [catType, setCatType] = useState<CatType>(CatType.BLESSED);
  const { data: cats, isLoading } = useQuery({
    queryKey: ["sale", profile?.cats, catType],
    queryFn: () => catsForSaleFetch(catType),
  });
  const handleCloseModal = () => {
    setSelectedCat(null);
  };

  return (
    <>
      <CatGame
        cats={cats || []}
        catType={catType}
        onClickCallback={setSelectedCat}
      />
      {selectedCat && (
        <CatCardModal
          onClose={handleCloseModal}
          {...selectedCat}
          isMintable={true}
        />
      )}

      <span className="absolute top-4 flex flex-col gap-4 left-1/2 -translate-x-1/2">
        <div className="flex gap-4 justify-center">
          <PixelButton
            text={CatType.REGULAR}
            onClick={() => setCatType(CatType.REGULAR)}
            active={catType === CatType.REGULAR}
          ></PixelButton>
          <PixelButton
            text={CatType.BLESSED}
            onClick={() => setCatType(CatType.BLESSED)}
            active={catType === CatType.BLESSED}
          ></PixelButton>
          {/* <PixelButton
            text={CatType.EXCLUSIVE}
            onClick={() => setCatType(CatType.EXCLUSIVE)}
            active={catType === CatType.EXCLUSIVE}
          ></PixelButton> */}
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">
            <div className="text-p4 bg-gradient-to-r px-4 from-purple-400 to-blue-400 text-white rounded-full font-secondary w-fit">
              {catTypeNote[catType].title}
            </div>
            <div className="text-p4 bg-gradient-to-r px-4 from-purple-400 to-blue-400 text-white rounded-full font-secondary w-fit">
              {catTypeNote[catType].note}
            </div>
          </div>
          <div className="text-p4 bg-gradient-to-r px-4 from-purple-400 to-blue-400 text-white rounded-full font-secondary w-fit">
            {catTypeNote[catType].description}
          </div>
          {!isLoading && !cats?.length && (
            <PixelButton isDisabled active text="OUT OF CATS, COME BACK ALTER"></PixelButton>
          )}
        </div>
      </span>
    </>
  );
}

export default Adopt;
