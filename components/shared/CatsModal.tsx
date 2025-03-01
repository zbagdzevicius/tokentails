import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { ICat } from "@/models/cats";
import { GameType } from "@/models/game";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CatCardModal, getMultiplier } from "../CatCardModal";
import { GameEvents } from "../Phaser/events";
import { Web3Providers } from "../web3/Web3Providers";
import { CloseButton } from "./CloseButton";
import { Countdown } from "./Countdown";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { CAT_API } from "@/api/cat-api";

const weekInMs = 604800000;

export const CatsModalContent = ({ close }: { close: () => void }) => {
  const [selectedCat, setSelectedCat] = useState<ICat | null>(null);

  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();

  const { setGameType } = useGame();
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

    toast({ message: "Cat selected successfully!" });
    if (cat?.status?.EAT !== MAX_CAT_STATUS) {
      setGameType(GameType.HOME);
    }
    close();
  };
  const handleCloseModal = () => {
    setSelectedCat(null);
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
      <Tag>MY CATS</Tag>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4 pt-2">
        Here you can switch your main cat
      </h2>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4 mb-4">
        Earn coins to Adopt more cats in the shelter
      </h2>
      <div className="flex flex-wrap justify-center">
        {mutatedCats?.map((cat) => (
          <div
            key={cat._id}
            className="w-1/2 md:w-1/3 flex justify-center mb-4"
          >
            <div className="relative overflow-hidden w-36 rounded-xl py-2 border-2 border-black">
              <div className="absolute left-2 top-1 opacity-75 text-black px-2 text-p5 font-secondary rounded-xl bg-yellow-300 z-20">
                X{getMultiplier(cat)}
              </div>
              <div className="relative z-10 items-center flex flex-col">
                <img
                  className="w-16 z-10 pixelated"
                  src={cat.catImg}
                  alt={cat.name}
                  onClick={() => setSelectedCat(cat)}
                />
                <img
                  className="w-8 mb-2 -mt-8 z-0 animate-spin"
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
                  <div className="-mb-2">
                    <PixelButton
                      isSmall
                      text="STAKE TO CRAFT"
                      onClick={() => onStakeCat(cat)}
                    />
                  </div>
                )}
                {cat.staked && (
                  <>
                    <Countdown
                      isDaysDisplayed
                      targetDate={new Date(cat.staked)}
                    />
                    {new Date(cat.staked).getTime() < new Date().getTime() ? (
                      <div className="-my-2">
                        <PixelButton
                          isSmall
                          text="CLAIM REWARDS"
                          onClick={() => onStakeRewards(cat)}
                        />
                      </div>
                    ) : (
                      <span className="-mb-1">
                        <Tag isSmall>Crafting</Tag>
                      </span>
                    )}
                  </>
                )}
              </div>
              <img
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
      <div className="m-auto z-50 rem:w-[350px] md:w-[600px] max-w-full bg-gradient-to-b from-yellow-300 to-purple-300 absolute inset-0 max-h-screen overflow-y-auto rounded-xl shadow h-fit">
        <CatsModalContent close={close} />
        <CloseButton onClick={close} />
      </div>
    </div>
  );
};
