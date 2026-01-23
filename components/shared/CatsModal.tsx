import { CAT_API } from "@/api/cat-api";
import { bgStyle } from "@/constants/utils";
import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { ICat } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import { PackType } from "@/models/order";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GameEvents } from "../Phaser/events";
import { TailsCardMini } from "../tailsCard/TailsCardMini";
import { TailsCardModal } from "../tailsCard/TailsCardModal";
import { CloseButton } from "./CloseButton";
import { PackModal } from "./PackModal";
import { packImages } from "./PacksModal";
import { Tag } from "./Tag";
import { PixelButton } from "./PixelButton";

const weekInMs = 604800000;

export const CatsModalContent = ({
  close,
  setSelectedCat,
  mutatedCats,
}: {
  close: () => void;
  setSelectedCat: (cat: ICat) => void;
  mutatedCats: ICat[];
}) => {
  const { profile } = useProfile();
  const { setOpenedModal } = useGame();
  return (
    <div className="px-0 pt-4 pb-8 md:px-16 flex flex-col justify-between items-center animate-appear">
      <div className="font-paws text-h2 glow">MY PETS</div>
      {!!profile?.discount && (
        <span className="mb-4">
          <Tag>YOUR DISCOUNT CODE: {profile?.discount.toUpperCase()}</Tag>
        </span>
      )}
      {!!profile?.affiliated && (
        <span className="mb-4 -mt-6">
          <Tag>YOUR REVENUE SHARE: ${Math.ceil(profile?.affiliated)}</Tag>
        </span>
      )}

      <span className="relative mb-4">
        <PixelButton
          onClick={() => {
            setOpenedModal(GameModal.PACKS);
          }}
          text="BUY PACKS FOR MORE CATS <3"
        ></PixelButton>
      </span>

      {/* <RedeemCard close={close} /> */}
      <div className="flex flex-wrap justify-center items-center w-full gap-x-4 gap-y-8 sm:gap-5">
        {mutatedCats?.map((cat) =>
          !!cat.packed && !!cat.packType ? (
            <img
              key={cat._id}
              src={packImages[cat.packType as PackType]}
              className="rem:w-[143px] object-cover hover:brightness-110 transition-all duration-300"
              onClick={() => {
                setSelectedCat(cat);
              }}
            />
          ) : (
            <TailsCardMini
              key={cat._id}
              cat={cat}
              onClick={() => setSelectedCat(cat)}
            />
          )
        )}
      </div>
    </div>
  );
};

export const CatsModal = ({ close }: { close: () => void }) => {
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

    toast({ message: `${cat.name} selected successfully!`, img: cat.catImg });
    if (cat?.status?.EAT !== MAX_CAT_STATUS) {
      setGameType(GameType.HOME);
    }
    close();
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
      // Update selectedCat if it's the same cat
      if (selectedCat?._id === cat._id) {
        setSelectedCat((prev) => (prev ? { ...prev, staked: null } : null));
      }
      const tails = 1;
      setProfileUpdate({
        tails: (profile?.tails || 0) + tails,
        monthTailsCrafted: profile?.monthTailsCrafted || 0,
        monthTails: (profile?.monthTails || 0) + tails,
      });
    }
    toast({ message: result.message });
  };
  const onStakeCat = async (cat: ICat) => {
    const result = await CAT_API.stake(cat._id!);
    if (result.success) {
      const stakedDate = new Date(new Date().getTime() + weekInMs);
      setCatUpdate(cat, { staked: stakedDate });
      // Update selectedCat if it's the same cat
      if (selectedCat?._id === cat._id) {
        setSelectedCat((prev) =>
          prev ? { ...prev, staked: stakedDate } : null
        );
      }
    }
    toast({ message: result.message });
  };

  return (
    <>
      <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
        <div
          onClick={close}
          className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
        ></div>
        <div
          className="m-auto z-50 w-full md:w-[610px] max-w-full absolute inset-0 max-h-screen overflow-y-auto md:rounded-xl shadow md:border-4 border-yellow-300 glow-box"
          style={bgStyle("4")}
        >
          <CloseButton onClick={close} />
          <CatsModalContent
            close={close}
            setSelectedCat={setSelectedCat}
            mutatedCats={mutatedCats}
          />
        </div>
      </div>
      {selectedCat?.packed ? (
        <PackModal cat={selectedCat} close={() => setSelectedCat(null)} />
      ) : (
        selectedCat && (
          <TailsCardModal
            onClose={() => setSelectedCat(null)}
            showSelect={true}
            showStake={true}
            profileCatId={profile?.cat._id}
            onSelect={onCatSelect}
            onStake={onStakeCat}
            onStakeRewards={onStakeRewards}
            {...selectedCat}
          />
        )
      )}
    </>
  );
};
