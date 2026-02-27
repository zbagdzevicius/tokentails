import { USER_API } from "@/api/user-api";
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
import { IProfile } from "@/models/profile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";

const TGE_TARGET_DATE = "2026-11-19T00:00:00Z";

const getNextMonthStartUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
};

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

type IProgressTab = "OVERVIEW" | "MISSIONS" | "TIERS" | "BADGES";

const progressTabs: Array<{ id: IProgressTab; label: string }> = [
  { id: "OVERVIEW", label: "INFO" },
  { id: "MISSIONS", label: "GOALS" },
  { id: "TIERS", label: "TIERS" },
  { id: "BADGES", label: "BADGES" },
];

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
      "When we quest, we serve. When we mint, we mend. Every action echoes in shelters, clinics, and cages.",
    how: "Earn $TAILS through playing or participating in Airdrop event",
    image: cdnFile("codex/codex-2.webp"),
    task: "COLLECT 100 $TAILS",
    verification: (profile) => (profile?.monthTails || 0) >= 100,
    status: (profile) => `${profile?.monthTails || 0} / 100`,
  },
  {
    title: "#3 No Life is Left Behind",
    description:
      "Not the last-born kitten in a shelter. Not the unloved token in the chain. We rescue what others abandon. That is our oath.",
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
    title: "#6 From the Blockchain to the Beyond",
    description:
      "These cats are more than metadata. They are stories. Beacons. Proof that Web3 can matter. And we, their guardians, become legends. Your feedback is CODEX fuel.",
    how: "Go to 'QUESTS' section and complete 10 quests",
    image: cdnFile("codex/codex-8.webp"),
    task: "COMPLETE 10 QUESTS",
    verification: (profile) => (profile?.quests?.length || 0) >= 10,
    status: (profile) => `${profile?.quests?.length || 0} / 10`,
  },
  {
    title: "#7 Destiny Is Shared",
    description:
      "To save a cat is to unlock its ninth life. But in return, it unlocks yours. Every rescuer earns a fortune not just in token — but in legacy, in status, in soul.",
    how: "Craft $TAILS by staking your cats. You can do it once every 7 days with each of your cat, head over to 'CATS' section, select a cat and click 'CRAFT $TAILS' button. The more cats you have, the more $TAILS you can craft.",
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
      className={`flex flex-col items-center relative font-primary pt-4 border-4 rounded-2xl bg-gradient-to-bl from-yellow-300 to-orange-300 ${
        isCompleted ? "border-yellow-300" : "border-red-300"
      }`}
    >
      {!info && (
        <div className="flex items-center gap-1 absolute top-0 left-0">
          <Tag isSmall>{title.slice(0, 2)}</Tag>
        </div>
      )}
      <img src={image} alt="codex" className="h-16 -mb-2 -mt-12" />
      {info && <Tag isSmall>{title}</Tag>}
      {info && (
        <div
          key={info?.type}
          className={`flex flex-col w-64 animate-opacity font-primary text-balance text-center animate-opacit rounded-2xl border-4 border-yellow-300 px-0.5 py-1 ${
            isCompleted ? "bg-yellow-300" : "bg-red-300"
          }`}
        >
          <div className="text-p5 font-bold">
            {info.type === "lore" ? "WHY IT MATTERS" : "WHAT DO I NEED TO DO?"}
          </div>
          {info.type === "lore" ? description : how}
        </div>
      )}
      <span
        className={`px-2 text-p6 rounded-b-xl border-x-4 border-yellow-300 ${
          isCompleted ? "bg-yellow-300" : "bg-red-300"
        }`}
      >
        MISSION
      </span>
      <div
        className={`font-primary text-center animate-opacity w-fit flex items-center gap-1`}
      >
        <img
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
          isSmall
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
          className={`font-primary text-center animate-opacity w-fit px-2 h-fit rounded-2xl border-yellow-300 border-2 ${
            isCompleted ? "bg-yellow-300" : "bg-red-300"
          }`}
        >
          {status(profile)}
        </div>
        <PixelButton
          isSmall
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
      headerBg: "bg-gradient-to-r from-gray-300 to-gray-100",
      headerText: "text-gray-900",
    },
    RESCUER: {
      badge: "icons/rocket.png",
      chest: "icons/invites/gift-coin.png",
      pattern: "cards/backgrounds/pattern-RARE.webp",
      sparkle: "cards/backgrounds/blue-sparkle.webp",
      mascot: "tail/open-arms.webp",
      headerBg: "bg-gradient-to-r from-blue-300 to-blue-100",
      headerText: "text-blue-900",
    },
    CURATOR: {
      badge: "cards/icons/power.webp",
      chest: "tail/guard.webp",
      pattern: "cards/backgrounds/pattern-EPIC.webp",
      sparkle: "cards/backgrounds/purple-sparkle.webp",
      mascot: "tail/mascot-matters.webp",
      headerBg: "bg-gradient-to-r from-purple-300 to-purple-100",
      headerText: "text-purple-900",
    },
    LEGEND: {
      badge: "ability/TAILS.png",
      chest: "logo/coin.png",
      pattern: "cards/backgrounds/pattern-LEGENDARY.webp",
      sparkle: "cards/backgrounds/legendary-sparkle.webp",
      mascot: "tail/cat-celebrate.webp",
      headerBg: "bg-gradient-to-r from-yellow-300 to-yellow-100",
      headerText: "text-yellow-900",
    },
  };

  const visual = tierVisuals[tier.id] || tierVisuals.EXPLORER;
  const revealButtonLabel = tier.unlocked ? "REVEAL PRIZE" : "PREVIEW";
  const borderStyle = tier.claimed
    ? "border-yellow-300"
    : tier.unlocked
    ? "border-green-300"
    : "border-red-300";
  const desktopButtonScaleClass = "md:!scale-[0.92] md:hover:!scale-100";

  return (
    <div
      className={`w-full rounded-2xl border-4 ${borderStyle} bg-gradient-to-b from-yellow-100/98 via-yellow-50/96 to-orange-100/95 px-3 py-3 md:px-4 md:py-3.5 relative overflow-hidden text-yellow-900 shadow-[0_8px_0_0_rgba(120,53,15,0.24)]`}
    >
      <img
        src={cdnFile(visual.pattern)}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply z-0"
        alt={`${tier.name} pattern`}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-yellow-100/40 z-0" />
      <img
        src={cdnFile(visual.mascot)}
        className="absolute -right-2 top-0 h-16 w-16 md:h-20 md:w-20 object-contain opacity-20 z-0"
        alt={`${tier.name} mascot`}
      />
      <div
        className={`flex items-center justify-between gap-2 relative z-10 rounded-xl border-2 border-yellow-900 px-2 py-1.5 md:px-2.5 md:py-2 ${visual.headerBg}`}
      >
        <div
          className={`font-primary text-p5 md:text-p4 flex items-center gap-1.5 font-bold ${visual.headerText}`}
        >
          <img
            src={cdnFile(visual.badge)}
            className="h-7 w-7 md:h-8 md:w-8 rounded-md border border-yellow-900"
            alt={`${tier.name} badge`}
          />
          {tier.name}
        </div>
        <div className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 text-yellow-900 px-2 py-0.5 font-primary text-p5 font-bold">
          {tier.unlockProgress}%
        </div>
      </div>
      <div className="mt-1 text-p5 font-primary leading-tight relative z-10 rounded-lg border-2 border-yellow-900 bg-yellow-50/97 text-yellow-900 px-2 py-1.5">
        {tier.description}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1 relative z-10">
        {tier.requirements.map((requirement) => (
          <div
            key={`${tier.id}-${requirement.id}`}
            className={`flex items-center justify-between rounded-lg border-2 border-yellow-900 px-2 py-1 md:py-1.5 font-primary text-p5 text-yellow-900 ${
              requirement.met ? "bg-green-200/95" : "bg-red-200/95"
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
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border-2 border-yellow-900 bg-yellow-50/96 p-1.5 md:p-2 relative z-10">
          <div className="font-primary text-p5 flex items-center gap-1 text-yellow-900">
            <img
              src={cdnFile("purrquest/icons/chest.gif")}
              className="h-7 w-7 md:h-8 md:w-8"
              alt="chest"
            />
            {tier.reward.revealTitle}
          </div>
          <PixelButton
            isSmall
            className={desktopButtonScaleClass}
            text={revealButtonLabel}
            onClick={onReveal}
          />
        </div>
      ) : (
        <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-50/97 to-pink-100/93 p-2.5 md:p-3 animate-opacity relative overflow-hidden z-10">
          <img
            src={cdnFile(visual.sparkle)}
            className="absolute right-0 top-0 h-20 w-20 opacity-70 z-0"
            alt={`${tier.name} sparkle`}
          />
          <div className="flex items-center gap-2 relative z-10">
            <img
              src={cdnFile(visual.chest)}
              className="h-10 w-10 md:h-12 md:w-12 rounded-lg border-2 border-yellow-900"
              alt={tier.reward.revealTitle}
            />
            <img
              src={cdnFile(tier.reward.image)}
              className="h-10 w-10 md:h-12 md:w-12 rounded-lg border-2 border-yellow-900"
              alt={tier.reward.unlockable}
            />
            <div className="font-primary text-p5 leading-tight text-yellow-900">
              <div>{tier.reward.revealTeaser}</div>
              <div className="font-bold">
                +{tier.reward.tails} $TAILS • {tier.reward.unlockable}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 relative z-10">
            {!tier.claimed && tier.claimable && (
              <PixelButton
                isSmall
                className={desktopButtonScaleClass}
                text={isClaiming ? "CLAIMING..." : `CLAIM ${tier.reward.tails}`}
                onClick={onClaim}
                isDisabled={isClaiming}
              />
            )}
            {!tier.claimed && tier.unlocked && !tier.claimable && (
              <Tag isSmall>MEET ELIGIBILITY TO CLAIM</Tag>
            )}
            {tier.claimed && <Tag isSmall>CLAIMED</Tag>}
            {!tier.unlocked && <Tag isSmall>LOCKED</Tag>}
            {!tier.unlocked && <Tag isSmall>UNLOCK REQUIREMENTS TO CLAIM</Tag>}
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
      className={`rounded-2xl border-4 border-yellow-900 px-2.5 py-2.5 md:px-3.5 md:py-3.5 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.28)] ${
        challenge.completed
          ? "bg-gradient-to-br from-green-200 via-yellow-200 to-lime-200"
          : "bg-gradient-to-br from-yellow-100 via-orange-100 to-pink-100"
      }`}
    >
      <img
        src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
        alt="challenge pattern"
      />
      <img
        src={cdnFile(mascot)}
        className="absolute -right-1 -bottom-2 h-16 w-16 md:h-20 md:w-20 object-contain opacity-20"
        alt="challenge mascot"
      />
      <div className="flex items-center justify-between gap-2 relative z-10 rounded-lg border-2 border-yellow-900 bg-yellow-50/92 px-2 py-1">
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
      <div className="mt-1 text-p6 md:text-p5 leading-tight font-primary relative z-10 rounded-lg border border-yellow-900 bg-white/70 px-2 py-1">
        {challenge.description}
      </div>
      <div className="mt-1.5 h-2.5 w-full rounded-full bg-yellow-300 border border-yellow-900 relative z-10">
        <div
          className={`h-full rounded-full ${
            challenge.completed ? "bg-green-500" : "bg-yellow-600"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-primary text-p6 md:text-p5 relative z-10 rounded-lg border border-yellow-900 bg-yellow-50/90 px-2 py-1">
        <span>Reward</span>
        <span className="font-bold rounded-md border border-yellow-900 bg-yellow-50/90 px-2 py-0.5">
          +{challenge.rewardTails} $TAILS
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1 relative z-10">
        {challenge.claimable && (
          <PixelButton
            isSmall
            className={desktopButtonScaleClass}
            text={isClaiming ? "CLAIMING..." : `CLAIM ${challenge.rewardTails}`}
            onClick={onClaim}
            isDisabled={isClaiming}
          />
        )}
        {challenge.claimed && <Tag isSmall>CLAIMED</Tag>}
        {!challenge.completed && <Tag isSmall>COMPLETE TO CLAIM</Tag>}
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
            className={`min-w-[172px] md:min-w-[210px] rounded-xl border-4 border-yellow-900 p-2 md:p-2.5 relative overflow-hidden shadow-[0_6px_0_0_rgba(120,53,15,0.25)] ${
              milestone.reached
                ? "bg-gradient-to-b from-yellow-200 via-green-200 to-lime-200"
                : "bg-gradient-to-b from-yellow-100 via-orange-100 to-pink-100"
            }`}
          >
            <img
              src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
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
              className="h-20 md:h-24 w-full rounded-lg object-cover border border-yellow-900 relative z-10"
            />
            <div className="mt-1.5 rounded-lg border border-yellow-900 bg-yellow-50/90 px-2 py-1 relative z-10">
              <div className="font-primary text-p6 md:text-p5">
                {milestone.label}
              </div>
              <div className="font-primary text-p6 md:text-p5">
                SCORE {milestone.current} / {milestone.target}
              </div>
              <div className="font-primary text-p6 md:text-p5 font-bold">
                +{milestone.rewardTails} $TAILS
              </div>
            </div>
            <div className="relative z-10">
              <Tag isSmall>{milestone.reached ? "UNLOCKED" : "LOCKED"}</Tag>
            </div>
            <div className="mt-1.5 flex items-center gap-1 relative z-10">
              {milestone.claimable && (
                <PixelButton
                  isSmall
                  className={desktopButtonScaleClass}
                  text={
                    claimingMilestoneId === milestone.id
                      ? "CLAIMING..."
                      : `CLAIM ${milestone.rewardTails}`
                  }
                  onClick={() => onClaimMilestone(milestone.id)}
                  isDisabled={claimingMilestoneId === milestone.id}
                />
              )}
              {milestone.claimed && <Tag isSmall>CLAIMED</Tag>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProgressHudTile = ({
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
      header: "bg-gradient-to-r from-green-300 to-yellow-200",
      valueGlow: "text-green-800",
      bar: "from-green-500 to-yellow-500",
    },
    "TIER ASCENT": {
      header: "bg-gradient-to-r from-blue-300 to-cyan-200",
      valueGlow: "text-blue-800",
      bar: "from-blue-500 to-cyan-500",
    },
    "COMBO POWER": {
      header: "bg-gradient-to-r from-orange-300 to-pink-200",
      valueGlow: "text-orange-800",
      bar: "from-orange-500 to-pink-500",
    },
    "CLAIMABLE STASH": {
      header: "bg-gradient-to-r from-yellow-300 to-amber-200",
      valueGlow: "text-yellow-800",
      bar: "from-yellow-500 to-amber-500",
    },
  };
  const theme = themeByTitle[title] || {
    header: "bg-gradient-to-r from-yellow-300 to-yellow-100",
    valueGlow: "text-yellow-900",
    bar: "from-pink-500 to-yellow-600",
  };
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="rounded-xl border-2 border-yellow-900 bg-gradient-to-b from-yellow-100/95 via-yellow-50/95 to-orange-100/95 text-yellow-900 px-3 py-2.5 md:px-3.5 md:py-3 relative overflow-hidden shadow-[0_6px_0_0_rgba(120,53,15,0.16)]">
      <img
        src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.06] mix-blend-multiply"
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
          className={`font-primary text-p6 md:text-p5 rounded-lg border-2 border-yellow-900 px-2 py-0.5 font-bold ${theme.header}`}
        >
          {title}
        </div>
        <div className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 p-1">
          <img
            src={cdnFile(icon)}
            alt={title}
            className="h-5 w-5 md:h-6 md:w-6"
          />
        </div>
      </div>
      <div className="mt-1 rounded-lg border-2 border-yellow-900 bg-white/88 px-2.5 py-1.5 relative z-10">
        <div
          className={`font-primary text-p3 md:text-p2 font-bold leading-none ${theme.valueGlow}`}
        >
          {value}
        </div>
      </div>
      <div className="mt-1 rounded-lg border border-yellow-900 bg-yellow-50/95 px-2 py-1 font-primary text-p6 md:text-p5 leading-tight min-h-[34px] relative z-10">
        {detail}
      </div>
      <div className="mt-1.5 flex items-center gap-2 relative z-10">
        <div className="h-2.5 flex-1 rounded-full border border-yellow-900 bg-yellow-50">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${theme.bar}`}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <span className="rounded-md border border-yellow-900 bg-yellow-50/95 px-1.5 py-0.5 font-primary text-p6 md:text-p5 font-bold text-yellow-900">
          {clampedProgress}%
        </span>
      </div>
    </div>
  );
};

const date = 9;

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

export const Codex = () => {
  const [isFAQOpen, setIsFAQOpen] = useState(false);
  const [activeProgressTab, setActiveProgressTab] =
    useState<IProgressTab>("OVERVIEW");
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
  const dateUntilNearest9thDay = useMemo(() => {
    const now = new Date();
    const currentDayUTC = now.getUTCDate();
    const currentMonthUTC = now.getUTCMonth();
    const currentYearUTC = now.getUTCFullYear();

    let nearest9thDay;

    if (currentDayUTC < 9) {
      // 9th day of current month in UTC
      nearest9thDay = new Date(Date.UTC(currentYearUTC, currentMonthUTC, date));
    } else {
      // 9th day of next month in UTC
      nearest9thDay = new Date(
        Date.UTC(currentYearUTC, currentMonthUTC + 1, date),
      );
    }

    return nearest9thDay;
  }, []);
  const isLessThan8hoursLeft = useMemo(() => {
    const now = new Date();
    const timeDifference = dateUntilNearest9thDay.getTime() - now.getTime();
    return timeDifference > 0 && timeDifference < 8 * 60 * 60 * 1000;
  }, [dateUntilNearest9thDay]);
  const nextMonthTargetDate = useMemo(() => getNextMonthStartUtc(), []);
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

  const claimTierReward = async (tierId: string) => {
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
      const alreadyClaimed = profile?.airdropRewardsClaimed || [];
      const claimedTierId = result.tierId || tierId;
      setProfileUpdate({
        tails: (profile?.tails || 0) + (result.tails || 0),
        airdropRewardsClaimed: Array.from(
          new Set([...alreadyClaimed, claimedTierId]),
        ),
      });
      showToast({
        message: result.message || `Claimed ${result.tails || 0} $TAILS`,
        symbol: "tails",
      });
      await syncAirdropProgression(result.progression);
    } finally {
      setClaimingTierId(null);
    }
  };

  const claimChallengeReward = async (challengeId: string) => {
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
      setProfileUpdate({
        tails: (profile?.tails || 0) + (result.tails || 0),
      });
      showToast({
        message: result.message || `Claimed ${result.tails || 0} $TAILS`,
        symbol: "tails",
      });
      await syncAirdropProgression(result.progression);
    } finally {
      setClaimingChallengeId(null);
    }
  };

  const claimMilestoneReward = async (milestoneId: string) => {
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
      setProfileUpdate({
        tails: (profile?.tails || 0) + (result.tails || 0),
      });
      showToast({
        message: result.message || `Claimed ${result.tails || 0} $TAILS`,
        symbol: "tails",
      });
      await syncAirdropProgression(result.progression);
    } finally {
      setClaimingMilestoneId(null);
    }
  };

  return (
    <div className="flex flex-col items-center relative pb-14">
      <div className="w-full max-w-[1320px] mb-3 rounded-2xl border-4 border-red-300 bg-gradient-to-r from-red-950 via-orange-900 to-yellow-900 px-3 py-3 md:px-4 md:py-4 text-yellow-100 relative overflow-hidden shadow-[0_10px_0_0_rgba(127,29,29,0.35)]">
        <div className="absolute inset-x-10 top-1/2 h-20 -translate-y-1/2 bg-red-500/25 blur-3xl animate-pulse" />
        <img
          src={cdnFile("cards/backgrounds/pattern-LEGENDARY.webp")}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.16] mix-blend-screen"
          alt="countdown pattern"
        />
        <img
          src={cdnFile("cards/backgrounds/legendary-sparkle.webp")}
          className="absolute -right-4 -top-4 h-28 w-28 md:h-36 md:w-36 object-contain opacity-45"
          alt="countdown sparkle"
        />
        <img
          src={cdnFile("flare-effect/effects/coindrop.gif")}
          className="absolute -left-4 bottom-0 h-20 w-20 md:h-24 md:w-24 object-contain opacity-40"
          alt="coin flare"
        />
        <img
          src={cdnFile("tail/cat-celebrate.webp")}
          className="absolute right-1 top-1 h-16 w-16 md:h-20 md:w-20 object-contain opacity-35"
          alt="countdown mascot"
        />
        <div className="relative z-10 rounded-xl border-2 border-yellow-300 bg-gradient-to-b from-red-900/60 to-yellow-900/40 px-3 py-3 md:px-4 md:py-4">
          <div className="w-fit mx-auto rounded-lg border-2 border-yellow-300 bg-gradient-to-r from-yellow-300 to-orange-300 px-3 py-0.5 font-primary text-p5 md:text-p4 font-bold text-red-900 text-center">
            TGE COUNTDOWN
          </div>
          <div className="mt-2 text-center font-primary text-p6 md:text-p5 text-yellow-100">
            FINAL PHASE
          </div>
          <div className="mt-2 mx-auto w-full max-w-[900px] p-4 md:p-5">
            <Countdown targetDate={TGE_TARGET_DATE} isDaysDisplayed isBig />
          </div>
        </div>
      </div>
      <div className="w-full max-w-[1320px] mb-3 rounded-2xl border-4 border-yellow-900 bg-gradient-to-b from-orange-100 to-yellow-100 px-3 py-3 md:px-4 md:py-4 text-yellow-900 relative overflow-hidden">
        <img
          src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.06] mix-blend-multiply"
          alt="monthly pattern"
        />
        <img
          src={cdnFile("tail/cat-promo.webp")}
          className="absolute right-1 bottom-0 h-14 w-14 md:h-16 md:w-16 object-contain opacity-20"
          alt="monthly mascot"
        />
        <div className="relative z-10 rounded-xl border-2 border-yellow-900 bg-yellow-50/96 px-3 py-3 md:px-4 md:py-4">
          <div className="w-fit mx-auto rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-3 py-0.5 font-primary text-p5 md:text-p4 font-bold text-yellow-900 text-center">
            NEXT MONTH COUNTDOWN
          </div>
          <div className="mt-2 mx-auto w-full max-w-[900px] p-4 md:p-5">
            <Countdown targetDate={nextMonthTargetDate} isDaysDisplayed isBig />
          </div>
          <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-orange-100 px-3 py-2 font-primary text-p6 md:text-p5 text-center">
            Rewards are cycle-based and progression-gated. Collect and claim
            before the monthly cutoff to maximize your allocation.
          </div>
        </div>
      </div>
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-center gap-2 -mr-2">
          {progressTabs.map((tab) => {
            const isActive = activeProgressTab === tab.id;
            return (
              <span key={tab.id} className="-ml-2">
                <PixelButton
                  isSmall
                  active={isActive}
                  className="!m-0"
                  text={tab.label}
                  onClick={() => setActiveProgressTab(tab.id)}
                />
              </span>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-[1320px] mb-8 flex flex-col items-center gap-3">
        {activeProgressTab !== "BADGES" && isAirdropLoading && (
          <div className="font-primary text-p4">LOADING PROGRESSION...</div>
        )}
        {activeProgressTab !== "BADGES" && isAirdropError && (
          <div className="w-full rounded-xl border-2 border-red-400 bg-red-100 p-3 flex flex-col items-center gap-1.5">
            <div className="font-primary text-p5 text-red-700">
              Could not load progression right now.
            </div>
            <PixelButton
              isSmall
              className="md:!scale-[0.92] md:hover:!scale-100"
              text="RETRY"
              onClick={() => refetchAirdropProgression()}
            />
          </div>
        )}
        {activeProgressTab === "BADGES" && (
          <div className="w-full max-w-[1320px] rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-100 via-orange-100 to-pink-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
            <img
              src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
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
              <div className="rounded-xl border-2 border-yellow-900 bg-yellow-50/95 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-yellow-900">
                    MY BADGE VAULT
                  </span>
                  <Tag isSmall>{isCompleted ? "MASTERED" : "IN PROGRESS"}</Tag>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="font-paws text-h3 leading-none text-yellow-900 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0,0.25)]">
                    {completedMonths}
                  </span>
                  <span className="font-primary text-p5 md:text-p4 mb-1">
                    BADGES EARNED
                  </span>
                </div>
                <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-yellow-100/95 px-2 py-2 min-h-[44px] flex items-center">
                  {completedMonths > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {Array.from({ length: completedMonths }).map((_, index) => (
                        <img
                          key={index}
                          src={cdnFile("logo/heart.webp")}
                          className="w-6"
                          alt="badge heart"
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="font-primary text-p6 md:text-p5 text-yellow-900">
                      Start completing missions to mint your first badge.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border-2 border-yellow-900 bg-gradient-to-b from-yellow-200 to-orange-100 p-3">
                <div className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-pink-400 to-yellow-400 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-yellow-900 w-fit">
                  BADGE YIELD
                </div>
                <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-2 font-primary text-yellow-900">
                  <div className="text-p6 md:text-p5">Current Monthly Boost</div>
                  <div className="text-p4 md:text-p3 font-bold leading-none">
                    +{monthlyBadgeYield} $TAILS
                  </div>
                </div>
                <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-1.5 font-primary text-p6 md:text-p5 text-yellow-900">
                  1 badge = 300 $TAILS per month
                </div>
                <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-1.5 font-primary text-p6 md:text-p5 text-yellow-900">
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
            {activeProgressTab === "OVERVIEW" && (
              <>
                <Tag>AIRDROP COMMAND CENTER</Tag>
                <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-100 to-pink-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
                    alt="hud pattern"
                  />
                  <img
                    src={cdnFile("tail/mascot-point-right.webp")}
                    className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-22"
                    alt="command center mascot"
                  />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between font-primary text-p4 gap-2">
                      <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-br from-yellow-300 to-yellow-100 px-2.5 py-0.5 text-yellow-900 text-p5 md:text-p4 font-bold">
                        PROGRESSION COMMAND CENTER
                      </span>
                      <div className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 text-yellow-900 px-3 py-0.5 text-p6 font-bold">
                        LIVE
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border-2 border-yellow-900 bg-yellow-50/92 p-2 md:p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <ProgressHudTile
                          icon="icons/check.webp"
                          mascot="tail/mascot-card.webp"
                          title="ELIGIBILITY SCORE"
                          value={`${eligibilityStats.met}/${eligibilityStats.total}`}
                          detail={`${eligibilityStats.progress}% READY FOR SNAPSHOT`}
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
                          detail={`STREAK BONUS +${airdropProgression.gamification.streakBonusTails} $TAILS`}
                          progress={comboPowerProgress}
                        />
                        <ProgressHudTile
                          icon="flare-effect/effects/coindrop.gif"
                          mascot="tail/open-arms.webp"
                          title="CLAIMABLE STASH"
                          value={`${rewardStats.claimableTails} $TAILS`}
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
                    <div className="mt-3 rounded-lg border-2 border-yellow-900 bg-yellow-50/95 text-yellow-900 px-3 py-1.5 font-primary text-p6 md:text-p5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span>
                        Missions: +{rewardStats.claimableChallengeTails} $TAILS
                      </span>
                      <span>
                        Milestones: +{rewardStats.claimableMilestoneTails}{" "}
                        $TAILS
                      </span>
                      <span>
                        Tiers: +{rewardStats.claimableTierTails} $TAILS
                      </span>
                      <span>
                        Legendary stash: x
                        {rewardStats.stashBonusMultiplier.toFixed(2)}
                        {rewardStats.additionalLegendaryCards > 0
                          ? ` (${rewardStats.additionalLegendaryCards} extra legendary)`
                          : " (no bonus yet)"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-100 to-pink-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                    <img
                      src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                      className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
                      alt="eligibility pattern"
                    />
                    <img
                      src={cdnFile("tail/mascot-card.webp")}
                      className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-28"
                      alt="eligibility mascot"
                    />
                    <div className="flex items-center justify-between font-primary text-p4 relative z-10">
                      <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 text-yellow-900 text-p5 md:text-p4 font-bold">
                        ELIGIBILITY
                      </span>
                      <span
                        className={`rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-2 py-0.5 ${
                          airdropProgression.eligible
                            ? "text-green-700"
                            : "text-red-700"
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
                            className={`rounded-lg border-2 border-yellow-900 px-3 py-2 font-primary text-p5 ${
                              criterion.met ? "bg-green-200" : "bg-red-200"
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

                  <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-200 to-orange-200 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                    <img
                      src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                      className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
                      alt="collectible pattern"
                    />
                    <img
                      src={cdnFile("tail/cat-promo.webp")}
                      className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-28"
                      alt="collectible mascot"
                    />
                    <div className="flex items-center justify-between font-primary text-p4 relative z-10">
                      <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 text-yellow-900 text-p5 md:text-p4 font-bold">
                        COLLECTIBLE LEVEL
                      </span>
                      <span className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-2 py-0.5">
                        {airdropProgression.metrics.collectibleLevel}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 font-primary text-p5 relative z-10">
                      <div className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-3 py-1">
                        Cats: {airdropProgression.metrics.collectiblesOwned}
                      </div>
                      <div className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-3 py-1">
                        Quests: {airdropProgression.metrics.questsCompleted}
                      </div>
                      <div className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-3 py-1">
                        Packs: {airdropProgression.metrics.packPurchases}
                      </div>
                      <div className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-3 py-1">
                        Portraits:{" "}
                        {airdropProgression.metrics.portraitPurchases}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 font-primary text-p5 relative z-10">
                      <span className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-3 py-1">
                        Current:{" "}
                        {airdropProgression.currentTierId || "UNRANKED"}
                      </span>
                      <span className="rounded-lg border-2 border-yellow-900 bg-yellow-100 px-3 py-1">
                        Next: {airdropProgression.nextTierId || "MAXED"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 relative z-10">
                      {airdropProgression.unlockedUnlockables.length > 0 ? (
                        airdropProgression.unlockedUnlockables.map(
                          (unlockable) => (
                            <Tag key={unlockable} isSmall>
                              {unlockable.toUpperCase()}
                            </Tag>
                          ),
                        )
                      ) : (
                        <Tag isSmall>NO UNLOCKABLES UNLOCKED YET</Tag>
                      )}
                    </div>
                  </div>

                  {!!nextAction && (
                    <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-blue-100 to-yellow-100 p-3 md:p-4 lg:col-span-2 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                      <img
                        src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                        className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
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
                        <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 text-yellow-900 text-p5 md:text-p4 font-bold">
                          NEXT BEST ACTION
                        </span>
                      </div>
                      <div className="font-primary text-p5 relative z-10 rounded-lg border border-yellow-900 bg-white/72 px-2 py-1 mt-1">
                        {nextAction.label}
                      </div>
                      <div className="font-primary text-p6 md:text-p5 leading-tight relative z-10 rounded-lg border border-yellow-900 bg-yellow-50/92 px-2 py-1 mt-1">
                        {nextAction.detail}
                      </div>
                      <div className="font-primary text-p6 md:text-p5 mt-1.5 relative z-10 rounded-lg border border-yellow-900 bg-yellow-50/92 px-2 py-1">
                        Progress: {nextAction.progress}
                      </div>
                    </div>
                  )}

                  <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-100 to-purple-100 p-3 md:p-4 relative overflow-hidden lg:col-span-2 shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                    <img
                      src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                      className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
                      alt="xp pattern"
                    />
                    <img
                      src={cdnFile("tail/cat-celebrate.webp")}
                      className="absolute right-1 top-1 h-12 w-12 md:h-14 md:w-14 object-contain opacity-28"
                      alt="xp mascot"
                    />
                    <div className="flex items-center justify-between font-primary text-p4 relative z-10">
                      <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 text-yellow-900 text-p5 md:text-p4 font-bold">
                        LVL {airdropProgression.gamification.level} •{" "}
                        {airdropProgression.gamification.title}
                      </span>
                      <span className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-2 py-0.5">
                        {airdropProgression.gamification.xp} XP
                      </span>
                    </div>
                    <div className="mt-2 h-4 w-full rounded-full border border-yellow-900 bg-yellow-200 relative z-10">
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
                        {airdropProgression.gamification.streakBonusTails}{" "}
                        $TAILS
                      </span>
                      <span>
                        POTENTIAL: +
                        {airdropProgression.gamification.potentialBonusTails}{" "}
                        $TAILS
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

            {activeProgressTab === "MISSIONS" && (
              <>
                <Tag>MISSION BOARD</Tag>
                <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-br from-yellow-100 via-orange-100 to-pink-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
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
                <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-br from-yellow-100 via-yellow-200 to-orange-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
                    alt="milestone board pattern"
                  />
                  <MilestoneTrack
                    milestones={airdropProgression.gamification.milestones}
                    claimingMilestoneId={claimingMilestoneId}
                    onClaimMilestone={claimMilestoneReward}
                  />
                  <div className="mt-2 w-full flex items-center justify-between rounded-xl border-2 border-yellow-900 bg-yellow-100/95 px-3 py-2 font-primary text-p6 md:text-p5 relative z-10">
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
                <div className="w-full rounded-xl border-2 border-yellow-900 bg-gradient-to-r from-yellow-100 to-pink-100 px-3 py-2 font-primary text-p6 md:text-p5 relative overflow-hidden">
                  <img
                    src={cdnFile("tail/open-arms.webp")}
                    className="absolute right-1 bottom-0 h-10 w-10 object-contain opacity-40"
                    alt="tip mascot"
                  />
                  <span className="relative z-10">
                    Claim mission and milestone rewards to fund tier unlock
                    progress. Tier rewards are the high-value airdrop payouts.
                  </span>
                </div>
              </>
            )}

            {activeProgressTab === "TIERS" && (
              <>
                <Tag>AIRDROP TIERS • REVEALS • $TAILS</Tag>
                <div className="w-full rounded-2xl border-4 border-yellow-300 bg-gradient-to-br from-yellow-100 via-orange-100 to-pink-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
                  <img
                    src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
                    className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
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
      </div>

      {activeProgressTab === "BADGES" && (
        <>
          <div className="w-full max-w-[1320px] rounded-2xl border-4 border-yellow-300 bg-gradient-to-r from-yellow-100 via-orange-100 to-pink-100 p-3 md:p-4 relative overflow-hidden shadow-[0_8px_0_0_rgba(120,53,15,0.2)]">
            <img
              src={cdnFile("cards/backgrounds/pattern-mini-2.webp")}
              className="absolute inset-0 h-full w-full object-cover opacity-[0.08] mix-blend-multiply"
              alt="missions pattern"
            />
            <img
              src={cdnFile("tail/mascot-point-right.webp")}
              className="absolute right-1 bottom-0 h-12 w-12 md:h-14 md:w-14 object-contain opacity-20"
              alt="missions mascot"
            />
            <div className="relative z-10">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-yellow-900">
                  THIS MONTH MISSIONS
                </span>
                <span className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-2 py-0.5 font-primary text-p6 md:text-p5 text-yellow-900 font-bold">
                  {completedCount}/{codex.length}
                </span>
              </div>
              <div className="mt-2 w-full flex rounded-full overflow-hidden gap-1 border-2 border-yellow-900 bg-yellow-50 p-1">
                {Array.from({ length: codex.length }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-12 w-6 flex-1 relative rounded-sm ${
                      index < completedCount ? "bg-yellow-300" : "bg-red-300"
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
              <div className="mt-2 rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-1.5 font-primary text-p6 md:text-p5 text-center text-yellow-900">
                {!isCompleted
                  ? `Complete ${remainingBadgeMissions} more mission${
                      remainingBadgeMissions === 1 ? "" : "s"
                    } to earn this cycle's cat lover badge`
                  : "All missions completed. Badge cycle fully unlocked."}
              </div>
            </div>
          </div>

          <div className="w-full max-w-[1320px] mt-2 rounded-xl border-2 border-yellow-900 bg-gradient-to-r from-yellow-100 to-orange-100 p-3 md:p-4 relative overflow-hidden">
            <img
              src={cdnFile("tail/open-arms.webp")}
              className="absolute right-1 top-1 h-10 w-10 md:h-12 md:w-12 object-contain opacity-20"
              alt="faq mascot"
            />
            <div className="relative z-10 flex items-center justify-between gap-2">
              <span className="rounded-lg border-2 border-yellow-900 bg-gradient-to-r from-yellow-300 to-yellow-100 px-2 py-0.5 font-primary text-p5 md:text-p4 font-bold text-yellow-900">
                BADGE INTEL
              </span>
              <PixelButton
                isSmall
                text={isFAQOpen ? "CLOSE" : "FAQ"}
                onClick={() => setIsFAQOpen((prev) => !prev)}
              />
            </div>
            {isFAQOpen && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-2">
                  <Tag isSmall>WHAT DO I NEED TO DO?</Tag>
                  <div className="font-primary text-p6 md:text-p5">
                    COMPLETE ALL 9 MISSIONS
                  </div>
                </div>
                <div className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-2">
                  <Tag isSmall>WHAT DO I NEED TO KNOW?</Tag>
                  <div className="font-primary text-p6 md:text-p5">
                    RESETS ON 9TH DAY OF EVERY MONTH
                  </div>
                </div>
                <div className="rounded-lg border-2 border-yellow-900 bg-yellow-50/95 px-3 py-2 md:col-span-2">
                  <Tag isSmall>WHAT ARE THE BENEFITS?</Tag>
                  <div className="font-primary text-p6 md:text-p5">
                    DISCOUNTED COLLECTIBLES • PRIORITY SUPPORT • EARLY ACCESS
                    TO UPDATES • $TAILS DROPS • AIRDROP ELIGIBILITY CRITERIA
                  </div>
                </div>
              </div>
            )}
          </div>
          {isLessThan8hoursLeft ? (
            <div className="flex flex-col gap-4 mt-3">
              <div className="font-primary text-p5">CALCULATING REWARDS...</div>
            </div>
          ) : (
            <div className="w-full max-w-[1320px] mt-6 grid grid-cols-1 gap-12 md:grid-cols-2 xl:grid-cols-3 place-items-center">
              {codex.map((item, i) => (
                <CodexSection key={i} {...item} progress={i + 1} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
