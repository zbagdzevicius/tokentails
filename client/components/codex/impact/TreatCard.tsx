import type { PublicImpact } from "@/api/impact-api";
import { Claim } from "@/components/claims/Claim";
import { treatsFigure } from "@/components/impact/live";
import { PixelIcon } from "@/components/shared/PixelIcon";
import type { ReactNode } from "react";
import { ImpactButton, ImpactPanel } from "./Panel";
import type { TreatIneligible, TreatState } from "./treat";

const localTime = (at: string | null) =>
  at ? new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;

const localDateTime = (at: string | null) =>
  at
    ? new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

function notEligibleText(reason: TreatIneligible, eligibleAt: string | null): string {
  switch (reason) {
    case "guest":
      return "Save your cat to send treats. Treats are sent from an account, one a day.";
    case "email-unverified":
      return "Verify your email to send treats. Check your inbox for the link.";
    case "account-too-new": {
      const at = localDateTime(eligibleAt);
      return at ? `Treats open a day after you join. Yours opens ${at}.` : "Treats open a day after you join.";
    }
    default:
      return "Play one game with your cat first, then come back to send a treat.";
  }
}

export interface TreatCopy {
  line: string;
  /** The button, when the state has one. */
  action: "send" | "retry" | "save" | null;
}

/** The words of each state. Treats cost the player nothing and give no Tails. */
export function treatCopy(state: TreatState, partner: string): TreatCopy {
  switch (state.kind) {
    case "loading":
      return { line: "Checking today's treat…", action: null };
    case "ready":
      return { line: `One tap and Token Tails sends ${partner} a treat. It's on us, once a day.`, action: "send" };
    case "on-its-way":
      return { line: `Your treat for ${partner} is on its way. Token Tails is sending it now.`, action: null };
    case "sent-today": {
      const at = localTime(state.nextAt);
      return {
        line: at
          ? `Today's treat reached ${partner}. Your next one opens at ${at}.`
          : `Today's treat reached ${partner}. Come back tomorrow for the next one.`,
        action: null,
      };
    }
    case "not-eligible":
      return { line: notEligibleText(state.reason, state.eligibleAt), action: state.reason === "guest" ? "save" : null };
    case "paused":
      return { line: "Treats are resting right now. They open again soon.", action: null };
    case "budget-spent": {
      const at = localTime(state.nextAt);
      return {
        line: at ? `Every treat for today is out. New ones open at ${at}.` : "Every treat for today is out. Come back tomorrow.",
        action: null,
      };
    }
    case "failed":
      return { line: "That treat didn't go out, and nothing was used up. You can send it again.", action: "retry" };
  }
}

const ICON: Record<TreatState["kind"], ReactNode> = {
  loading: <PixelIcon name="loader" size={18} className="motion-safe:animate-spin" />,
  ready: <PixelIcon name="heart" size={18} />,
  "on-its-way": <PixelIcon name="send" size={18} />,
  "sent-today": <PixelIcon name="check" size={18} />,
  "not-eligible": <PixelIcon name="lock" size={18} />,
  paused: <PixelIcon name="eye-off" size={18} />,
  "budget-spent": <PixelIcon name="bookmark" size={18} />,
  failed: <PixelIcon name="close" size={18} />,
};

interface TreatCardProps {
  state: TreatState;
  partner: string;
  busy: boolean;
  onSend: () => void;
  onSave: () => void;
  impact: PublicImpact | null;
  isApp: boolean;
}

/**
 * The treat card (plan G5 "Treats"): Token Tails pays a small treat to the partner shelter, once a
 * day per account, at no cost to the player and with no Tails given for it. Its seven states come
 * from the DONATE_* codes (see ./treat.ts). The community total is a <Claim> with its tier.
 */
export const TreatCard = ({ state, partner, busy, onSend, onSave, impact, isApp }: TreatCardProps) => {
  const copy = treatCopy(state, partner);
  const total = treatsFigure(impact, isApp);
  return (
    <ImpactPanel title="Today's treat" labelledBy="impact-treat-title" testId="treat-card">
      <div className="flex items-start gap-3" data-treat-state={state.kind}>
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-tt-pink/60 bg-tt-pink/10 text-tt-pink"
        >
          {ICON[state.kind]}
        </span>
        <p className="min-w-0 font-secondary text-p5 leading-snug md:text-p4" data-testid="treat-line" role="status">
          {copy.line}
        </p>
      </div>
      {copy.action === "send" && (
        <ImpactButton onClick={onSend} busy={busy} testId="treat-send" className="self-start">
          {busy ? "Sending…" : `Send ${partner} a treat`}
        </ImpactButton>
      )}
      {copy.action === "retry" && (
        <ImpactButton onClick={onSend} busy={busy} testId="treat-retry" className="self-start">
          {busy ? "Sending…" : "Send it again"}
        </ImpactButton>
      )}
      {copy.action === "save" && (
        <ImpactButton onClick={onSave} testId="treat-save" className="self-start">
          Save your cat
        </ImpactButton>
      )}
      <p className="font-secondary text-p6 leading-snug text-tt-muted">
        Token Tails pays for every treat. It costs you nothing, and treats give no Tails.
      </p>
      {total && (
        <p className="font-secondary text-p6 leading-snug" data-testid="treat-total">
          <Claim id={total.id} values={total.values} liveAsOf={total.asOf} tier={total.tier} isApp={isApp} variant="inline" />
        </p>
      )}
    </ImpactPanel>
  );
};

export default TreatCard;
