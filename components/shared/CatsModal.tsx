import { catsFetch, setActiveCat } from "@/constants/api";
import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { ICat } from "@/models/cats";
import { GameType } from "@/models/game";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CatCardModal, getMultiplier } from "../CatCardModal";
import { GameEvents } from "../Phaser/events";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Web3Providers } from "../web3/Web3Providers";

export const CatsModalContent = ({ close }: { close: () => void }) => {
  const [selectedCat, setSelectedCat] = useState<ICat | null>(null);

  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();

  const multiplier = useMemo(() => getMultiplier(selectedCat), [selectedCat]);

  const { setGameType } = useGame();
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => catsFetch(),
  });

  const onCatSelect = (cat: ICat) => {
    const isSameCat = profile?.cat._id === cat._id;
    if (isSameCat || !cat) {
      toast({ message: "This cat is already selected" });
      return;
    }
    setProfileUpdate({ cat });
    setActiveCat(cat._id!);

    GameEvents.CAT_SPAWN.push({ cat });

    toast({ message: "Cat selected successfully!" });
    if (cat?.status?.EAT !== MAX_CAT_STATUS) {
      setGameType(GameType.HOME);
    }
    close();
  };
  const handleCloseModal = () => {
    setSelectedCat(null);

  };

  return (
    <div className="px-4 pt-4 pb-8 md:px-16 flex flex-col justify-between items-center animate-appear">
      <h2 className="text-center font-secondary uppercase tracking-tight text-8xl max-lg:text-5xl max-lg:text-balance">
        My Cats
      </h2>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4">
        Here you can switch your main cat
      </h2>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4 mb-6">
        Earn coins to Adopt more cats in the shelter
      </h2>
      <div className="flex flex-wrap justify-center">
        {cats?.map((cat) => (
          <div key={cat._id} className="w-1/2 flex justify-center mb-4">
            <div
              className="relative overflow-hidden w-36 rounded-xl py-2 border-2 border-black"
              onClick={() => setSelectedCat(cat)}
            >
              <div className="absolute left-2 top-1 opacity-75 text-black px-2 text-p5 font-secondary rounded-xl bg-yellow-300 z-20">
                X{getMultiplier(cat)}
              </div>
              <div className="relative z-10 items-center flex flex-col">
                <img className="w-16 z-10" src={cat.catImg} alt={cat.name} />
                <img
                  className="w-8 mb-2 -mt-8 z-0 animate-spin"
                  src={`ability/${cat.type}.png`}
                  alt={`${cat.type} icon`}
                />
                <div className="text-p4 bg-red-600 font-secondary text-white w-full text-center opacity-75 mb-2 border-y-2 border-black">
                  {cat.name}
                </div>
                <PixelButton
                  active={profile?.cat._id === cat._id}
                  text={profile?.cat._id === cat._id ? "Selected" : "Select"}
                  onClick={() => onCatSelect(cat)}
                />
              </div>
              <img
                className="absolute inset-0 object-cover w-full h-full z-0"
                src={`ability/${cat.type}_BG.webp`}
                alt={`${cat.type} background`}
              />
            </div>
          </div>
        ))}
      </div>

      {selectedCat && (
        <Web3Providers>
          <CatCardModal onClose={handleCloseModal} {...selectedCat} />
        </Web3Providers>
      )}

      <img
        onClick={() => {
          setGameType(GameType.SHELTER);
          close();
        }}
        className="w-full h-auto rounded-xl hover:animate-hover cursor-pointer"
        src="/game/select/shelter-wide.jpg"
        alt="Go to shelter"
      />
    </div>
  );
};

export const CatsModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-yellow-300 to-purple-300 absolute inset-0 max-h-screen overflow-y-auto rounded-lg shadow h-fit">
        <CatsModalContent close={close} />
        <CloseButton onClick={close} />
      </div>
    </div>
  );
};
