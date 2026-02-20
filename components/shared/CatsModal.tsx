import { CAT_API } from "@/api/cat-api";
import { bgStyle, cdnFile } from "@/constants/utils";
import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { ICat, Tier } from "@/models/cats";
import { GameModal, GameType } from "@/models/game";
import { PackType } from "@/models/order";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { GameEvents } from "../Phaser/events";
import { TailsCardMini } from "../tailsCard/TailsCardMini";
import { TailsCardModal } from "../tailsCard/TailsCardModal";
import { ArrowIcon } from "./ArrowIcon";
import { CloseButton } from "./CloseButton";
import { PackModal } from "./PackModal";
import { packImages } from "./PacksModal";
import { Tag } from "./Tag";
import { PixelButton } from "./PixelButton";

const TierConfig = {
  [Tier.LEGENDARY]: {
    bgColor:
      "bg-gradient-to-r from-[#E5B75A] via-[#D4A548] via-[#C89434] to-[#B8842A]",
    textColor: "text-yellow-100",
    borderColor: "border-yellow-400",
  },
  [Tier.EPIC]: {
    bgColor:
      "bg-gradient-to-r from-[#AB5FA6] via-[#9B4F96] via-[#7B3F86] to-[#6B2F76]",
    textColor: "text-purple-100",
    borderColor: "border-purple-400",
  },
  [Tier.RARE]: {
    bgColor:
      "bg-gradient-to-r from-[#5A9FAF] via-[#4A8F9F] via-[#3A7F8F] to-[#2A6F7F]",
    textColor: "text-blue-100",
    borderColor: "border-blue-400",
  },
  [Tier.COMMON]: {
    bgColor:
      "bg-gradient-to-r from-gray-600 via-gray-500 via-gray-400 to-gray-300",
    textColor: "text-gray-100",
    borderColor: "border-gray-400",
  },
};

const patternImages: Record<Tier, string> = {
  [Tier.LEGENDARY]: cdnFile("cards/backgrounds/pattern-LEGENDARY.webp"),
  [Tier.EPIC]: cdnFile("cards/backgrounds/pattern-EPIC.webp"),
  [Tier.RARE]: cdnFile("cards/backgrounds/pattern-RARE.webp"),
  [Tier.COMMON]: cdnFile("cards/backgrounds/pattern-COMMON.webp"),
};

const weekInMs = 604800000;

const cornerImg = {
  [Tier.LEGENDARY]: cdnFile("utilities/cats-modal/legendary.webp"),
  [Tier.EPIC]: cdnFile("utilities/cats-modal/epic.webp"),
  [Tier.RARE]: cdnFile("utilities/cats-modal/rare.webp"),
  [Tier.COMMON]: cdnFile("utilities/cats-modal/common.webp"),
};

const shardImages = {
  [Tier.LEGENDARY]: cdnFile("utilities/cats-modal/legendary_shard.webp"),
  [Tier.EPIC]: cdnFile("utilities/cats-modal/epic_shard.webp"),
  [Tier.RARE]: cdnFile("utilities/cats-modal/rare_shard.webp"),
  [Tier.COMMON]: cdnFile("utilities/cats-modal/common_shard.webp"),
};

const CornerDecoration = ({
  position,
  tier,
}: {
  position: "tl" | "tr" | "bl" | "br";
  tier?: Tier;
}) => {
  const rotations = {
    tl: "180deg",
    tr: "270deg",
    bl: "90deg",
    br: "0deg",
  };

  const positions = {
    tl: "top-0 left-0",
    tr: "top-0 right-0",
    bl: "bottom-0 left-0",
    br: "bottom-0 right-0",
  };

  return (
    <div
      className={`absolute ${positions[position]} w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 pointer-events-none z-50`}
    >
      <img
        src={
          tier ? cornerImg[tier] : cdnFile("utilities/cats-modal/corner.webp")
        }
        alt=""
        className="w-full h-full object-contain"
        style={{
          transform: `rotate(${rotations[position]})`,
          filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.2))`,
        }}
        draggable={false}
      />
    </div>
  );
};

const PackRow = ({
  mutatedCats,
  setSelectedCat,
}: {
  mutatedCats: ICat[];
  setSelectedCat: (cat: ICat) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const packedCats = useMemo(
    () => mutatedCats.filter((cat) => cat.packed && cat.packType),
    [mutatedCats],
  );
  const { setOpenedModal } = useGame();
  const getCountFromWidth = () => {
    if (typeof window === "undefined") return 5;
    if (window.innerWidth >= 1024) return 5;
    if (window.innerWidth >= 768) return 4;
    return 3;
  };

  const [count, setCount] = useState(getCountFromWidth);

  useEffect(() => {
    function handleResize() {
      setCount(getCountFromWidth());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const chunkPacks = (packs: ICat[], size: number) => {
    const chunks: ICat[][] = [];
    for (let i = 0; i < packs.length; i += size) {
      chunks.push(packs.slice(i, i + size));
    }
    return chunks;
  };

  if (isExpanded) {
    const packsPerRow = count;
    const rows = chunkPacks(packedCats, packsPerRow);

    return (
      <div className="w-full mb-8">
        {/* One big bookshelf - click background to collapse */}
        <div
          className="relative cursor-pointer"
          onClick={() => setIsExpanded(false)}
        >
          {packedCats.length > 0 ? (
            <div className="">
              {rows.map((rowPacks, rowIndex) => (
                <div key={rowIndex} className="relative w-full">
                  {/* Shelf image - THE PARENT that defines size */}
                  <img
                    src={cdnFile("utilities/cats-modal/shelf.webp")}
                    alt="shelf"
                    className="w-[200%] lg:w-full h-auto"
                    draggable={false}
                  />

                  {/* Packs positioned absolutely based on shelf */}
                  <div
                    className="absolute inset-0 flex justify-center items-end gap-10 lg:gap-2 pb-[10%] px-[3%]"
                    style={{ height: "95%" }}
                  >
                    {rowPacks.map((cat, index) => (
                      <div
                        key={cat._id! + index}
                        className="flex-1 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                        style={{
                          maxWidth:
                            typeof window !== "undefined" &&
                            window.innerWidth < 1024
                              ? `${60 / Math.min(count, packedCats.length)}%`
                              : `${85 / Math.min(count, packedCats.length)}%`,
                          maxHeight: "100%",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCat(cat);
                        }}
                      >
                        <img
                          src={packImages[cat.packType as PackType]}
                          alt={cat.packType}
                          className="w-full h-auto object-contain"
                          draggable={false}
                          style={{
                            filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PixelButton
              onClick={() => {
                setOpenedModal(GameModal.PACKS);
              }}
              text="GET PACKS"
            ></PixelButton>
          )}
        </div>
      </div>
    );
  }

  // Collapsed - single shelf view
  return (
    <div className="w-full mb-8">
      {/* Single bookshelf */}
      <div
        className="relative w-full cursor-pointer group"
        onClick={() => packedCats.length > 0 && setIsExpanded(true)}
      >
        <img
          src={cdnFile("utilities/cats-modal/shelf.webp")}
          alt="shelf"
          className="w-[200%] lg:w-full h-auto"
          draggable={false}
        />
        {packedCats.length > 0 ? (
          <div
            className="absolute inset-0 flex justify-center items-end gap-5 lg:gap-2 pb-[10%] px-[3%]"
            style={{
              height:
                typeof window !== "undefined" && window.innerWidth < 1024
                  ? "100%"
                  : "95%",
            }}
          >
            {packedCats.slice(0, count).map((cat, index) => (
              <div
                key={cat._id! + index}
                className="flex-1 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                style={{
                  maxWidth:
                    typeof window !== "undefined" && window.innerWidth < 1024
                      ? `${65 / Math.min(count, packedCats.length)}%`
                      : `${85 / Math.min(count, packedCats.length)}%`,
                  maxHeight: "100%",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCat(cat);
                }}
              >
                <img
                  src={packImages[cat.packType as PackType]}
                  alt={cat.packType}
                  className="w-full h-auto object-contain"
                  draggable={false}
                  style={{
                    filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-lg font-primary text-white">
              No packs available
            </p>
          </div>
        )}

        {packedCats.length > count && (
          <div className="absolute bottom-0 lg:bottom-2 left-1/2 -translate-x-1/2 z-10">
            <PixelButton
              onClick={() => setIsExpanded(true)}
              text="See all"
              isSmall
            />
          </div>
        )}
      </div>
    </div>
  );
};

interface TierRowProps {
  tier: Tier;
  cats: ICat[];
  totalAvailable: number;
  setSelectedCat: (cat: ICat) => void;
}

const TierRow = ({
  tier,
  cats,
  totalAvailable,
  setSelectedCat,
}: TierRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = TierConfig[tier];
  const progress = (cats.length / totalAvailable) * 100;

  const getCountFromWidth = () => {
    if (typeof window === "undefined") return 2;
    if (window.innerWidth >= 1024) return 4;
    if (window.innerWidth >= 768) return 3;
    return 2;
  };

  const [count, setCount] = useState(getCountFromWidth);

  useEffect(() => {
    function handleResize() {
      setCount(getCountFromWidth());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const contentBg = {
    [Tier.LEGENDARY]: "bg-gradient-to-b from-yellow-100/80 to-yellow-50/80",
    [Tier.EPIC]: "bg-gradient-to-b from-purple-100/80 to-purple-50/80",
    [Tier.RARE]: "bg-gradient-to-b from-blue-100/80 to-blue-50/80",
    [Tier.COMMON]: "bg-gradient-to-b from-gray-300/90 to-gray-50/90",
  };

  const borderColors = {
    [Tier.LEGENDARY]: "border-yellow-900",
    [Tier.EPIC]: "border-purple-900",
    [Tier.RARE]: "border-blue-900",
    [Tier.COMMON]: "border-gray-800",
  };

  return (
    <div className="w-full mb-6 relative">
      <CornerDecoration position="bl" tier={tier} />
      <CornerDecoration position="br" tier={tier} />
      <CornerDecoration position="tr" tier={tier} />
      <CornerDecoration position="tl" tier={tier} />

      <div
        className={`w-full rounded-2xl overflow-hidden border-[6px] ${
          borderColors[tier]
        } shadow-2xl hover:shadow-${
          tier === Tier.LEGENDARY
            ? "yellow"
            : tier === Tier.EPIC
            ? "purple"
            : tier === Tier.RARE
            ? "blue"
            : "gray"
        }-500/40 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4`}
      >
        <div
          className={`${config.bgColor} px-4 lg:px-6 py-1 cursor-pointer hover:brightness-110 active:scale-[0.99] transition-all duration-300 relative overflow-hidden group`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div
            className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity duration-500"
            style={{
              backgroundImage: `url(${patternImages[tier]})`,
              backgroundSize: "180px 220px",
              backgroundRepeat: "repeat",
              mixBlendMode: "overlay",
            }}
          />

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <img
              src={shardImages[tier]}
              alt={`${tier} Shard`}
              className="w-24 h-24 lg:w-40 lg:h-40 object-contain drop-shadow-lg"
              draggable={false}
            />
          </div>

          <div className="flex justify-between items-center relative z-10">
            <div className="flex items-center gap-1 lg:gap-3">
              <h2
                className={`text-xl md:text-2xl font-primary ${config.textColor} uppercase tracking-widest font-bold drop-shadow-lg`}
              >
                {tier}
              </h2>
              <div
                className={`${
                  config.textColor
                } text-2xl font-bold transition-all duration-500 ease-out drop-shadow-lg ${
                  isExpanded ? "rotate-90 scale-110" : "scale-100"
                }`}
              >
                <ArrowIcon width={20} height={20} color={"#fff"} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`hidden md:block w-32 h-5 rounded-full overflow-hidden border-2 shadow-inner ${
                  borderColors[tier]
                } ${
                  tier === Tier.LEGENDARY
                    ? "bg-yellow-600/40"
                    : tier === Tier.EPIC
                    ? "bg-purple-500/40"
                    : tier === Tier.RARE
                    ? "bg-blue-500/40"
                    : "bg-gray-700/40"
                } backdrop-blur-sm relative`}
              >
                <div
                  className={`h-full transition-all duration-700 ease-out relative overflow-hidden ${
                    tier === Tier.LEGENDARY
                      ? "bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-200"
                      : tier === Tier.EPIC
                      ? "bg-gradient-to-r from-purple-400 via-purple-300 to-purple-200"
                      : tier === Tier.RARE
                      ? "bg-gradient-to-r from-blue-400 via-blue-300 to-blue-200"
                      : "bg-gradient-to-r from-gray-400 via-gray-300 to-gray-200"
                  }`}
                  style={{ width: `${progress}%` }}
                >
                  {/* Shimmer animation on progress bar */}
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                </div>
              </div>
              <span
                className={`text-base md:text-lg font-primary ${
                  config.textColor
                } font-bold drop-shadow-lg ${
                  tier === Tier.LEGENDARY
                    ? "bg-yellow-800/30"
                    : tier === Tier.EPIC
                    ? "bg-purple-800/30"
                    : tier === Tier.RARE
                    ? "bg-blue-800/30"
                    : "bg-gray-800/30"
                } px-3 py-1 rounded-full backdrop-blur-sm`}
              >
                {cats.length}/{totalAvailable}
              </span>
            </div>
          </div>
        </div>
        <div
          className={`${contentBg[tier]} p-4 transition-all duration-500 overflow-hidden backdrop-blur-sm`}
        >
          {isExpanded ? (
            <div
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 cursor-pointer"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {cats.length > 0 ? (
                cats.map((cat, index) => (
                  <div
                    key={cat._id! + index}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCat(cat);
                    }}
                  >
                    <TailsCardMini
                      cat={cat}
                      onClick={() => setSelectedCat(cat)}
                    />
                  </div>
                ))
              ) : (
                <div className="col-span-full flex items-center justify-center py-8">
                  <p
                    className={`text-base font-primary opacity-50 ${
                      tier === Tier.LEGENDARY
                        ? "text-yellow-900"
                        : tier === Tier.EPIC
                        ? "text-purple-900"
                        : tier === Tier.RARE
                        ? "text-blue-900"
                        : "text-gray-800"
                    }`}
                  >
                    No {tier.toLowerCase()} cats yet
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex flex-col gap-3 cursor-pointer "
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 relative">
                {cats.length > 0 ? (
                  <>
                    {cats.slice(0, count).map((cat, index) => (
                      <div key={cat._id! + index} className="flex-shrink-0">
                        <TailsCardMini
                          cat={cat}
                          onClick={() => setSelectedCat(cat)}
                        />
                      </div>
                    ))}
                    {cats.length > count && (
                      <div
                        className="absolute -right-2 top-1/2 -translate-y-1/2 flex items-center justify-center z-10"
                        onClick={() => setIsExpanded(true)}
                      >
                        <div
                          className={`text-4xl font-bold ${
                            tier === Tier.LEGENDARY
                              ? "text-yellow-900"
                              : tier === Tier.EPIC
                              ? "text-purple-900"
                              : tier === Tier.RARE
                              ? "text-blue-900"
                              : "text-gray-800"
                          }`}
                        ></div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full text-center py-8">
                    <p
                      className={`text-base font-primary opacity-50 ${
                        tier === Tier.LEGENDARY
                          ? "text-yellow-900"
                          : tier === Tier.EPIC
                          ? "text-purple-900"
                          : tier === Tier.RARE
                          ? "text-blue-900"
                          : "text-gray-800"
                      }`}
                    >
                      No {tier.toLowerCase()} cats yet
                    </p>
                  </div>
                )}
              </div>
              {!isExpanded && cats.length > count && (
                <p
                  className={`font-primary text-center text-p5 font-bold ${
                    tier === Tier.LEGENDARY
                      ? "text-yellow-900"
                      : tier === Tier.EPIC
                      ? "text-purple-900"
                      : tier === Tier.RARE
                      ? "text-blue-900"
                      : "text-gray-800"
                  }`}
                >
                  <PixelButton
                    onClick={() => setIsExpanded(true)}
                    text="See all"
                    isSmall
                  />
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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

  const catsByTier = useMemo(() => {
    const unpackedCats = mutatedCats.filter((cat) => !cat.packed);
    return {
      [Tier.LEGENDARY]: unpackedCats.filter(
        (cat) => cat.tier === Tier.LEGENDARY,
      ),
      [Tier.EPIC]: unpackedCats.filter((cat) => cat.tier === Tier.EPIC),
      [Tier.RARE]: unpackedCats.filter((cat) => cat.tier === Tier.RARE),
      [Tier.COMMON]: unpackedCats.filter((cat) => cat.tier === Tier.COMMON),
    };
  }, [mutatedCats]);

  return (
    <div className="px-0 pt-4 pb-8 md:px-16 flex flex-col justify-between items-center animate-appear">
      <div className="font-paws text-h2 glow mb-2 animate-in fade-in zoom-in duration-500">
        MY PETS
      </div>
      <div className="w-full max-w-md mb-4 px-4"></div>
      {profile?.discount && (
        <span className="mb-4">
          <Tag>YOUR DISCOUNT CODE: {profile?.discount.toUpperCase()}</Tag>
        </span>
      )}
      {profile?.affiliated && (
        <span className="mb-4 -mt-5">
          <Tag>YOUR REVENUE SHARE: ${Math.ceil(profile?.affiliated)}</Tag>
        </span>
      )}

      <div className="w-full px-2">
        <PackRow mutatedCats={mutatedCats} setSelectedCat={setSelectedCat} />

        <TierRow
          tier={Tier.LEGENDARY}
          cats={catsByTier[Tier.LEGENDARY]}
          totalAvailable={350}
          setSelectedCat={setSelectedCat}
        />
        <TierRow
          tier={Tier.EPIC}
          cats={catsByTier[Tier.EPIC]}
          totalAvailable={350}
          setSelectedCat={setSelectedCat}
        />
        <TierRow
          tier={Tier.RARE}
          cats={catsByTier[Tier.RARE]}
          totalAvailable={350}
          setSelectedCat={setSelectedCat}
        />
        <TierRow
          tier={Tier.COMMON}
          cats={catsByTier[Tier.COMMON]}
          totalAvailable={350}
          setSelectedCat={setSelectedCat}
        />
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
      }),
    );
  };
  const onStakeRewards = async (cat: ICat) => {
    const result = await CAT_API.stakingRedeem(cat._id!);
    if (result.success) {
      setCatUpdate(cat, { staked: null });
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
      if (selectedCat?._id === cat._id) {
        setSelectedCat((prev) =>
          prev ? { ...prev, staked: stakedDate } : null,
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
          className="z-40 h-full w-full absolute inset-0 bg-yellow-300/50 backdrop-blur-md animate-in fade-in duration-300"
        ></div>
        <div
          className="m-auto z-50 w-full md:w-[700px] lg:w-[900px] max-w-full absolute inset-0 max-h-screen overflow-y-auto  shadow-2xl md:border-4 border-yellow-300 glow-box animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-500"
          style={{
            ...bgStyle("4"),
            overflowX: "hidden",
          }}
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
