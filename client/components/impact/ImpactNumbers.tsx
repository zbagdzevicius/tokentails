import type { PublicImpact } from "@/api/impact-api";
import { Claim } from "@/components/claims/Claim";
import { isAppBuild } from "@/components/claims/build";
import { publicFact } from "@/components/claims/facts";
import type { FactId } from "@/lib/facts.generated";
import {
  countriesFigure,
  disbursedFigure,
  heistsFigure,
  LiveFigure,
  playersFigure,
  treatsFigure,
} from "./live";

/** The /stats rows, in order, with the words shown while a figure is not measured yet. */
export const STATS_ROWS: { id: FactId; label: string; read: (i: PublicImpact | null, app: boolean) => LiveFigure | null }[] = [
  { id: "L-players", label: "Players", read: (i) => playersFigure(i) },
  // claim: L-treats, L-disbursed (labels of the live rows below)
  { id: "L-treats", label: "Treats sent", read: (i, app) => treatsFigure(i, app) },
  { id: "L-disbursed", label: "Paid to shelters", read: (i, app) => disbursedFigure(i, app) },
  { id: "L-countries", label: "Partner countries", read: (i) => countriesFigure(i) },
  { id: "L-heists", label: "Heists verified", read: (i) => heistsFigure(i) },
];

/**
 * The live numbers of /stats (plan G11 "stats single source of truth"): every figure comes from the
 * one public impact snapshot through <Claim>, with its date and status chip, never from in-process
 * counters. A figure the snapshot does not measure reads "Not measured yet".
 */
export const ImpactNumbers = ({ impact, isApp = isAppBuild() }: { impact: PublicImpact | null; isApp?: boolean }) => (
  <ul className="grid w-full max-w-4xl grid-cols-1 gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="impact-numbers">
    {STATS_ROWS.filter((row) => publicFact(row.id)).map((row) => {
      const figure = row.read(impact, isApp);
      return (
        <li
          key={row.id}
          data-stat={row.id}
          className="flex min-h-[7rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-tt-gold-500/60 bg-tt-night-800/90 px-3 py-3 text-center text-tt-cream shadow-[0_4px_0_rgb(var(--tt-night-950))]"
        >
          <span className="font-primary text-p6 uppercase tracking-wide text-tt-muted">{row.label}</span>
          {figure ? (
            <Claim
              id={figure.id}
              values={figure.values}
              liveAsOf={figure.asOf}
              tier={figure.tier}
              variant="stat"
              isApp={isApp}
            />
          ) : (
            <span className="font-secondary text-p5" data-testid="stat-not-measured">
              Not measured yet
            </span>
          )}
        </li>
      );
    })}
  </ul>
);

export default ImpactNumbers;
