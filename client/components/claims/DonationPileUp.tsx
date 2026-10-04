import clsx from "clsx";
import type { ReactNode } from "react";
import { EvidenceChip } from "./EvidenceChip";
import { factText, formatFactDate, publicFact, splitFigure } from "./facts";
import type { PublicFact } from "./facts";

/**
 * "How we got to $40K+": the achievements-first head of the claims section on /impact.
 *
 * Truth layer: every figure comes from the facts registry. F-026 is one company-reported all-time
 * total with no itemised split in the repo, so the pile is drawn as one recorded block labelled
 * "amount not itemised" rather than invented per-donation steps. When itemised donations are added
 * to the registry (one entry per donation, with date, shelter and kind), list their ids in
 * PILE_STEP_IDS and they stack in order.
 *
 * Integrator note: render <DonationPileUp isApp={isApp} comingOnline={...rows} /> above the claims
 * table in pages/impact.tsx, and pass the rows for which isComingOnline() is true as comingOnline
 * (they stay rendered, inside a collapsed group).
 */

/** The all-time direct-giving total the pile adds up to. */
export const PILE_TOTAL_ID = "F-026";
/** The next pile (a separate currency and a separate goal: never summed with F-026). */
export const NEXT_PILE_ID = "C-001";
/** Itemised donation entries, oldest first. None are recorded in the registry yet. */
export const PILE_STEP_IDS: readonly string[] = [];

/** A live row with nothing to show yet ("Not measured yet", "None yet", "not deployed"). */
export function isComingOnline(
  fact: Pick<PublicFact, "status" | "display">,
  text: string | null | undefined
): boolean {
  if (fact.status === "live") return text == null || text === "";
  return /not deployed/i.test(fact.display);
}

function usd(value: PublicFact["value"]): string | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return null;
  return `$${Math.round(n / 1000)}K+`;
}

interface DonationPileUpProps {
  isApp: boolean;
  /** The empty live rows, kept rendered inside a collapsed "Coming online" group. */
  comingOnline?: ReactNode;
  /** Count shown on the group summary. */
  comingOnlineCount?: number;
  className?: string;
}

export const DonationPileUp = ({
  isApp,
  comingOnline,
  comingOnlineCount,
  className,
}: DonationPileUpProps) => {
  const total = publicFact(PILE_TOTAL_ID);
  if (!total) return null;
  const steps = PILE_STEP_IDS.map((id) => publicFact(id)).filter(
    (f): f is PublicFact => f != null
  );
  const totalLabel = usd(total.value);
  const asOf = formatFactDate(total.asOf);
  const next = publicFact(NEXT_PILE_ID);
  const totalText = factText(total, {}, isApp) ?? total.display;

  return (
    <section
      data-pileup
      aria-labelledby="pileup-title"
      className={clsx(
        "rounded-2xl border border-tt-gold-400/30 bg-tt-night-900 p-4 text-tt-cream md:p-6",
        className
      )}
    >
      <p className="font-sans text-p6 uppercase tracking-wide text-tt-muted">
        Given directly, all time
      </p>
      <h3
        id="pileup-title"
        className="font-primary text-p2 leading-none text-tt-gold-400 md:text-h5"
      >
        How we got to {totalLabel ?? "our total"}
      </h3>

      {/* The pile: recorded blocks stacked left to right toward the total. */}
      <div className="mt-4" data-pileup-bar>
        <div className="flex items-end justify-between font-sans text-p6 text-tt-cream/85">
          <span>$0</span>
          <span className="font-primary text-p3 text-tt-gold-400">
            {totalLabel}
          </span>
        </div>
        <div
          role="img"
          aria-label={`${totalText}. Amount not itemised by donation.`}
          className="mt-1 flex h-8 w-full overflow-hidden rounded-lg border border-tt-gold-400/60 bg-tt-night-700"
        >
          {steps.length > 0 ? (
            steps.map((s, i) => (
              <span
                key={s.id}
                data-pileup-step={s.id}
                style={{ flexGrow: Number(s.value) || 1 }}
                className={clsx(
                  "h-full border-r border-tt-night-900/60",
                  i % 2 ? "bg-tt-gold-500" : "bg-tt-gold-400"
                )}
              />
            ))
          ) : (
            <span
              data-pileup-step={total.id}
              className="h-full w-full bg-[repeating-linear-gradient(135deg,rgb(var(--tt-gold-400))_0_10px,rgb(var(--tt-gold-500))_10px_20px)]"
            />
          )}
        </div>
      </div>

      {/* The steps behind the pile, oldest first. */}
      <ol className="mt-4 space-y-2" data-pileup-steps>
        {(steps.length > 0 ? steps : [total]).map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-1 rounded-lg bg-tt-night-700/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="font-sans text-p5">
              {(() => {
                const { figure, rest } = splitFigure(s.short ?? s.display);
                return (
                  <>
                    <span className="font-primary text-tt-gold-400">
                      {figure ?? usd(s.value)}
                    </span>{" "}
                    {rest}
                  </>
                );
              })()}
              <span className="block text-p6 text-tt-cream/75">
                {formatFactDate(s.asOf) ? `to ${formatFactDate(s.asOf)} · ` : ""}
                crypto and goods · recipients and amounts not itemised
              </span>
            </span>
            <span className="flex flex-wrap gap-1">
              <EvidenceChip kind={s.status} isApp={isApp} />
              <a
                href={`#${s.id}`}
                className="font-sans text-p6 text-tt-muted underline underline-offset-2"
              >
                {s.id}
              </a>
            </span>
          </li>
        ))}
      </ol>

      {next && !isApp && (
        <p className="mt-4 font-sans text-p6 text-tt-cream/85">
          Next pile, counted on-chain from day one:{" "}
          <span className="text-tt-cream">{factText(next, {}, isApp) ?? next.display}</span>
        </p>
      )}
      {asOf && (
        <p className="mt-1 font-sans text-p6 text-tt-muted">Total checked {asOf}.</p>
      )}

      {comingOnline && (
        <details data-coming-online className="group mt-5 border-t border-tt-cream/15 pt-3">
          <summary className="cursor-pointer list-none font-primary text-p4 text-tt-cream marker:hidden">
            <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
            Coming online
            {comingOnlineCount != null && (
              <span className="ml-1 font-sans text-p6 text-tt-muted">
                ({comingOnlineCount} live counters, nothing recorded yet)
              </span>
            )}
          </summary>
          <div className="mt-2">{comingOnline}</div>
        </details>
      )}
    </section>
  );
};

export default DonationPileUp;
