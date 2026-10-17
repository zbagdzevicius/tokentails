// copy-lint: web-only app builds render AppProofNotice instead (the isAppBuild gate in ShelterPayouts)
import { isAppBuild } from "@/components/claims/build";
import NextLink from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { AppProofNotice } from "./AppProofNotice";
import { CampaignMeter } from "./CampaignMeter";
import { HandoverStatus, claimsDateLabel } from "./campaign";
import { ChainInfo, SHELTER_CHAINS, chainRole } from "./chains";
import { mainnetRails, readGiveEnv, tryChainId, tryItRails, walletGiveMode } from "./giveMode";
import { useCampaignGoal } from "./goal";
import { formatUnits } from "./logs";
import { MotoredLine } from "./MotoredLine";
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
  updatingText,
  twoDp,
  usePayouts,
  useTreatJar,
} from "./payoutSections";
import { RouterEntry, fetchRouters, routerFor } from "./routers";
import { ShelterDeployment, deploymentToken, resolveChain } from "./rpc";
import { isPinkPawWallet } from "./pinkPaw";
import { PinkPawShowcase } from "./PinkPawShowcase";
import { ShelterProfile } from "./ShelterProfile";
import { TotalsBillboard } from "./TotalsBillboard";
import { CARD, CHIP, FIGURE, HEADLINE, Kicker, NightStage, PANEL, PILL, PinkCat, Skeleton } from "./ui";
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

/** The fallback line when campaign.json does not say "handed-over" (the setup before 16 Oct 2026). */
export const DISCLOSURE = "Payouts go to a wallet Token Tails holds for the shelter.";

/** The page's custody line, following campaign.json `shelter.handover` (gate G12). */
// claim: C-001 (campaign.wallets: a wallet Token Tails held until 16 Oct 2026, Pink Paw's wallet since)
export const disclosureFor = (handover: HandoverStatus | undefined) =>
  handover === "handed-over"
    ? "Payouts go to Pink Paw's wallet. Before 16 Oct 2026 they went to a wallet Token Tails held for the shelter."
    : DISCLOSURE;

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

/** The summary of the folded testnet proof, once mainnet payout contracts are listed above it. */
export const testnetFoldSummary = (networks: number) =>
  `Also running on ${networks} test network${networks === 1 ? "" : "s"} (test coins, no real money)`;

/**
 * The testnet proof's frame. Without a mainnet deployment it is the full panel, as before; with
 * one it folds into a small closed `<details>` under the mainnet content, its content kept inside.
 */
export const TestnetProofFold = ({
  folded,
  networks,
  children,
}: {
  folded: boolean;
  networks: number;
  children: ReactNode;
}) =>
  folded ? (
    <section id="testnet-proof" className="scroll-mt-24" data-testid="testnet-proof">
      <details className="group" data-testid="testnet-proof-fold">
        <summary
          className={`${PILL} mx-auto w-fit cursor-pointer list-none !border-tt-mint !text-tt-mint [&::-webkit-details-marker]:hidden`}
          data-testid="testnet-proof-summary"
        >
          {testnetFoldSummary(networks)} <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className={`${PANEL} mt-4`}>{children}</div>
      </details>
    </section>
  ) : (
    <section id="testnet-proof" className={`${PANEL} scroll-mt-24`} data-testid="testnet-proof">
      {children}
    </section>
  );

/** One chain: its total, payout count, contract and balance. */
export const ChainCard = ({
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
  const role = chainRole(deployment.chainId, deploymentToken(deployment));
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

      {/* Shaped like the card's total and its count line, so the figure lands in place. */}
      {result.status === "loading" && (
        <div aria-busy="true" data-testid="chain-card-loading">
          <span className="sr-only">Reading payouts…</span>
          <Skeleton className="h-9 w-40 md:h-11 md:w-48" />
          <Skeleton className="mt-2 h-4 w-36" />
        </div>
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
      {/* The chain is busy: these are the index's last-known payouts, kept and labelled, never dropped. */}
      {result.status === "done" && result.updating && (
        <p className="text-p6 md:text-p5 text-tt-cream/70" data-testid="chain-card-updating">
          {updatingText(result.updating)}
        </p>
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

  // The hero board needs only to know whether the list is read; the totals are its own (per coin).
  const pending = page.status === "done" && stillReading(page.deployments, results);

  const deployments = page.status === "done" ? page.deployments : [];
  const campaignDeployment = campaign
    ? deployments.find((d) => d.chainId === campaign.chainId)
    : undefined;
  const campaignChain = campaignDeployment ? resolveChain(campaignDeployment) : null;

  // Wallet giving: the campaign slot (real money, only while the split pays the shelter's wallet) and, separately, the
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
          shelterWallet={campaign.shelter.handover === "handed-over" ? campaign.shelter.wallet : null}
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
          <Kicker>Public, on-chain</Kicker>
          <h1 className="font-primary text-h5 md:text-h2 xl:text-h1 font-bold uppercase leading-none text-white drop-shadow-lg text-balance">
            Shelter <span className="glow text-tt-cream">payouts</span>
          </h1>

          {/* The totals billboard: skeleton while reading, then every coin at once (never summed). */}
          {/* With no contracts listed the board itself says "First payouts land soon". */}
          {page.status !== "error" && (
            <TotalsBillboard loading={page.status === "loading"} deployments={deployments} results={results} />
          )}
          {/* Motored sponsor money, labelled live from its first gift (never counted as donors). */}
          <MotoredLine items={feed} shelterName={campaign?.shelter.name || "Pink Paw"} />
          {page.status === "done" && page.deployments.length === 0 && testnet.length > 0 && (
            <a href="#testnet-proof" className={PILL} data-testid="testnet-proof-link">
              Already live on {chainCount(testnet)} testnets: see the proof ›
            </a>
          )}

          <p className="max-w-2xl text-p5 md:text-p4 text-tt-cream/90">
            Every payout is a public event of the ShelterSplit contract. This page reads an index of those
            events, then the newest blocks straight from each chain, and links every payout to its
            transaction on the chain&apos;s explorer, so you can check each one yourself.
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
            <section className={PANEL} aria-busy="true" data-testid="deployments-loading">
              <span className="sr-only">Loading deployments…</span>
              <Skeleton className="h-6 w-28" />
              <Skeleton className="mt-3 h-8 w-[min(100%,24rem)] md:h-10" />
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-7 md:gap-4 xl:grid-cols-3">
                {[0, 1, 2].map((k) => (
                  <div key={k} className={`${CARD} flex flex-col gap-3`}>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-9 w-40 md:h-11" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                ))}
              </div>
            </section>
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
          {/* With mainnet contracts listed above, it folds into one small closed line. */}
          {testnet.length > 0 && (
            <TestnetProofFold folded={deployments.length > 0} networks={chainCount(testnet)}>
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
            </TestnetProofFold>
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
