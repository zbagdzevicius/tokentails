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
import { PackModal } from "./PackModal";
import { packImages } from "./PacksModal";
import {
  EmptyState,
  LoadingState,
  ModalButton,
  ModalSection,
  ModalStack,
  StatusPill,
} from "@/components/ui/modal";
import { PixelIcon } from "./PixelIcon";
import clsx from "clsx";

const shardImages: Record<Tier, string> = {
  [Tier.LEGENDARY]: cdnFile("utilities/cats-modal/legendary_shard.webp"),
  [Tier.EPIC]: cdnFile("utilities/cats-modal/epic_shard.webp"),
  [Tier.RARE]: cdnFile("utilities/cats-modal/rare_shard.webp"),
  [Tier.COMMON]: cdnFile("utilities/cats-modal/common_shard.webp"),
};

/** Tier ink on the night panel. */
const TIER_INK: Record<Tier, string> = {
  [Tier.LEGENDARY]: "text-tt-gold-400",
  [Tier.EPIC]: "text-tt-lilac",
  [Tier.RARE]: "text-tt-sky",
  [Tier.COMMON]: "text-tt-cream",
};

const TIER_NAME: Record<Tier, string> = {
  [Tier.LEGENDARY]: "Legendary",
  [Tier.EPIC]: "Epic",
  [Tier.RARE]: "Rare",
  [Tier.COMMON]: "Common",
};

const weekInMs = 604800000;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Grid columns at this width, matching TierGroup's grid: 2 on phones, 3 from md, 4 from lg, and 5
 * on a landscape phone (`short:`), so a collapsed group shows two full rows.
 */
function useColumns(): number {
  const read = () => {
    if (typeof window === "undefined") return 3;
    if (window.innerHeight <= 500 && window.innerWidth >= 640) return 5;
    if (window.innerWidth >= 1024) return 4;
    return window.innerWidth >= 768 ? 3 : 2;
  };
  const [columns, setColumns] = useState(read);
  useEffect(() => {
    const onResize = () => setColumns(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return columns;
}

/** "Show all N" under a list that was cut to two rows; nothing when everything fits. */
const ShowAll = ({
  total,
  shown,
  expanded,
  onToggle,
  noun,
}: {
  total: number;
  shown: number;
  expanded: boolean;
  onToggle: () => void;
  noun: string;
}) =>
  total > shown || expanded ? (
    <div className="flex justify-center">
      <ModalButton variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle}>
        {expanded ? "Show fewer" : `Show all ${total} ${noun}`}
      </ModalButton>
    </div>
  ) : null;

const TIER_NAME_BY_PACK: Record<PackType, string> = {
  [PackType.STARTER]: "Starter",
  [PackType.INFLUENCER]: "Influencer",
  [PackType.LEGENDARY]: "Legendary",
};

/**
 * Unopened packs: the one thing to act on, so a gold card with the packs on a soft pedestal, and
 * it comes first in My Pets.
 */
const PackShelf = ({
  packs,
  setSelectedCat,
}: {
  packs: ICat[];
  setSelectedCat: (cat: ICat) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const limit = useColumns() + 2;
  const shown = expanded ? packs : packs.slice(0, limit);
  return (
    <ModalSection
      title="Unopened packs"
      icon="gift"
      tone="highlight"
      helper="Tap a pack to open it and meet the cat inside."
      data-testid="my-pets-packs"
    >
      <ul className="flex flex-wrap items-end justify-center gap-4 md:gap-6">
        {shown.map((cat, index) => (
          <li key={cat._id! + index}>
            <button
              type="button"
              aria-label={`Open ${TIER_NAME_BY_PACK[cat.packType as PackType] ?? "card"} pack`}
              onClick={() => setSelectedCat(cat)}
              className="group relative flex min-h-[44px] flex-col items-center gap-1.5 outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-tt-gold-400"
            >
              <span className="relative flex justify-center">
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 h-4 w-[120%] -translate-x-1/2 rounded-[50%] bg-tt-gold-400/25 blur-md"
                />
                <img
                  src={packImages[cat.packType as PackType]}
                  alt=""
                  className="relative h-28 w-auto object-contain drop-shadow-[0_8px_12px_rgb(var(--tt-night-950)/0.6)] transition-transform duration-300 motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:scale-105 motion-reduce:transition-none md:h-36 short:!h-24"
                  draggable={false}
                />
              </span>
              <span
                aria-hidden="true"
                className="font-primary text-p5 uppercase leading-none tracking-wide text-tt-cream group-hover:text-tt-gold-400"
              >
                {TIER_NAME_BY_PACK[cat.packType as PackType] ?? "Card"} pack
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ShowAll
        total={packs.length}
        shown={shown.length}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        noun="packs"
      />
    </ModalSection>
  );
};

const TIER_RANK = [Tier.LEGENDARY, Tier.EPIC, Tier.RARE, Tier.COMMON];

/** Tiers with cats first, then empty ones; rarest first within each group. */
export function tierOrder(byTier: Record<Tier, readonly unknown[]>): Tier[] {
  return [
    ...TIER_RANK.filter((t) => byTier[t].length > 0),
    ...TIER_RANK.filter((t) => byTier[t].length === 0),
  ];
}

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
    // The whole card is the button; the open badge stays on the first card only, as the hint.
    badge={ping}
    ariaLabel={`Open ${catName(cat)}`}
    fill
    // Landscape phones: small cards, so a row fits the short screen instead of one card filling it.
    className="mx-auto max-w-[180px] short:max-w-[120px]"
    onClick={(e) => {
      // The grid around it toggles the tier open; a card press only opens the card.
      e.stopPropagation();
      onOpen(cat);
    }}
  >
    <TailsCardMini cat={cat} onClick={() => onOpen(cat)} />
  </CardAction>
);

/** The cats you own in one tier: a small heading with the tier's shard, then two rows of cards. */
const TierGroup = ({
  tier,
  cats,
  pingFirst,
  setSelectedCat,
}: {
  tier: Tier;
  cats: ICat[];
  pingFirst: boolean;
  setSelectedCat: (cat: ICat) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const limit = useColumns() * 2;
  const shown = expanded ? cats : cats.slice(0, limit);
  return (
    <div data-testid={`tier-group-${tier}`} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <img src={shardImages[tier]} alt="" aria-hidden="true" className="h-7 w-7 object-contain" draggable={false} />
        <h4 className={clsx("font-primary text-p4 uppercase leading-none tracking-wide", TIER_INK[tier])}>
          {TIER_NAME[tier]}
        </h4>
        <span className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">
          {plural(cats.length, "cat", "cats")}
        </span>
        <span aria-hidden="true" className="ml-1 h-[2px] flex-1 bg-tt-night-500/70" />
      </div>
      {/* px-2: room for the cards' glow, which the modal's overflow-x clip would cut at the edge. */}
      <ul className="grid grid-cols-2 gap-4 px-2 md:grid-cols-3 md:gap-6 lg:grid-cols-4 short:!grid-cols-5 short:!gap-3">
        {shown.map((cat, index) => (
          <li key={cat._id! + index} className="min-w-0">
            <PetCard cat={cat} ping={pingFirst && index === 0} onOpen={setSelectedCat} />
          </li>
        ))}
      </ul>
      <ShowAll
        total={cats.length}
        shown={shown.length}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        noun={`${TIER_NAME[tier].toLowerCase()} cats`}
      />
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
  status = "ready",
  onRetry,
}: {
  setSelectedCat: (cat: ICat) => void;
  mutatedCats: ICat[];
  /** The cats request: while it loads or after it failed there is no "No cats yet". */
  status?: "loading" | "error" | "ready";
  onRetry?: () => void;
}) => {
  const { profile } = useProfile();
  const { setOpenedModal } = useGame();

  const packs = useMemo(() => mutatedCats.filter((cat) => cat.packed && cat.packType), [mutatedCats]);
  const catsByTier = useMemo(() => {
    const unpackedCats = mutatedCats.filter((cat) => !cat.packed);
    return {
      [Tier.LEGENDARY]: unpackedCats.filter((cat) => cat.tier === Tier.LEGENDARY),
      [Tier.EPIC]: unpackedCats.filter((cat) => cat.tier === Tier.EPIC),
      [Tier.RARE]: unpackedCats.filter((cat) => cat.tier === Tier.RARE),
      [Tier.COMMON]: unpackedCats.filter((cat) => cat.tier === Tier.COMMON),
    };
  }, [mutatedCats]);
  // Owned tiers first (rarest first), then the tiers still to find, as one strip at the end.
  const order = tierOrder(catsByTier);
  const owned = order.filter((tier) => catsByTier[tier].length > 0);
  const missing = order.filter((tier) => catsByTier[tier].length === 0);
  const total = owned.reduce((sum, tier) => sum + catsByTier[tier].length, 0);
  const getPacks = () => setOpenedModal(GameModal.PACKS);

  if (status === "loading") {
    return (
      <ModalStack>
        <ModalSection title="Your cats" icon="paw" data-testid="my-pets-cats">
          <LoadingState rows={3} label="Loading your cats" />
        </ModalSection>
      </ModalStack>
    );
  }
  if (status === "error") {
    return (
      <ModalStack>
        <ModalSection title="Your cats" icon="paw" data-testid="my-pets-cats">
          <EmptyState
            tone="error"
            icon="warning-diamond"
            title="Your cats did not load"
            body="Your cats are safe. Check your connection and try again."
            action={
              <ModalButton variant="secondary" icon="reload" onClick={onRetry}>
                Try again
              </ModalButton>
            }
          />
        </ModalSection>
      </ModalStack>
    );
  }

  return (
    <ModalStack className="motion-safe:animate-appear">
      {(!!profile?.discount || !!profile?.affiliated) && (
        <div className="flex flex-wrap gap-2">
          {!!profile?.discount && (
            <StatusPill tone="gold" icon="key">
              Your discount code: {profile.discount.toUpperCase()}
            </StatusPill>
          )}
          {!!profile?.affiliated && (
            <StatusPill tone="mint" icon="coins">
              Your revenue share: ${Math.ceil(profile.affiliated)}
            </StatusPill>
          )}
        </div>
      )}

      {packs.length > 0 && <PackShelf packs={packs} setSelectedCat={setSelectedCat} />}

      <ModalSection
        title="Your cats"
        icon="paw"
        helper={
          total
            ? "Tap a card to play as that cat or send it on a cat nap for Tails."
            : undefined
        }
        data-testid="my-pets-cats"
        bodyClassName="gap-6"
      >
        {owned.length ? (
          owned.map((tier, index) => (
            <TierGroup
              key={tier}
              tier={tier}
              cats={catsByTier[tier]}
              pingFirst={index === 0}
              setSelectedCat={setSelectedCat}
            />
          ))
        ) : (
          <EmptyState
            icon="paw"
            title="No cats yet"
            body="Open a pack to meet your first cat."
            action={
              <ModalButton variant="primary" icon="shopping-bag" onClick={getPacks}>
                Get packs
              </ModalButton>
            }
          />
        )}
      </ModalSection>

      {missing.length > 0 && (
        <ModalSection
          title="Still to find"
          icon="sparkles"
          helper="Rarer cats come from packs. The rarer the pack, the better the odds."
          data-testid="my-pets-missing"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Plain labels (no edge), with a lock: tiers you have not found, not buttons. */}
            <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Tiers you have not found yet">
              {missing.map((tier) => (
                <li key={tier} data-testid="empty-tier-row" className="flex items-center gap-1.5">
                  <span className="relative h-7 w-7 shrink-0" aria-hidden="true">
                    <img
                      src={shardImages[tier]}
                      alt=""
                      className="h-7 w-7 object-contain opacity-40 grayscale"
                      draggable={false}
                    />
                    <span className="absolute -bottom-1 -right-1 text-tt-muted">
                      <PixelIcon name="lock" size={14} />
                    </span>
                  </span>
                  <span className={clsx("font-primary text-p5 uppercase leading-none tracking-wide opacity-80", TIER_INK[tier])}>
                    {TIER_NAME[tier]}
                  </span>
                </li>
              ))}
            </ul>
            {/* Primary only when there is nothing else to do here (no packs to open); none when
                the empty "No cats yet" above already offers it. */}
            {total > 0 && (
              <ModalButton
                variant={packs.length ? "secondary" : "primary"}
                size="sm"
                icon="shopping-bag"
                onClick={getPacks}
                className="self-start md:self-auto"
              >
                Get packs
              </ModalButton>
            )}
          </div>
        </ModalSection>
      )}
    </ModalStack>
  );
};

export const CatsModal = ({ close }: { close: () => void }) => {
  const [selectedCat, setSelectedCat] = useState<ICat | null>(null);

  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();

  const { setGameType } = useGame();
  const { data: cats, isError, refetch } = useQuery({
    queryKey: ["cats", profile?.cat],
    // Strict: a failed load shows "did not load" with a retry, never "No cats yet".
    queryFn: () => CAT_API.cats({ strict: true }),
    retry: 1,
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
        icon="paw"
        description="Your cat cards and unopened packs."
        name="cats"
        size="xl"
        bodyClassName="overflow-x-hidden"
      >
        <CatsModalContent
          setSelectedCat={setSelectedCat}
          mutatedCats={mutatedCats}
          status={cats ? "ready" : isError ? "error" : "loading"}
          onRetry={() => void refetch()}
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
