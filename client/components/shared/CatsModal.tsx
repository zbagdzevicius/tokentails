import { CAT_API } from "@/api/cat-api";
import { cdnFile } from "@/constants/utils";
import { GameModal as GameDialog } from "@/components/ui/GameModal";
import { useAccountAction, useLatest } from "@/hooks/useAccountAction";
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
import { catName } from "@/components/shelter-payouts/pinkPaw";
import { CardAction } from "../tailsCard/CardAction";
import { TailsCardMini } from "../tailsCard/TailsCardMini";
import { TailsCardModal } from "../tailsCard/TailsCardModal";
import { ArrowIcon } from "./ArrowIcon";
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
  isMobileView,
}: {
  mutatedCats: ICat[];
  setSelectedCat: (cat: ICat) => void;
  isMobileView: boolean;
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
  const isDesktop = count >= 5;

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
                    className="absolute inset-0 flex justify-center items-end gap-5 lg:gap-2 pb-[10%] px-[3%]"
                    style={{ height: "95%" }}
                  >
                    {rowPacks.map((cat, index) => (
                      <div
                        key={cat._id! + index}
                        className="flex-1 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                        style={{
                          maxWidth: `${
                            (isDesktop ? 85 : 60) /
                            Math.min(count, packedCats.length)
                          }%`,
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
                            filter: isMobileView
                              ? undefined
                              : "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
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
              height: isDesktop ? "95%" : "100%",
            }}
          >
            {packedCats.slice(0, count).map((cat, index) => (
              <div
                key={cat._id! + index}
                className="flex-1 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                style={{
                  maxWidth: `${Math.min(
                    20,
                    (isDesktop ? 85 : 65) / Math.min(count, packedCats.length),
                  )}%`,
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
                    filter: isMobileView
                      ? undefined
                      : "drop-shadow(0 10px 20px rgba(0,0,0,0.5))",
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center flex-col gap-4 justify-center">
            <p className="text-lg font-primary text-white">
              No packs available
            </p>
            <PixelButton
              className="!m-0"
              onClick={() => {
                setOpenedModal(GameModal.PACKS);
              }}
              text="GET PACKS"
            />
          </div>
        )}

        {packedCats.length > count && (
          <div className="absolute bottom-0 lg:bottom-2 left-1/2 -translate-x-1/2 z-10">
            <PixelButton
              onClick={() => setIsExpanded(true)}
              text="See all"
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );
};

const borderColors = {
  [Tier.LEGENDARY]: "border-tt-gold-500",
  [Tier.EPIC]: "border-tt-lilac",
  [Tier.RARE]: "border-tt-sky",
  [Tier.COMMON]: "border-tt-muted",
};

/** Text on the night card body, in the tier's accent. */
const inkOnNight = {
  [Tier.LEGENDARY]: "text-tt-gold-400",
  [Tier.EPIC]: "text-tt-lilac",
  [Tier.RARE]: "text-tt-sky",
  [Tier.COMMON]: "text-tt-cream",
};

const TIER_RANK = [Tier.LEGENDARY, Tier.EPIC, Tier.RARE, Tier.COMMON];

/** Tiers with cats first, then empty ones; rarest first within each group. */
export function tierOrder(byTier: Record<Tier, readonly unknown[]>): Tier[] {
  return [
    ...TIER_RANK.filter((t) => byTier[t].length > 0),
    ...TIER_RANK.filter((t) => byTier[t].length === 0),
  ];
}

/** A tier you have no cats in: one slim line, not a full panel. */
const EmptyTierRow = ({ tier }: { tier: Tier }) => (
  <div
    className={`mb-3 flex w-full items-center justify-between rounded-xl border-2 ${borderColors[tier]} bg-tt-night-900/60 px-4 py-2`}
    data-testid="empty-tier-row"
  >
    <span className={`font-primary uppercase tracking-widest text-p4 ${inkOnNight[tier]}`}>{tier}</span>
    <span className={`font-primary text-p5 ${inkOnNight[tier]} opacity-80`}>
      No {tier.toLowerCase()} cats yet
    </span>
  </div>
);

/**
 * One My Pets card: the whole mini card is a button that opens the card detail (the same
 * `setSelectedCat` the card's own click runs), with the small gold "open" badge.
 */
const PetCard = ({
  cat,
  ping,
  onOpen,
}: {
  cat: ICat;
  ping: boolean;
  onOpen: (cat: ICat) => void;
}) => (
  <CardAction
    size="sm"
    ping={ping}
    ariaLabel={`Open ${catName(cat)}`}
    fill
    className="mx-auto max-w-[180px]"
    onClick={(e) => {
      // The grid around it toggles the tier open; a card press only opens the card.
      e.stopPropagation();
      onOpen(cat);
    }}
  >
    <TailsCardMini cat={cat} onClick={() => onOpen(cat)} />
  </CardAction>
);

interface TierRowProps {
  tier: Tier;
  cats: ICat[];
  setSelectedCat: (cat: ICat) => void;
  isMobileView: boolean;
}

const TierRow = ({
  tier,
  cats,
  setSelectedCat,
  isMobileView,
}: TierRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = TierConfig[tier];

  const getCountFromWidth = () => {
    if (typeof window === "undefined") return 2;
    // Three columns from tablet up: on desktop four columns left the cards at ~149 px.
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

  // Night card bodies (plan G6): the tier shows in the border and the ink, not a pale fill.
  const contentBg = {
    [Tier.LEGENDARY]: "bg-tt-night-900/80",
    [Tier.EPIC]: "bg-tt-night-900/80",
    [Tier.RARE]: "bg-tt-night-900/80",
    [Tier.COMMON]: "bg-tt-night-900/80",
  };

  return (
    <div className="w-full mb-6 relative">
      {!isMobileView && (
        <>
          <CornerDecoration position="bl" tier={tier} />
          <CornerDecoration position="br" tier={tier} />
          <CornerDecoration position="tr" tier={tier} />
          <CornerDecoration position="tl" tier={tier} />
        </>
      )}

      <div
        className={`w-full rounded-2xl overflow-hidden border-[6px] ${
          borderColors[tier]
        } ${
          isMobileView ? "shadow-lg" : "shadow-2xl"
        } hover:shadow-${
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
          className={`${config.bgColor} px-4 lg:px-6 py-1 cursor-pointer ${
            isMobileView ? "" : "hover:brightness-110"
          } active:scale-[0.99] transition-all duration-300 relative overflow-hidden group`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {!isMobileView && (
            <>
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
            </>
          )}

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
              {/* The count of cats you own in this tier. There is no real "out of N" total per
                  tier, so no progress bar or "/350" (that number was a placeholder). */}
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
                {cats.length}
                <span className="sr-only"> {tier.toLowerCase()} cats owned</span>
              </span>
            </div>
          </div>
        </div>
        <div
          className={`${contentBg[tier]} p-4 transition-all duration-500 overflow-hidden ${
            isMobileView ? "" : "backdrop-blur-sm"
          }`}
        >
          {isExpanded ? (
            <div
              className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8 cursor-pointer"
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
                    <PetCard cat={cat} ping={index === 0} onOpen={setSelectedCat} />
                  </div>
                ))
              ) : (
                <div className="col-span-full flex items-center justify-center py-8">
                  <p
                    className={`w-full text-center text-base font-primary ${inkOnNight[tier]}`}
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 lg:gap-8 relative">
                {cats.length > 0 ? (
                  <>
                    {cats.slice(0, count).map((cat, index) => (
                      <div key={cat._id! + index} className="flex-shrink-0">
                        <PetCard cat={cat} ping={index === 0} onOpen={setSelectedCat} />
                      </div>
                    ))}
                    {cats.length > count && (
                      <div
                        className="absolute -right-2 top-1/2 -translate-y-1/2 flex items-center justify-center z-10"
                        onClick={() => setIsExpanded(true)}
                      >
                        <div
                          className={`text-4xl font-bold ${inkOnNight[tier]}`}
                        ></div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="col-span-full w-full text-center py-8">
                    <p
                      className={`w-full text-center text-base font-primary ${inkOnNight[tier]}`}
                    >
                      No {tier.toLowerCase()} cats yet
                    </p>
                  </div>
                )}
              </div>
              {!isExpanded && cats.length > count && (
                <p
                  className={`font-primary text-center text-p5 font-bold ${inkOnNight[tier]}`}
                >
                  <PixelButton
                    onClick={() => setIsExpanded(true)}
                    text="See all"
                    size="sm"
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


/** The Tails a collected nap paid, from the response (`tails`); 0 when missing. */
export function napTailsOf(result: unknown): number {
  const tails = (result as { tails?: unknown } | null)?.tails;
  return typeof tails === "number" && Number.isFinite(tails) && tails > 0 ? Math.floor(tails) : 0;
}

/** When the nap ends, from the response (`stakedUntil`), or null. */
export function napUntilOf(result: unknown): Date | null {
  const until = (result as { stakedUntil?: unknown } | null)?.stakedUntil;
  if (typeof until !== "string" && !(until instanceof Date)) return null;
  const date = new Date(until);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const CatsModalContent = ({
  setSelectedCat,
  mutatedCats,
}: {
  setSelectedCat: (cat: ICat) => void;
  mutatedCats: ICat[];
}) => {
  const { profile } = useProfile();
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateIsMobileView = () => setIsMobileView(window.innerWidth < 768);
    updateIsMobileView();
    window.addEventListener("resize", updateIsMobileView);
    return () => window.removeEventListener("resize", updateIsMobileView);
  }, []);

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
    <div className="px-0 pt-2 pb-4 md:px-10 flex flex-col justify-between items-center animate-appear">
      {!!profile?.discount && (
        <span className="mb-4">
          <Tag>YOUR DISCOUNT CODE: {profile?.discount.toUpperCase()}</Tag>
        </span>
      )}
      {!!profile?.affiliated && (
        <span className="mb-4 -mt-5">
          <Tag>YOUR REVENUE SHARE: ${Math.ceil(profile?.affiliated)}</Tag>
        </span>
      )}

      <div className="w-full px-2">
        <PackRow
          mutatedCats={mutatedCats}
          setSelectedCat={setSelectedCat}
          isMobileView={isMobileView}
        />

        {/* Tiers you own come first (rarest first); empty tiers follow as one-line rows, so your
            own cats are on the first screen instead of three "No X cats yet" panels. */}
        {tierOrder(catsByTier).map((tier) =>
          catsByTier[tier].length > 0 ? (
            <TierRow
              key={tier}
              tier={tier}
              cats={catsByTier[tier]}
              setSelectedCat={setSelectedCat}
              isMobileView={isMobileView}
            />
          ) : (
            <EmptyTierRow key={tier} tier={tier} />
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
  const [catOverrides, setCatOverrides] = useState<Record<string, Partial<ICat>>>(
    {},
  );
  const mutatedCats = useMemo(
    () =>
      (cats || []).map((cat) => {
        if (!cat._id || !catOverrides[cat._id]) return cat;
        return { ...cat, ...catOverrides[cat._id] };
      }),
    [cats, catOverrides],
  );
  // Adopt and stake are account actions (plan G1, decision #9): a guest gets the AuthSheet, and
  // the action goes on once they signed in. Handlers read the profile through a ref because they
  // may run after the sheet replaced the guest profile.
  const { runWithAccount } = useAccountAction();
  const latest = useLatest({ profile, setProfileUpdate });

  const onCatSelect = (cat: ICat) => {
    const isSameCat = !!cat && profile?.cat?._id === cat._id;
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
    if (!cat._id) return;
    setCatOverrides((prev) => ({
      ...prev,
      [cat._id!]: { ...(prev[cat._id!] || {}), ...update },
    }));
  };
  // Cat nap (plan G5 P1/P2): the backend answers with the Tails it actually paid, so the profile
  // adds exactly that (a still-napping cat pays 0 and keeps napping).
  const claimStakeRewards = async (cat: ICat) => {
    const result = await CAT_API.stakingRedeem(cat._id!);
    if (!result) {
      toast({ message: "We couldn't wake your cat just now. Try again." });
      return;
    }
    const tails = napTailsOf(result);
    if (result.success) {
      setCatUpdate(cat, { staked: null });
      setSelectedCat((prev) =>
        prev && prev._id === cat._id ? { ...prev, staked: null } : prev,
      );
      if (tails > 0) {
        const { profile: current, setProfileUpdate } = latest.current;
        setProfileUpdate({
          tails: (current?.tails || 0) + tails,
          monthTailsCrafted: (current?.monthTailsCrafted || 0) + tails,
          monthTails: (current?.monthTails || 0) + tails,
        });
      }
    }
    toast({ message: result.message });
  };
  const stakeCat = async (cat: ICat) => {
    const result = await CAT_API.stake(cat._id!);
    if (result.success) {
      const stakedDate = napUntilOf(result) ?? new Date(new Date().getTime() + weekInMs);
      setCatUpdate(cat, { staked: stakedDate });
      setSelectedCat((prev) =>
        prev && prev._id === cat._id ? { ...prev, staked: stakedDate } : prev,
      );
    }
    toast({ message: result.message });
  };
  const onStakeRewards = (cat: ICat) =>
    void runWithAccount("claim-rewards", () => claimStakeRewards(cat));
  const onStakeCat = (cat: ICat) =>
    void runWithAccount("adopt", () => stakeCat(cat));

  return (
    <>
      <GameDialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title="MY PETS"
        name="cats"
        size="xl"
        bodyClassName="overflow-x-hidden"
      >
        <CatsModalContent
          setSelectedCat={setSelectedCat}
          mutatedCats={mutatedCats}
        />
      </GameDialog>
      {selectedCat?.packed ? (
        <PackModal cat={selectedCat} close={() => setSelectedCat(null)} />
      ) : (
        selectedCat && (
          <TailsCardModal
            onClose={() => setSelectedCat(null)}
            showSelect={true}
            showStake={true}
            profileCatId={profile?.cat?._id}
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
