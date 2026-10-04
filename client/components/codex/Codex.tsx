import clsx from "clsx";
import { fetchTokenStatus, POINTS_STATUS, TOKEN_STATUS_QUERY_KEY, vaultVisible } from "@/api/token-status-api";
import { USER_API } from "@/api/user-api";
import {
  clearProgressTab,
  PROGRESS_TAB_EVENT,
  takeProgressTab,
  type ProgressTabDetail,
} from "@/components/impact/progressTab";
import { firstCodexEntry } from "@/context/auth/saveNudge";
import { useAccountAction, useLatest } from "@/hooks/useAccountAction";
import { cdnFile } from "@/constants/utils";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import {
  IAirdropCriterion,
  IAirdropProgression,
  IAirdropTierProgress,
} from "@/models/airdrop";
import { isApp } from "@/models/app";
import { GameModal } from "@/models/game";
import { IProfile } from "@/models/profile";
import { CAT_NAP_DAYS, CAT_NAP_MAX_CATS, CAT_NAP_TAILS, formatTails } from "@/shared-contracts/copy";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { PixelIcon } from "../shared/PixelIcon";
import {
  EmptyState,
  KeyValueList,
  KeyValueRow,
  LoadingState,
  ModalButton,
  ModalSection,
  ModalStack,
  ModalTabPanel,
  StatGrid,
  StatTile,
  StatusPill,
  type ModalTab,
} from "../ui/modal";
import { HintedTabs } from "../ui/modal/HintedTabs";
import { tailsExplainer, type SceneState } from "./explainer";
import { ImmortalizePetFlow } from "./ImmortalizePetFlow";
import { ImpactTab } from "./impact/ImpactTab";
import {
  MilestoneCard,
  MissionCard,
  ProgressBar,
  RewardCheckRow,
  TierCard,
  Well,
} from "./ProgressCards";
import {
  PROGRESS_TAB_LABELS,
  resolveProgressTab,
  visibleProgressTabs,
  type ProgressTab,
} from "./progressTabs";
import { localSeasonTime, seasonFrozen, seasonOf } from "./season";
import { TailsExplainer } from "./TailsExplainer";
import { Vault } from "./Vault";

export interface ICodex {
  title: string;
  description: string;
  how: string;
  image: string;
  task: string;
  progress?: number;
  verification: (profile?: IProfile | null) => boolean;
  status: (profile?: IProfile | null) => string;
}

export enum CODEX_LIFE {
  ONE = "1",
  TWO = "2",
  THREE = "3",
  FOUR = "4",
  FIVE = "5",
  SIX = "6",
  SEVEN = "7",
  EIGHT = "8",
  NINE = "9",
}

/** Metrics the 4e backend added (rescue points ledger); older responses lack them. */
type RescueMetrics = Partial<{ tailsEarned: number; tailsGiven: number; goalsHelped: number }>;

/** Tails each season badge adds at every season reset (the BADGES tab's bonus line). */
const BADGE_SEASON_TAILS = 300;

const codex: ICodex[] = [
  {
    title: "#1 One Spirit, Two Bodies",
    description:
      "Every COLLECTIBLE cat reflects a real soul. Digital twins of the forgotten, the wounded, the waiting. To adopt one is to guard both — in code and in flesh.",
    how: "Tap PACKS, buy a pack, then open it.",
    image: cdnFile("codex/codex-1.webp"),
    task: "Open a cat pack",
    verification: (profile) => (profile?.monthPacks || 0) >= 1,
    status: (profile) => `${profile?.monthPacks || 0} / 1`,
  },
  {
    title: "#2 Play Is Prayer",
    description:
      "When we quest, we serve. When we play, we mend. Every action echoes in shelters, clinics, and cages.",
    how: "Earn Tails by playing games, missions and events.",
    image: cdnFile("codex/codex-2.webp"),
    task: "Collect 100 Tails",
    verification: (profile) => (profile?.monthTails || 0) >= 100,
    status: (profile) => `${profile?.monthTails || 0} / 100`,
  },
  {
    title: "#3 No Life is Left Behind",
    description:
      // claim:fiction codex lore: an oath of the in-game order, it states no real rescue or payment
      "Not the last-born kitten in the corner. Not the one everyone walked past. We look after what others abandon. That is our oath.",
    how: "Go to HOME and feed your cat with the FEED TO CONTROL button.",
    image: cdnFile("codex/codex-5.webp"),
    task: "Feed your cat",
    verification: (profile) => (profile?.monthFeeded || 0) >= 1,
    status: (profile) => `${profile?.monthFeeded || 0} / 1`,
  },
  {
    title: "#4 The Bond Cannot Break",
    description:
      "Your cat is not your possession — it is your mirror. To neglect it is to neglect yourself. To care is to evolve.",
    how: "Use the DAILY SPIN on 10 days this season. You get one spin a day.",
    image: cdnFile("codex/codex-6.webp"),
    task: "Spin on 10 days",
    verification: (profile) => (profile?.monthStreak || 0) >= 10,
    status: (profile) => `${profile?.monthStreak || 0} / 10`,
  },
  {
    title: "#5 The Tailsguard Ascends Together",
    description:
      "For every life saved, the world shifts. The more we rescue, the stronger our network. Our magic multiplies.",
    how: "Open EVENTS, go to QUESTS and tap GET INVITE LINK. It counts once your friend has joined.",
    image: cdnFile("codex/codex-7.webp"),
    task: "Invite 1 friend",
    verification: (profile) => (profile?.monthReferrals || 0) >= 1,
    status: (profile) => `${profile?.monthReferrals || 0} / 1`,
  },
  {
    title: "#6 Beyond the Screen",
    description:
      "These cats are more than pixels. They are stories. Beacons. Proof that play can matter. And we, their guardians, become legends. Your feedback is CODEX fuel.",
    how: "Open EVENTS, go to QUESTS and complete 10 quests.",
    image: cdnFile("codex/codex-8.webp"),
    task: "Complete 10 quests",
    verification: (profile) => (profile?.quests?.length || 0) >= 10,
    status: (profile) => `${profile?.quests?.length || 0} / 10`,
  },
  {
    title: "#7 Destiny Is Shared",
    description:
      // claim:fiction codex lore: the in-game ninth life, no real rescue or money is meant here
      "To save a cat is to unlock its ninth life. But in return, it unlocks yours. Every rescuer earns a fortune not in coins, but in legacy, in status, in soul.",
    how: `Let your cats nap. Open 'MY PETS', pick a cat and send it to nap: after ${CAT_NAP_DAYS} days it brings ${formatTails(CAT_NAP_TAILS)}. Up to ${CAT_NAP_MAX_CATS} cats can nap at once.`,
    image: cdnFile("codex/codex-9.webp"),
    task: "Earn 100 Tails from naps",
    verification: (profile) => (profile?.monthTailsCrafted || 0) >= 100,
    status: (profile) => `${profile?.monthTailsCrafted || 0} / 100`,
  },
];

/** "3 / 10" as numbers, for the bar. */
const parseStatus = (text: string): { value: number; max: number } => {
  const [a, b] = text.split("/").map((n) => Number(n.trim()));
  return { value: Number.isFinite(a) ? a : 0, max: Number.isFinite(b) && b > 0 ? b : 1 };
};

/** One season badge mission: its art, the task, what to do, progress, and the lore under WHY?. */
export const CodexSection = ({ title, description, how, image, task, verification, status }: ICodex) => {
  const [lore, setLore] = useState(false);
  const { profile } = useProfile();
  const id = useId();
  const isCompleted = useMemo(() => verification?.(profile), [profile, verification]);
  const line = status(profile);
  const { value, max } = parseStatus(line);
  const number = title.slice(0, 2);

  return (
    <Well tone={isCompleted ? "done" : "default"} data-testid="badge-mission" className="h-full">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <img src={image} alt="" aria-hidden="true" className="h-14 w-14 object-contain [image-rendering:pixelated]" />
          <span className="absolute -left-1 -top-1 bg-tt-night-950 px-1 font-primary text-p6 leading-tight text-tt-gold-400">
            {number}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-cream">{task}</p>
            {isCompleted ? (
              <StatusPill tone="mint" icon="check">Done</StatusPill>
            ) : (
              <span className="shrink-0 font-primary text-p5 leading-none text-tt-cream">{line}</span>
            )}
          </div>
          {/* What to do, in plain words (the lore title sits under WHY?). */}
          <p className="mt-1 font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">{how}</p>
        </div>
      </div>
      <ProgressBar value={value} max={max} tone={isCompleted ? "mint" : "gold"} label={`${task}: ${line}`} />
      <ModalButton
        variant="ghost"
        size="sm"
        icon="heart"
        aria-expanded={lore}
        aria-controls={`${id}-info`}
        onClick={() => setLore((open) => !open)}
        className={clsx("self-start", lore && "text-tt-cream")}
      >
        WHY?
      </ModalButton>
      <div id={`${id}-info`} aria-live="polite">
        {lore && (
          <div className="animate-opacity bg-tt-night-950/50 p-2.5 motion-reduce:animate-none">
            <p className="font-primary text-p6 uppercase tracking-wide text-tt-gold-400">{title.slice(3)}</p>
            <p className="mt-1 font-sans text-p6 font-semibold leading-snug text-tt-cream md:text-p5">{description}</p>
          </div>
        )}
      </div>
    </Well>
  );
};

/** Where a reward check's button goes (the lobby modal that moves that check). */
const CHECK_PLACES: Record<string, { modal: GameModal; label: string }> = {
  COLLECTIBLES: { modal: GameModal.PACKS, label: "Open PACKS" },
  RARE_PLUS: { modal: GameModal.PACKS, label: "Open PACKS" },
  QUESTS: { modal: GameModal.QUESTS, label: "Open quests" },
  STREAK: { modal: GameModal.SPIN_WHEEL, label: "Daily spin" },
};

type INextAction = {
  label: string;
  detail: string;
  progress: string;
  /** The reward check this step is about, for its button. */
  checkId?: string;
};

const getNextAction = (
  eligibilityCriteria?: IAirdropCriterion[],
  tiers?: IAirdropTierProgress[],
): INextAction | null => {
  if (!eligibilityCriteria?.length || !tiers?.length) {
    return null;
  }

  const unmetCriterion = eligibilityCriteria.find((criterion) => !criterion.met);
  if (unmetCriterion) {
    return {
      label: `Reward check: ${unmetCriterion.label}`,
      detail: unmetCriterion.description,
      progress: `${unmetCriterion.current} / ${unmetCriterion.target}`,
      checkId: unmetCriterion.id,
    };
  }

  const nextTier = tiers.find((tier) => !tier.unlocked);
  if (!nextTier) {
    return {
      label: "Every tier is unlocked",
      detail: "Claim what is left and keep climbing the leaderboard.",
      progress: "All done",
    };
  }

  const missingRequirement = nextTier.requirements.find((requirement) => !requirement.met);
  if (!missingRequirement) {
    return {
      label: `Unlock ${nextTier.name}`,
      detail: "Open TIERS, reveal the prize and claim it.",
      progress: "Ready",
    };
  }

  return {
    label: `Next tier: ${nextTier.name}`,
    detail: `${missingRequirement.label} to unlock it.`,
    progress: `${missingRequirement.current} / ${missingRequirement.target}`,
  };
};

const TAB_ICONS: Record<ProgressTab, ModalTab["icon"]> = {
  impact: "paw",
  rewards: "gift",
  missions: "target",
  tiers: "trophy",
  "pet-art": "image",
  badges: "star",
  vault: "lock",
};

/** The one line under each tab's heading: what the tab is for, in plain words. */
const TAB_HELP: Record<Exclude<ProgressTab, "impact" | "vault" | "pet-art">, { title: string; icon: ModalTab["icon"]; helper: string }> = {
  rewards: {
    title: "Your rewards",
    icon: "gift",
    helper: "What you can claim now, your tier and the checks that unlock tier prizes.",
  },
  missions: {
    title: "Daily missions",
    icon: "target",
    helper: "Small goals that pay Tails. Finish one, then claim it here.",
  },
  tiers: {
    title: "Tiers",
    icon: "trophy",
    helper: "Each tier has a one-time prize. Meet its requirements, reveal the prize, then claim it.",
  },
  badges: {
    title: "Season badge",
    icon: "star",
    helper: `Finish all ${codex.length} missions this season to earn a badge. Each badge adds ${formatTails(BADGE_SEASON_TAILS)} at every season reset.`,
  },
};

export interface CodexProps {
  /** The tab to open on (a deep link). Without it, a pending lobby request or IMPACT. */
  tab?: ProgressTab;
  /**
   * The scene behind PROGRESS, so the Tails explainer opens only on a menu or game-over screen.
   * Null (or absent) means no running scene, e.g. outside the game shell.
   */
  scene?: SceneState | null;
  /** Opens a lobby modal (PACKS, EVENTS, DAILY SPIN) for the next step's button; none outside the game. */
  onOpenModal?: (modal: GameModal) => void;
}

export const Codex = ({ tab, scene = null, onOpenModal }: CodexProps = {}) => {
  // The lobby's RESCUE tile and MY IMPACT ask for a tab beside the open (task 5e): read it once.
  const [requestedTab] = useState<ProgressTab | null>(() => tab ?? takeProgressTab());
  const [chosenTab, setChosenTab] = useState<ProgressTab | null>(null);
  const [revealedRewards, setRevealedRewards] = useState<
    Record<string, boolean>
  >({});
  const [claimingTierId, setClaimingTierId] = useState<string | null>(null);
  const [claimingChallengeId, setClaimingChallengeId] = useState<string | null>(
    null,
  );
  const [claimingMilestoneId, setClaimingMilestoneId] = useState<string | null>(
    null,
  );
  const { profile, setProfileUpdate } = useProfile();
  const showToast = useToast();
  const queryClient = useQueryClient();
  // Airdrop tier, challenge and milestone claims are account actions (decision #9): a guest gets
  // the AuthSheet ("CLAIM YOUR REWARDS") and the claim goes on once they signed in. The claim
  // code reads the profile and its setter through `latest`, since it may run after the sheet replaced it.
  const { runWithAccount } = useAccountAction();
  const latest = useLatest({ profile, setProfileUpdate });

  const {
    data: airdropProgression,
    isLoading: isAirdropLoading,
    isError: isAirdropError,
    refetch: refetchAirdropProgression,
  } = useQuery({
    queryKey: ["airdrop-progression", profile?._id],
    queryFn: async () => {
      const data = await USER_API.airdropProgression();
      if (!data) {
        throw new Error("Failed to load airdrop progression");
      }
      return data;
    },
    enabled: !!profile?._id,
  });

  const completedMonths = useMemo(() => {
    return profile?.codex?.filter((item) => item === 1)?.length || 0;
  }, [profile]);
  const completedCount = useMemo(() => {
    return codex.filter((item) => item.verification?.(profile)).length;
  }, [profile]);
  const monthlyBadgeYield = useMemo(() => {
    return (profile?.codex?.reduce((acc, item) => acc + item, 0) || 0) * 300;
  }, [profile]);
  const remainingBadgeMissions = useMemo(
    () => Math.max(0, codex.length - completedCount),
    [completedCount],
  );
  const isCompleted = useMemo(() => {
    return completedCount >= codex.length;
  }, [completedCount]);

  const saveCodex = useDebouncedCallback(async () => {
    await USER_API.saveCodex().then((response) => {
      setProfileUpdate({ codex: response?.codex || profile?.codex });
    });
  }, 1000);
  useEffect(() => {
    if (isCompleted) {
      saveCodex();
    }
  }, [isCompleted, saveCodex]);
  // The season comes from the backend (plan G5 P6); the client never computes its dates.
  const season = useMemo(() => seasonOf(airdropProgression), [airdropProgression]);
  const seasonIsFrozen = season ? seasonFrozen(season, new Date()) : false;

  // VAULT (decision #39): web only, and only when the backend says TOKEN. App builds never ask.
  const { data: tokenStatus, isPending: tokenStatusPending } = useQuery({
    queryKey: [TOKEN_STATUS_QUERY_KEY],
    queryFn: ({ signal }) => fetchTokenStatus({ isApp, signal }),
    enabled: !isApp,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const showVault = vaultVisible(tokenStatus ?? POINTS_STATUS, isApp);
  const progressTabs = useMemo(() => visibleProgressTabs({ isApp, vault: showVault }), [showVault]);
  const wantedTab = chosenTab ?? requestedTab;
  const activeProgressTab = resolveProgressTab(wantedTab, progressTabs);
  // A link to VAULT waits for token-status instead of showing IMPACT and then jumping.
  const waitingForVault = wantedTab === "vault" && !isApp && tokenStatusPending;
  const rootRef = useRef<HTMLDivElement>(null);
  const setActiveProgressTab = setChosenTab;

  // A request for an already open PROGRESS (the event), and no stale request after it closes.
  useEffect(() => {
    const onTab = (event: Event) => {
      const detail = (event as CustomEvent<ProgressTabDetail>).detail;
      if (detail?.tab) {
        takeProgressTab();
        setChosenTab(detail.tab);
      }
    };
    window.addEventListener(PROGRESS_TAB_EVENT, onTab);
    return () => {
      window.removeEventListener(PROGRESS_TAB_EVENT, onTab);
      clearProgressTab();
    };
  }, []);

  // First codex entry: the guest save nudge (decision #10) and the Tails explainer, queued.
  useEffect(() => {
    firstCodexEntry();
    tailsExplainer.request();
  }, []);
  const nextAction = useMemo(
    () =>
      getNextAction(
        airdropProgression?.eligibilityCriteria,
        airdropProgression?.tiers,
      ),
    [airdropProgression],
  );
  const nextMilestone = useMemo(
    () =>
      airdropProgression?.gamification?.milestones?.find(
        (milestone) =>
          milestone.id === airdropProgression.gamification.nextMilestoneId,
      ) || null,
    [airdropProgression],
  );
  const rescueMetrics: RescueMetrics = (airdropProgression?.metrics ?? {}) as RescueMetrics;
  const eligibilityStats = useMemo(() => {
    const total = airdropProgression?.eligibilityCriteria?.length || 0;
    const met =
      airdropProgression?.eligibilityCriteria?.filter((item) => item.met)
        .length || 0;
    const progress = total ? Math.round((met / total) * 100) : 0;
    return { total, met, progress };
  }, [airdropProgression]);
  const tierStats = useMemo(() => {
    const total = airdropProgression?.tiers?.length || 0;
    const unlocked =
      airdropProgression?.tiers?.filter((tier) => tier.unlocked).length || 0;
    const progress = total ? Math.round((unlocked / total) * 100) : 0;
    return { total, unlocked, progress };
  }, [airdropProgression]);
  const rewardStats = useMemo(() => {
    const claimableChallengeTails =
      airdropProgression?.gamification?.dailyChallenges
        ?.filter((challenge) => challenge.claimable)
        .reduce((sum, challenge) => sum + challenge.rewardTails, 0) || 0;
    const claimableMilestoneTails =
      airdropProgression?.gamification?.milestones
        ?.filter((milestone) => milestone.claimable)
        .reduce((sum, milestone) => sum + milestone.rewardTails, 0) || 0;
    const claimableTierTails =
      airdropProgression?.tiers
        ?.filter((tier) => tier.claimable && airdropProgression.eligible !== false)
        .reduce((sum, tier) => sum + tier.reward.tails, 0) || 0;
    const claimableCount =
      (airdropProgression?.gamification?.dailyChallenges?.filter(
        (challenge) => challenge.claimable,
      ).length || 0) +
      (airdropProgression?.gamification?.milestones?.filter(
        (milestone) => milestone.claimable,
      ).length || 0) +
      (airdropProgression?.tiers?.filter((tier) => tier.claimable && airdropProgression.eligible !== false).length || 0);
    const claimableTails =
      claimableChallengeTails + claimableMilestoneTails + claimableTierTails;
    const stashBonusPercent =
      airdropProgression?.metrics?.legendaryStashBonusPercent || 0;
    const additionalLegendaryCards =
      airdropProgression?.metrics?.additionalLegendaryCards || 0;
    const stashBonusMultiplier =
      airdropProgression?.metrics?.legendaryStashBonusMultiplier || 1;

    return {
      claimableChallengeTails,
      claimableMilestoneTails,
      claimableTierTails,
      claimableCount,
      claimableTails,
      stashBonusPercent,
      additionalLegendaryCards,
      stashBonusMultiplier,
    };
  }, [airdropProgression]);
  const revealTier = (tierId: string) => {
    setRevealedRewards((prev) => ({ ...prev, [tierId]: true }));
  };

  const syncAirdropProgression = async (progression?: IAirdropProgression) => {
    const { profile } = latest.current;
    if (!profile?._id) {
      return;
    }
    if (progression) {
      queryClient.setQueryData(
        ["airdrop-progression", profile._id],
        progression,
      );
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ["airdrop-progression", profile._id],
    });
  };

  const claimTierReward = (tierId: string) =>
    void runWithAccount("claim-rewards", () => runClaimTierReward(tierId));

  const runClaimTierReward = async (tierId: string) => {
    if (claimingTierId) {
      return;
    }
    setClaimingTierId(tierId);

    try {
      const result = await USER_API.claimAirdropTier(tierId);
      if (!result.success) {
        showToast({
          message: result.message || "Unable to claim this tier right now.",
          isError: true,
        });
        return;
      }

      revealTier(tierId);
      const { profile } = latest.current;
      const alreadyClaimed = profile?.airdropRewardsClaimed || [];
      const claimedTierId = result.tierId || tierId;
      latest.current.setProfileUpdate({
        tails: (profile?.tails || 0) + (result.tails || 0),
        airdropRewardsClaimed: Array.from(
          new Set([...alreadyClaimed, claimedTierId]),
        ),
      });
      showToast({
        message: result.message || `Claimed ${formatTails(result.tails || 0)}`,
        symbol: "tails",
      });
      await syncAirdropProgression(result.progression);
    } finally {
      setClaimingTierId(null);
    }
  };

  const claimChallengeReward = (challengeId: string) =>
    void runWithAccount("claim-rewards", () => runClaimChallengeReward(challengeId));

  const runClaimChallengeReward = async (challengeId: string) => {
    if (claimingChallengeId) {
      return;
    }
    setClaimingChallengeId(challengeId);

    try {
      const result = await USER_API.claimAirdropChallenge(challengeId);
      if (!result.success) {
        showToast({
          message:
            result.message ||
            "Unable to claim this challenge reward right now.",
          isError: true,
        });
        return;
      }
      latest.current.setProfileUpdate({
        tails: (latest.current.profile?.tails || 0) + (result.tails || 0),
      });
      showToast({
        message: result.message || `Claimed ${formatTails(result.tails || 0)}`,
        symbol: "tails",
      });
      await syncAirdropProgression(result.progression);
    } finally {
      setClaimingChallengeId(null);
    }
  };

  const claimMilestoneReward = (milestoneId: string) =>
    void runWithAccount("claim-rewards", () => runClaimMilestoneReward(milestoneId));

  const runClaimMilestoneReward = async (milestoneId: string) => {
    if (claimingMilestoneId) {
      return;
    }
    setClaimingMilestoneId(milestoneId);

    try {
      const result = await USER_API.claimAirdropMilestone(milestoneId);
      if (!result.success) {
        showToast({
          message:
            result.message ||
            "Unable to claim this milestone reward right now.",
          isError: true,
        });
        return;
      }
      latest.current.setProfileUpdate({
        tails: (latest.current.profile?.tails || 0) + (result.tails || 0),
      });
      showToast({
        message: result.message || `Claimed ${formatTails(result.tails || 0)}`,
        symbol: "tails",
      });
      await syncAirdropProgression(result.progression);
    } finally {
      setClaimingMilestoneId(null);
    }
  };

  const missionsReady =
    (airdropProgression?.gamification?.dailyChallenges?.filter((c) => c.claimable).length || 0) +
    (airdropProgression?.gamification?.milestones?.filter((m) => m.claimable).length || 0);
  const tiersReady = airdropProgression?.tiers?.filter((t) => t.claimable && airdropProgression.eligible !== false).length || 0;
  const tabs: ModalTab<ProgressTab>[] = progressTabs.map((id) => ({
    id,
    label: PROGRESS_TAB_LABELS[id],
    icon: TAB_ICONS[id],
    testId: `progress-tab-${id}`,
    badge: id === "missions" && missionsReady ? missionsReady : id === "tiers" && tiersReady ? tiersReady : undefined,
  }));
  const shownTab = waitingForVault ? "vault" : activeProgressTab;
  // A new tab starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    const scroller = rootRef.current?.closest<HTMLElement>(".overflow-y-auto");
    if (scroller && scroller.scrollTop > 0) scroller.scrollTo({ top: 0 });
  }, [shownTab]);
  const needsProgression = ["rewards", "missions", "tiers"].includes(activeProgressTab);
  const help = shownTab !== "impact" && shownTab !== "vault" && shownTab !== "pet-art" ? TAB_HELP[shownTab] : null;
  const tierName = (id?: string | null) =>
    (id && airdropProgression?.tiers?.find((t) => t.id === id)?.name) || null;
  const currentTierName = tierName(airdropProgression?.currentTierId);
  const nextTierName = tierName(airdropProgression?.nextTierId);
  // Where the waiting rewards are: missions and milestones first, then tier prizes.
  const claimTab: ProgressTab = missionsReady ? "missions" : "tiers";
  const claimParts = [
    rewardStats.claimableChallengeTails > 0 && `Missions +${formatTails(rewardStats.claimableChallengeTails, { word: false })}`,
    rewardStats.claimableMilestoneTails > 0 && `Milestones +${formatTails(rewardStats.claimableMilestoneTails, { word: false })}`,
    rewardStats.claimableTierTails > 0 && `Tiers +${formatTails(rewardStats.claimableTierTails, { word: false })}`,
    rewardStats.additionalLegendaryCards > 0 &&
      `Legendary bonus x${rewardStats.stashBonusMultiplier.toFixed(2)}`,
  ].filter(Boolean) as string[];
  const checkPlace = nextAction?.checkId ? CHECK_PLACES[nextAction.checkId] : undefined;
  const streakDays = airdropProgression?.metrics?.streak ?? profile?.streak ?? 0;

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 pb-6 short:gap-3">
      <div
        data-testid="progress-tabs"
        className="sticky -top-4 z-20 -mx-4 -mt-4 bg-tt-night-800 px-4 pb-2 pt-4 shadow-[0_2px_0_rgb(var(--tt-gold-500)/0.22)] md:-mx-6 md:px-6 short:static short:shadow-none"
      >
        <HintedTabs
          tabs={tabs}
          value={shownTab}
          onChange={(id) => setActiveProgressTab(id)}
          label="Progress sections"
          idBase="progress"
          className="md:[&_[role=tab]]:text-p4"
        />
      </div>

      <ModalTabPanel idBase="progress" id={shownTab} className="flex flex-col gap-4 short:gap-3">
        {activeProgressTab === "impact" && !waitingForVault && <TailsExplainer scene={scene} />}

        {waitingForVault && (
          <div data-testid="vault-loading">
            <LoadingState rows={3} label="Loading the Vault" className="py-6" />
          </div>
        )}

        {!waitingForVault && activeProgressTab === "impact" && (
          <ImpactTab season={season} seasonLoading={isAirdropLoading} />
        )}

        {activeProgressTab === "vault" && showVault && tokenStatus && <Vault status={tokenStatus} />}

        {needsProgression && isAirdropLoading && (
          <ModalSection title={help?.title} icon={help?.icon} helper={help?.helper}>
            <LoadingState rows={4} label="Loading your progress" />
          </ModalSection>
        )}
        {needsProgression && isAirdropError && (
          <ModalSection tone="danger">
            <EmptyState
              tone="error"
              icon="warning-diamond"
              title="Progress could not load"
              body="Your Tails and rewards are safe. Try again in a moment."
              action={
                <ModalButton variant="secondary" icon="reload" onClick={() => refetchAirdropProgression()}>
                  RETRY
                </ModalButton>
              }
            />
          </ModalSection>
        )}

        {!!airdropProgression && activeProgressTab === "rewards" && help && (
          <ModalStack>
            {rewardStats.claimableCount > 0 ? (
              // Rewards are waiting: claiming them is the next step, whatever the long-term check says.
              <ModalSection
                tone="highlight"
                title="Your next step"
                icon="zap"
                aside={<StatusPill tone="gold">{rewardStats.claimableCount} ready</StatusPill>}
                data-testid="next-step"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-primary text-p3 uppercase leading-tight text-tt-cream">
                      Claim {formatTails(rewardStats.claimableTails)}
                    </p>
                    <p className="mt-1 font-sans text-p5 font-semibold leading-snug text-tt-muted">
                      {rewardStats.claimableCount} reward{rewardStats.claimableCount === 1 ? " is" : "s are"} ready in{" "}
                      {missionsReady && tiersReady ? "Missions and Tiers" : missionsReady ? "Missions" : "Tiers"}.
                    </p>
                  </div>
                  <ModalButton
                    variant="primary"
                    icon="gift"
                    className="shrink-0"
                    data-testid="next-step-claim"
                    onClick={() => setActiveProgressTab(claimTab)}
                  >
                    Claim now
                  </ModalButton>
                </div>
              </ModalSection>
            ) : (
              !!nextAction && (
                <ModalSection
                  tone="highlight"
                  title="Your next step"
                  icon="zap"
                  aside={<StatusPill tone="gold">{nextAction.progress}</StatusPill>}
                  data-testid="next-step"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-primary text-p3 uppercase leading-tight text-tt-cream">{nextAction.label}</p>
                      <p className="mt-1 font-sans text-p5 font-semibold leading-snug text-tt-muted">{nextAction.detail}</p>
                    </div>
                    {checkPlace && onOpenModal && (
                      <ModalButton
                        variant="secondary"
                        icon="chevron-right"
                        className="shrink-0"
                        data-testid="next-step-go"
                        onClick={() => onOpenModal(checkPlace.modal)}
                      >
                        {checkPlace.label}
                      </ModalButton>
                    )}
                  </div>
                </ModalSection>
              )
            )}

            <ModalSection title={help.title} icon={help.icon} helper={help.helper}>
              <StatGrid cols={4}>
                {rewardStats.claimableCount > 0 ? (
                  // The tile is a way in: it opens the tab where the rewards wait.
                  <button
                    type="button"
                    onClick={() => setActiveProgressTab(claimTab)}
                    className="group min-w-0 text-left outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-tt-gold-400"
                    aria-label={`To claim: ${formatTails(rewardStats.claimableTails)}. Open ${claimTab === "missions" ? "Missions" : "Tiers"}`}
                    data-testid="to-claim-tile"
                  >
                    <StatTile
                      label="To claim"
                      icon="gift"
                      tone="gold"
                      className="h-full transition-[box-shadow] group-hover:[box-shadow:inset_0_0_0_2px_rgb(var(--tt-gold-400)/0.7)] motion-reduce:transition-none"
                      value={formatTails(rewardStats.claimableTails, { word: false })}
                      unit="Tails"
                      helper={claimParts.join(" · ")}
                    />
                  </button>
                ) : (
                  <StatTile
                    label="To claim"
                    icon="gift"
                    tone="gold"
                    value={formatTails(rewardStats.claimableTails, { word: false })}
                    unit="Tails"
                    helper="Nothing yet. Finish a mission first."
                  />
                )}
                <StatTile
                  label="Tier"
                  icon="trophy"
                  tone="sky"
                  value={`${tierStats.unlocked} / ${tierStats.total}`}
                  progress={{ value: tierStats.unlocked, max: tierStats.total || 1 }}
                  helper={`Now: ${currentTierName ?? "none yet"} · Next: ${nextTierName ?? "all done"}`}
                />
                <StatTile
                  label="Checks"
                  icon="check"
                  tone="mint"
                  value={`${eligibilityStats.met} / ${eligibilityStats.total}`}
                  progress={{ value: eligibilityStats.met, max: eligibilityStats.total || 1 }}
                  helper="Meet them all to claim tier prizes."
                />
                <StatTile
                  label="Streak"
                  icon="fire"
                  tone="pink"
                  value={streakDays}
                  unit={streakDays === 1 ? "day" : "days"}
                  helper={`x${airdropProgression.gamification.comboMultiplier} bonus · +${formatTails(airdropProgression.gamification.streakBonusTails)}`}
                />
              </StatGrid>
            </ModalSection>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 short:gap-3">
              <ModalSection
                title="Reward checks"
                icon="check"
                helper="Tier prizes can be claimed once every check is met."
                aside={
                  airdropProgression.eligible ? (
                    <StatusPill tone="mint" icon="check">All met</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">
                      {eligibilityStats.met} of {eligibilityStats.total}
                    </StatusPill>
                  )
                }
              >
                <div className="grid gap-2 xl:grid-cols-2">
                  {airdropProgression.eligibilityCriteria.map((criterion) => (
                    <RewardCheckRow key={criterion.id} criterion={criterion} />
                  ))}
                </div>
              </ModalSection>

              <ModalSection
                title={`Level ${airdropProgression.gamification.level}`}
                icon="star"
                helper={`${airdropProgression.gamification.title}. Playing and claiming rewards gives XP.`}
                aside={
                  <StatusPill tone="gold">
                    {airdropProgression.gamification.xp} / {airdropProgression.gamification.nextLevelXp} XP
                  </StatusPill>
                }
              >
                <ProgressBar
                  value={airdropProgression.gamification.levelProgress}
                  max={100}
                  label={`Level ${airdropProgression.gamification.level} progress`}
                />
                <KeyValueList>
                  <KeyValueRow
                    icon="coins"
                    label="Bonus you can still earn"
                    value={`+${formatTails(airdropProgression.gamification.potentialBonusTails)}`}
                  />
                  <KeyValueRow
                    icon="check"
                    label="Claimed so far"
                    value={`${airdropProgression.totalClaimedChallenges} missions · ${airdropProgression.totalClaimedMilestones} milestones`}
                  />
                </KeyValueList>
              </ModalSection>
            </div>

            <ModalSection
              title="Your collection"
              icon="users"
              helper="Cats you own and good you did. Every Tail you earn counts toward your rank, even after you give it."
              aside={<StatusPill tone="sky">Collection lvl {airdropProgression.metrics.collectibleLevel}</StatusPill>}
            >
              <StatGrid cols={4}>
                <StatTile label="Cats" icon="paw" value={airdropProgression.metrics.collectiblesOwned} />
                <StatTile label="Quests done" icon="target" value={airdropProgression.metrics.questsCompleted} />
                <StatTile
                  label="Tails given"
                  icon="heart"
                  tone="pink"
                  value={formatTails(rescueMetrics.tailsGiven ?? 0, { word: false })}
                />
                <StatTile label="Goals helped" icon="trophy" tone="mint" value={rescueMetrics.goalsHelped ?? 0} />
              </StatGrid>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">Unlocked:</span>
                {airdropProgression.unlockedUnlockables.length > 0 ? (
                  airdropProgression.unlockedUnlockables.map((unlockable) => (
                    <StatusPill key={unlockable} tone="gold">
                      {unlockable}
                    </StatusPill>
                  ))
                ) : (
                  <span className="font-sans text-p6 font-semibold text-tt-muted">nothing yet. Tier prizes show here.</span>
                )}
              </div>
            </ModalSection>
          </ModalStack>
        )}

        {!!airdropProgression && activeProgressTab === "missions" && help && (
          <ModalStack>
            <ModalSection
              title={help.title}
              icon={help.icon}
              helper={help.helper}
              tone={missionsReady ? "highlight" : "default"}
              aside={missionsReady ? <StatusPill tone="gold" icon="gift">{missionsReady} ready</StatusPill> : undefined}
            >
              {airdropProgression.gamification.dailyChallenges.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {airdropProgression.gamification.dailyChallenges.map((challenge) => (
                    <MissionCard
                      key={challenge.id}
                      challenge={challenge}
                      isClaiming={claimingChallengeId === challenge.id}
                      onClaim={() => claimChallengeReward(challenge.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState compact icon="target" title="No missions today" body="New missions show up here each day." />
              )}
            </ModalSection>

            <ModalSection
              title="Milestones"
              icon="crown"
              helper={
                nextMilestone
                  ? `Bigger goals that pay once. Next: ${nextMilestone.label} (${nextMilestone.current} / ${nextMilestone.target}).`
                  : "Bigger goals that pay once. You reached them all."
              }
            >
              <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" aria-label="Milestones">
                {airdropProgression.gamification.milestones.map((milestone) => (
                  <MilestoneCard
                    key={milestone.id}
                    milestone={milestone}
                    isClaiming={claimingMilestoneId === milestone.id}
                    onClaim={() => claimMilestoneReward(milestone.id)}
                  />
                ))}
              </ul>
            </ModalSection>
            <p className="flex items-start gap-2 px-1 font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">
              <PixelIcon name="info-box" size={16} className="mt-0.5 shrink-0 text-tt-gold-400" />
              Claimed missions and milestones help you climb the tiers. Every Tail you earn counts toward your rank,
              even after you give it to a goal.
            </p>
          </ModalStack>
        )}

        {!!airdropProgression && activeProgressTab === "tiers" && help && (
          <ModalSection
            title={help.title}
            icon={help.icon}
            helper={help.helper}
            aside={tiersReady ? <StatusPill tone="gold" icon="gift">{tiersReady} ready</StatusPill> : undefined}
          >
            <div className="grid gap-3 xl:grid-cols-2">
              {airdropProgression.tiers.map((tier) => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  checksMet={airdropProgression.eligible}
                  revealed={!!revealedRewards[tier.id]}
                  isClaiming={claimingTierId === tier.id}
                  onReveal={() => revealTier(tier.id)}
                  onClaim={() => claimTierReward(tier.id)}
                />
              ))}
            </div>
          </ModalSection>
        )}

        {activeProgressTab === "pet-art" && (
          <ImmortalizePetFlow
            onPurchaseComplete={() => {
              void syncAirdropProgression();
            }}
          />
        )}

        {activeProgressTab === "badges" && help && (
          <ModalStack>
            <ModalSection
              title={help.title}
              icon={help.icon}
              helper={help.helper}
              tone={isCompleted ? "success" : "default"}
              aside={
                isCompleted ? (
                  <StatusPill tone="mint" icon="check">Earned</StatusPill>
                ) : (
                  <StatusPill tone="neutral">In progress</StatusPill>
                )
              }
            >
              <StatGrid cols={3}>
                <StatTile
                  label="This season"
                  icon="target"
                  value={`${completedCount} / ${codex.length}`}
                  unit="missions"
                  progress={{ value: completedCount, max: codex.length }}
                  helper={
                    isCompleted
                      ? "All done. This season's badge is yours."
                      : `${remainingBadgeMissions} more to earn this season's badge.`
                  }
                  className="col-span-2 md:col-span-1 short:col-span-1"
                />
                <StatTile
                  label="Earned"
                  icon="star"
                  tone="pink"
                  value={completedMonths}
                  unit={completedMonths === 1 ? "badge" : "badges"}
                  helper={completedMonths > 0 ? "Badges you kept from past seasons." : "Your first one is a season of missions away."}
                />
                <StatTile
                  label="Bonus"
                  icon="coins"
                  value={`+${formatTails(monthlyBadgeYield, { word: false })}`}
                  unit="Tails"
                  helper={`Each season reset: ${formatTails(BADGE_SEASON_TAILS)} per badge.`}
                />
              </StatGrid>
              <details className="group bg-tt-night-950/40 px-3 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-night-500)/0.6)]">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 font-primary text-p5 uppercase tracking-wide text-tt-cream">
                  <PixelIcon name="info-box" size={16} className="text-tt-gold-400" />
                  How badges work
                  <PixelIcon name="chevron-right" size={16} className="ml-auto transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                </summary>
                <dl className="grid gap-3 pb-3 font-sans text-p6 font-semibold leading-snug md:grid-cols-3 md:text-p5">
                  <div>
                    <dt className="font-extrabold text-tt-gold-400">What do I do?</dt>
                    <dd className="text-tt-cream">Finish all {codex.length} missions below within one season.</dd>
                  </div>
                  <div>
                    <dt className="font-extrabold text-tt-gold-400">When does it reset?</dt>
                    <dd className="text-tt-cream">
                      {season
                        ? `The next season starts ${localSeasonTime(season.anchorAt)} (your time).`
                        : "A new season starts every month."}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-extrabold text-tt-gold-400">What do I get?</dt>
                    <dd className="text-tt-cream">
                      Bonus Tails each season, tier progress, discounted collectibles, priority support and early access to updates.
                    </dd>
                  </div>
                </dl>
              </details>
            </ModalSection>

            <ModalSection
              title="This season's missions"
              icon="target"
              aside={<StatusPill tone={isCompleted ? "mint" : "neutral"}>{completedCount} / {codex.length}</StatusPill>}
            >
              {seasonIsFrozen ? (
                <EmptyState
                  compact
                  icon="loader"
                  title="Counting this season's badges"
                  body="New missions open when the next season starts."
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {codex.map((item, i) => (
                    <CodexSection key={i} {...item} progress={i + 1} />
                  ))}
                </div>
              )}
            </ModalSection>
          </ModalStack>
        )}
      </ModalTabPanel>
    </div>
  );
};
