// copy-lint: web-only rendered only on web pages (ShelterPayouts, the /give and /impact web branches; app builds show AppProofNotice)
import { Campaign, CampaignProgress, GoalSource, HandoverStatus, claimsDateLabel, openHolder, percentLabel } from "./campaign";
import { SHELTER_CHAINS, chainDisplayName, explorerAddress } from "./chains";
import type { GoalReadState } from "./goal";
import { formatUnits } from "./logs";
import { headingName } from "./pinkPaw";
import { CARD, FIGURE } from "./ui";

/** 12.345678 -> "12.34"; 50000 -> "50,000": thousands separators, at most two decimals. */
export const usdcFigure = (v18: bigint) => {
  const [w, f] = formatUnits(v18, 18).split(".");
  const whole = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = f ? f.slice(0, 2).replace(/0+$/, "") : "";
  return cents ? `${whole}.${cents}` : whole;
};

/** "Arc mainnet", "Arc Testnet": the meter reads one chain only, so it names it. */
const meterChain = (chainId: number) => {
  const c = SHELTER_CHAINS[chainId];
  if (!c) return `chain ${chainId}`;
  return c.testnet ? chainDisplayName(c) : `${c.name} mainnet`;
};

const SOURCE_LABEL: Record<GoalSource, string> = {
  gifts: "gifts from people",
  match: "Token Tails' match",
  treats: "sponsored treats",
  x402: "x402 payments",
  "purchase-shares": "shop shares",
};

/** "a, b and c". */
export const listCopy = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The sources line: only what can reach the open wallet today (progress.sources, from the backend).
 * While Token Tails holds the wallet that is sponsored treats (custody rules keep public gifts, the
 * match and x402 away from it), plus shop shares only while a checkout settles through the split.
 */
export function sourcesCopy(shelter: string, chainId: number, sources: GoalSource[], holder: "token-tails" | "shelter" | HandoverStatus): string {
  const today = listCopy(sources.map((s) => SOURCE_LABEL[s]));
  const held = holder === "token-tails" || holder === "held-by-token-tails";
  // claim: C-001 (the goal counts the USDC that comes in to the campaign wallets), C-004 (treats)
  if (held) {
    return `Counts every USDC that comes in to the wallet Token Tails holds for ${shelter} on ${meterChain(chainId)}: today, ${today || "nothing yet"}. Gifts, the match and x402 payments count once ${shelter} holds its own wallet. Read from the chain.`;
  }
  return `Counts every USDC that comes in to ${shelter}'s wallets on ${meterChain(chainId)}: ${today || "nothing yet"}. Money moved between ${shelter}'s own wallets counts once, and spending never lowers it. Read from the chain.`;
}

/** Bar width: the real share, with a small visible stub so an early bar still reads as a meter. */
const barWidth = (p: CampaignProgress) => Math.max(p.raised > BigInt(0) ? 2 : 1.5, p.percent);

/**
 * The goal meter (fact C-001): the USDC that came in to the campaign wallets since the campaign
 * started, against the goal, counted from the chain (useCampaignGoal). `compact` is the /give and
 * /impact size. Never shows "0" for a wallet it could not read.
 */
export const CampaignMeter = ({
  campaign,
  progress,
  state = "ok",
  compact = false,
  className = "",
}: {
  campaign: Campaign;
  progress: CampaignProgress;
  state?: GoalReadState;
  compact?: boolean;
  className?: string;
}) => {
  const shelter = headingName(campaign.shelter.name);
  const chain = SHELTER_CHAINS[campaign.chainId];
  const since = claimsDateLabel(campaign.startDate);
  const by = claimsDateLabel(campaign.endDate);
  const loading = state === "loading";
  const unread = state === "error";
  const known = state === "ok";
  return (
    <section
      className={`${CARD} flex flex-col gap-3 text-p5 ${className}`}
      data-testid="campaign-meter"
      data-state={progress.counting ? state : "idle"}
      data-claim="C-001"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-primary uppercase text-p3 md:text-p2 leading-none text-tt-cream">{campaign.name}</h3>
        {since && <span className="text-p6 md:text-p5 text-tt-cream/75">since {since}</span>}
      </div>
      {/* claim: C-001 (the goal amount and date come from campaign.json, generated from the registry) */}
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-live="polite" data-testid="campaign-meter-value">
        <span className={`${FIGURE} ${compact ? "text-h5 md:text-h4" : "text-h4 md:text-h3"} ${loading ? "motion-safe:animate-pulse" : ""}`}>
          {!progress.counting || known ? (
            <>
              {known && !progress.exact ? <span className="text-p3 md:text-p2 normal-case">at least </span> : null}
              {usdcFigure(progress.raised)}
            </>
          ) : loading ? (
            "…"
          ) : (
            "?"
          )}
        </span>
        <span className="text-p3 md:text-p2 text-tt-cream">
          of the {usdcFigure(progress.goal)} USDC goal for {shelter}
        </span>
      </p>
      <div
        className="h-6 w-full overflow-hidden rounded-lg border-4 border-tt-cream bg-tt-night-950"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? progress.percent : undefined}
        aria-valuetext={known ? `${percentLabel(progress)} of the goal` : loading ? "Counting" : "Not read"}
        aria-label={`${campaign.name} progress`}
      >
        {/* A small stub at 0% so the empty bar still reads as a meter, not an input field. With nothing
            counted it is a plain cream tick: the pink-gold fill (and its glow) means money came in. */}
        <div
          data-testid="campaign-meter-fill"
          className={`h-full motion-safe:transition-all motion-safe:duration-700 ${
            known && progress.raised > BigInt(0)
              ? "bg-gradient-to-r from-tt-pink to-tt-gold-400 shadow-[0_0_12px_rgb(var(--tt-gold-400)/.6)]"
              : "bg-tt-cream/35"
          }`}
          style={{ width: `${known ? barWidth(progress) : 1.5}%` }}
        />
      </div>
      <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-p6 md:text-p5 text-tt-cream/85">
        <span data-testid="campaign-meter-percent">
          {known ? `${percentLabel(progress)} of the goal` : loading && progress.counting ? "Counting…" : ""}
        </span>
        {by && <span>Goal date: {by}</span>}
      </p>
      {unread && progress.counting && (
        <p className="text-tt-cream/90" role="status" data-testid="campaign-meter-unread">
          Can&apos;t read the count right now. Reload in a minute to see the live figure.
        </p>
      )}
      {known && !progress.exact && (
        <p className="text-tt-cream/80" data-testid="campaign-meter-floor">
          Still counting older blocks, so this shows at least what came in so far.
        </p>
      )}
      {!progress.counting && (
        <p className="text-tt-cream/75">The meter starts counting when the shelter wallet goes live.</p>
      )}
      {progress.counting && (
        <p className="text-p6 md:text-p5 text-tt-cream/75" data-testid="campaign-meter-sources">
          {sourcesCopy(shelter, campaign.chainId, progress.sources, openHolder(campaign))}
          {chain && campaign.shelter.wallet && !compact && (
            <>
              {" "}
              <a
                href={explorerAddress(chain.explorer, campaign.shelter.wallet)}
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap text-tt-gold-400 underline decoration-dotted underline-offset-2 hover:text-tt-cream"
              >
                Check the wallet ›
              </a>
            </>
          )}
        </p>
      )}
    </section>
  );
};

export default CampaignMeter;
