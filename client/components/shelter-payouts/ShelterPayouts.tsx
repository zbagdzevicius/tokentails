// copy-lint: web-only app builds render AppProofNotice instead (the isAppBuild gate in ShelterPayouts)
import { isAppBuild } from "@/components/claims/build";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import { AppProofNotice } from "./AppProofNotice";
import { CampaignMeter } from "./CampaignMeter";
import { HandoverStatus, claimsDateLabel } from "./campaign";
import { ChainInfo, SHELTER_CHAINS, chainRole } from "./chains";
import { mainnetRails, readGiveEnv, tryChainId, tryItRails, walletGiveMode } from "./giveMode";
import { useCampaignGoal } from "./goal";
import { formatUnits } from "./logs";
import {
  Addr,
  Balance,
  FeedSection,
  GiveCtaSection,
  HEIST_URL,
  HowItWorks,
  IMPACT_URL,
  PayoutFeed,
  payoutsEmptyCopy,
  Result,
  Sym,
  TreatCta,
  chainCount,
  chainLabel,
  deployInstances,
  feedItems,
  stillReading,
  totalsBySymbol,
  twoDp,
  usePayouts,
  useTreatJar,
} from "./payoutSections";
import { RouterEntry, fetchRouters, routerFor } from "./routers";
import { ShelterDeployment, resolveChain } from "./rpc";
import { isPinkPawWallet } from "./pinkPaw";
import { PinkPawShowcase } from "./PinkPawShowcase";
import { ShelterProfile } from "./ShelterProfile";
import { CARD, CHIP, FIGURE, HEADLINE, Kicker, NightStage, PANEL, PILL, PinkCat } from "./ui";
import { WalletChoice, WalletDonate } from "./WalletDonate";

export { claimsDateLabel };
// Kept here for callers and tests that import them from the page component.
export { GIVE_URL, HEIST_URL, IMPACT_URL, chainCount, payoutsEmptyCopy, receiptHref, twoDp } from "./payoutSections";

/** Chain settings for a chain id: a deployments.json entry's overrides first, then the built-in list. */
export function chainFor(chainId: number, deployments: ShelterDeployment[]): ChainInfo | null {
  const d = deployments.find((x) => x.chainId === chainId);
  return d ? resolveChain(d) : SHELTER_CHAINS[chainId] || null;
}

// The match meter renders inside each wallet block, for that block's own chain (WalletDonate).
export { matchMeterCopy } from "./giveMode";

export const DISCLOSURE =
  "Shelter wallet held by Token Tails on behalf of the shelter until handover";

/** The page's custody line, following campaign.json `shelter.handover` (gate G12). */
export const disclosureFor = (handover: HandoverStatus | undefined) =>
  handover === "handed-over" ? "The shelter holds its own wallet keys" : DISCLOSURE;

// ShelterSplit forwards every donation in the same transaction, so this should read 0.
const BalanceLine = ({
  balance,
  symbol,
  decimals,
  label = "Contract balance",
}: {
  balance: Balance;
  symbol: string;
  decimals: number;
  label?: string;
}) => (
  <p className="text-p6 md:text-p5 text-tt-cream/75" data-testid="contract-balance">
    {label}:{" "}
    {balance.status === "loading" && <span className="motion-safe:animate-pulse">…</span>}
    {balance.status === "error" && <span>unavailable</span>}
    {balance.status === "done" && (
      <strong className="text-tt-cream">
        {formatUnits(balance.wei, decimals)} <Sym>{symbol}</Sym>
      </strong>
    )}{" "}
    (pass-through: donations are split out in the same transaction)
  </p>
);

/** One chain: its total, payout count, contract and balance. */
const ChainCard = ({
  deployment,
  result,
  balance,
  instance,
}: {
  deployment: ShelterDeployment;
  result: Result;
  balance: Balance;
  /** "Deploy 2 of 2" when another contract on this chain pays the same coin. */
  instance?: string | null;
}) => {
  const chain = resolveChain(deployment);
  const cardTotals = result.status === "done" ? totalsBySymbol(result.items, chain) : [];
  const role = chainRole(deployment.chainId);
  // The balance read is the native coin unless the chain has none (Tempo): say which.
  const nativeBalance = !chain?.balanceToken;
  const balanceSymbol = chain?.balanceToken ? chain.symbol : chain?.nativeSymbol || "";

  return (
    <section className={`${CARD} flex flex-col gap-3`} data-testid="chain-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-primary text-p3 md:text-p2 uppercase leading-none text-tt-cream">
          {chainLabel(deployment, chain)}
        </h3>
        <span className={CHIP}>
          <span className="sr-only">Contract </span>
          <Addr explorer={chain?.explorer} value={deployment.address} kind="address" />
        </span>
      </div>
      {/* Which instance this is: several contracts on one chain differ by payout token. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={CHIP} data-testid="chain-card-token">
          Pays <Sym>{chain?.symbol || "USDC"}</Sym>
          {chain?.nativeSymbol && chain.nativeSymbol !== chain.symbol ? (
            <>
              {" "}+ native <Sym>{chain.nativeSymbol}</Sym>
            </>
          ) : null}
        </span>
        {instance && (
          <span className={CHIP} data-testid="chain-card-instance">
            {instance}
          </span>
        )}
      </div>
      {role && (
        <p className="text-p6 md:text-p5 text-tt-cream/80" data-testid="chain-role">
          {role}
        </p>
      )}

      {result.status === "loading" && (
        <p className="motion-safe:animate-pulse">Reading payouts from the chain…</p>
      )}
      {result.status === "error" && (
        <p className="text-tt-cream/85" role="status">
          {result.error}
        </p>
      )}
      {result.status === "done" && result.items.length === 0 && (
        <p className="text-tt-cream/85" data-testid="deployment-empty">
          No payouts on this contract yet. Token Tails will list each one here as it lands.
        </p>
      )}
      {result.status === "done" && result.items.length > 0 && (
        <div>
          <p className={`${FIGURE} text-h5 md:text-h4`}>
            {cardTotals.map((t, k) => (
              <span key={t.symbol}>
                {k > 0 ? " + " : ""}
                {twoDp(t.amount)} <Sym>{t.symbol}</Sym>
              </span>
            ))}
          </p>
          <p className="mt-1 font-primary text-p5 uppercase tracking-wide text-tt-cream/80">
            Total paid in {result.items.length} payout{result.items.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <BalanceLine
        balance={balance}
        symbol={balanceSymbol}
        decimals={chain?.balanceToken ? chain.decimals : chain?.nativeDecimals ?? 18}
        label={nativeBalance && balanceSymbol !== chain?.symbol ? "Contract balance (native coin)" : "Contract balance"}
      />
    </section>
  );
};

export const ShelterPayouts = ({ embed = false }: { embed?: boolean }) =>
  isAppBuild() ? <AppProofNotice /> : <WebShelterPayouts embed={embed} />;

const WebShelterPayouts = ({ embed }: { embed: boolean }) => {
  const { page, results, balances, testnet, tResults, tBalances } = usePayouts();
  const { campaign, progress, state: goalState } = useCampaignGoal();
  const { closed: jarClosed } = useTreatJar();
  const [routers, setRouters] = useState<RouterEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchRouters().then((r) => !cancelled && setRouters(r));
    return () => {
      cancelled = true;
    };
  }, []);

  // Totals per symbol: amounts of different coins are never added together.
  const totals: Record<string, { amount: bigint; count: number }> = {};
  if (page.status === "done") {
    page.deployments.forEach((d, i) => {
      const r = results[i];
      if (r?.status !== "done") return;
      for (const t of totalsBySymbol(r.items, resolveChain(d))) {
        const acc = totals[t.symbol] || { amount: BigInt(0), count: 0 };
        acc.amount += t.amount;
        acc.count += t.count;
        totals[t.symbol] = acc;
      }
    });
  }
  const totalEntries = Object.entries(totals);
  const payoutCount = totalEntries.reduce((n, [, t]) => n + t.count, 0);
  const pending = page.status === "done" && stillReading(page.deployments, results);

  const unread =
    page.status === "done" && page.deployments.some((_, i) => results[i]?.status === "error");
  const chainsTotal = page.status === "done" ? chainCount(page.deployments) : 0;

  const deployments = page.status === "done" ? page.deployments : [];
  const campaignDeployment = campaign
    ? deployments.find((d) => d.chainId === campaign.chainId)
    : undefined;
  const campaignChain = campaignDeployment ? resolveChain(campaignDeployment) : null;

  // Wallet giving: the campaign slot (real money, only after the handover) and, separately, the
  // testnet "try it live" slot. The rules live in giveMode.ts.
  // Mainnet and testnet ShelterSplits: a chain without a router gives straight into its split.
  const giveDeployments = [...deployments, ...testnet];
  const giveEnv = readGiveEnv();
  const campaignMode = walletGiveMode(campaign, giveDeployments, routers, giveEnv, "campaign");
  const tryMode = walletGiveMode(campaign, giveDeployments, routers, giveEnv, "try-it");
  const tryId = tryChainId(giveEnv);
  // Every chain of the six with a wallet path: each block lets the donor pick the network.
  const tryChoices: WalletChoice[] = tryItRails(routers, giveDeployments, giveEnv);
  const campaignChoices: WalletChoice[] =
    campaignMode === "mainnet" ? mainnetRails(campaign, routers, giveDeployments, giveEnv) : [];

  const feed = feedItems(deployments, results);
  const testFeed = feedItems(testnet, tResults);
  const testInstances = deployInstances(testnet);
  const testPending = stillReading(testnet, tResults);
  const testUnread = testnet.filter((_, i) => tResults[i]?.status === "error").length;
  const testChainNames = Array.from(new Set(testnet.map((d) => chainLabel(d, resolveChain(d)))));
  const shelterName = (addr: string) =>
    campaign?.shelter.wallet && campaign.shelter.wallet === addr.toLowerCase() ? campaign.shelter.name : null;

  // Inside the Heist modal (`?embed=1`) links leave the iframe, and the Heist link is dropped.
  const target = embed ? "_top" : undefined;
  const ctaButton = (size?: "md") => <TreatCta jarClosed={jarClosed} embed={embed} target={target} size={size} />;
  // Pink Paw's logo and cats only when the campaign is Pink Paw's own wallet.
  const showPinkPaw = !!campaign && isPinkPawWallet(campaign.shelter.wallet);
  const campaignBody = campaign ? (
    <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-2">
      <ShelterProfile campaign={campaign} explorer={campaignChain?.explorer} heading={showPinkPaw ? "Their wallet" : undefined} />
      <div className="flex flex-col gap-4">
        {progress && <CampaignMeter campaign={campaign} progress={progress} state={goalState} />}
        <WalletDonate
          mode={campaignMode}
          chainId={campaign.chainId}
          chain={campaignChain || chainFor(campaign.chainId, deployments)}
          router={routerFor(routers, campaign.chainId)}
          shelterName={campaign.shelter.name}
          choices={campaignChoices}
        />
        {tryId !== null && (
          <WalletDonate
            mode={tryMode}
            chainId={tryId}
            chain={chainFor(tryId, deployments)}
            router={routerFor(routers, tryId)}
            shelterName={campaign.shelter.name}
            choices={tryChoices}
          />
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex w-full flex-col text-tt-cream">
      {/* HERO: the total sent to shelters, as big as the landing's figures. */}
      <NightStage>
        <section
          className={`mx-auto flex max-w-[1400px] flex-col items-center gap-5 px-4 text-center md:gap-6 md:px-8 lg:px-16 ${
            embed ? "pt-8 pb-12" : "pt-24 pb-16 md:pt-32 md:pb-24"
          }`}
        >
          <Kicker>Live from the chain</Kicker>
          <h1 className="font-primary text-h5 md:text-h2 xl:text-h1 font-bold uppercase leading-none text-white drop-shadow-lg text-balance">
            Shelter <span className="glow text-tt-cream">payouts</span>
          </h1>

          {page.status === "done" && page.deployments.length > 0 && (
            <div className="flex flex-col items-center gap-2" data-testid="payouts-totals" aria-live="polite">
              {totalEntries.length === 0 && pending && (
                <p className={`${FIGURE} text-h3 md:text-h1 motion-safe:animate-pulse`}>…</p>
              )}
              {/* Never "0 USDC": a chain that could not be read is not a chain with no payouts. */}
              {totalEntries.length === 0 && !pending && unread && (
                <p className="max-w-xl text-p4 md:text-p3 text-tt-cream/90" data-testid="payouts-unread">
                  The chains are busy right now. Reload in a minute to see the live total.
                </p>
              )}
              {totalEntries.length === 0 && !pending && !unread && (
                <p className={`${FIGURE} text-h4 md:text-h2`}>First payouts land soon</p>
              )}
              {totalEntries.map(([symbol, t]) => (
                <p key={symbol} className={`${FIGURE} text-[64px] md:text-[120px] lg:text-[160px]`}>
                  {twoDp(t.amount)} <span className="text-h5 md:text-h3 normal-case">{symbol}</span>
                </p>
              ))}
              {totalEntries.length > 0 && (
                <p className="font-primary text-p4 md:text-p2 uppercase tracking-wide text-tt-cream">
                  across {payoutCount} payout{payoutCount === 1 ? "" : "s"} on {chainsTotal} chain
                  {chainsTotal === 1 ? "" : "s"}
                  {chainsTotal !== deployments.length ? ` (${deployments.length} contracts)` : ""}
                  {pending ? " · still counting…" : ""}
                </p>
              )}
              {/* Partial figures must say they are partial: a chain that could not be read is missing. */}
              {totalEntries.length > 0 && !pending && unread && (
                <p className="max-w-xl text-p5 md:text-p4 text-tt-cream/90" data-testid="payouts-partial">
                  Some chains could not be read right now, so these totals may be incomplete. Reload in a minute.
                </p>
              )}
            </div>
          )}
          {page.status === "done" && page.deployments.length === 0 && (
            <p className={`${FIGURE} text-h4 md:text-h2`}>First payouts land soon</p>
          )}
          {page.status === "done" && page.deployments.length === 0 && testnet.length > 0 && (
            <a href="#testnet-proof" className={PILL} data-testid="testnet-proof-link">
              Already live on {chainCount(testnet)} testnets: see the proof ›
            </a>
          )}

          <p className="max-w-2xl text-p5 md:text-p4 text-tt-cream/90">
            Every payout from the ShelterSplit contract is read live from the chain&apos;s public RPC, not
            from our servers.
          </p>

          <div className="mt-2 flex flex-col items-center gap-6 md:mt-4">
            {ctaButton("md")}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {/* claim: fiction in-game rescue, the Heist story */}
              {!embed && !jarClosed && (
                <a href={HEIST_URL} className={PILL} data-testid="play-heist">
                  Play Catnip Heist: rescue a shelter cat
                </a>
              )}
              <NextLink href={IMPACT_URL} target={target} className={PILL} data-testid="see-impact">
                See all impact ›
              </NextLink>
            </div>
          </div>

          <p
            className="inline-flex items-center gap-2 rounded-xl border-2 border-tt-cream/70 bg-tt-night-900/80 px-4 py-2 text-p6 md:text-p5 text-tt-cream"
            data-testid="shelter-disclosure"
          >
            <span aria-hidden="true">🔑</span>
            {disclosureFor(campaign?.shelter.handover)}
          </p>
        </section>
      </NightStage>

      <NightStage>
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 pt-8 pb-16 md:gap-8 md:px-8 md:pt-12 lg:px-16">
          {/* PINK PAW: the showcase shelter and its campaign. */}
          {campaign && (
            <section className={PANEL} data-testid="pink-paw-showcase">
              <Kicker>Showcase shelter</Kicker>
              <h2 className={HEADLINE}>
                Where your treats <span className="glow text-tt-cream">land first.</span>
              </h2>
              <div className="mt-5 md:mt-7">
                {showPinkPaw ? (
                  <PinkPawShowcase name={campaign.shelter.name} target={target}>
                    {campaignBody}
                  </PinkPawShowcase>
                ) : (
                  campaignBody
                )}
              </div>
            </section>
          )}

          {page.status === "loading" && (
            <p className="text-center motion-safe:animate-pulse">Loading deployments…</p>
          )}
          {page.status === "error" && (
            <p className={`${PANEL} text-tt-rust`} role="alert">
              Could not load the deployment list: {page.error}
            </p>
          )}
          {page.status === "done" && page.deployments.length === 0 && (
            <section className={`${PANEL} flex flex-col items-center gap-3 text-center`}>
              <PinkCat lick className="h-40 w-40 -my-6" />
              <p className="max-w-2xl text-p5 md:text-p4" data-testid="payouts-empty">
                {payoutsEmptyCopy(campaign?.startDate)}
              </p>
            </section>
          )}

          {page.status === "done" && page.deployments.length > 0 && (
            <>
              {/* PER CHAIN */}
              <section className={PANEL}>
                <Kicker>Per chain</Kicker>
                <h2 className={HEADLINE}>
                  One contract, <span className="glow text-tt-cream">every chain.</span>
                </h2>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-7 md:gap-4 xl:grid-cols-3">
                  {page.deployments.map((d, i) => (
                    <ChainCard
                      key={`${d.chainId}-${d.address}`}
                      deployment={d}
                      result={results[i] || { status: "loading" }}
                      balance={balances[i] || { status: "loading" }}
                    />
                  ))}
                </div>
              </section>

              {/* FEED */}
              <FeedSection feed={feed} pending={pending} shelterName={shelterName} target={target} />
            </>
          )}

          {/* TESTNET PROOF: the contract on every target chain's test network, apart from real money. */}
          {testnet.length > 0 && (
            <section id="testnet-proof" className={`${PANEL} scroll-mt-24`} data-testid="testnet-proof">
              <div className="flex flex-wrap items-center gap-3">
                <Kicker>Testnet proof</Kicker>
                <span className={`${CHIP} !border-tt-mint !text-tt-mint`}>Test coins · no real money</span>
              </div>
              <h2 className={HEADLINE}>
                Live on {chainCount(testnet)} testnets. <span className="glow text-tt-cream">Check every payout.</span>
              </h2>
              <p className="mt-3 max-w-3xl text-p5 md:text-p4 text-tt-cream/90">
                Before the mainnet launch, the same ShelterSplit contract runs on the test network of each chain
                below. These payouts use test coins with no value, so they never count toward the totals above.
                Each one links to its block explorer and to its receipt on this site.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Testnets">
                {testChainNames.map((n) => (
                  <li key={n} className={CHIP}>
                    {n}
                  </li>
                ))}
              </ul>
              <p className="mt-4 font-primary text-p4 md:text-p3 uppercase tracking-wide text-tt-cream" aria-live="polite">
                {/* A contract that could not be read hides its payouts: the count is then a floor. */}
                {!testPending && testUnread > 0 ? "At least " : ""}
                {testFeed.length} test payout{testFeed.length === 1 ? "" : "s"} on {testnet.length} contracts
                {testPending ? " · still reading…" : ""}
              </p>
              {!testPending && testUnread > 0 && (
                <p className="mt-1 text-p5 text-tt-cream/85" data-testid="testnet-partial">
                  {testUnread} contract{testUnread === 1 ? "" : "s"} could not be read right now. Reload in a minute.
                </p>
              )}
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-7 md:gap-4 xl:grid-cols-3">
                {testnet.map((d, i) => (
                  <ChainCard
                    key={`${d.chainId}-${d.address}`}
                    instance={testInstances[i]}
                    deployment={d}
                    result={tResults[i] || { status: "loading" }}
                    balance={tBalances[i] || { status: "loading" }}
                  />
                ))}
              </div>
              {testFeed.length > 0 && (
                <details className="mt-5 md:mt-7" data-testid="testnet-feed">
                  <summary className={`${PILL} cursor-pointer list-none`}>
                    Every test payout ({testFeed.length}) ›
                  </summary>
                  <div className="mt-4">
                    <PayoutFeed items={testFeed} shelterName={shelterName} target={target} />
                  </div>
                </details>
              )}
            </section>
          )}

          <HowItWorks />

          {/* CLOSING CTA, like the landing's rescue hub. */}
          <GiveCtaSection jarClosed={jarClosed} embed={embed} target={target} />
        </div>
      </NightStage>
    </div>
  );
};

export default ShelterPayouts;
