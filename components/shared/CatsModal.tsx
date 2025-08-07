import { CAT_API } from "@/api/cat-api";
import { getMultiplier } from "@/constants/cat-utils";
import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { cardsColor, ICat } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CatCardModal } from "../catCard/CatCardModal";
import { GameEvents } from "../Phaser/events";
import { Web3Providers } from "../web3/Web3Providers";
import { CloseButton } from "./CloseButton";
import { Countdown } from "./Countdown";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import dynamic from "next/dynamic";

const GenerateCat = dynamic(
  () => import("../catCard/GenerateCat").then((mod) => mod.GenerateCat),
  { ssr: false }
);

const weekInMs = 604800000;

export const CatsModalContent = ({ close }: { close: () => void }) => {
  const [selectedCat, setSelectedCat] = useState<ICat | null>(null);

  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();

  const { setGameType, setOpenedModal } = useGame();
  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => CAT_API.cats(),
  });
  const [mutatedCats, setMutatedCats] = useState<ICat[]>([]);
  useEffect(() => {
    if (cats?.length) {
      setMutatedCats(cats);
    }
  }, [cats]);
  const onCatSelect = (cat: ICat) => {
    const isSameCat = profile?.cat._id === cat._id;
    if (isSameCat || !cat) {
      toast({ message: "This cat is already selected" });
      return;
    }
    setProfileUpdate({ cat });
    CAT_API.setActive(cat._id!);

    GameEvents.CAT_SPAWN.push({ cat });

    toast({ message: `${cat.name} selected successfully!`, img: cat.catImg });
    if (cat?.status?.EAT !== MAX_CAT_STATUS) {
      setGameType(GameType.HOME);
    }
    close();
  };
  const handleCloseModal = (gameModal?: GameModal) => {
    setSelectedCat(null);
    if (gameModal) {
      setOpenedModal(gameModal);
    }
  };
  const setCatUpdate = (cat: ICat, update: Partial<ICat>) => {
    setMutatedCats((prev) =>
      prev.map((c) => {
        if (c._id === cat._id) {
          return { ...c, ...update };
        }
        return c;
      })
    );
  };
  const onStakeRewards = async (cat: ICat) => {
    const result = await CAT_API.stakingRedeem(cat._id!);
    if (result.success) {
      setCatUpdate(cat, { staked: null });
      const coins = 5000 * getMultiplier(cat);
      setProfileUpdate({
        catpoints: (profile?.catpoints || 0) + coins,
        monthCoinsCrafted: (profile?.monthCoinsCrafted || 0) + coins,
      });
    }
    toast({ message: result.message });
  };
  const onStakeCat = async (cat: ICat) => {
    const result = await CAT_API.stake(cat._id!);
    if (result.success) {
      setCatUpdate(cat, { staked: new Date(new Date().getTime() + weekInMs) });
    }
    toast({ message: result.message });
  };

  return (
    <div className="px-4 pt-4 pb-8 md:px-16 flex flex-col justify-between items-center animate-appear">
      <Tag>MY PETS</Tag>
      <h2 className="text-center font-secondary uppercase text-p4 md:text-p3 pt-2">
        Here you can switch your pet
      </h2>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4 mb-2">
        Earn coins to Adopt more in the shelter
      </h2>
      <PixelButton
        text="Become a Hero for Cats ♡"
        onClick={() => setOpenedModal(GameModal.CATS_IN_NEED)}
      />
      <div className="mt-1"></div>

      <Web3Providers>
        <GenerateCat close={close} />
      </Web3Providers>
      <div className="flex flex-wrap justify-center w-full">
        {mutatedCats?.map((cat) => (
          <div
            key={cat._id}
            className="w-1/2 md:w-1/3 flex justify-center mb-4"
          >
            <div
              className="relative overflow-hidden w-36 rounded-xl py-2 border-2"
              style={{ borderColor: cardsColor[cat.type] }}
            >
              <div
                style={{ backgroundColor: cardsColor[cat.type] || "white" }}
                className="absolute left-0 top-0 opacity-75 text-black pl-1 text-p5 font-secondary rounded-r-xl z-20 flex items-center"
              >
                X{getMultiplier(cat)}
                <img
                  draggable={false}
                  src="/logo/coin.webp"
                  className="w-6 h-6 ml-1"
                />
              </div>
              <div className="relative z-10 items-center flex flex-col">
                <img
                  draggable={false}
                  className="w-20 mb-2 z-10 pixelated"
                  src={cat.catImg}
                  alt={cat.name}
                  onClick={() => setSelectedCat(cat)}
                />
                <img
                  draggable={false}
                  className="w-8 -mt-8 -mb-4 z-0 animate-spin"
                  src={`ability/${cat.type}.png`}
                  alt={`${cat.type} icon`}
                />
                <div
                  className="text-p4 bg-red-600 font-secondary text-white w-full text-center opacity-75 mb-2 border-y-2 border-black"
                  onClick={() => setSelectedCat(cat)}
                >
                  {cat.name}
                </div>
                <PixelButton
                  active={profile?.cat._id === cat._id}
                  text={profile?.cat._id === cat._id ? "Selected" : "Select"}
                  onClick={() => onCatSelect(cat)}
                />
                {!cat.staked && (
                  <PixelButton
                    isSmall
                    text="CRAFT COINS"
                    onClick={() => onStakeCat(cat)}
                  />
                )}
                {cat.staked && (
                  <>
                    {new Date(cat.staked).getTime() < new Date().getTime() ? (
                      <div>
                        <PixelButton
                          isSmall
                          text="CLAIM REWARDS"
                          onClick={() => onStakeRewards(cat)}
                        />
                      </div>
                    ) : (
                      <>
                        <Countdown
                          isDaysDisplayed
                          targetDate={new Date(cat.staked)}
                        />
                        <span className="-mb-1">
                          <Tag isSmall>Crafting</Tag>
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
              <img
                draggable={false}
                className="absolute inset-0 object-cover w-full h-full z-0"
                src={`ability/${cat.type}_BG.webp`}
                alt={`${cat.type} background`}
                onClick={() => setSelectedCat(cat)}
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
        draggable={false}
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
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div
        className="m-auto z-50 rem:w-[350px] md:w-[600px] max-w-full absolute inset-0 max-h-screen overflow-y-auto rounded-xl shadow"
        style={{
          backgroundImage: "url('/backgrounds/bg-5.webp')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <CloseButton onClick={close} />
        <CatsModalContent close={close} />
      </div>
    </div>
  );
};
