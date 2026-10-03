import type { RescueGoal } from "@/api/rescue-goals-api";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { ImpactPanel } from "./Panel";

const shortDate = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "3f2a9c…b41e": enough of the receipt fingerprint to compare, short enough for a phone. */
export const shortHash = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;

/**
 * DELIVERED (plan G5 "IMPACT layout"): goals the shelter received, each with the delivery photo
 * and its receipt. On the web the receipt's SHA-256 fingerprint is shown so anyone can check the
 * receipt Token Tails keeps; app builds show no hash (store copy rule, F7.2) and link to web
 * /impact instead.
 */
export const DeliveredStrip = ({ goals, isApp = isAppBuild() }: { goals: RescueGoal[]; isApp?: boolean }) => (
  <ImpactPanel title="Delivered" labelledBy="impact-delivered-title" testId="delivered-strip" className="lg:col-span-2">
    {goals.length === 0 ? (
      <p className="font-secondary text-p5 leading-snug text-tt-cream/90" data-testid="delivered-empty">
        Nothing delivered yet. Each goal shows up here once it reaches the shelter, with a photo and
        its receipt.
      </p>
    ) : (
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" aria-label="Delivered goals">
        {goals.map((goal) => {
          const d = goal.delivery!;
          return (
            <li
              key={goal.id}
              data-testid="delivered-item"
              className="flex w-[15rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border-2 border-tt-mint/50 bg-tt-night-950/60 md:w-[17rem]"
            >
              <img
                src={d.photoUrl}
                alt={`${goal.deliverable}${goal.shelter ? ` at ${goal.shelter.name}` : ""}`}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <p className="inline-flex items-center gap-1 font-primary text-p6 uppercase tracking-wide text-tt-mint">
                  <PixelIcon name="check" size={12} /> Delivered {shortDate(d.deliveredAt)}
                </p>
                <p className="font-primary text-p5 uppercase leading-tight text-tt-cream">{goal.title}</p>
                {goal.shelter && <p className="font-secondary text-p6 text-tt-cream/80">{goal.shelter.name}</p>}
                {d.note && <p className="font-secondary text-p6 leading-snug text-tt-cream/90">{d.note}</p>}
                <div className="mt-auto pt-1 font-secondary text-p6 text-tt-muted" data-testid="delivered-receipt">
                  {isApp ? (
                    <button
                      type="button"
                      onClick={() => void openWebImpact()}
                      className="inline-flex min-h-[44px] items-center gap-1 underline decoration-dotted underline-offset-4 hover:text-tt-gold-400"
                    >
                      Receipt checked · see the proof <PixelIcon name="external-link" size={12} />
                    </button>
                  ) : (
                    <span title={d.receiptSha256}>
                      Receipt SHA-256{" "}
                      {/* eslint-disable-next-line tt/no-raw-font -- a receipt fingerprint is the `code` role (hashes only) */}
                      <code className="font-mono text-tt-cream">{shortHash(d.receiptSha256)}</code>
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </ImpactPanel>
);

export default DeliveredStrip;
