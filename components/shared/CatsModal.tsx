import { CAT_API } from "@/api/cat-api";
import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { ICat } from "@/models/cats";
import { GameType } from "@/models/game";
import { IImage } from "@/models/image";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CatCardModal, getMultiplier } from "../CatCardModal";
import { GameEvents } from "../Phaser/events";
import { StripePayment } from "../web3/payments/StripePayment";
import { Web3Providers } from "../web3/Web3Providers";
import { ChainSelect } from "./ChainSelect";
import { CloseButton } from "./CloseButton";
import { Countdown } from "./Countdown";
import { Previews } from "./drag-drop";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { EntityType } from "@/models/save";
import { CurrencyType } from "@/web3/contracts";
import { Web3Transfer } from "../web3/transfer/Web3Transfer";
import { useWeb3 } from "@/context/Web3Context";

const weekInMs = 604800000;

export const GenerateCat = ({ close }: { close: () => void }) => {
  const [isDisplayed, setIsDisplayed] = useState(false);
  const { profile, setProfileUpdate } = useProfile();
  const [price, setPrice] = useState(5);
  const [name, setName] = useState("");
  const [image, setImage] = useState<IImage[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"web3" | "card">("card");
  const toast = useToast();
  const { setGameType } = useGame();
  const {
    currencyType,
    bnbRate,
    xlmRate,
    solRate,
    transactionStatus,
    setTransactionStatus,
  } = useWeb3();
  const onSuccess = (cat?: ICat) => {
    if (cat) {
      setProfileUpdate({
        cats: [...(profile?.cats || []), cat],
        cat,
      });
      setTransactionStatus(null);
    }
    toast({ message: "Congratz on your generated cat !" });
    setGameType(GameType.HOME);
    close();
  };
  const currencyPrice = useMemo(() => {
    if (
      [CurrencyType.XLM, CurrencyType.BNB, CurrencyType.SOL].includes(
        currencyType
      ) &&
      bnbRate &&
      xlmRate &&
      solRate
    ) {
      if (currencyType === CurrencyType.BNB) {
        return parseFloat((price / bnbRate).toFixed(3));
      }
      if (currencyType === CurrencyType.XLM) {
        return Math.ceil(price / xlmRate);
      }
      if (currencyType === CurrencyType.SOL) {
        return parseFloat((price / solRate).toFixed(3));
      }
    }
    return price;
  }, [currencyType, bnbRate, xlmRate, solRate, price]);

  useEffect(() => {
    if (transactionStatus?.success) {
      onSuccess(transactionStatus.cat);
    }
  }, [transactionStatus]);

  return (
    <div className="flex flex-col items-center justify-center mb-4">
      {isDisplayed ? (
        <div className="flex flex-col items-center justify-center mb-8 gap-3 animate-appear">
          <Tag>Generate Your Own Cat</Tag>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value?.slice(0, 24))}
            className="flex-grow px-2 py-1 outline-none text-p3 bg-white rounded-full"
            placeholder="Name of your cat"
          />
          <Previews maxFiles={1} value={image} onChange={setImage} />

          {!!name && !!image?.length && (
            <>
              <div className="flex justify-center gap-4 animate-appear">
                <PixelButton
                  text="Credit Card"
                  active={paymentMethod === "card"}
                  onClick={() => setPaymentMethod("card")}
                />
                <PixelButton
                  text="Crypto"
                  active={paymentMethod === "web3"}
                  onClick={() => setPaymentMethod("web3")}
                />
              </div>
              {paymentMethod === "web3" ? (
                <ChainSelect />
              ) : (
                <StripePayment
                  price={price}
                  generatedCat={{
                    name,
                    image: image[0]?._id!,
                  }}
                  onSuccess={() => {
                    onSuccess();
                  }}
                />
              )}
              <div className="m-auto animate-appear">
                {paymentMethod === "web3" && (
                  <div className="flex flex-col items-start w-fit m-auto">
                    <div className="text-main-black font-bold bg-yellow-300 rounded-t-xl w-24 text-center text-p6 ml-3">
                      {currencyPrice} {currencyType}
                    </div>
                    <Web3Transfer
                      price={currencyPrice}
                      amount={1}
                      entityType={EntityType.CAT}
                      user={profile?._id}
                      generatedCat={{
                        name,
                        image: image[0]?._id!,
                      }}
                      text="Generate"
                      loadingText="Generating..."
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <PixelButton
          onClick={() => setIsDisplayed(true)}
          text="Generate Your Own Cat"
        />
      )}
    </div>
  );
};

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
      <h2 className="text-center font-secondary uppercase text-p4 md:text-p3 pt-2">
        Here you can switch your main cat
      </h2>
      <h2 className="text-center font-secondary uppercase text-p5 md:text-p4 mb-2">
        Earn coins to Adopt more cats in the shelter
      </h2>

      <Web3Providers>
        <GenerateCat close={close} />
      </Web3Providers>
      <div className="flex flex-wrap justify-center w-full">
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
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="m-auto z-50 rem:w-[350px] md:w-[600px] max-w-full bg-gradient-to-b from-yellow-300 to-purple-300 absolute inset-0 max-h-screen overflow-y-auto rounded-xl shadow">
        <CloseButton onClick={close} />
        <CatsModalContent close={close} />
      </div>
    </div>
  );
};
