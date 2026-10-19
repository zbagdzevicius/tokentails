// copy-lint: web-only the live payout widget returns null in app builds (no coins or chains in the app)
import { apiUrl } from "@/api/api";
import { loadPayoutIndex } from "@/components/shelter-payouts/payoutIndex";
import { MOTORED_DISCLOSURE, MOTORED_SPONSOR, motoredNote } from "@/components/shelter-payouts/motored";
import { isApp } from "@/models/app";
import { formatFeedDate } from "@/lib/feed/view";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import s from "./feed.module.scss";
import { payoutTotals, type PayoutTotals } from "./payoutTotals";

type State = { status: "loading" } | { status: "ready"; totals: PayoutTotals } | { status: "error" };

/**
 * `<!-- payouts-live -->`: the current payout figures for Pink Paw, read in the browser from the
 * public payout index (never baked into the page, so it never ages). A skeleton holds the space while
 * it loads; if the read fails the widget says so and links the ledger. Web builds only.
 *
 * claim: live payout totals (GET /shelter/payouts, the /shelter-payouts source), per coin and never
 *   summed; each coin's Motored sponsor share is shown in that coin's tile with the founder
 *   disclosure (motored.ts). "for
 *   Pink Paw", not "to": before 16 Oct 2026 the splits paid a wallet Token Tails held for the shelter.
 */
export const PayoutsLive = ({ appBuild = isApp }: { appBuild?: boolean }) => {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    if (appBuild) return;
    let cancelled = false;
    loadPayoutIndex("mainnet", apiUrl)
      .then((index) => {
        if (cancelled) return;
        const totals = payoutTotals(index);
        setState(totals ? { status: "ready", totals } : { status: "error" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [appBuild]);

  if (appBuild) return null;

  return (
    <section
      aria-labelledby="payouts-live-title"
      aria-busy={state.status === "loading"}
      className="my-10 max-w-[46rem] rounded-[1.25rem] bg-white/80 p-5 ring-1 ring-[rgb(var(--line)/0.1)] md:my-12 md:p-7"
      data-testid="payouts-live"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="payouts-live-title" className="flex items-center gap-2.5 font-sans text-p6 font-extrabold uppercase tracking-[0.12em] text-[rgb(var(--ink-2))] md:text-p5">
          <span className={s.live} aria-hidden="true" />
          Live from the payout ledger
        </p>
        {state.status === "ready" && state.totals.latest && (
          <p className="text-p6 font-bold text-[rgb(var(--muted))] md:text-p5">
            Latest payout {formatFeedDate(new Date(state.totals.latest * 1000).toISOString())}
          </p>
        )}
      </div>

      <div className="mt-4 min-h-[7.5rem]" aria-live="polite">
        {state.status === "loading" && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="payouts-live-loading">
            <span className="sr-only">Reading the live payouts…</span>
            {[0, 1].map((i) => (
              <span key={i} aria-hidden="true" className="block h-[4.5rem] rounded-xl bg-[rgb(var(--paper-2))] motion-safe:animate-pulse" />
            ))}
          </div>
        )}
        {state.status === "error" && (
          <p className="text-p5 leading-relaxed text-[rgb(var(--ink-2))] md:text-[1.05rem]" data-testid="payouts-live-error">
            Could not load the live figures right now. Every payout is still listed, with its transaction, on the{" "}
            <Link href="/shelter-payouts" className="font-bold text-[rgb(var(--link))] underline underline-offset-4">
              payout ledger
            </Link>
            .
          </p>
        )}
        {state.status === "ready" && (
          <>
            <p className="text-p5 text-[rgb(var(--ink-2))] md:text-[1.05rem]">
              Paid out for Pink Paw through ShelterSplit, from public on-chain events, coin by coin:
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="payouts-live-coins">
              {state.totals.coins.map((c) => (
                <li key={c.symbol} className="rounded-xl bg-[rgb(var(--paper-2))] px-4 py-3">
                  <span className="block font-primary text-[1.9rem] leading-none text-[rgb(var(--ink))]">
                    {c.amount} <span className="text-[1.1rem] text-[rgb(var(--ink-2))]">{c.symbol}</span>
                  </span>
                  <span className="mt-1 block text-p6 font-bold text-[rgb(var(--muted))] md:text-p5">
                    {c.count.toLocaleString("en-US")} {c.count === 1 ? "payout" : "payouts"}
                  </span>
                  {c.motored && (
                    <span className="mt-2 block rounded-lg bg-tt-gold-400/20 px-2.5 py-1.5 text-p6 font-bold leading-snug text-[rgb(var(--ink))] md:text-p5" data-testid="payouts-live-coin-motored">
                      Of which {c.motored.amount} {c.symbol} from {MOTORED_SPONSOR} (a sponsor; {MOTORED_DISCLOSURE.replace(/\.$/, "")})
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {state.totals.motoredCount > 0 && (
              <p className="mt-4 text-p6 leading-relaxed text-[rgb(var(--ink-2))] md:text-p5" data-testid="payouts-live-motored">
                About the {MOTORED_SPONSOR} share: {motoredNote(state.totals.motoredCount)}
              </p>
            )}
          </>
        )}
      </div>

      <Link
        href="/shelter-payouts"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[rgb(var(--ink))] px-4 font-sans text-p5 font-extrabold text-tt-cream transition hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--link))]"
      >
        Check every payout yourself
        <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
      </Link>
    </section>
  );
};
