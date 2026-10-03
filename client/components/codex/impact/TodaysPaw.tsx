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
  isApp = isAppBuild(),
}: {
  view: PawView;
  partner: string;
  settlementSends: boolean;
  isApp?: boolean;
}) => {
  const how = settlementSends
    ? `Two runs a day earn a paw. Each night Token Tails pays one treat to ${partner} for the day's paws.`
    : "Two runs a day earn a paw. Your paws count now; paw treats start once the nightly payout opens.";
  const proofClass =
    "inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-lg px-1 font-primary text-p6 uppercase tracking-wide text-tt-cream underline decoration-dotted underline-offset-4 hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 md:text-p5";
  return (
    <ImpactPanel title="Today's paw" labelledBy="impact-paw-title" testId="todays-paw">
      <PawProgress view={view} variant="full" />
      <p className="font-secondary text-p5 leading-snug text-tt-cream/90">{how}</p>
      {isApp ? (
        <button type="button" onClick={() => void openWebImpact()} className={proofClass} data-testid="paw-proof">
          See the proof <PixelIcon name="external-link" size={12} />
        </button>
      ) : (
        <Link href="/impact" className={proofClass} data-testid="paw-proof">
          See the proof
        </Link>
      )}
    </ImpactPanel>
  );
};

export default TodaysPaw;
