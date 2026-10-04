import { cdnFile } from "@/constants/utils";
import type {
  IAirdropChallenge,
  IAirdropCriterion,
  IAirdropMilestone,
  IAirdropTierProgress,
} from "@/models/airdrop";
import { formatTails } from "@/shared-contracts/copy";
import clsx from "clsx";
import type { ReactNode } from "react";
import { PixelIcon } from "../shared/PixelIcon";
import { ModalButton, StatusPill } from "../ui/modal";

/*
 * The PROGRESS cards (REWARDS, MISSIONS, TIERS). They sit inside a ModalSection, so they are
 * flat rows on the section card (one card level only): a night well, no gold border. Tone follows
 * state, never alarm: locked or not yet is muted, done is mint, ready to claim is gold with a
 * gentle pulse (motion allowed only).
 */

type BarTone = "gold" | "mint" | "sky" | "pink";
const BAR_FILL: Record<BarTone, string> = {
  gold: "bg-tt-gold-400",
  mint: "bg-tt-mint",
  sky: "bg-tt-sky",
  pink: "bg-tt-pink",
};

/** A crisp pixel progress bar (square ends, stepped edge). */
export const ProgressBar = ({
  value,
  max,
  tone = "gold",
  label,
  className,
}: {
  value: number;
  max: number;
  tone?: BarTone;
  /** Accessible name; the bar is a progressbar. */
  label: string;
  className?: string;
}) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={clsx("h-[8px] w-full bg-tt-night-950 [box-shadow:0_0_0_2px_rgb(var(--tt-night-500)/0.9)]", className)}
    >
      <div
        className={clsx("h-full transition-[width] duration-500 motion-reduce:transition-none", BAR_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

/** A flat row inside a section card. */
export const Well = ({
  tone = "default",
  className,
  children,
  ...rest
}: {
  tone?: "default" | "done" | "ready";
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}) => (
  <div
    data-testid={rest["data-testid"]}
    data-state={tone}
    className={clsx(
      "relative flex min-w-0 flex-col gap-2 p-3 short:p-2",
      tone === "ready"
        ? "bg-tt-gold-400/10 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-gold-500)/0.7)]"
        : tone === "done"
        ? "bg-tt-mint/[0.06] [box-shadow:inset_0_0_0_2px_rgb(var(--tt-mint)/0.35)]"
        : "bg-tt-night-950/45 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-night-500)/0.6)]",
      className
    )}
  >
    {children}
  </div>
);

const Reward = ({ tails }: { tails: number }) => (
  <span className="inline-flex items-center gap-1 font-primary text-p5 uppercase leading-none text-tt-gold-400">
    <PixelIcon name="coins" size={14} />+{formatTails(tails)}
  </span>
);

/** One reward check (an eligibility criterion): what it asks, how far along, met or not yet. */
export const RewardCheckRow = ({ criterion }: { criterion: IAirdropCriterion }) => (
  <Well tone={criterion.met ? "done" : "default"}>
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className={clsx("mt-0.5", criterion.met ? "text-tt-mint" : "text-tt-muted")}>
        <PixelIcon name={criterion.met ? "check" : "target"} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-p5 font-extrabold leading-tight text-tt-cream">{criterion.label}</p>
        <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted">{criterion.description}</p>
      </div>
      <span className="shrink-0 font-primary text-p5 leading-none text-tt-cream">
        {criterion.current} / {criterion.target}
      </span>
    </div>
    <ProgressBar
      value={criterion.current}
      max={criterion.target}
      tone={criterion.met ? "mint" : "gold"}
      label={`${criterion.label}: ${criterion.current} of ${criterion.target}`}
    />
  </Well>
);

/** A daily mission: progress, its Tails, and CLAIM once it is done. */
export const MissionCard = ({
  challenge,
  isClaiming,
  onClaim,
}: {
  challenge: IAirdropChallenge;
  isClaiming: boolean;
  onClaim: () => void;
}) => {
  const tone = challenge.claimable ? "ready" : challenge.claimed ? "done" : "default";
  return (
    <Well tone={tone} data-testid={`mission-${challenge.id}`}>
      <div className="flex items-start gap-2.5">
        <img
          src={cdnFile(challenge.icon)}
          className="h-9 w-9 shrink-0 object-contain [image-rendering:pixelated]"
          alt=""
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-cream">{challenge.label}</p>
          <p className="mt-1 font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">
            {challenge.description}
          </p>
        </div>
        <span className="shrink-0 font-primary text-p5 leading-none text-tt-cream">
          {Math.min(challenge.current, challenge.target)} / {challenge.target}
        </span>
      </div>
      <ProgressBar
        value={challenge.current}
        max={challenge.target}
        tone={challenge.completed ? "mint" : "gold"}
        label={`${challenge.label}: ${challenge.current} of ${challenge.target}`}
      />
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
        <Reward tails={challenge.rewardTails} />
        {challenge.claimable ? (
          <ModalButton
            variant="primary"
            size="sm"
            busy={isClaiming}
            onClick={onClaim}
            className="tt-claim-glow"
          >
            {`CLAIM ${challenge.rewardTails} TAILS`}
          </ModalButton>
        ) : challenge.claimed ? (
          <StatusPill tone="mint" icon="check">Claimed</StatusPill>
        ) : (
          // A state, not an action: plain muted text, so it never reads as a button beside CLAIM.
          <span className="font-sans text-p6 font-bold text-tt-muted md:text-p5">
            {Math.max(0, challenge.target - challenge.current)} to go
          </span>
        )}
      </div>
    </Well>
  );
};

/** A milestone: a bigger one-time goal, in a sideways row. */
export const MilestoneCard = ({
  milestone,
  isClaiming,
  onClaim,
}: {
  milestone: IAirdropMilestone;
  isClaiming: boolean;
  onClaim: () => void;
}) => {
  const tone = milestone.claimable ? "ready" : milestone.claimed || milestone.reached ? "done" : "default";
  return (
    <li className="w-[13.5rem] shrink-0 snap-start md:w-[15rem]">
      <Well tone={tone} className="h-full">
        <img
          src={cdnFile(milestone.icon)}
          alt=""
          aria-hidden="true"
          className="h-16 w-full object-contain [image-rendering:pixelated] md:h-20"
        />
        <p className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-cream">{milestone.label}</p>
        <div className="flex items-center justify-between gap-2 font-sans text-p6 font-bold text-tt-muted">
          <span>
            {Math.min(milestone.current, milestone.target)} / {milestone.target}
          </span>
          <Reward tails={milestone.rewardTails} />
        </div>
        <ProgressBar
          value={milestone.current}
          max={milestone.target}
          tone={milestone.reached ? "mint" : "gold"}
          label={`${milestone.label}: ${milestone.current} of ${milestone.target}`}
        />
        <div className="mt-auto flex min-h-[44px] items-center">
          {milestone.claimable ? (
            <ModalButton
              variant="primary"
              size="sm"
              fullWidth
              busy={isClaiming}
              onClick={onClaim}
              className="tt-claim-glow"
            >
              {`CLAIM ${milestone.rewardTails} TAILS`}
            </ModalButton>
          ) : milestone.claimed ? (
            <StatusPill tone="mint" icon="check">Claimed</StatusPill>
          ) : milestone.reached ? (
            <StatusPill tone="mint">Reached</StatusPill>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-sans text-p6 font-bold text-tt-muted md:text-p5">
              {milestone.current > 0 ? (
                "In progress"
              ) : (
                <>
                  <PixelIcon name="lock" size={14} /> Not started
                </>
              )}
            </span>
          )}
        </div>
      </Well>
    </li>
  );
};

const TIER_ART: Record<string, { badge: string; chest: string; text: string }> = {
  EXPLORER: { badge: "logo/coin.webp", chest: "logo/chest.webp", text: "text-tt-cream" },
  RESCUER: { badge: "icons/rocket.png", chest: "icons/invites/gift-coin.png", text: "text-tt-sky" },
  CURATOR: { badge: "cards/icons/power.webp", chest: "tail/guard.webp", text: "text-tt-lilac" },
  LEGEND: { badge: "ability/TAILS.png", chest: "logo/coin.png", text: "text-tt-gold-400" },
};

/**
 * One tier: what it needs, its hidden prize (REVEAL PRIZE or PREVIEW), and CLAIM once it is
 * unlocked and the reward checks are met.
 */
export const TierCard = ({
  tier,
  revealed,
  isClaiming,
  onReveal,
  onClaim,
  checksMet = true,
}: {
  tier: IAirdropTierProgress;
  /** Every reward check is met; a tier prize cannot be claimed before (the backend agrees). */
  checksMet?: boolean;
  revealed: boolean;
  isClaiming: boolean;
  onReveal: () => void;
  onClaim: () => void;
}) => {
  const art = TIER_ART[tier.id] || TIER_ART.EXPLORER;
  const claimable = tier.claimable && checksMet;
  const tone = claimable ? "ready" : tier.claimed || tier.unlocked ? "done" : "default";
  const status = tier.claimed ? (
    <StatusPill tone="mint" icon="check">Claimed</StatusPill>
  ) : claimable ? (
    <StatusPill tone="gold" icon="gift">Ready to claim</StatusPill>
  ) : tier.unlocked ? (
    <StatusPill tone="mint">Unlocked</StatusPill>
  ) : (
    <StatusPill tone="neutral" icon="lock">Locked</StatusPill>
  );

  return (
    <Well tone={tone} data-testid={`tier-${tier.id}`} className="gap-3">
      {/* The status wraps onto its own row when the card is narrow, never over the title. */}
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2">
        <img
          src={cdnFile(art.badge)}
          className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]"
          alt=""
          aria-hidden="true"
        />
        <div className="min-w-[9rem] flex-1">
          <h4 className={clsx("font-primary text-p3 uppercase leading-none tracking-wide", art.text)}>{tier.name}</h4>
          <p className="mt-1 font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">{tier.description}</p>
        </div>
        <div className="shrink-0 max-sm:basis-full max-sm:pl-[50px]">{status}</div>
      </div>

      <ul className="flex flex-col gap-1.5" aria-label={`${tier.name} requirements`}>
        {tier.requirements.map((req) => (
          <li key={`${tier.id}-${req.id}`} className="flex items-center gap-2 font-sans text-p5 font-bold">
            <span aria-hidden="true" className={req.met ? "text-tt-mint" : "text-tt-muted"}>
              <PixelIcon name={req.met ? "check" : "lock"} size={14} />
            </span>
            <span className={clsx("min-w-0 flex-1", req.met ? "text-tt-cream" : "text-tt-cream/85")}>{req.label}</span>
            <span className="shrink-0 text-tt-muted">
              {req.current} / {req.target}
            </span>
          </li>
        ))}
      </ul>

      {!revealed ? (
        <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 border-t-2 border-tt-night-500/50 pt-3">
          <span className="inline-flex items-center gap-2 font-sans text-p5 font-bold text-tt-cream">
            <img src={cdnFile("purrquest/icons/chest.gif")} className="h-8 w-8" alt="" aria-hidden="true" />
            {tier.reward.revealTitle}
          </span>
          <ModalButton variant={tier.unlocked ? "primary" : "secondary"} size="sm" icon="eye" onClick={onReveal}>
            {tier.unlocked ? "REVEAL PRIZE" : "PREVIEW"}
          </ModalButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t-2 border-tt-night-500/50 pt-3 animate-opacity motion-reduce:animate-none">
          <div className="flex items-center gap-2.5">
            <img
              src={cdnFile(art.chest)}
              className="h-11 w-11 shrink-0 object-contain [image-rendering:pixelated]"
              alt=""
              aria-hidden="true"
            />
            <img
              src={cdnFile(tier.reward.image)}
              className="h-11 w-11 shrink-0 object-contain [image-rendering:pixelated]"
              alt={tier.reward.unlockable}
            />
            <div className="min-w-0">
              <p className="font-sans text-p6 font-semibold text-tt-muted md:text-p5">{tier.reward.revealTeaser}</p>
              <p className="font-primary text-p4 uppercase leading-tight text-tt-gold-400">
                +{formatTails(tier.reward.tails)} · {tier.reward.unlockable}
              </p>
            </div>
          </div>
          <div className="flex min-h-[44px] flex-wrap items-center gap-2">
            {!tier.claimed && claimable && (
              <ModalButton variant="primary" size="sm" busy={isClaiming} onClick={onClaim} className="tt-claim-glow">
                {`CLAIM ${tier.reward.tails} TAILS`}
              </ModalButton>
            )}
            {!tier.claimed && tier.unlocked && !claimable && (
              <p className="font-sans text-p6 font-semibold text-tt-muted md:text-p5">
                Meet all checks first: see Reward checks on REWARDS.
              </p>
            )}
            {!tier.unlocked && (
              <p className="font-sans text-p6 font-semibold text-tt-muted md:text-p5">
                Finish the requirements above to unlock this prize.
              </p>
            )}
          </div>
        </div>
      )}
    </Well>
  );
};
