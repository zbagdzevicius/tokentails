import type { MyGives } from "@/api/rescue-goals-api";
import type { ImpactViewer } from "@/components/impact/useImpactMe";
import { formatTails } from "@/shared-contracts/copy";
import { ImpactPanel } from "./Panel";

interface Stat {
  key: string;
  label: string;
  value: string;
  /** A short line under the label when the number is not known yet. */
  note?: string;
}

/**
 * MY IMPACT (plan G4, G5): what this player did, in in-game units only. Paws, treats Token Tails
 * sent for them, Tails given and goals helped. It renders with no purchase and no cat (G4
 * acceptance "MY IMPACT renders with spent=0 and cat=null"), and never converts anything to money.
 */
export const MyImpact = ({
  viewer,
  paws,
  treatsConfirmed,
  gives,
}: {
  viewer: ImpactViewer;
  /** Lifetime paws; null while the count is unknown (paws not open yet, or still loading). */
  paws: number | null;
  treatsConfirmed: number;
  gives: MyGives | null;
  /** Kept for callers; the IN-GAME note lives once in the IMPACT tab's small print. */
  isApp: boolean;
}) => {
  const stats: Stat[] = [
    paws == null
      ? { key: "paws", label: "Paws earned", value: "–", note: "Shows once paws open" }
      : { key: "paws", label: "Paws earned", value: String(paws) },
    { key: "treats", label: "Treats for you", value: String(treatsConfirmed) },
    { key: "given", label: "Tails given", value: formatTails(gives?.totals.tailsGiven ?? 0, { word: false }) },
    { key: "goals", label: "Goals helped", value: String(gives?.totals.goalsHelped ?? 0) },
  ];
  const badge = gives?.treatGiver ?? null;
  return (
    <ImpactPanel
      title="My impact"
      labelledBy="impact-mine-title"
      testId="my-impact"
      icon="chart"
      helper="What you did so far. These are game numbers, not money."
      className="lg:col-span-2"
    >
      {viewer === "guest" ? (
        <p className="font-sans font-semibold text-p5 leading-snug" data-testid="my-impact-guest">
          Save your cat to keep your paws, treats and gives on every device. Your runs already count
          toward today&apos;s paw once you do.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.key}
                data-testid={`my-impact-${s.key}`}
                className="flex min-w-0 flex-col items-center gap-1 bg-tt-night-950/45 px-2 py-3 text-center [box-shadow:inset_0_0_0_2px_rgb(var(--tt-night-500)/0.6)]"
              >
                <dt className="order-2 font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">{s.label}</dt>
                <dd className="order-1 font-primary text-p2 leading-none text-tt-gold-400">{s.value}</dd>
                {s.note && (
                  <dd className="order-3 font-sans text-p6 font-semibold leading-snug text-tt-muted">{s.note}</dd>
                )}
              </div>
            ))}
          </dl>
          {badge && (
            <p className="font-sans font-semibold text-p5" data-testid="treat-giver">
              {badge.earned
                ? "Treat Giver badge earned this season."
                : `Treat Giver badge: ${Math.min(badge.confirmedTreats, badge.needed)} of ${badge.needed} treats this season.`}
            </p>
          )}
          {gives && gives.totals.monthTailsGiven > 0 && (
            <p className="font-sans font-semibold text-p6 text-tt-muted">
              This season: {formatTails(gives.totals.monthTailsGiven)} given to {gives.totals.monthGoalsHelped}{" "}
              goal{gives.totals.monthGoalsHelped === 1 ? "" : "s"}.
            </p>
          )}
        </>
      )}
    </ImpactPanel>
  );
};

export default MyImpact;
