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
  IAirdropChallenge,
  IAirdropCriterion,
  IAirdropMilestone,
  IAirdropProgression,
  IAirdropTierProgress,
} from "@/models/airdrop";
import { isApp } from "@/models/app";
import { IProfile } from "@/models/profile";
import { CAT_NAP_DAYS, CAT_NAP_MAX_CATS, CAT_NAP_TAILS, formatTails } from "@/shared-contracts/copy";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { tailsExplainer, type SceneState } from "./explainer";
import { ImmortalizePetFlow } from "./ImmortalizePetFlow";
import { ImpactTab } from "./impact/ImpactTab";
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

const codex: ICodex[] = [
  {
    title: "#1 One Spirit, Two Bodies",
    description:
      "Every COLLECTIBLE cat reflects a real soul. Digital twins of the forgotten, the wounded, the waiting. To adopt one is to guard both — in code and in flesh.",
    how: "CLICK 'SHOP`, Purchase a pack and open it!",
    image: cdnFile("codex/codex-1.webp"),
    task: "PURCHASE CAT PACK",
    verification: (profile) => (profile?.monthPacks || 0) >= 1,
    status: (profile) => `${profile?.monthPacks || 0} / 1`,
  },
  {
    title: "#2 Play Is Prayer",
    description:
      "When we quest, we serve. When we play, we mend. Every action echoes in shelters, clinics, and cages.",
    how: "Earn Tails by playing games, missions and events.",
    image: cdnFile("codex/codex-2.webp"),
    task: "COLLECT 100 TAILS",
    verification: (profile) => (profile?.monthTails || 0) >= 100,
    status: (profile) => `${profile?.monthTails || 0} / 100`,
  },
  {
    title: "#3 No Life is Left Behind",
    description:
      // claim:fiction codex lore: an oath of the in-game order, it states no real rescue or payment
      "Not the last-born kitten in the corner. Not the one everyone walked past. We look after what others abandon. That is our oath.",
    how: "Go to HOME and feed your cat by clicki 'FEED TO CONTROL' button.",
    image: cdnFile("codex/codex-5.webp"),
    task: "FEED YOUR CATS",
    verification: (profile) => (profile?.monthFeeded || 0) >= 1,
    status: (profile) => `${profile?.monthFeeded || 0} / 1`,
  },
  {
    title: "#4 The Bond Cannot Break",
    description:
      "Your cat is not your possession — it is your mirror. To neglect it is to neglect yourself. To care is to evolve.",
    how: "Click 'CHECK-IN' button 10 times! You can do it once a day.",
    image: cdnFile("codex/codex-6.webp"),
    task: "CHECK-IN 10 times",
    verification: (profile) => (profile?.monthStreak || 0) >= 10,
    status: (profile) => `${profile?.monthStreak || 0} / 10`,
  },
  {
    title: "#5 The Tailsguard Ascends Together",
    description:
      "For every life saved, the world shifts. The more we rescue, the stronger our network. Our magic multiplies.",
    how: "Go to 'EVENTS' section, then 'QUESTS' click 'INVITE' button and invite a friend. Once they onboard, you'll be rewarded.",
    image: cdnFile("codex/codex-7.webp"),
    task: "ONBOARD 1 FRIEND",
    verification: (profile) => (profile?.monthReferrals || 0) >= 1,
    status: (profile) => `${profile?.monthReferrals || 0} / 1`,
  },
  {
    title: "#6 Beyond the Screen",
    description:
      "These cats are more than pixels. They are stories. Beacons. Proof that play can matter. And we, their guardians, become legends. Your feedback is CODEX fuel.",
    how: "Go to 'QUESTS' section and complete 10 quests",
    image: cdnFile("codex/codex-8.webp"),
    task: "COMPLETE 10 QUESTS",
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
    task: "CRAFT TAILS",
    verification: (profile) => (profile?.monthTailsCrafted || 0) >= 100,
    status: (profile) => `${profile?.monthTailsCrafted || 0} / 100`,
  },
];

export const CodexSection = ({
  title,
  description,
  how,
  image,
  task,
  verification,
  status,
}: ICodex) => {
  const [info, setInfo] = useState<null | {
    type: "lore" | "how";
    text: string;
  }>(null);
  const { profile } = useProfile();
  const isCompleted = useMemo(
    () => verification?.(profile),
    [profile, verification],
  );
  return (
    <div
      className={`flex flex-col items-center relative font-primary pt-4 border-4 rounded-2xl bg-gradient-to-bl from-tt-night-700 to-tt-night-900 text-tt-cream ${
        isCompleted ? "border-tt-gold-500" : "border-tt-rust/70"
      }`}
    >
      {!info && (
        <div className="flex items-center gap-1 absolute top-0 left-0">
          <Tag size="sm">{title.slice(0, 2)}</Tag>
        </div>
      )}
      <img src={image} alt="codex" className="h-16 -mb-2 -mt-12" />
      {info && <Tag size="sm">{title}</Tag>}
      {info && (
        <div
          key={info?.type}
          className={`flex flex-col w-64 animate-opacity font-primary text-balance text-center animate-opacit rounded-2xl border-4 border-tt-gold-500 px-0.5 py-1 ${
            isCompleted ? "bg-tt-night-800" : "bg-tt-ember/30"
          }`}
        >
          <div className="text-p5 font-bold">
            {info.type === "lore" ? "WHY IT MATTERS" : "WHAT DO I NEED TO DO?"}
          </div>
          {info.type === "lore" ? description : how}
        </div>
      )}
      <span
        className={`px-2 text-p6 rounded-b-xl border-x-4 border-tt-gold-500 ${
          isCompleted ? "bg-tt-night-800" : "bg-tt-ember/30"
        }`}
      >
        MISSION
      </span>
      <div
        className={`font-primary text-center animate-opacity w-fit flex items-center gap-1`}
      >
        <img
          alt=""
          aria-hidden="true"
          src={
            isCompleted
              ? cdnFile("icons/check.webp")
              : cdnFile("icons/loader.webp")
          }
          className={`w-4 h-4 -mt-1 ${isCompleted ? "" : "animate-spin-slow"}`}
        />
        {task}
      </div>
      <div className="flex items-center -mt-2">
        <PixelButton
          size="sm"
          text="WHY?"
          active={info?.type === "lore"}
          onClick={() =>
            setInfo((prev) =>
              prev?.type === "lore"
                ? null
                : { type: "lore", text: description },
            )
          }
        />
        <div
          className={`font-primary text-center animate-opacity w-fit px-2 h-fit rounded-2xl border-tt-gold-500 border-2 ${
            isCompleted ? "bg-tt-night-800" : "bg-tt-ember/30"
          }`}
        >
          {status(profile)}
        </div>
        <PixelButton
          size="sm"
          text="HOW?"
          active={info?.type === "how"}
          onClick={() =>
            setInfo((prev) =>
              prev?.type === "how" ? null : { type: "how", text: how },
            )
          }
        />
      </div>
    </div>
  );
};

const AirdropTierCard = ({
  tier,
  revealed,
  isClaiming,
  onReveal,
  onClaim,
}: {
  tier: IAirdropTierProgress;
  revealed: boolean;
  isClaiming: boolean;
  onReveal: () => void;
  onClaim: () => void;
}) => {
  const tierVisuals: Record<
    string,
    {
      badge: string;
      chest: string;
      pattern: string;
      sparkle: string;
      mascot: string;
      headerBg: string;
      headerText: string;
    }
  > = {
    EXPLORER: {
      badge: "logo/coin.webp",
      chest: "logo/chest.webp",
      pattern: "cards/backgrounds/pattern-COMMON.webp",
      sparkle: "cards/backgrounds/white-opening-sparkle.webp",
      mascot: "tail/mascot-point-right.webp",
      headerBg: "bg-tt-night-950/70 border-tt-muted/70",
      headerText: "text-tt-cream",
    },
    RESCUER: {
      badge: "icons/rocket.png",
      chest: "icons/invites/gift-coin.png",
      pattern: "cards/backgrounds/pattern-RARE.webp",
      sparkle: "cards/backgrounds/blue-sparkle.webp",
      mascot: "tail/open-arms.webp",
      headerBg: "bg-tt-night-950/70 border-tt-sky/70",
      headerText: "text-tt-sky",
    },
    CURATOR: {
      badge: "cards/icons/power.webp",
      chest: "tail/guard.webp",
      pattern: "cards/backgrounds/pattern-EPIC.webp",
      sparkle: "cards/backgrounds/purple-sparkle.webp",
      mascot: "tail/mascot-matters.webp",
      headerBg: "bg-tt-night-950/70 border-tt-lilac/70",
      headerText: "text-tt-lilac",
    },
    LEGEND: {
      badge: "ability/TAILS.png",
      chest: "logo/coin.png",
      pattern: "cards/backgrounds/pattern-LEGENDARY.webp",
      sparkle: "cards/backgrounds/legendary-sparkle.webp",
      mascot: "tail/cat-celebrate.webp",
      headerBg: "bg-tt-night-950/70 border-tt-gold-500",
      headerText: "text-tt-gold-400",
    },
  };

  const visual = tierVisuals[tier.id] || tierVisuals.EXPLORER;
  const revealButtonLabel = tier.unlocked ? "REVEAL PRIZE" : "PREVIEW";
  const borderStyle = tier.claimed
    ? "border-tt-gold-500"
    : tier.unlocked
    ? "border-tt-mint/80"
    : "border-tt-rust/70";
  const desktopButtonScaleClass = "md:!scale-[0.92] md:hover:!scale-100";

  return (
    <div
      className={`w-full rounded-2xl border-4 ${borderStyle} bg-gradient-to-b from-tt-night-700 via-tt-night-800 to-tt-night-900 px-3 py-3 md:px-4 md:py-3.5 relative overflow-hidden text-tt-cream shadow-[0_8px_0_0_rgba(7,5,26,0.24)]`}
    >
      <img
        src={cdnFile(visual.pattern)}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen z-0"
        alt={`${tier.name} pattern`}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-tt-lilac/5 via-transparent to-tt-night-950/40 z-0" />
      <img
        src={cdnFile(visual.mascot)}
        className="absolute -right-2 top-0 h-16 w-16 md:h-20 md:w-20 object-contain opacity-20 z-0"
        alt={`${tier.name} mascot`}
      />
      <div
        className={`flex items-center justify-between gap-2 relative z-10 rounded-xl border-2 px-2 py-1.5 md:px-2.5 md:py-2 ${visual.headerBg}`}
      >
        <div
          className={`font-primary text-p5 md:text-p4 flex items-center gap-1.5 font-bold ${visual.headerText}`}
        >
          <img
            src={cdnFile(visual.badge)}
            className="h-7 w-7 md:h-8 md:w-8 rounded-md border border-tt-gold-500/50"
            alt={`${tier.name} badge`}
          />
          {tier.name}
        </div>
        <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 text-tt-cream px-2 py-0.5 font-primary text-p5 font-bold">
          {tier.unlockProgress}%
        </div>
      </div>
      <div className="mt-1 text-p5 font-primary leading-tight relative z-10 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 text-tt-cream px-2 py-1.5">
        {tier.description}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1 relative z-10">
        {tier.requirements.map((requirement) => (
          <div
            key={`${tier.id}-${requirement.id}`}
            className={`flex items-center justify-between rounded-lg border-2 border-tt-gold-500/50 px-2 py-1 md:py-1.5 font-primary text-p5 text-tt-cream ${
              requirement.met ? "bg-tt-mint/15" : "bg-tt-ember/25"
            }`}
          >
            <span>{requirement.label}</span>
            <span>
              {requirement.current} / {requirement.target}
            </span>
          </div>
        ))}
      </div>

      {!revealed ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 p-1.5 md:p-2 relative z-10">
          <div className="font-primary text-p5 flex items-center gap-1 text-tt-cream">
            <img
              src={cdnFile("purrquest/icons/chest.gif")}
              className="h-7 w-7 md:h-8 md:w-8"
              alt="chest"
            />
            {tier.reward.revealTitle}
          </div>
          <PixelButton
            size="sm"
            className={desktopButtonScaleClass}
            text={revealButtonLabel}
            onClick={onReveal}
          />
        </div>
      ) : (
        <div className="mt-2 rounded-lg border-2 border-tt-gold-500/50 bg-gradient-to-r from-tt-night-700 to-tt-night-900 p-2.5 md:p-3 animate-opacity relative overflow-hidden z-10">
          <img
            src={cdnFile(visual.sparkle)}
            className="absolute right-0 top-0 h-20 w-20 opacity-70 z-0"
            alt={`${tier.name} sparkle`}
          />
          <div className="flex items-center gap-2 relative z-10">
            <img
              src={cdnFile(visual.chest)}
              className="h-10 w-10 md:h-12 md:w-12 rounded-lg border-2 border-tt-gold-500/50"
              alt={tier.reward.revealTitle}
            />
            <img
              src={cdnFile(tier.reward.image)}
              className="h-10 w-10 md:h-12 md:w-12 rounded-lg border-2 border-tt-gold-500/50"
              alt={tier.reward.unlockable}
            />
            <div className="font-primary text-p5 leading-tight text-tt-cream">
              <div>{tier.reward.revealTeaser}</div>
              <div className="font-bold">
                +{formatTails(tier.reward.tails)} • {tier.reward.unlockable}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 relative z-10">
            {!tier.claimed && tier.claimable && (
              <PixelButton
                size="sm"
                className={desktopButtonScaleClass}
                text={isClaiming ? "CLAIMING..." : `CLAIM ${tier.reward.tails}`}
                onClick={onClaim}
                disabled={isClaiming}
              />
            )}
            {!tier.claimed && tier.unlocked && !tier.claimable && (
              <Tag size="sm">MEET ELIGIBILITY TO CLAIM</Tag>
            )}
            {tier.claimed && <Tag size="sm">CLAIMED</Tag>}
            {!tier.unlocked && <Tag size="sm">LOCKED</Tag>}
            {!tier.unlocked && <Tag size="sm">UNLOCK REQUIREMENTS TO CLAIM</Tag>}
          </div>
        </div>
      )}
    </div>
  );
};

const GamifiedChallengeCard = ({
  challenge,
  isClaiming,
  onClaim,
}: {
  challenge: IAirdropChallenge;
  isClaiming: boolean;
  onClaim: () => void;
}) => {
  const progress = Math.min(
    100,
    Math.floor((challenge.current / challenge.target) * 100),
  );
  const desktopButtonScaleClass = "md:!scale-[0.92] md:hover:!scale-100";
  const challengeMascots = [
    "tail/mascot-card.webp",
    "tail/open-arms.webp",
    "tail/cat-promo.webp",
    "tail/mascot-matters.webp",
  ];
  const mascotIndex =
    challenge.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    challengeMascots.length;
  const mascot = challengeMascots[mascotIndex];

  return (
    <div
      className={`rounded-2xl border-4 border-tt-gold-500/50 px-2.5 py-2.5 md:px-3.5 md:py-3.5 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.28)] ${
        challenge.completed
          ? "bg-gradient-to-br from-tt-night-700 via-tt-night-800 to-tt-night-900"
          : "bg-gradient-to-br from-tt-night-700 via-tt-night-800 to-tt-night-900"
      }`}
    >
      <img
        src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
        alt="challenge pattern"
      />
      <img
        src={cdnFile(mascot)}
        className="absolute -right-1 -bottom-2 h-16 w-16 md:h-20 md:w-20 object-contain opacity-20"
        alt="challenge mascot"
      />
      <div className="flex items-center justify-between gap-2 relative z-10 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-1">
        <div className="flex items-center gap-1.5 font-primary text-p5">
          <img
            src={cdnFile(challenge.icon)}
            className="h-6 w-6"
            alt={challenge.label}
          />
          {challenge.label}
        </div>
        <span className="font-primary text-p5">
          {challenge.current} / {challenge.target}
        </span>
      </div>
      <div className="mt-1 text-p6 md:text-p5 leading-tight font-primary relative z-10 rounded-lg border border-tt-gold-500/50 bg-tt-night-950/60 px-2 py-1">
        {challenge.description}
      </div>
      <div className="mt-1.5 h-2.5 w-full rounded-full bg-tt-night-950 border border-tt-gold-500/50 relative z-10">
        <div
          className={`h-full rounded-full ${
            challenge.completed ? "bg-green-500" : "bg-yellow-600"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-primary text-p6 md:text-p5 relative z-10 rounded-lg border border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-1">
        <span>Reward</span>
        <span className="font-bold rounded-md border border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-0.5">
          +{formatTails(challenge.rewardTails)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1 relative z-10">
        {challenge.claimable && (
          <PixelButton
            size="sm"
            className={desktopButtonScaleClass}
            text={isClaiming ? "CLAIMING..." : `CLAIM ${challenge.rewardTails}`}
            onClick={onClaim}
            disabled={isClaiming}
          />
        )}
        {challenge.claimed && <Tag size="sm">CLAIMED</Tag>}
        {!challenge.completed && <Tag size="sm">COMPLETE TO CLAIM</Tag>}
      </div>
    </div>
  );
};

const MilestoneTrack = ({
  milestones,
  claimingMilestoneId,
  onClaimMilestone,
}: {
  milestones: IAirdropMilestone[];
  claimingMilestoneId: string | null;
  onClaimMilestone: (milestoneId: string) => void;
}) => {
  const desktopButtonScaleClass = "md:!scale-[0.92] md:hover:!scale-100";
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex w-max gap-2.5 pr-2 md:pr-3">
        {milestones.map((milestone) => (
          <div
            key={milestone.id}
            className={`min-w-[172px] md:min-w-[210px] rounded-xl border-4 border-tt-gold-500/50 p-2 md:p-2.5 relative overflow-hidden shadow-[0_6px_0_0_rgba(7,5,26,0.25)] ${
              milestone.reached
                ? "bg-gradient-to-b from-tt-night-700 via-tt-night-800 to-tt-night-900"
                : "bg-gradient-to-b from-tt-night-700 via-tt-night-800 to-tt-night-900"
            }`}
          >
            <img
              src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
              alt="milestone pattern"
            />
            <img
              src={cdnFile(
                milestone.reached
                  ? "tail/cat-celebrate.webp"
                  : "tail/mascot-point-right.webp",
              )}
              className="absolute -right-1 -top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-20"
              alt="milestone mascot"
            />
            <img
              src={cdnFile(milestone.icon)}
              alt={milestone.label}
              className="h-20 md:h-24 w-full rounded-lg object-cover border border-tt-gold-500/50 relative z-10"
            />
            <div className="mt-1.5 rounded-lg border border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-1 relative z-10">
              <div className="font-primary text-p6 md:text-p5">
                {milestone.label}
              </div>
              <div className="font-primary text-p6 md:text-p5">
                SCORE {milestone.current} / {milestone.target}
              </div>
              <div className="font-primary text-p6 md:text-p5 font-bold">
                +{formatTails(milestone.rewardTails)}
              </div>
            </div>
            <div className="relative z-10">
              <Tag size="sm">{milestone.reached ? "UNLOCKED" : "LOCKED"}</Tag>
            </div>
            <div className="mt-1.5 flex items-center gap-1 relative z-10">
              {milestone.claimable && (
                <PixelButton
                  size="sm"
                  className={desktopButtonScaleClass}
                  text={
                    claimingMilestoneId === milestone.id
                      ? "CLAIMING..."
                      : `CLAIM ${milestone.rewardTails}`
                  }
                  onClick={() => onClaimMilestone(milestone.id)}
                  disabled={claimingMilestoneId === milestone.id}
                />
              )}
              {milestone.claimed && <Tag size="sm">CLAIMED</Tag>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** G8 copy: the reward tile title doubles as the theme key below. */
export const CLAIMABLE_TREASURE_TITLE = "CLAIMABLE TREASURE";

export const ProgressHudTile = ({
  icon,
  mascot,
  title,
  value,
  detail,
  progress,
}: {
  icon: string;
  mascot?: string;
  title: string;
  value: string;
  detail: string;
  progress: number;
}) => {
  const themeByTitle: Record<
    string,
    { header: string; valueGlow: string; bar: string }
  > = {
    "ELIGIBILITY SCORE": {
      header: "bg-tt-night-950/70 text-tt-mint",
      valueGlow: "text-tt-mint",
      bar: "from-green-500 to-yellow-500",
    },
    "TIER ASCENT": {
      header: "bg-tt-night-950/70 text-tt-sky",
      valueGlow: "text-tt-sky",
      bar: "from-blue-500 to-cyan-500",
    },
    "COMBO POWER": {
      header: "bg-tt-night-950/70 text-tt-rust",
      valueGlow: "text-tt-rust",
      bar: "from-orange-500 to-pink-500",
    },
    [CLAIMABLE_TREASURE_TITLE]: {
      header: "bg-tt-night-950/70 text-tt-gold-400",
      valueGlow: "text-tt-gold-400",
      bar: "from-yellow-500 to-amber-500",
    },
  };
  const theme = themeByTitle[title] || {
    header: "bg-tt-night-950/70 text-tt-pink",
    valueGlow: "text-tt-pink",
    bar: "from-pink-500 to-yellow-600",
  };
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="rounded-xl border-2 border-tt-gold-500/50 bg-gradient-to-b from-tt-night-700 via-tt-night-800 to-tt-night-900 text-tt-cream px-3 py-2.5 md:px-3.5 md:py-3 relative overflow-hidden shadow-[0_6px_0_0_rgba(7,5,26,0.16)]">
      <img
        src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.06] mix-blend-screen"
        alt="tile pattern"
      />
      {!!mascot && (
        <img
          src={cdnFile(mascot)}
          className="absolute right-0 bottom-0 h-10 w-10 md:h-12 md:w-12 object-contain opacity-18"
          alt={`${title} mascot`}
        />
      )}
      <div className="flex items-center justify-between gap-1 relative z-10">
        <div
          className={`font-primary text-p6 md:text-p5 rounded-lg border-2 border-tt-gold-500/50 px-2 py-0.5 font-bold ${theme.header}`}
        >
          {title}
        </div>
        <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 p-1">
          <img
            src={cdnFile(icon)}
            alt={title}
            className="h-5 w-5 md:h-6 md:w-6"
          />
        </div>
      </div>
      <div className="mt-1 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-950/60 px-2.5 py-1.5 relative z-10">
        <div
          className={`font-primary text-p3 md:text-p2 font-bold leading-none ${theme.valueGlow}`}
        >
          {value}
        </div>
      </div>
      <div className="mt-1 rounded-lg border border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-1 font-primary text-p6 md:text-p5 leading-tight min-h-[34px] relative z-10">
        {detail}
      </div>
      <div className="mt-1.5 flex items-center gap-2 relative z-10">
        <div className="h-2.5 flex-1 rounded-full border border-tt-gold-500/50 bg-tt-night-950">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${theme.bar}`}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <span className="rounded-md border border-tt-gold-500/50 bg-tt-night-900/80 px-1.5 py-0.5 font-primary text-p6 md:text-p5 font-bold text-tt-cream">
          {clampedProgress}%
        </span>
      </div>
    </div>
  );
};

type INextAction = {
  label: string;
  detail: string;
  progress: string;
};

const getNextAction = (
  eligibilityCriteria?: IAirdropCriterion[],
  tiers?: IAirdropTierProgress[],
): INextAction | null => {
  if (!eligibilityCriteria?.length || !tiers?.length) {
    return null;
  }

  const unmetCriterion = eligibilityCriteria.find(
    (criterion) => !criterion.met,
  );
  if (unmetCriterion) {
    return {
      label: `Eligibility: ${unmetCriterion.label}`,
      detail: unmetCriterion.description,
      progress: `${unmetCriterion.current} / ${unmetCriterion.target}`,
    };
  }

  const nextTier = tiers.find((tier) => !tier.unlocked);
  if (!nextTier) {
    return {
      label: "All tiers unlocked",
      detail:
        "Claim remaining rewards and keep collecting for leaderboard flex.",
      progress: "MAXED",
    };
  }

  const missingRequirement = nextTier.requirements.find(
    (requirement) => !requirement.met,
  );
  if (!missingRequirement) {
    return {
      label: `Unlock ${nextTier.name}`,
      detail: "Reveal and claim your tier reward.",
      progress: "READY",
    };
  }

  return {
    label: `Push for ${nextTier.name}`,
    detail: `Focus on ${missingRequirement.label.toLowerCase()} to unlock this tier.`,
    progress: `${missingRequirement.current} / ${missingRequirement.target}`,
  };
};

export interface CodexProps {
  /** The tab to open on (a deep link). Without it, a pending lobby request or IMPACT. */
  tab?: ProgressTab;
  /**
   * The scene behind PROGRESS, so the Tails explainer opens only on a menu or game-over screen.
   * Null (or absent) means no running scene, e.g. outside the game shell.
   */
  scene?: SceneState | null;
}

export const Codex = ({ tab, scene = null }: CodexProps = {}) => {
  const [isFAQOpen, setIsFAQOpen] = useState(false);
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
  const setActiveProgressTab = setChosenTab;
  const onImpactOrVault = activeProgressTab === "impact" || activeProgressTab === "vault";

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
        ?.filter((tier) => tier.claimable)
        .reduce((sum, tier) => sum + tier.reward.tails, 0) || 0;
    const claimableCount =
      (airdropProgression?.gamification?.dailyChallenges?.filter(
        (challenge) => challenge.claimable,
      ).length || 0) +
      (airdropProgression?.gamification?.milestones?.filter(
        (milestone) => milestone.claimable,
      ).length || 0) +
      (airdropProgression?.tiers?.filter((tier) => tier.claimable).length || 0);
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
  const comboPowerProgress = useMemo(() => {
    const comboMultiplier =
      airdropProgression?.gamification?.comboMultiplier || 1;
    return Math.max(
      0,
      Math.min(100, Math.round(((comboMultiplier - 1) / 0.75) * 100)),
    );
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

  return (
    <div className="flex flex-col items-center relative pb-14">
      <div className="mb-4 w-full max-w-[1320px]">
        <div
          className="flex flex-wrap items-center justify-center gap-y-1 gap-x-2 -mr-2"
          role="group"
          aria-label="Progress sections"
          data-testid="progress-tabs"
        >
          {progressTabs.map((id) => {
            const isActive = !waitingForVault && activeProgressTab === id;
            return (
              <div
                key={id}
                className={clsx(
                  "relative pb-2.5 rounded-xl",
                  // The open tab carries a gold frame and glow; the others are dimmed, so the open
                  // one reads at a glance at any width (hover only lifts them back to full strength).
                  isActive && "ring-2 ring-tt-gold-400 bg-tt-gold-400/15 shadow-[0_0_12px_rgba(255,204,85,0.55)]"
                )}
                data-testid={`progress-tab-${id}`}
                data-active={isActive || undefined}
              >
                <PixelButton
                  active={isActive}
                  pressed={isActive}
                  // Touch screens keep :hover after a tap, so the tapped-away tab must not look chosen.
                  className={clsx(
                    "!m-0 [@media(hover:none)]:hover:!filter-none [@media(hover:none)]:hover:!pb-0 [@media(hover:none)]:hover:!transform-none",
                    !isActive &&
                      "opacity-70 saturate-50 hover:opacity-100 hover:saturate-100 focus-visible:opacity-100 focus-visible:saturate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-cream [@media(hover:none)]:hover:!opacity-70 [@media(hover:none)]:hover:!saturate-50"
                  )}
                  text={PROGRESS_TAB_LABELS[id]}
                  onClick={() => setActiveProgressTab(id)}
                />
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-2 bottom-0.5 h-1.5 rounded-full bg-tt-gold-400 shadow-[0_0_8px_rgba(255,204,85,0.9)]"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-[1320px] mb-3 empty:hidden pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
        <TailsExplainer scene={scene} />
      </div>
      {waitingForVault && (
        <div className="w-full max-w-[1320px] mb-8 px-3 text-center font-primary text-p5 text-tt-muted" data-testid="vault-loading">
          LOADING…
        </div>
      )}
      {!waitingForVault && activeProgressTab === "impact" && (
        <div className="w-full max-w-[1320px] mb-8 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ImpactTab season={season} seasonLoading={isAirdropLoading} />
        </div>
      )}
      {activeProgressTab === "vault" && showVault && tokenStatus && (
        <div className="w-full max-w-[1320px] mb-8 px-3">
          <Vault status={tokenStatus} />
        </div>
      )}
      {!onImpactOrVault && !waitingForVault && (
      <div className="w-full max-w-[1320px] mb-8 flex flex-col items-center gap-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {["rewards", "missions", "tiers"].includes(activeProgressTab) &&
          isAirdropLoading && (
            <div className="font-primary text-p4">LOADING PROGRESSION...</div>
          )}
        {["rewards", "missions", "tiers"].includes(activeProgressTab) &&
          isAirdropError && (
            <div className="w-full rounded-xl border-2 border-tt-rust bg-tt-ember/20 p-3 flex flex-col items-center gap-1.5">
              <div className="font-primary text-p5 text-tt-pink">
                Could not load progression right now.
              </div>
              <PixelButton
                size="sm"
                className="md:!scale-[0.92] md:hover:!scale-100"
                text="RETRY"
                onClick={() => refetchAirdropProgression()}
              />
            </div>
          )}
        {activeProgressTab === "badges" && (
          <div className="w-full max-w-[1320px] rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-r from-tt-night-700 via-tt-night-800 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
            <img
              src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
              alt="badge hub pattern"
            />
            <img
              src={
                isCompleted
                  ? cdnFile("tail/cat-celebrate.webp")
                  : cdnFile("tail/mascot-matters.webp")
              }
              alt="badge mascot"
              className="absolute right-1 top-1 h-14 w-14 md:h-16 md:w-16 object-contain opacity-25"
            />
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-3">
              <div className="rounded-xl border-2 border-tt-gold-500/50 bg-tt-night-900/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-tt-gold-400">
                    MY BADGE VAULT
                  </span>
                  <Tag size="sm">{isCompleted ? "MASTERED" : "IN PROGRESS"}</Tag>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="font-paws text-h3 leading-none text-tt-cream drop-shadow-[0_1.4px_1.8px_rgba(0,0,0,0.25)]">
                    {completedMonths}
                  </span>
                  <span className="font-primary text-p5 md:text-p4 mb-1">
                    BADGES EARNED
                  </span>
                </div>
                <div className="mt-2 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-2 py-2 min-h-[44px] flex items-center">
                  {completedMonths > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {Array.from({ length: completedMonths }).map(
                        (_, index) => (
                          <img
                            key={index}
                            src={cdnFile("logo/heart.webp")}
                            className="w-6"
                            alt="badge heart"
                          />
                        ),
                      )}
                    </div>
                  ) : (
                    <span className="font-primary text-p6 md:text-p5 text-tt-cream">
                      Start completing missions to earn your first badge.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border-2 border-tt-gold-500/50 bg-gradient-to-b from-tt-night-700 to-tt-night-900 p-3">
                <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-950/70 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-tt-pink w-fit">
                  BADGE YIELD
                </div>
                <div className="mt-2 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-3 py-2 font-primary text-tt-cream">
                  <div className="text-p6 md:text-p5">
                    Current Monthly Boost
                  </div>
                  <div className="text-p4 md:text-p3 font-bold leading-none">
                    +{formatTails(monthlyBadgeYield)}
                  </div>
                </div>
                <div className="mt-2 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-3 py-1.5 font-primary text-p6 md:text-p5 text-tt-cream">
                  Each badge adds {formatTails(300)} at every season reset
                </div>
                <div className="mt-2 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-3 py-1.5 font-primary text-p6 md:text-p5 text-tt-cream">
                  {remainingBadgeMissions > 0
                    ? `Next badge in ${remainingBadgeMissions} mission${
                        remainingBadgeMissions === 1 ? "" : "s"
                      }`
                    : "All badge missions complete this cycle"}
                </div>
              </div>
            </div>
          </div>
        )}
        {!!airdropProgression && (
          <>
            {activeProgressTab === "rewards" && (
              <>
                <Tag>YOUR REWARDS</Tag>
                <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-r from-tt-night-700 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                    alt="hud pattern"
                  />
                  <img
                    src={cdnFile("tail/mascot-point-right.webp")}
                    className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-22"
                    alt="command center mascot"
                  />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between font-primary text-p4 gap-2">
                      <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2.5 py-0.5 text-tt-gold-400 text-p5 md:text-p4 font-bold">
                        PROGRESSION COMMAND CENTER
                      </span>
                      <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 text-tt-cream px-3 py-0.5 text-p6 font-bold">
                        LIVE
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border-2 border-tt-gold-500/50 bg-tt-night-900/80 p-2 md:p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <ProgressHudTile
                          icon="icons/check.webp"
                          mascot="tail/mascot-card.webp"
                          title="ELIGIBILITY SCORE"
                          value={`${eligibilityStats.met}/${eligibilityStats.total}`}
                          detail={`${eligibilityStats.progress}% OF CHECKS MET`}
                          progress={eligibilityStats.progress}
                        />
                        <ProgressHudTile
                          icon="icons/rocket.png"
                          mascot="tail/mascot-point-right.webp"
                          title="TIER ASCENT"
                          value={`${tierStats.unlocked}/${tierStats.total}`}
                          detail={`${
                            airdropProgression.currentTierId || "UNRANKED"
                          } -> ${airdropProgression.nextTierId || "MAXED"}`}
                          progress={tierStats.progress}
                        />
                        <ProgressHudTile
                          icon="icons/fire-2.gif"
                          mascot="tail/cat-celebrate.webp"
                          title="COMBO POWER"
                          value={`x${airdropProgression.gamification.comboMultiplier}`}
                          detail={`STREAK BONUS +${formatTails(airdropProgression.gamification.streakBonusTails)}`}
                          progress={comboPowerProgress}
                        />
                        <ProgressHudTile
                          icon="flare-effect/effects/coindrop.gif"
                          mascot="tail/open-arms.webp"
                          title={CLAIMABLE_TREASURE_TITLE}
                          value={formatTails(rewardStats.claimableTails)}
                          detail={`${rewardStats.claimableCount} REWARDS READY${
                            rewardStats.stashBonusPercent > 0
                              ? ` • +${rewardStats.stashBonusPercent}% LEGENDARY BONUS`
                              : ""
                          }`}
                          progress={Math.min(
                            100,
                            Math.round((rewardStats.claimableCount / 6) * 100),
                          )}
                        />
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 text-tt-cream px-3 py-1.5 font-primary text-p6 md:text-p5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span>
                        Missions: +{formatTails(rewardStats.claimableChallengeTails)}
                      </span>
                      <span>
                        Milestones: +{formatTails(rewardStats.claimableMilestoneTails)}
                      </span>
                      <span>
                        Tiers: +{formatTails(rewardStats.claimableTierTails)}
                      </span>
                      <span>
                        Legendary bonus: x
                        {rewardStats.stashBonusMultiplier.toFixed(2)}
                        {rewardStats.additionalLegendaryCards > 0
                          ? ` (${rewardStats.additionalLegendaryCards} extra legendary)`
                          : " (no bonus yet)"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-r from-tt-night-700 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                    <img
                      src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                      className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                      alt="eligibility pattern"
                    />
                    <img
                      src={cdnFile("tail/mascot-card.webp")}
                      className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-28"
                      alt="eligibility mascot"
                    />
                    <div className="flex items-center justify-between font-primary text-p4 relative z-10">
                      <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2 py-0.5 text-tt-gold-400 text-p5 md:text-p4 font-bold">
                        ELIGIBILITY
                      </span>
                      <span
                        className={`rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-0.5 ${
                          airdropProgression.eligible
                            ? "text-tt-mint"
                            : "text-tt-pink"
                        }`}
                      >
                        {airdropProgression.eligible
                          ? "ELIGIBLE"
                          : "IN PROGRESS"}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 xl:grid-cols-2 relative z-10">
                      {airdropProgression.eligibilityCriteria.map(
                        (criterion) => (
                          <div
                            key={criterion.id}
                            className={`rounded-lg border-2 border-tt-gold-500/50 px-3 py-2 font-primary text-p5 ${
                              criterion.met ? "bg-tt-mint/15" : "bg-tt-ember/25"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{criterion.label}</span>
                              <span>
                                {criterion.current} / {criterion.target}
                              </span>
                            </div>
                            <div className="text-p6 md:text-p5 leading-tight">
                              {criterion.description}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-r from-tt-night-700 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                    <img
                      src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                      className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                      alt="collectible pattern"
                    />
                    <img
                      src={cdnFile("tail/cat-promo.webp")}
                      className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-28"
                      alt="collectible mascot"
                    />
                    <div className="flex items-center justify-between font-primary text-p4 relative z-10">
                      <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2 py-0.5 text-tt-gold-400 text-p5 md:text-p4 font-bold">
                        COLLECTIBLE LEVEL
                      </span>
                      <span className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-0.5">
                        {airdropProgression.metrics.collectibleLevel}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 font-primary text-p5 relative z-10">
                      <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-3 py-1">
                        Cats: {airdropProgression.metrics.collectiblesOwned}
                      </div>
                      <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-3 py-1">
                        Quests: {airdropProgression.metrics.questsCompleted}
                      </div>
                      <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-3 py-1">
                        Tails given:{" "}
                        {formatTails(rescueMetrics.tailsGiven ?? 0, { word: false })}
                      </div>
                      <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-3 py-1">
                        Goals helped: {rescueMetrics.goalsHelped ?? 0}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 font-primary text-p5 relative z-10">
                      <span className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-3 py-1">
                        Current:{" "}
                        {airdropProgression.currentTierId || "UNRANKED"}
                      </span>
                      <span className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-3 py-1">
                        Next: {airdropProgression.nextTierId || "MAXED"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 relative z-10">
                      {airdropProgression.unlockedUnlockables.length > 0 ? (
                        airdropProgression.unlockedUnlockables.map(
                          (unlockable) => (
                            <Tag key={unlockable} size="sm">
                              {unlockable.toUpperCase()}
                            </Tag>
                          ),
                        )
                      ) : (
                        <Tag size="sm">NO UNLOCKABLES UNLOCKED YET</Tag>
                      )}
                    </div>
                  </div>

                  {!!nextAction && (
                    <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-r from-tt-night-700 to-tt-night-900 p-3 md:p-4 lg:col-span-2 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                      <img
                        src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                        className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                        alt="action pattern"
                      />
                      <img
                        src={cdnFile("tail/open-arms.webp")}
                        className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-28"
                        alt="action mascot"
                      />
                      <div className="font-primary text-p4 flex items-center gap-1.5 relative z-10">
                        <img
                          src={cdnFile("icons/rocket.png")}
                          className="h-6 w-6"
                          alt="next action"
                        />
                        <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2 py-0.5 text-tt-gold-400 text-p5 md:text-p4 font-bold">
                          NEXT BEST ACTION
                        </span>
                      </div>
                      <div className="font-primary text-p5 relative z-10 rounded-lg border border-tt-gold-500/50 bg-tt-night-950/60 px-2 py-1 mt-1">
                        {nextAction.label}
                      </div>
                      <div className="font-primary text-p6 md:text-p5 leading-tight relative z-10 rounded-lg border border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-1 mt-1">
                        {nextAction.detail}
                      </div>
                      <div className="font-primary text-p6 md:text-p5 mt-1.5 relative z-10 rounded-lg border border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-1">
                        Progress: {nextAction.progress}
                      </div>
                    </div>
                  )}

                  <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-r from-tt-night-700 to-tt-night-900 p-3 md:p-4 relative overflow-hidden lg:col-span-2 shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                    <img
                      src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                      className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                      alt="xp pattern"
                    />
                    <img
                      src={cdnFile("tail/cat-celebrate.webp")}
                      className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-28"
                      alt="xp mascot"
                    />
                    <div className="flex items-center justify-between font-primary text-p4 relative z-10">
                      <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2 py-0.5 text-tt-gold-400 text-p5 md:text-p4 font-bold">
                        LVL {airdropProgression.gamification.level} •{" "}
                        {airdropProgression.gamification.title}
                      </span>
                      <span className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-0.5">
                        {airdropProgression.gamification.xp} XP
                      </span>
                    </div>
                    <div className="mt-2 h-4 w-full rounded-full border border-tt-gold-500/50 bg-tt-night-950 relative z-10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-pink-500 to-yellow-600"
                        style={{
                          width: `${airdropProgression.gamification.levelProgress}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between font-primary text-p6 md:text-p5 relative z-10">
                      <span>
                        NEXT LVL: {airdropProgression.gamification.nextLevelXp}{" "}
                        XP
                      </span>
                      <span>
                        COMBO x{airdropProgression.gamification.comboMultiplier}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-primary text-p6 md:text-p5 relative z-10">
                      <span>
                        STREAK BONUS: +
                        {formatTails(airdropProgression.gamification.streakBonusTails)}
                      </span>
                      <span>
                        POTENTIAL: +
                        {formatTails(airdropProgression.gamification.potentialBonusTails)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-primary text-p6 md:text-p5 relative z-10">
                      <span>
                        CLAIMED MISSIONS:{" "}
                        {airdropProgression.totalClaimedChallenges}
                      </span>
                      <span>
                        CLAIMED MILESTONES:{" "}
                        {airdropProgression.totalClaimedMilestones}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeProgressTab === "missions" && (
              <>
                <Tag>MISSION BOARD</Tag>
                <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-br from-tt-night-700 via-tt-night-800 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                    alt="mission board pattern"
                  />
                  <img
                    src={cdnFile("tail/mascot-matters.webp")}
                    className="absolute right-2 top-1 h-12 w-12 md:h-16 md:w-16 object-contain opacity-25"
                    alt="mission board mascot"
                  />
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 relative z-10">
                    {airdropProgression.gamification.dailyChallenges.map(
                      (challenge) => (
                        <GamifiedChallengeCard
                          key={challenge.id}
                          challenge={challenge}
                          isClaiming={claimingChallengeId === challenge.id}
                          onClaim={() => claimChallengeReward(challenge.id)}
                        />
                      ),
                    )}
                  </div>
                </div>

                <Tag>MILESTONE TRACK</Tag>
                <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-br from-tt-night-700 via-tt-night-800 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                    alt="milestone board pattern"
                  />
                  <MilestoneTrack
                    milestones={airdropProgression.gamification.milestones}
                    claimingMilestoneId={claimingMilestoneId}
                    onClaimMilestone={claimMilestoneReward}
                  />
                  <div className="mt-2 w-full flex items-center justify-between rounded-xl border-2 border-tt-gold-500/50 bg-tt-night-800/90 px-3 py-2 font-primary text-p6 md:text-p5 relative z-10">
                    <span>
                      NEXT MILESTONE: {nextMilestone?.label || "MAXED"}
                      {nextMilestone &&
                        ` (${nextMilestone.current}/${nextMilestone.target})`}
                    </span>
                    <img
                      src={cdnFile("tail/mascot-point-right.webp")}
                      className="h-10"
                      alt="milestone mascot"
                    />
                  </div>
                </div>
                <div className="w-full rounded-xl border-2 border-tt-gold-500/50 bg-gradient-to-r from-tt-night-700 to-tt-night-900 px-3 py-2 font-primary text-p6 md:text-p5 relative overflow-hidden">
                  <img
                    src={cdnFile("tail/open-arms.webp")}
                    className="absolute right-1 bottom-0 h-10 w-10 object-contain opacity-40"
                    alt="tip mascot"
                  />
                  <span className="relative z-10">
                    Claim mission and milestone rewards to climb the tiers.
                    Every Tail you earn counts toward your rank, even after you
                    give it to a goal.
                  </span>
                </div>
              </>
            )}

            {activeProgressTab === "tiers" && (
              <>
                <Tag>TIERS • REVEALS • REWARDS</Tag>
                <div className="w-full rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-br from-tt-night-700 via-tt-night-800 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
                    alt="tiers board pattern"
                  />
                  <img
                    src={cdnFile("tail/guard.webp")}
                    className="absolute right-2 top-1 h-14 w-14 md:h-16 md:w-16 object-contain opacity-25"
                    alt="tiers mascot"
                  />
                  <div className="w-full grid gap-3 xl:grid-cols-2 relative z-10">
                    {airdropProgression.tiers.map((tier) => (
                      <AirdropTierCard
                        key={tier.id}
                        tier={tier}
                        revealed={!!revealedRewards[tier.id]}
                        isClaiming={claimingTierId === tier.id}
                        onReveal={() => revealTier(tier.id)}
                        onClaim={() => claimTierReward(tier.id)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        {activeProgressTab === "pet-art" && (
          <>
            <Tag>IMMORTALIZE PET FLOW</Tag>
            <ImmortalizePetFlow
              onPurchaseComplete={() => {
                void syncAirdropProgression();
              }}
            />
          </>
        )}
      </div>
      )}

      {activeProgressTab === "badges" && (
        <div className="w-full flex flex-col items-center pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-[1320px] rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-r from-tt-night-700 via-tt-night-800 to-tt-night-900 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(7,5,26,0.2)]">
            <img
              src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-screen"
              alt="missions pattern"
            />
            <img
              src={cdnFile("tail/mascot-point-right.webp")}
              className="absolute right-1 bottom-0 h-12 w-12 md:h-14 md:w-14 object-contain opacity-20"
              alt="missions mascot"
            />
            <div className="relative z-10">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-tt-gold-400">
                  THIS MONTH MISSIONS
                </span>
                <span className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-2 py-0.5 font-primary text-p6 md:text-p5 text-tt-cream font-bold">
                  {completedCount}/{codex.length}
                </span>
              </div>
              <div className="mt-2 w-full flex rounded-full overflow-hidden gap-1 border-2 border-tt-gold-500/50 bg-tt-night-950 p-1">
                {Array.from({ length: codex.length }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-12 w-6 flex-1 relative rounded-sm ${
                      index < completedCount ? "bg-tt-gold-400" : "bg-tt-ember/30"
                    }`}
                  >
                    {index < completedCount && (
                      <img
                        src={cdnFile("logo/heart.webp")}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5"
                        alt="completed mission"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-3 py-1.5 font-primary text-p6 md:text-p5 text-center text-tt-cream">
                {!isCompleted
                  ? `Complete ${remainingBadgeMissions} more mission${
                      remainingBadgeMissions === 1 ? "" : "s"
                    } to earn this cycle's cat lover badge`
                  : "All missions completed. Badge cycle fully unlocked."}
              </div>
            </div>
          </div>

          <div className="w-full max-w-[1320px] mt-2 rounded-xl border-2 border-tt-gold-500/50 bg-gradient-to-r from-tt-night-700 to-tt-night-900 p-3 md:p-4 relative overflow-hidden">
            <img
              src={cdnFile("tail/open-arms.webp")}
              className="absolute right-1 top-1 h-10 w-10 md:h-12 md:w-12 object-contain opacity-20"
              alt="faq mascot"
            />
            <div className="relative z-10 flex items-center justify-between gap-2">
              <span className="rounded-lg border-2 border-tt-gold-500 bg-tt-night-950/70 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-tt-gold-400">
                BADGE INTEL
              </span>
              <PixelButton
                size="sm"
                text={isFAQOpen ? "CLOSE" : "FAQ"}
                onClick={() => setIsFAQOpen((prev) => !prev)}
              />
            </div>
            {isFAQOpen && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-3 py-2">
                  <Tag size="sm">WHAT DO I NEED TO DO?</Tag>
                  <div className="font-primary text-p6 md:text-p5">
                    COMPLETE ALL 9 MISSIONS
                  </div>
                </div>
                <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-3 py-2">
                  <Tag size="sm">WHAT DO I NEED TO KNOW?</Tag>
                  <div className="font-primary text-p6 md:text-p5">
                    {season
                      ? `NEXT SEASON STARTS ${localSeasonTime(season.anchorAt).toUpperCase()}`
                      : "A NEW SEASON STARTS EVERY MONTH"}
                  </div>
                </div>
                <div className="rounded-lg border-2 border-tt-gold-500/50 bg-tt-night-900/80 px-3 py-2 md:col-span-2">
                  <Tag size="sm">WHAT ARE THE BENEFITS?</Tag>
                  <div className="font-primary text-p6 md:text-p5">
                    DISCOUNTED COLLECTIBLES • PRIORITY SUPPORT • EARLY ACCESS TO
                    UPDATES • BONUS TAILS • TIER PROGRESS
                  </div>
                </div>
              </div>
            )}
          </div>
          {seasonIsFrozen ? (
            <div className="flex flex-col gap-4 mt-3">
              <div className="font-primary text-p5">COUNTING THIS SEASON&apos;S BADGES...</div>
            </div>
          ) : (
            <div className="w-full max-w-[1320px] mt-6 grid grid-cols-1 gap-12 md:grid-cols-2 xl:grid-cols-3 place-items-center">
              {codex.map((item, i) => (
                <CodexSection key={i} {...item} progress={i + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
