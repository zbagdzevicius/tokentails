import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { PawProgress } from "@/components/impact/PawProgress";
import type { PawView } from "@/components/impact/pawView";
import { PixelIcon } from "@/components/shared/PixelIcon";
import Link from "next/link";
import { ImpactPanel } from "./Panel";

/**
 * Today's paw (plan G4 "IMPACT tab ... today's paw progress with a local-time countdown, latest
 * settlement, See the proof"). Two spaced scoring runs a day earn a paw; the nightly settlement
 * turns the day's paws into one treat, paid by Token Tails. Nothing here says a paw was paid:
 * the settlement and its Merkle proof are on /impact.
 */
export const TodaysPaw = ({
  view,
  partner,
  settlementSends,
  hasSettlement = false,
  isApp = isAppBuild(),
}: {
  view: PawView;
  partner: string;
  settlementSends: boolean;
  /** A nightly settlement exists, so SEE THE PROOF has something to show. */
  hasSettlement?: boolean;
  isApp?: boolean;
}) => {
  const needed = view.runs?.needed ?? 2;
  const rule = `Play ${needed} runs today to earn a paw.`;
  const how = settlementSends ? `${rule} Each night Token Tails pays one treat to ${partner} for the day's paws.` : rule;
  const proofClass =
    "inline-flex min-h-[44px] items-center gap-1.5 self-start px-1 font-primary text-p5 uppercase tracking-wide text-tt-gold-400 underline decoration-dotted underline-offset-4 hover:text-tt-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400";
  // No count yet: the run meter still shows what a paw takes, without claiming runs were counted.
  const waiting = view.state === "unavailable";
  return (
    <ImpactPanel title="Today's paw" icon="paw" helper={how} labelledBy="impact-paw-title" testId="todays-paw">
      {waiting ? (
        <div className="flex flex-col items-center gap-2 text-center" data-testid="paw-progress" data-paw-state={view.state}>
          <span className="flex items-center gap-1" role="img" aria-label={`${needed} runs earn a paw`}>
            {Array.from({ length: needed }, (_, i) => (
              <span key={i} className="inline-block h-5 w-5 rounded-sm border-2 border-tt-cream/50 bg-tt-night-900/70" />
            ))}
          </span>
          <span className="font-sans text-p5 font-bold leading-tight text-tt-cream" data-testid="paw-text">
            Your runs show here once paws open.
          </span>
        </div>
      ) : (
        <PawProgress view={view} variant="full" className="!font-sans font-bold" />
      )}
      {hasSettlement &&
        (isApp ? (
          <button type="button" onClick={() => void openWebImpact()} className={proofClass} data-testid="paw-proof">
            See the proof <PixelIcon name="external-link" size={12} />
          </button>
        ) : (
          <Link href="/impact" className={proofClass} data-testid="paw-proof">
            See the proof
          </Link>
        ))}
    </ImpactPanel>
  );
};

export default TodaysPaw;
