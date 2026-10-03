import type { PledgeOutcome, RescueGoal } from "@/api/rescue-goals-api";
import { GameModal } from "@/components/ui/GameModal";
import { formatTails, TAILS_NO_CASH_VALUE } from "@/shared-contracts/copy";
import { ImpactButton } from "./Panel";

/** What the sheet says after a give that did not go through. */
export function pledgeProblem(outcome: PledgeOutcome): string | null {
  switch (outcome.kind) {
    case "given":
    case "signed-out":
      return null;
    case "returned":
      return "This goal filled up first, so nothing was taken. Your Tails are still yours.";
    case "interrupted":
      return "We're still checking this give. Try again: it will never be counted twice.";
    case "refused":
      switch (outcome.code) {
        case "PLEDGES_PAUSED":
          return "Giving to goals opens soon.";
        case "PLEDGE_NOT_ELIGIBLE":
          return outcome.message || "Play a few games with your cat first. Giving opens three days after you join.";
        case "PLEDGE_BALANCE":
          return "You don't have that many Tails yet.";
        case "PLEDGE_DAILY_CAP":
          return outcome.message || "You reached today's giving limit. It resets at midnight UTC.";
        case "GOAL_NOT_OPEN":
        case "GOAL_NOT_FOUND":
          return "This goal is no longer open.";
        case "GOAL_OVERFLOW":
          return "This goal needs fewer Tails than that. Try a smaller amount.";
        default:
          return outcome.message || "That give didn't go through. Nothing was taken.";
      }
  }
}

interface GiveSheetProps {
  open: boolean;
  goal: RescueGoal;
  amount: number;
  busy: boolean;
  /** The last outcome of this give, when it did not go through. */
  problem: string | null;
  /** True when the last attempt was interrupted: the retry re-sends the same give. */
  canRetry: boolean;
  /** True when the give was refused or returned: the same give cannot go through, so only Close shows. */
  final?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The confirm sheet of a give (plan G5: "giving never lowers your rank"). It states the amount,
 * the goal, that rank and tier progress stay, and the no-cash-value line. The give's UUID is made
 * by the card when the sheet opens, so CONFIRM and TRY AGAIN send the same give.
 */
export const GiveSheet = ({ open, goal, amount, busy, problem, canRetry, final = false, onConfirm, onClose }: GiveSheetProps) => {
  return (
    <GameModal
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      canClose={!busy}
      title="GIVE TAILS"
      name="give-tails"
      size="sm"
      layer="modal-nested"
    >
      <div className="flex flex-col gap-3 text-center text-tt-cream" data-testid="give-sheet">
        <p className="font-primary text-p3 uppercase leading-tight text-tt-gold-400">
          {formatTails(amount)}
        </p>
        <p className="font-secondary text-p4 leading-snug">
          to <strong className="font-bold">{goal.title}</strong>
          {goal.shelter ? <> for {goal.shelter.name}</> : null}
        </p>
        <ul className="flex flex-col gap-1.5 rounded-xl border-2 border-tt-mint/50 bg-tt-mint/10 px-3 py-2 text-left font-secondary text-p5 leading-snug">
          <li className="font-bold text-tt-mint" data-testid="give-rank-line">
            Giving never lowers your rank.
          </li>
          <li>Your earned Tails, tier progress and board place stay the same.</li>
          <li>Your balance goes down by {formatTails(amount)}.</li>
        </ul>
        <p className="font-secondary text-p6 text-tt-muted">{TAILS_NO_CASH_VALUE}</p>
        {problem && (
          <p role="alert" data-testid="give-problem" className="rounded-lg border-2 border-tt-rust/70 bg-tt-ember/20 px-3 py-2 font-secondary text-p5">
            {problem}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!final && (
            <ImpactButton onClick={onConfirm} busy={busy} testId="give-confirm" className="min-w-[10rem]">
              {busy ? "Giving…" : canRetry ? "Try again" : `Give ${formatTails(amount, { word: false })}`}
            </ImpactButton>
          )}
          <ImpactButton tone="ghost" onClick={onClose} disabled={busy} testId="give-cancel">
            {final ? "Close" : "Not now"}
          </ImpactButton>
        </div>
      </div>
    </GameModal>
  );
};

export default GiveSheet;
