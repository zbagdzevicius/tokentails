import {
  impactAsOf,
  ImpactResult,
  isDevBaseline,
  isZeroAmount,
  loadImpactForPage,
  PayoutBucket,
  PledgeRow,
  PublicImpact,
  PublicOutcome,
  railCopyState,
  RailCopyState,
  RailState,
} from "@/api/impact-api";
import { isAppBuild, openWebImpact } from "@/components/claims/build";
import { Claim } from "@/components/claims/Claim";
import { EvidenceChip } from "@/components/claims/EvidenceChip";
import { moneyTierFor } from "@/components/claims/evidence";
import {
  allPublicFacts,
  factText,
  formatFactDate,
  isStale,
  publicFact,
  publicSourceUrl,
  shownInApp,
  type PublicFact,
} from "@/components/claims/facts";
import { labelSet } from "@/components/claims/labels";
import { formatMoney } from "@/components/claims/money";
import { RAIL_CHIP_COPY } from "@/components/claims/rail-copy";
import { MONEY_TIERS, type MoneyTier } from "@/components/claims/tiers";
import { useNow } from "@/components/claims/useNow";
import { countryName } from "@/components/globe/iso";
import { SeoHead } from "@/components/seo/SeoHead";
import {
  explorerAddress,
  explorerTx,
  SHELTER_CHAINS,
} from "@/components/shelter-payouts/chains";
import { PixelIcon } from "@/components/shared/PixelIcon";
import { cdnFile } from "@/constants/utils";
import { useImpact } from "@/hooks/useImpact";
import type { GetStaticProps } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/*
 * The public proof page (plan F7.6, G11; 2.13 row 23: /proof redirects here). One page lists every
 * public claim with its value, date, status and source, and the money with its evidence tier.
 * Web: ISR every 600 s from the CDN impact.json, then the API, then the bundled baseline. App builds
 * (static export) read the committed baseline, show the F7.2 app labels, no explorer or wallet
 * wording, and open this web page through @capacitor/browser for the on-chain details.
 */

export interface ImpactPageProps {
  impact: ImpactResult | null;
}

export const IMPACT_REVALIDATE_SECONDS = 600;

export const getStaticProps: GetStaticProps<ImpactPageProps> = async () => {
  const isApp = !!process.env.NEXT_PUBLIC_IS_APP;
  const impact = await loadImpactForPage(isApp);
  return isApp
    ? { props: { impact } }
    : { props: { impact }, revalidate: IMPACT_REVALIDATE_SECONDS };
};

// Fact ids by section. Kept as data: the registry listing below shows every public entry anyway.
const REACH_IDS = ["F-001", "F-011", "F-013"];
const SEI_IDS = ["F-003", "F-004"];
const NOW_ID = "F-025";
const TREAT_SIZE_ID = "C-004";
const DAILY_BUDGET_ID = "C-005";
const GOAL_ID = "C-001";

const BUCKET_LABEL: Record<PayoutBucket, string> = {
  heist: "Catnip Heist treats",
  page: "Treats sent from the payouts page",
  paws: "Nightly paw settlements",
  x402: "Agent-paid cards",
  direct: "Other payouts",
};

const RAIL_COPY: Record<RailState, string> = {
  "not-deployed": "Not open yet. Real shelter treats open soon.",
  paused: "Paused. Treats resume when the rail is switched back on.",
  live: "Open. Token Tails pays each eligible treat from its own daily budget.",
  exhausted: "Today's treats are gone. The budget resets at 00:00 UTC.",
};

/**
 * The /impact money box while no payout is indexed (review 3f #1). It agrees with the Treat rail
 * section on the same page: "soon" only while no rail exists. No chain words, so the app can show it.
 */
// claim: L-disbursed
const MONEY_EMPTY_COPY: Record<RailCopyState, string> = {
  soon: "No payouts yet. Real shelter treats open soon: Token Tails will pay them from its own daily budget, and every payout will show here with its date and evidence tier.",
  paused:
    "No payouts yet. Treats are paused right now; once they resume, every payout will show here with its date and evidence tier.",
  open: "No payout recorded yet. Treats are open: Token Tails pays each eligible treat from its own daily budget, and every payout will show here with its date and evidence tier.",
  exhausted:
    "No payout recorded yet. Today's treats are used up and the budget resets at 00:00 UTC; every payout will show here with its date and evidence tier.",
};

const CARD =
  "rounded-2xl border-4 border-tt-cream/60 bg-tt-night-900/80 p-4 md:p-6 lg:p-8";
const H2 =
  "font-primary uppercase text-p2 md:text-h5 lg:text-h4 leading-none text-tt-cream glow";
const LEAD = "mt-2 max-w-3xl font-sans text-p5 md:text-p4 text-tt-cream/85";
const EMPTY =
  "mt-4 rounded-xl border-2 border-dashed border-tt-cream/30 p-4 font-sans text-p5 text-tt-cream/80";
const LINK = "text-tt-gold-400 underline underline-offset-2 break-all";

const Section = ({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
}) => (
  <section
    id={id}
    className={`${CARD} scroll-mt-6`}
    aria-labelledby={`${id}-title`}
  >
    <h2 id={`${id}-title`} className={H2}>
      {title}
    </h2>
    {lead && <p className={LEAD}>{lead}</p>}
    {children}
  </section>
);

const Stat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rounded-xl border-2 border-tt-cream/25 bg-black/30 p-3">
    <dt className="font-primary uppercase tracking-wide text-p6 md:text-p5 text-tt-muted">
      {label}
    </dt>
    <dd className="mt-1 font-sans text-p4 md:text-p3 text-tt-cream">
      {children}
    </dd>
  </div>
);

function sourceLabel(result: ImpactResult | null): string {
  if (!result) return "No snapshot available";
  if (result.source === "baseline") {
    return isDevBaseline(result.impact)
      ? "Development snapshot (local backend, not public numbers)"
      : "Bundled snapshot";
  }
  return result.source === "cdn"
    ? "Live snapshot (CDN)"
    : "Live snapshot (API)";
}

const OUTCOME_LABEL: Record<string, string> = {
  treatment: "Treatment",
  adoption: "Adoption",
  supplies: "Supplies",
  food: "Food",
  surgery: "Surgery",
  vaccination: "Vaccination",
};

const outcomeLabel = (type: string) =>
  OUTCOME_LABEL[type] ?? type.charAt(0).toUpperCase() + type.slice(1);

const isMoneyTier = (t: string | null): t is MoneyTier =>
  !!t && (MONEY_TIERS as readonly string[]).includes(t);

/** "2026-09" to "Sep 2026". */
function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? month
    : d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

/** Pledged minus paid, never below zero (integer strings). */
export function shortfallWei(row: PledgeRow): string {
  const gap = BigInt(row.pledgedWei) - BigInt(row.paidWei);
  return gap > BigInt(0) ? gap.toString() : "0";
}

/**
 * Registry rows. App builds leave out entries whose app wording would carry chain, wallet or USDC
 * words (R10), judged on the text the app would show, so every claim the app page renders is listed
 * (review 3f #2).
 */
export function registryFacts(isApp: boolean): PublicFact[] {
  return allPublicFacts().filter((f) => !isApp || shownInApp(f));
}

/** Display order for currencies; anything else follows alphabetically. */
const SYMBOL_ORDER = ["USDC", "EURC", "USDT", "USD"];

/** Non-zero amounts per currency, in a fixed order (USDC first, then the rest A to Z). */
export function moneySymbols(
  bySymbol: Record<string, string>
): [string, string][] {
  const rank = (s: string) => {
    const i = SYMBOL_ORDER.indexOf(s);
    return i === -1 ? SYMBOL_ORDER.length : i;
  };
  return Object.entries(bySymbol)
    .filter(([, wei]) => !isZeroAmount(wei))
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * What "Who holds the money" may say (review 3f #2). No custody tier while no money exists
 * (no indexed payout, or the chain is not deployed); only shelters with a custody arrangement
 * are listed; the partner's name comes from the snapshot, never from the copy.
 */
export function custodyView(impact: PublicImpact | null) {
  const hasMoney =
    !!impact &&
    impact.money.eventCount > 0 &&
    impact.sources.chain !== "not-deployed";
  const items = impact?.shelters.items ?? [];
  return {
    hasMoney,
    partnerName: items.find((s) => s.role === "partner")?.name ?? null,
    shelters: hasMoney
      ? items.filter((s) => s.role !== "house" && s.handoverStatus !== null)
      : [],
  };
}

/** The live value for an L- entry, or null when the snapshot does not measure it. */
export function liveValues(
  fact: PublicFact,
  impact: PublicImpact | null,
  isApp: boolean
) {
  if (!impact) return null;
  const asOfMongo = impactAsOf(impact, "mongo");
  switch (fact.id) {
    case "L-countries":
      // Zero means the country backfill has not run, not "no partners": not measured yet.
      return impact.shelters.countries.length === 0
        ? null
        : {
            values: { n: impact.shelters.countries.length },
            asOf: asOfMongo,
          };
    case "L-players":
      return impact.players.registeredAllTime === null
        ? null
        : { values: { n: impact.players.registeredAllTime }, asOf: asOfMongo };
    case "L-heists":
      return impact.heists.verified === null
        ? null
        : { values: { n: impact.heists.verified }, asOf: asOfMongo };
    case "L-treats": {
      if (isZeroAmount(impact.treats.totalConfirmedWei)) return null;
      const amount = formatMoney(impact.treats.totalConfirmedWei, "USDC", {
        isApp,
        asOf: asOfMongo,
      });
      return amount ? { values: { amount }, asOf: asOfMongo } : null;
    }
    case "L-disbursed": {
      // Every non-zero currency, in a fixed order; never summed across currencies.
      const asOf = impactAsOf(impact, "chain");
      const parts = moneySymbols(impact.money.bySymbol)
        .map(([symbol, wei]) => formatMoney(wei, symbol, { isApp, asOf }))
        .filter((a): a is string => !!a);
      return parts.length > 0
        ? { values: { amount: parts.join(" · ") }, asOf }
        : null;
    }
    case "L-rail":
      return {
        values: { state: impact.rail.state.replace("-", " ") },
        asOf: impact.generatedAt,
      };
    default:
      return null;
  }
}

const RegistryRow = ({
  fact,
  impact,
  isApp,
  now,
}: {
  fact: PublicFact;
  impact: PublicImpact | null;
  isApp: boolean;
  /** Null until mount (useNow): no STALE chip in built HTML. */
  now: Date | null;
}) => {
  const live = fact.status === "live" ? liveValues(fact, impact, isApp) : null;
  const text = factText(fact, live?.values ?? {}, isApp);
  // A live entry the snapshot does not measure is "not measured yet", not stale.
  const stale =
    !now || (fact.status === "live" && !live)
      ? false
      : isStale(fact, now, live?.asOf ?? null);
  const chain =
    fact.chain === "arc" && impact
      ? SHELTER_CHAINS[impact.chain.chainId]
      : undefined;
  const contract = impact?.chain.contract ?? null;
  const dates = (
    <>
      {formatFactDate(fact.status === "live" ? live?.asOf : fact.asOf) ?? "—"}
      <span className="block text-tt-muted">
        checked {formatFactDate(fact.checkedAt) ?? "—"}
      </span>
    </>
  );
  const sourceLink = isApp ? null : publicSourceUrl(fact.sourceUrl);
  const source = (
    <>
      {sourceLink ? (
        <a
          href={sourceLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          {sourceLink.host}
        </a>
      ) : fact.live ? (
        <span>Impact snapshot</span>
      ) : fact.status === "company-reported" ? (
        <span>Token Tails records</span>
      ) : (
        <span>Registry</span>
      )}
      {!isApp && chain && contract && (
        <a
          href={explorerAddress(chain.explorer, contract)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${LINK} block`}
        >
          Contract on {chain.name}
        </a>
      )}
    </>
  );
  return (
    <tr
      id={fact.id}
      data-claim-row={fact.id}
      className="scroll-mt-6 border-t border-tt-cream/15 align-top"
    >
      <th
        scope="row"
        className="py-3 pr-3 text-left text-p6 text-tt-muted whitespace-nowrap"
      >
        {fact.id}
      </th>
      <td className="py-3 pr-3">
        <span className="font-sans text-p5 text-tt-cream">
          {text ?? (
            <span className="text-tt-cream/70">
              {fact.status !== "live"
                ? fact.display
                : fact.chain
                ? "None yet"
                : "Not measured yet"}
            </span>
          )}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          <EvidenceChip kind={fact.status} isApp={isApp} />
          {stale && <EvidenceChip kind="stale" isApp={isApp} />}
        </span>
        <span className="mt-2 flex flex-col gap-0.5 font-sans text-p6 text-tt-cream/85 sm:hidden">
          <span>{dates}</span>
          <span>{source}</span>
        </span>
      </td>
      <td className="hidden py-3 pr-3 font-sans text-p6 text-tt-cream/85 whitespace-nowrap sm:table-cell">
        {dates}
      </td>
      <td className="hidden py-3 font-sans text-p6 text-tt-cream/85 sm:table-cell">
        {source}
      </td>
    </tr>
  );
};

const OutcomeItem = ({
  outcome: o,
  isApp,
  explorer,
  chainName,
}: {
  outcome: PublicOutcome;
  isApp: boolean;
  explorer?: string;
  chainName?: string;
}) => {
  const amount =
    o.amountWei && o.symbol
      ? formatMoney(o.amountWei, o.symbol, { isApp, asOf: o.date })
      : null;
  return (
    <li className="relative" data-outcome={o.id}>
      <span
        aria-hidden
        className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-tt-cream bg-tt-night-900"
      />
      <p className="font-primary uppercase text-p6 text-tt-muted">
        <time dateTime={o.date}>{formatFactDate(o.date)}</time> ·{" "}
        {outcomeLabel(o.type)}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2 font-sans text-p5 text-tt-cream">
        <span>{o.animalName ?? "A shelter animal"}</span>
        {amount && <span className="text-tt-cream/85">· {amount}</span>}
        {isMoneyTier(o.tier) && <EvidenceChip kind={o.tier} isApp={isApp} />}
        {!isApp && o.payoutTxHash && explorer && (
          <a
            href={explorerTx(explorer, o.payoutTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            Payout on {chainName}
          </a>
        )}
      </p>
    </li>
  );
};

const PledgeTable = ({
  rows,
  isApp,
}: {
  rows: PledgeRow[];
  isApp: boolean;
}) => {
  const shown = rows
    .map((r) => {
      const fmt = (wei: string) =>
        formatMoney(wei, r.symbol, { isApp, asOf: `${r.month}-01` });
      const pledged = fmt(r.pledgedWei);
      const paid = fmt(r.paidWei);
      const short = fmt(shortfallWei(r));
      return pledged && paid && short
        ? {
            key: `${r.month}-${r.symbol}`,
            month: r.month,
            pledged,
            paid,
            short,
            gap: !isZeroAmount(shortfallWei(r)),
          }
        : null;
    })
    .filter(<T,>(r: T | null): r is T => !!r);
  if (!shown.length) {
    return <p className={EMPTY}>No pledge months to show in this build.</p>;
  }
  return (
    <div className="mt-4 -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <table
        className="w-full text-left font-sans text-p5"
        data-testid="pledge-table"
      >
        <caption className="sr-only">Pledged and paid per month</caption>
        <thead>
          <tr className="font-primary uppercase text-p6 text-tt-muted">
            <th scope="col" className="py-2 pr-3">
              Month
            </th>
            <th scope="col" className="py-2 pr-3">
              Pledged
            </th>
            <th scope="col" className="py-2 pr-3">
              Paid
            </th>
            <th scope="col" className="py-2">
              Shortfall
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key} className="border-t border-tt-cream/15">
              <th
                scope="row"
                className="py-2 pr-3 text-left font-normal whitespace-nowrap"
              >
                {monthLabel(r.month)}
              </th>
              <td className="py-2 pr-3">{r.pledged}</td>
              <td className="py-2 pr-3">{r.paid}</td>
              <td className={r.gap ? "py-2 text-tt-gold-400" : "py-2"}>
                {r.gap ? r.short : "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function ImpactPage({ impact: initial }: ImpactPageProps) {
  const isApp = isAppBuild();
  const { impact: data, source } = useImpact({ initial });
  const impact = data ?? null;
  const result: ImpactResult | null = impact
    ? { impact, source: source ?? "baseline" }
    : null;
  // Time-dependent chips wait for mount, so an export built days ago hydrates without a mismatch.
  const now = useNow();
  const labels = labelSet(isApp);
  const chainAsOf = impact ? impactAsOf(impact, "chain") : null;
  const mongoAsOf = impact ? impactAsOf(impact, "mongo") : null;
  const tier = impact
    ? moneyTierFor(impact.money.custody)
    : "onchain-custodial";
  const chain = impact ? SHELTER_CHAINS[impact.chain.chainId] : undefined;
  const symbols = impact ? moneySymbols(impact.money.bySymbol) : [];
  const buckets = impact
    ? (
        Object.entries(impact.money.byBucket) as [
          PayoutBucket,
          Record<string, string>
        ][]
      ).filter(([, amounts]) =>
        Object.values(amounts).some((wei) => !isZeroAmount(wei))
      )
    : [];
  const snapshotDate = formatFactDate(impact?.generatedAt ?? null);
  const baselineOld =
    !!impact &&
    result?.source === "baseline" &&
    !!now &&
    now.getTime() - Date.parse(impact.generatedAt) > 2 * 86_400_000;
  const treatSize = publicFact(TREAT_SIZE_ID);
  const dailyBudget = publicFact(DAILY_BUDGET_ID);
  const goal = publicFact(GOAL_ID);
  const nowFact = publicFact(NOW_ID);
  const custody = custodyView(impact);
  const shelters = custody.shelters;
  const partnerPhrase = custody.partnerName
    ? `its partner shelter ${custody.partnerName}`
    : "its partner shelters";

  return (
    <>
      <SeoHead
        title="Impact · Token Tails"
        description="Every public Token Tails number with its date, status and source: payouts, who holds the money, shelter cats in the game and reach."
        path="/impact"
      />
      <div
        className="relative min-h-screen w-full overflow-hidden bg-tt-night-900 text-tt-cream"
        data-testid="impact-page"
      >
        <img
          src={cdnFile("landing/card-bg.webp")}
          alt=""
          aria-hidden
          className="pointer-events-none fixed inset-0 h-full w-full object-cover pixelated opacity-60"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 bg-gradient-to-b from-tt-night-900/70 via-tt-night-900/60 to-tt-night-900/90"
        />

        <div className="relative z-10 mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-8 md:gap-8 md:px-8 md:py-12">
          <header className="flex flex-col gap-3">
            <Link
              href="/"
              className="inline-flex min-h-[44px] w-fit items-center gap-1 font-primary uppercase text-p5 text-tt-cream/80 hover:text-tt-cream"
            >
              <PixelIcon name="chevron-left" /> Token Tails
            </Link>
            <h1 className="font-paws uppercase leading-none text-h4 md:text-h2 text-tt-cream glow">
              Impact
            </h1>
            <p className="max-w-3xl font-sans text-p4 md:text-p3 text-tt-cream/90">
              Every public number, with its date, its status and where to check
              it. Money shows who holds it. Nothing here is a promise until it
              says so.
            </p>
            <div className="flex flex-wrap items-center gap-2 font-primary uppercase text-p6 md:text-p5">
              <span
                className="rounded-lg border-2 border-tt-cream/40 px-2 py-1"
                data-testid="snapshot-meta"
              >
                {sourceLabel(result)}
                {snapshotDate ? ` · ${snapshotDate}` : ""}
              </span>
              {baselineOld && <EvidenceChip kind="stale" isApp={isApp} />}
              {isApp && (
                <button
                  type="button"
                  onClick={() => void openWebImpact()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-tt-gold-400 px-3 text-tt-gold-400"
                >
                  Full details on tokentails.com{" "}
                  <PixelIcon name="external-link" />
                </button>
              )}
            </div>
            <nav aria-label="Sections" className="mt-1 flex flex-wrap gap-2">
              {[
                ["money", "Money"],
                ["custody", "Custody"],
                ["rail", "Treat rail"],
                ["outcomes", "Outcomes"],
                ["pledges", "Pledges"],
                ["paws", "Paws"],
                ["rescue-cats", "Rescue cats"],
                ["reach", "Reach"],
                ["methodology", "Method"],
                ["claims", "Every claim"],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="inline-flex min-h-[36px] items-center rounded-full border-2 border-tt-cream/40 px-3 font-primary uppercase text-p6 text-tt-cream/90 hover:border-tt-cream"
                >
                  {label}
                </a>
              ))}
            </nav>
          </header>

          {!impact && (
            <p className={EMPTY} role="status">
              The impact snapshot could not be loaded. The claim registry below
              still lists every public number.
            </p>
          )}

          {/* claim: L-disbursed */}
          <Section
            id="money"
            title="Money sent to shelters"
            lead="Totals from indexed payouts, one line per currency and evidence tier. Currencies are never added together."
          >
            {symbols.length > 0 ? (
              <ul
                className="mt-4 flex flex-col gap-2"
                data-testid="money-headline"
              >
                {symbols.map(([symbol, wei]) => {
                  const amount = formatMoney(wei, symbol, {
                    isApp,
                    asOf: chainAsOf,
                  });
                  return amount ? (
                    <li
                      key={symbol}
                      className="font-primary uppercase text-p3 md:text-h6"
                    >
                      <Claim
                        id="L-disbursed"
                        values={{ amount }}
                        tier={tier}
                        liveAsOf={chainAsOf}
                        interactive={false}
                      />
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              // claim: L-disbursed
              <p className={EMPTY} data-testid="money-empty">
                {MONEY_EMPTY_COPY[railCopyState(impact?.rail.state)]}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat label="Off-chain payouts">
                Not tracked in this snapshot yet. Signed and confirmed shelter
                payouts will be listed here once the snapshot carries them.
              </Stat>
              <Stat label="Last payout">
                {impact?.money.lastTxHash ? (
                  isApp ? (
                    // The snapshot has no payout time, only when the chain was read (review 3f #4).
                    `Recorded${chainAsOf ? `, checked ${formatFactDate(chainAsOf)}` : ""}`
                  ) : chain ? (
                    <a
                      href={explorerTx(chain.explorer, impact.money.lastTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={LINK}
                    >
                      {impact.money.lastTxHash.slice(0, 10)}… on {chain.name}
                    </a>
                  ) : (
                    impact.money.lastTxHash
                  )
                ) : (
                  "None yet"
                )}
              </Stat>
            </dl>
            {buckets.length > 0 && (
              <table
                className="mt-4 w-full text-left font-sans text-p5"
                data-testid="money-buckets"
              >
                <caption className="sr-only">Payouts by source</caption>
                <thead>
                  <tr className="font-primary uppercase text-p6 text-tt-muted">
                    <th scope="col" className="py-2">
                      Source
                    </th>
                    <th scope="col" className="py-2">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map(([bucket, amounts]) => (
                    <tr key={bucket} className="border-t border-tt-cream/15">
                      <td className="py-2 pr-3">
                        {BUCKET_LABEL[bucket] ?? bucket}
                      </td>
                      <td className="py-2">
                        {Object.entries(amounts)
                          .map(([symbol, wei]) =>
                            formatMoney(wei, symbol, { isApp, asOf: chainAsOf })
                          )
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-4">
              <p className="font-primary uppercase text-p6 text-tt-muted">
                Evidence tiers
              </p>
              <ul
                className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2"
                data-testid="tier-legend"
              >
                {MONEY_TIERS.map((t) => (
                  <li
                    key={t}
                    className="flex flex-col gap-1 rounded-xl border-2 border-tt-cream/20 p-3"
                  >
                    <EvidenceChip kind={t} isApp={isApp} className="w-fit" />
                    <span className="font-sans text-p6 md:text-p5 text-tt-cream/85">
                      {labels.explain[t]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Section>

          <Section id="custody" title="Who holds the money">
            <div className="mt-4 flex flex-col gap-3">
              {custody.hasMoney ? (
                <>
                  <span>
                    <EvidenceChip kind={tier} isApp={isApp} />
                  </span>
                  <p className="font-sans text-p5 md:text-p4 text-tt-cream/90">
                    {impact?.money.custody === "handed-over"
                      ? "Every partner shelter now holds its own money."
                      : isApp
                      ? `Token Tails holds the money for ${partnerPhrase} until the shelter takes it over.`
                      : `Token Tails still holds the wallet key for ${partnerPhrase}. The shelter takes the key over at the handover, and the tier then changes.`}
                  </p>
                </>
              ) : (
                <p className={EMPTY} data-testid="custody-empty">
                  No money held yet. The first payout sets the tier.
                </p>
              )}
              {shelters.length > 0 && (
                <ul className="flex flex-col gap-1 font-sans text-p5 text-tt-cream/85">
                  {shelters.map((s) => (
                    <li key={s.slug}>
                      {s.name}
                      {s.countryCode ? ` · ${countryName(s.countryCode)}` : ""}
                      {s.handoverStatus === "handed-over"
                        ? isApp
                          ? " · held by the shelter"
                          : " · holds its own key"
                        : s.handoverStatus === "held-by-token-tails"
                        ? isApp
                          ? " · held by Token Tails"
                          : " · key held by Token Tails"
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <Section id="rail" title="Treat rail">
            <p className={LEAD} data-testid="rail-state">
              {impact
                ? RAIL_COPY[impact.rail.state]
                : RAIL_COPY["not-deployed"]}
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {treatSize && (
                <Stat label="Treat size">{factText(treatSize, {}, isApp)}</Stat>
              )}
              {dailyBudget && (
                <Stat label="Daily budget">
                  {factText(dailyBudget, {}, isApp)}
                </Stat>
              )}
              <Stat label="Treats sent">
                {impact && impact.treats.confirmedCount > 0 ? (
                  <Claim
                    id="L-treats"
                    values={{
                      amount:
                        formatMoney(impact.treats.totalConfirmedWei, "USDC", {
                          isApp,
                          asOf: mongoAsOf,
                        }) ?? "",
                    }}
                    liveAsOf={mongoAsOf}
                    interactive={false}
                  />
                ) : (
                  "None yet"
                )}
              </Stat>
              <Stat label="On their way">
                {impact
                  ? impact.treats.onTheirWayCount.toLocaleString("en-US")
                  : "—"}
              </Stat>
            </dl>
            {goal && (!isApp || !goal.chain || goal.appDisplay) && (
              <p
                className="mt-4 font-sans text-p5 text-tt-cream/85"
                data-claim-ref={goal.id}
              >
                {factText(goal, {}, isApp)}. The goal is checked against the
                daily budget, so it can be reached.
              </p>
            )}
          </Section>

          <Section
            id="outcomes"
            title="Payouts and outcomes"
            lead="What happened after money reached a shelter: treatments, adoptions and supplies, with the animal's name only."
          >
            {impact && impact.outcomes.published > 0 ? (
              <>
                <p
                  className="mt-4 font-primary uppercase text-p3"
                  data-testid="outcomes-count"
                >
                  {impact.outcomes.published.toLocaleString("en-US")} published
                  outcomes
                </p>
                {impact.outcomes.items.length > 0 && (
                  <ol
                    className="mt-4 flex flex-col gap-3 border-l-2 border-tt-cream/25 pl-4"
                    data-testid="outcomes-timeline"
                  >
                    {impact.outcomes.items.map((o) => (
                      <OutcomeItem
                        key={o.id}
                        outcome={o}
                        isApp={isApp}
                        explorer={chain?.explorer}
                        chainName={chain?.name}
                      />
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <p className={EMPTY}>
                No shelter outcomes published yet. They appear here once a
                shelter has confirmed one and its photo has been redacted.
              </p>
            )}
          </Section>

          <Section id="pledges" title="Pledged and paid">
            {impact && impact.pledges.rows.length > 0 ? (
              <PledgeTable rows={impact.pledges.rows} isApp={isApp} />
            ) : (
              <p className={EMPTY}>
                The purchase pledge has not started. When it does, each month
                shows what Token Tails pledged and what it paid, with any
                shortfall.
              </p>
            )}
          </Section>

          <Section
            id="paws"
            title="Paw settlements"
            lead={
              isApp
                ? "Each night Token Tails will settle the day's paws in one payout, with a fingerprint of every paw in it. Your paw proof can be checked against it on tokentails.com."
                : "Each night Token Tails will settle the day's paws in one payout whose memo carries a Merkle root. Your paw proof can be checked against it in your browser."
            }
          >
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat label="Settlements">
                {impact
                  ? impact.pawSettlements.count.toLocaleString("en-US")
                  : "—"}
              </Stat>
              <Stat label="Latest">
                {impact?.pawSettlements.latest
                  ? "See the payout list"
                  : "None yet"}
              </Stat>
            </dl>
            <form
              className="mt-4 flex flex-col gap-2"
              aria-describedby="paw-verifier-note"
              onSubmit={(e) => e.preventDefault()}
            >
              <label
                htmlFor="paw-proof"
                className="font-primary uppercase text-p6 text-tt-muted"
              >
                Paw proof
              </label>
              <textarea
                id="paw-proof"
                disabled
                rows={2}
                placeholder="Proofs arrive with the first nightly settlement"
                className="rounded-lg border-2 border-tt-cream/30 bg-black/40 p-2 text-p6 text-tt-cream disabled:opacity-60"
              />
              <p
                id="paw-verifier-note"
                className="font-sans text-p6 text-tt-cream/75"
              >
                The checker turns on when settlements start. It runs in your
                browser and sends nothing.
              </p>
            </form>
          </Section>

          <Section
            id="rescue-cats"
            title="Rescue cats"
            lead="Shelter cats listed in the game. Portraits of players' own pets never count."
          >
            {impact ? (
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Stat label="Listed">
                  {impact.rescueCats.total.toLocaleString("en-US")}
                </Stat>
                <Stat label="Marked adopted by their shelter">
                  {impact.rescueCats.adopted.toLocaleString("en-US")}
                </Stat>
              </dl>
            ) : (
              <p className={EMPTY}>Not available in this snapshot.</p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-2 font-sans text-p6 text-tt-cream/75">
              <EvidenceChip kind="shelter-reported" isApp={isApp} />
              From the shelters&apos; own records in the game
              {mongoAsOf ? `, as of ${formatFactDate(mongoAsOf)}` : ""}.
            </p>
          </Section>

          {nowFact && !isApp && (
            <Section id="now" title="Where we run now">
              <p className="mt-4 font-primary uppercase text-p4 md:text-p3">
                {/* F-025 vouches for its own words only; the rail state is plain copy after its chips. */}
                <Claim id={nowFact.id} interactive={false} />{" "}
                <span className="text-tt-cream/85" data-testid="rail-note">
                  · {RAIL_CHIP_COPY[railCopyState(impact?.rail.state)]}
                </span>
              </p>
              {impact?.rail.splitAddress && chain && (
                <a
                  href={explorerAddress(
                    chain.explorer,
                    impact.rail.splitAddress
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${LINK} mt-2 inline-block font-sans text-p5`}
                >
                  ShelterSplit contract on {chain.name}
                </a>
              )}
            </Section>
          )}

          {!isApp && (
            <Section
              id="history"
              title="Track record (historical)"
              lead="Activity from the earlier SEI deployment, which ended in March 2026. History, not today's numbers."
            >
              <ul className="mt-4 flex flex-col gap-2 font-sans text-p4">
                {SEI_IDS.map((id) => {
                  const fact = publicFact(id);
                  return fact ? (
                    <li key={id}>
                      <Claim id={fact.id} interactive={false} />
                    </li>
                  ) : null;
                })}
              </ul>
            </Section>
          )}

          <Section id="reach" title="Reach">
            <ul className="mt-4 flex flex-col gap-2 font-sans text-p4">
              {REACH_IDS.map((id) => {
                const fact = publicFact(id);
                return fact ? (
                  <li key={id}>
                    <Claim id={fact.id} interactive={false} />
                  </li>
                ) : null;
              })}
              {impact && impact.players.registeredAllTime !== null && (
                <li>
                  <Claim
                    id="L-players"
                    values={{ n: impact.players.registeredAllTime }}
                    liveAsOf={mongoAsOf}
                    interactive={false}
                    suffix={
                      <span className="text-tt-cream/75">
                        registered, all time, guests not counted
                      </span>
                    }
                  />
                </li>
              )}
              {impact && impact.players.active30d !== null && (
                <li className="text-tt-cream/90">
                  {impact.players.active30d.toLocaleString("en-US")} played in
                  the last 30 days
                </li>
              )}
              {impact && impact.shelters.countries.length > 0 && (
                <li>
                  <Claim
                    id="L-countries"
                    values={{ n: impact.shelters.countries.length }}
                    liveAsOf={mongoAsOf}
                    interactive={false}
                    suffix={
                      <span className="text-tt-cream/75">
                        ({impact.shelters.countries.map(countryName).join(", ")}
                        )
                      </span>
                    }
                  />
                </li>
              )}
              {impact && impact.heists.verified !== null && (
                <li>
                  <Claim
                    id="L-heists"
                    values={{ n: impact.heists.verified }}
                    liveAsOf={mongoAsOf}
                    interactive={false}
                  />
                </li>
              )}
            </ul>
          </Section>

          <Section id="methodology" title="How we count">
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 font-sans text-p5 md:text-p4 text-tt-cream/90">
              <li>
                Every public number has an entry in our claim registry with a
                date, a status and a check-by date. Past that date it shows a
                STALE chip until someone checks it again.
              </li>
              <li>
                Money comes from indexed payout records, not from what players
                spent. Each currency is shown on its own, never added to
                another.
              </li>
              <li>
                {isApp
                  ? "In the app, amounts show as a US dollar equivalent with the date of the rate."
                  : "On-chain payouts are read from the ShelterSplit contract every five minutes; the snapshot is rebuilt every hour. If the chain cannot be read, the last good figures stay with their old date. They are never replaced by zeros."}
              </li>
              <li>
                Player counts leave out guest accounts. Rescue counts leave out
                portraits.
              </li>
              <li>
                Company-reported numbers are Token Tails&apos; own figures.
                Historical numbers come from an earlier deployment and are
                labelled as history.
              </li>
              <li>
                Paws, Tails and runs are in-game. They have no cash value.
              </li>
            </ul>
          </Section>

          <Section
            id="claims"
            title="Every claim"
            lead="Each number shown anywhere on Token Tails, with its value, date, status and source."
          >
            <div className="mt-4 -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="w-full text-left" data-testid="claim-registry">
                <caption className="sr-only">Public claims</caption>
                <thead>
                  <tr className="font-primary uppercase text-p6 text-tt-muted">
                    <th scope="col" className="py-2 pr-3">
                      Id
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Claim
                    </th>
                    <th scope="col" className="hidden py-2 pr-3 sm:table-cell">
                      Date
                    </th>
                    <th scope="col" className="hidden py-2 sm:table-cell">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {registryFacts(isApp).map((fact) => (
                    <RegistryRow
                      key={fact.id}
                      fact={fact}
                      impact={impact}
                      isApp={isApp}
                      now={now}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
