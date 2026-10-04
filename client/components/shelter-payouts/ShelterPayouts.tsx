// copy-lint: web-only app builds render AppProofNotice instead (the isAppBuild gate in ShelterPayouts)
import { DonateStatus, SHELTER_API } from "@/api/shelter-api";
import { isAppBuild } from "@/components/claims/build";
import { PixelButton } from "@/components/shared/PixelButton";
import NextLink from "next/link";
import { Dispatch, ReactNode, SetStateAction, useEffect, useState } from "react";
import { AppProofNotice } from "./AppProofNotice";
import { CampaignMeter } from "./CampaignMeter";
import { Campaign, campaignProgress, claimsDateLabel, fetchCampaign } from "./campaign";

export { claimsDateLabel };
import { ChainInfo, SHELTER_CHAINS, chainRole, explorerAddress, explorerTx } from "./chains";
import { readGiveEnv, tryChainId, tryItRouters, walletGiveMode } from "./giveMode";
import { RouterEntry, fetchRouters, routerFor } from "./routers";
import { Disbursement, displayMemo, formatUnits, payoutUnit, to18 } from "./logs";
import {
  ShelterDeployment,
  fetchDeployments,
  fetchDisbursements,
  fetchNativeBalance,
  fetchTestnetDeployments,
  isTestnetDeployment,
  readErrorText,
  resolveChain,
} from "./rpc";
import { isPinkPawWallet } from "./pinkPaw";
import { PinkPawShowcase } from "./PinkPawShowcase";
import { ShelterProfile } from "./ShelterProfile";
import { CARD, CHIP, FIGURE, MEMO, HEADLINE, Kicker, NightStage, PANEL, PILL, PinkCat } from "./ui";
import { WalletChoice, WalletDonate } from "./WalletDonate";

export const GIVE_URL = "/shelter-payouts/give";

// The Catnip Heist host page (task 4b); the old /heist/index.html redirects there.
export const HEIST_URL = "/heist";
export const IMPACT_URL = "/impact";

/** Chain settings for a chain id: a deployments.json entry's overrides first, then the built-in list. */
export function chainFor(chainId: number, deployments: ShelterDeployment[]): ChainInfo | null {
  const d = deployments.find((x) => x.chainId === chainId);
  return d ? resolveChain(d) : SHELTER_CHAINS[chainId] || null;
}

// The match meter renders inside each wallet block, for that block's own chain (WalletDonate).
export { matchMeterCopy } from "./giveMode";

export const DISCLOSURE =
  "Shelter wallet held by Token Tails on behalf of the shelter until handover";

type Result =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; items: Disbursement[] };

type Page =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; deployments: ShelterDeployment[] };

// Sum per symbol, in 18-decimal units, so Arc's native USDC (18 decimals) and ERC-20 USDC (6)
// add up while different coins never mix.
function totalsBySymbol(
  items: Disbursement[],
  chain: ReturnType<typeof resolveChain>
): { symbol: string; amount: bigint; count: number }[] {
  const out: Record<string, { symbol: string; amount: bigint; count: number }> = {};
  for (const d of items) {
    const u = chain ? payoutUnit(d.kind, chain) : { decimals: 6, symbol: "?" };
    const t = out[u.symbol] || { symbol: u.symbol, amount: BigInt(0), count: 0 };
    t.amount += to18(d.amount, u.decimals);
    t.count += 1;
    out[u.symbol] = t;
  }
  return Object.values(out);
}

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;

/** Distinct chains in a deployment list: two contracts on one chain count once. */
export const chainCount = (deployments: Pick<ShelterDeployment, "chainId">[]) =>
  new Set(deployments.map((d) => d.chainId)).size;

/** Token symbols keep their case (pathUSD, mUSDC) inside the upper-case figure and chip styles. */
const Sym = ({ children }: { children: ReactNode }) => <span className="normal-case">{children}</span>;

// Reads payouts and the contract balance of every deployment in a list, keyed by its index.
function readDeployments(
  deployments: ShelterDeployment[],
  setResults: Dispatch<SetStateAction<Record<number, Result>>>,
  setBalances: Dispatch<SetStateAction<Record<number, Balance>>>,
  cancelled: () => boolean
) {
  deployments.forEach((d, i) => {
    setResults((r) => ({ ...r, [i]: { status: "loading" } }));
    fetchNativeBalance(d)
      .then((wei) => !cancelled() && setBalances((b) => ({ ...b, [i]: { status: "done", wei } })))
      .catch(() => !cancelled() && setBalances((b) => ({ ...b, [i]: { status: "error" } })));
    fetchDisbursements(d)
      .then((items) => {
        if (!cancelled()) setResults((r) => ({ ...r, [i]: { status: "done", items } }));
      })
      .catch((err: unknown) => {
        if (!cancelled()) setResults((r) => ({ ...r, [i]: { status: "error", error: readErrorText(err) } }));
      });
  });
}

/**
 * The empty state while no payout exists (plan G4 acceptance: future tense and the claims date, or
 * no date if unset). The date is the campaign's start, the day payouts begin to count.
 */
export function payoutsEmptyCopy(startDate: string | null | undefined, now: Date = new Date()): string {
  const lead =
    "No mainnet payouts yet. Token Tails will list each payout here as soon as the first mainnet contract goes live.";
  const label = claimsDateLabel(startDate);
  if (!label) return lead;
  const started = Date.parse(`${startDate}T00:00:00Z`) <= now.getTime();
  return started
    ? `${lead} Every payout from ${label} on will count toward the campaign.`
    : `${lead} Payouts will start counting on ${label}.`;
}

// Two decimals is plenty for a headline figure: 12.345678 -> 12.34. Below 1, keep two significant
// digits so a small native gift never reads as zero: 0.0021 ETH -> 0.0021, not 0.00.
export const twoDp = (v18: bigint) => {
  const [w, f] = formatUnits(v18, 18).split(".");
  if (!f) return w;
  if (w !== "0") return `${w}.${f.slice(0, 2)}`;
  const lead = f.search(/[1-9]/);
  if (lead < 0) return "0";
  if (lead >= 6) return "<0.000001";
  return `0.${f.slice(0, Math.max(2, lead + 2))}`;
};

const Link = ({ href, text, label }: { href: string; text: string; label?: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    // The `code` role: addresses and tx hashes only (plan F4, G14).
    // eslint-disable-next-line tt/no-raw-font
    className="font-mono normal-case underline decoration-dotted underline-offset-2 hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400"
  >
    {text}
  </a>
);

const Addr = ({ explorer, value, kind }: { explorer?: string; value: string; kind: "address" | "tx" }) =>
  explorer ? (
    <Link
      href={kind === "tx" ? explorerTx(explorer, value) : explorerAddress(explorer, value)}
      text={short(value)}
      label={kind === "tx" ? `Transaction ${short(value)} on the explorer` : undefined}
    />
  ) : (
    // The `code` role: an address or a tx hash (plan F4, G14).
    // eslint-disable-next-line tt/no-raw-font
    <span className="font-mono normal-case">{short(value)}</span>
  );

type Balance = { status: "loading" } | { status: "error" } | { status: "done"; wei: bigint };

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

const chainLabel = (deployment: ShelterDeployment, chain: ChainInfo | null) =>
  `${chain?.name || `Chain ${deployment.chainId}`}${
    deployment.network && !(chain?.name || "").toLowerCase().includes(deployment.network.toLowerCase())
      ? ` ${deployment.network}`
      : ""
  }`;

/** One chain: its total, payout count, contract and balance. */
const ChainCard = ({
  deployment,
  result,
  balance,
}: {
  deployment: ShelterDeployment;
  result: Result;
  balance: Balance;
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

type FeedItem = { d: Disbursement; chain: ChainInfo | null; chainName: string; chainId: number };

/** The site's own receipt page for one payout transaction. */
export const receiptHref = (chainId: number, txHash: string) =>
  `/shelter-payouts/receipt?chain=${chainId}&tx=${txHash}`;

/** Every payout on every chain, newest block first within each chain. */
const PayoutFeed = ({
  items,
  shelterName,
  target,
}: {
  items: FeedItem[];
  shelterName: (addr: string) => string | null;
  target?: string;
}) => (
  <ul className="flex flex-col gap-3" data-testid="payouts-feed">
    {items.map(({ d, chain, chainName, chainId }) => {
      const unit = chain ? payoutUnit(d.kind, chain) : { decimals: 6, symbol: "" };
      const memo = displayMemo(d.memo);
      const name = shelterName(d.shelter);
      return (
        <li
          key={`${chainName}-${d.txHash}-${d.logIndex}`}
          className="flex flex-col gap-2 rounded-2xl border-2 border-tt-cream/40 bg-tt-night-900/70 p-3 md:flex-row md:items-center md:gap-4 md:p-4"
        >
          <span className="flex items-center gap-3 md:w-64 md:shrink-0">
            <span aria-hidden="true" className="text-h6">🐾</span>
            <span className="font-primary text-p1 md:text-h6 leading-none whitespace-nowrap text-tt-gold-400 [text-shadow:0_0_8px_rgb(var(--tt-gold-400)/.45)]">
              {formatUnits(d.amount, unit.decimals)} <Sym>{unit.symbol}</Sym>
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-p5 md:text-p4">
              to{" "}
              {name ? (
                <strong className="text-tt-cream">{name}</strong>
              ) : (
                <Addr explorer={chain?.explorer} value={d.shelter} kind="address" />
              )}
            </span>
            <span className="flex flex-wrap gap-2">
              <span className={CHIP}>{chainName}</span>
              {memo && <span className={MEMO}>{memo}</span>}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-p6 md:text-p5 text-tt-cream/80">
            <span>
              <span className="mr-1">Tx</span>
              <Addr explorer={chain?.explorer} value={d.txHash} kind="tx" />
            </span>
            <NextLink
              href={receiptHref(chainId, d.txHash)}
              target={target}
              className="underline decoration-dotted underline-offset-2 hover:text-tt-gold-400"
              data-testid="feed-receipt"
            >
              Receipt ›
            </NextLink>
          </span>
        </li>
      );
    })}
  </ul>
);

export const ShelterPayouts = ({ embed = false }: { embed?: boolean }) =>
  isAppBuild() ? <AppProofNotice /> : <WebShelterPayouts embed={embed} />;

const WebShelterPayouts = ({ embed }: { embed: boolean }) => {
  const [page, setPage] = useState<Page>({ status: "loading" });
  const [results, setResults] = useState<Record<number, Result>>({});
  const [balances, setBalances] = useState<Record<number, Balance>>({});
  // The testnet proof: its own list, reads and section, never added to the mainnet figures.
  const [testnet, setTestnet] = useState<ShelterDeployment[]>([]);
  const [tResults, setTResults] = useState<Record<number, Result>>({});
  const [tBalances, setTBalances] = useState<Record<number, Balance>>({});
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  // undefined while loading, null when the backend could not be reached.
  const [jar, setJar] = useState<DonateStatus | null | undefined>(undefined);
  const [routers, setRouters] = useState<RouterEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchRouters().then((r) => !cancelled && setRouters(r));
    SHELTER_API.getDonateStatus().then((st) => !cancelled && setJar(st));
    fetchCampaign()
      .then((c) => !cancelled && setCampaign(c))
      .catch(() => undefined); // the campaign block is optional; the payouts still render
    const isCancelled = () => cancelled;
    Promise.all([
      fetchDeployments().then(
        (list) => ({ ok: true as const, list }),
        (err: Error) => ({ ok: false as const, error: err.message })
      ),
      fetchTestnetDeployments(),
    ]).then(([main, testList]) => {
      if (cancelled) return;
      // A testnet entry in the public list (e.g. the whole funding file copied over) moves to the
      // testnet section, so test money never shows up in the headline figures.
      const mainnet = main.ok ? main.list.filter((d) => !isTestnetDeployment(d)) : [];
      const seen = new Set(testList.map((d) => `${d.chainId}:${d.address.toLowerCase()}`));
      const tests = [
        ...testList,
        ...(main.ok ? main.list.filter((d) => isTestnetDeployment(d) && !seen.has(`${d.chainId}:${d.address.toLowerCase()}`)) : []),
      ];
      setPage(main.ok ? { status: "done", deployments: mainnet } : { status: "error", error: main.error });
      setTestnet(tests);
      readDeployments(mainnet, setResults, setBalances, isCancelled);
      readDeployments(tests, setTResults, setTBalances, isCancelled);
    });
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
  const pending =
    page.status === "done" &&
    page.deployments.some((_, i) => results[i]?.status !== "done" && results[i]?.status !== "error");

  const unread =
    page.status === "done" && page.deployments.some((_, i) => results[i]?.status === "error");
  const chainsTotal = page.status === "done" ? chainCount(page.deployments) : 0;

  const deployments = page.status === "done" ? page.deployments : [];
  const progress = campaign
    ? campaignProgress(
        campaign,
        deployments.flatMap((d, i) => {
          const r = results[i];
          return r?.status === "done"
            ? [{ chainId: d.chainId, items: r.items, symbol: resolveChain(d)?.symbol }]
            : [];
        })
      )
    : null;
  const campaignDeployment = campaign
    ? deployments.find((d) => d.chainId === campaign.chainId)
    : undefined;
  const campaignChain = campaignDeployment ? resolveChain(campaignDeployment) : null;

  // Wallet giving: the campaign slot (real money, only after the handover) and, separately, the
  // testnet "try it live" slot. The rules live in giveMode.ts.
  const giveEnv = readGiveEnv();
  const campaignMode = walletGiveMode(campaign, deployments, routers, giveEnv, "campaign");
  const tryMode = walletGiveMode(campaign, deployments, routers, giveEnv, "try-it");
  const tryId = tryChainId(giveEnv);
  // Every listed testnet router with a wallet path: the try-it block lets the donor pick the network.
  const tryChoices: WalletChoice[] = tryItRouters(routers, giveEnv).flatMap((r) => {
    const chain = chainFor(r.chainId, deployments);
    return chain ? [{ chainId: r.chainId, chain, router: r }] : [];
  });

  const feed: FeedItem[] = deployments.flatMap((d, i) => {
    const r = results[i];
    if (r?.status !== "done") return [];
    const chain = resolveChain(d);
    return r.items.map((item) => ({ d: item, chain, chainName: chainLabel(d, chain), chainId: d.chainId }));
  });
  const testFeed: FeedItem[] = testnet.flatMap((d, i) => {
    const r = tResults[i];
    if (r?.status !== "done") return [];
    const chain = resolveChain(d);
    return r.items.map((item) => ({ d: item, chain, chainName: chainLabel(d, chain), chainId: d.chainId }));
  });
  const testPending = testnet.some((_, i) => tResults[i]?.status !== "done" && tResults[i]?.status !== "error");
  const testUnread = testnet.filter((_, i) => tResults[i]?.status === "error").length;
  const testChainNames = Array.from(new Set(testnet.map((d) => chainLabel(d, resolveChain(d)))));
  const shelterName = (addr: string) =>
    campaign?.shelter.wallet && campaign.shelter.wallet === addr.toLowerCase() ? campaign.shelter.name : null;

  // Inside the Heist modal (`?embed=1`) links leave the iframe, and the Heist link is dropped.
  const target = embed ? "_top" : undefined;
  // While the treat jar is closed, "SEND A TREAT" would lead to a disabled button: point the CTA at
  // the Heist instead (or, inside the Heist, show that the jar opens soon).
  const jarOpen =
    !!jar?.enabled && BigInt(jar.amountWei || "0") > BigInt(0) &&
    BigInt(jar.remainingTodayWei || "0") >= BigInt(jar.amountWei || "0");
  const jarClosed = jar !== undefined && !jarOpen;
  const ctaButton = (size?: "md") =>
    jarClosed ? (
      embed ? (
        <span className={`${PILL} cursor-default border-dashed`} data-testid="treat-jar-closed">
          Treat jar opens soon
        </span>
      ) : (
        <a href={HEIST_URL} data-testid="play-heist-cta">
          <PixelButton
            as="span"
            text="PLAY CATNIP HEIST"
            size={size}
            className={size ? "md:scale-125 md:hover:scale-[1.35]" : undefined}
          />
        </a>
      )
    ) : (
      <NextLink href={GIVE_URL} target={target} data-testid="give-treat">
        <PixelButton
          as="span"
          text="SEND A TREAT"
          subtext="🐾"
          size={size}
          className={size ? "md:scale-125 md:hover:scale-[1.35]" : undefined}
        />
      </NextLink>
    );
  // Pink Paw's logo and cats only when the campaign is Pink Paw's own wallet.
  const showPinkPaw = !!campaign && isPinkPawWallet(campaign.shelter.wallet);
  const campaignBody = campaign ? (
    <div className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-2">
      <ShelterProfile campaign={campaign} explorer={campaignChain?.explorer} heading={showPinkPaw ? "Their wallet" : undefined} />
      <div className="flex flex-col gap-4">
        {progress && <CampaignMeter campaign={campaign} progress={progress} loading={pending} />}
        <WalletDonate
          mode={campaignMode}
          chainId={campaign.chainId}
          chain={campaignChain || chainFor(campaign.chainId, deployments)}
          router={routerFor(routers, campaign.chainId)}
          shelterName={campaign.shelter.name}
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
            {DISCLOSURE}
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
              <section className={PANEL}>
                <Kicker>Payouts feed</Kicker>
                <h2 className={HEADLINE}>
                  Every treat, <span className="glow text-tt-cream">on the record.</span>
                </h2>
                <div className="mt-5 md:mt-7">
                  {feed.length > 0 ? (
                    <PayoutFeed items={feed} shelterName={shelterName} target={target} />
                  ) : (
                    <p className={pending ? "motion-safe:animate-pulse" : ""}>
                      {pending ? "Reading payouts from the chain…" : "No payouts yet. The first one shows up here."}
                    </p>
                  )}
                </div>
              </section>
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

          {/* CLOSING CTA, like the landing's rescue hub. */}
          <section className={`${PANEL} flex flex-col items-center gap-5 text-center md:flex-row md:justify-between md:text-left`}>
            <div className="flex items-center gap-4">
              <PinkCat lick className="hidden h-36 w-36 -my-6 shrink-0 sm:block" />
              <div>
                <h2 className="font-primary text-h6 md:text-h5 uppercase leading-none text-white">
                  One tap. <span className="glow text-tt-cream">One treat.</span>
                </h2>
                <p className="mt-2 max-w-xl text-p5 md:text-p4 text-tt-cream/90">
                  {jarClosed
                    ? "The treat jar opens soon. Token Tails pays for every treat, and each one shows up on this page."
                    : "Token Tails pays for it, and it shows up on this page."}
                </p>
              </div>
            </div>
            <span className="md:mr-6">{ctaButton()}</span>
          </section>
        </div>
      </NightStage>
    </div>
  );
};

export default ShelterPayouts;
