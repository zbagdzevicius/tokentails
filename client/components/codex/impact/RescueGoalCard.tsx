import { maxGive, PLEDGE_CHIPS, PLEDGE_MAX, type MyGives, type RescueGoal } from "@/api/rescue-goals-api";
import { cdnFile } from "@/constants/utils";
import type { ImpactViewer } from "@/components/impact/useImpactMe";
import { formatTails } from "@/shared-contracts/copy";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { EmptyState, LoadingState } from "@/components/ui/modal";
import clsx from "clsx";
import { ImpactButton, ImpactPanel } from "./Panel";

/** How a goal works, in three steps (no money figure: Tails have no cash value). */
export const GOAL_STEPS = [
  "Token Tails sets the money aside before a goal opens.",
  "Your Tails choose which goal is delivered first.",
  "Once delivered, the photo and receipt show below.",
] as const;

export type GoalsLoad = "loading" | "error" | "ready";

export interface GiveChip {
  key: "100" | "1000" | "max";
  label: string;
  amount: number;
  enabled: boolean;
}

export interface GiveOptions {
  chips: GiveChip[];
  /** Why the chips are off, or what limits them; null when there is nothing to say. */
  note: string | null;
}

const localDate = (at: string) =>
  new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Why a registered account cannot give yet (the F7.5 pledge policy reasons). */
export function giveBlockedNote(reason: string | null, eligibleAt: string | null): string {
  if (reason === "account-too-new") {
    return eligibleAt
      ? `Giving opens three days after you join. Yours opens ${localDate(eligibleAt)}.`
      : "Giving opens three days after you join.";
  }
  if (reason === "not-enough-games") return "Save three games with your cat to start giving.";
  if (reason === "email-unverified") return "Verify your email to start giving.";
  return "Giving is not open for this account yet.";
}

/**
 * The 100 / 1,000 / MAX chips and the line under them. A guest's chips stay on: a tap asks them
 * to save their cat first (guests never give, plan F5.4). A registered account's chips follow
 * its balance, today's room under the daily cap and what the goal still needs.
 */
export function giveOptions(goal: RescueGoal, viewer: ImpactViewer, gives: MyGives | null): GiveOptions {
  const fixed = PLEDGE_CHIPS.map((amount) => ({
    key: String(amount) as GiveChip["key"],
    label: formatTails(amount, { word: false }),
    amount,
  }));
  if (viewer === "guest") {
    return {
      chips: [...fixed.map((c) => ({ ...c, enabled: true })), { key: "max", label: "MAX", amount: 0, enabled: true }],
      note: "Save your cat to give Tails to goals.",
    };
  }
  if (viewer !== "registered") {
    const note = viewer === "unverified" ? "Verify your email to start giving." : null;
    return {
      chips: [...fixed.map((c) => ({ ...c, enabled: false })), { key: "max", label: "MAX", amount: 0, enabled: false }],
      note,
    };
  }
  if (!gives) {
    // The account read failed: offer the fixed chips and let the backend decide.
    const room = Math.min(goal.remainingTails, PLEDGE_MAX);
    return {
      chips: [
        ...fixed.map((c) => ({ ...c, enabled: c.amount <= room })),
        { key: "max", label: "MAX", amount: 0, enabled: false },
      ],
      note: null,
    };
  }
  const off = (note: string): GiveOptions => ({
    chips: [...fixed.map((c) => ({ ...c, enabled: false })), { key: "max", label: "MAX", amount: 0, enabled: false }],
    note,
  });
  if (!gives.eligibility.open) return off("Giving to goals opens soon. Keep your Tails until then.");
  if (!gives.eligibility.eligible) return off(giveBlockedNote(gives.eligibility.reason, gives.eligibility.eligibleAt));
  const max = maxGive(goal, gives);
  if (max <= 0) {
    if (gives.daily.left < gives.limits.min) return off("You reached today's giving limit. It resets at midnight UTC.");
    return off(`You need at least ${formatTails(gives.limits.min)} to give.`);
  }
  return {
    chips: [
      ...fixed.map((c) => ({ ...c, enabled: c.amount <= max })),
      { key: "max", label: `MAX ${formatTails(max, { word: false })}`, amount: max, enabled: true },
    ],
    note:
      gives.daily.used > 0
        ? `You can give ${formatTails(gives.daily.left)} more today.`
        : `Up to ${formatTails(gives.daily.cap)} a day.`,
  };
}

interface RescueGoalCardProps {
  load: GoalsLoad;
  goal: RescueGoal | null;
  viewer: ImpactViewer;
  gives: MyGives | null;
  onPick: (chip: GiveChip) => void;
  onRetry: () => void;
  isApp: boolean;
}

/**
 * The current Rescue Goal (plan G5 "IMPACT layout"): a shelter purchase Token Tails has already
 * set the money aside for. Players give Tails to choose which goal is delivered first. Progress is
 * in Tails (IN-GAME); no money figure is shown or implied.
 */
export const RescueGoalCard = ({ load, goal, viewer, gives, onPick, onRetry }: RescueGoalCardProps) => {
  const options = goal ? giveOptions(goal, viewer, gives) : null;
  const pct = goal ? Math.round((goal.raisedTails / goal.targetTails) * 100) : 0;
  const art = goal?.image || goal?.shelter?.image || null;

  return (
    <ImpactPanel
      title="Rescue goal"
      labelledBy="impact-goal-title"
      testId="rescue-goal-card"
      icon="heart"
      helper="Point your Tails at the goal you want delivered first."
      className="lg:row-span-2"
    >
      {load === "loading" && (
        <div className="flex min-h-[10rem] flex-col justify-center" data-testid="goal-loading">
          <LoadingState rows={4} label="Looking for the open goal…" />
        </div>
      )}
      {load === "error" && (
        <EmptyState
          data-testid="goal-error"
          tone="error"
          compact
          icon="warning-diamond"
          title="Goals could not load"
          body="Your Tails are safe. Try again in a moment."
          action={
            <ImpactButton tone="ghost" onClick={onRetry}>
              Try again
            </ImpactButton>
          }
        />
      )}
      {load === "ready" && !goal && (
        <div className="flex flex-col items-center gap-3 py-3 text-center" data-testid="goal-empty">
          <img src={cdnFile("logo/heart.webp")} alt="" aria-hidden="true" className="h-12 w-12 object-contain opacity-80 [image-rendering:pixelated]" />
          <p className="font-primary text-p4 uppercase text-tt-cream">No goal is open right now</p>
          <p className="max-w-md font-sans font-semibold text-p5 leading-snug text-tt-cream/90">
            A goal opens only once Token Tails has set its money aside. Keep playing: your Tails wait
            for the next one, and giving them never lowers your rank.
          </p>
        </div>
      )}
      {load === "ready" && goal && options && (
        <div className="flex flex-1 flex-col gap-3" data-testid="goal-open" data-goal-id={goal.id}>
          <div className="flex min-w-0 gap-3">
            {art && (
              <img
                src={art}
                alt=""
                aria-hidden="true"
                className="h-20 w-20 shrink-0 object-cover [box-shadow:0_0_0_2px_rgb(var(--tt-gold-500)/0.6)] md:h-24 md:w-24"
              />
            )}
            <div className="min-w-0">
              {goal.shelter && (
                <p className="font-primary text-p6 uppercase tracking-wide text-tt-sky md:text-p5">{goal.shelter.name}</p>
              )}
              <p className="font-primary text-p3 uppercase leading-tight text-tt-cream md:text-p2" data-testid="goal-title">
                {goal.title}
              </p>
              <p className="mt-1 font-sans font-semibold text-p5 leading-snug text-tt-cream/90">
                {goal.description || goal.deliverable}
              </p>
            </div>
          </div>

          <div>
            <div
              className="h-[12px] w-full overflow-hidden bg-tt-night-950 [box-shadow:0_0_0_2px_rgb(var(--tt-night-500)/0.9)]"
              role="progressbar"
              aria-label="Tails given to this goal"
              aria-valuemin={0}
              aria-valuemax={goal.targetTails}
              aria-valuenow={goal.raisedTails}
            >
              <div
                className="h-full bg-gradient-to-r from-tt-pink to-tt-gold-400"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 font-sans font-semibold text-p5">
              <span data-testid="goal-progress">
                <strong className="font-bold text-tt-gold-400">{formatTails(goal.raisedTails, { word: false })}</strong> of{" "}
                {formatTails(goal.targetTails)}
              </span>
              <span className="inline-flex items-center gap-2 text-tt-muted">
                {formatTails(goal.remainingTails)} to go
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-primary text-p6 uppercase tracking-wide text-tt-cream/80 md:text-p5" id="impact-give-label">
              Give Tails
            </p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="impact-give-label">
              {options.chips.map((chip) => (
                // Supporting choices (each opens a confirm sheet): night buttons, so the one gold
                // action on the tab stays the treat.
                <ImpactButton
                  key={chip.key}
                  tone="ghost"
                  testId={`give-chip-${chip.key}`}
                  disabled={!chip.enabled}
                  onClick={() => onPick(chip)}
                  className={clsx("w-full", chip.key === "max" && "px-2")}
                  ariaLabel={chip.key === "max" ? (chip.amount ? `Give the most you can, ${formatTails(chip.amount)}` : "Give the most you can") : `Give ${formatTails(chip.amount)}`}
                >
                  {chip.label}
                </ImpactButton>
              ))}
            </div>
            {options.note && (
              <p className="font-sans font-semibold text-p5 leading-snug text-tt-cream/90" data-testid="give-note">
                {options.note}
              </p>
            )}
            <p className="flex items-center gap-1.5 font-sans text-p5 font-bold text-tt-mint">
              <PixelIcon name="check" size={14} /> Giving never lowers your rank.
            </p>
          </div>
          <ol
            className="grid grid-cols-1 gap-2 border-t-2 border-tt-night-500/50 pt-3 sm:grid-cols-3"
            aria-label="How goals work"
            data-testid="goal-steps"
          >
            {GOAL_STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-2 font-sans font-semibold text-p6 leading-snug text-tt-cream/85 md:text-p5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-tt-night-950/60 font-primary text-p6 text-tt-gold-400"
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </ImpactPanel>
  );
};

export default RescueGoalCard;
