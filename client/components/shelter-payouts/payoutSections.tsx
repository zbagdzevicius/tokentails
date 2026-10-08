// copy-lint: web-only shared sections of the web payouts page and the /impact embed; app builds render AppProofNotice (ShelterPayouts) or skip the embed (impact.tsx)
import { DonateStatus, SHELTER_API } from "@/api/shelter-api";
import { PixelButton } from "@/components/shared/PixelButton";
import NextLink from "next/link";
import { Dispatch, ReactNode, SetStateAction, useEffect, useState } from "react";
import { claimsDateLabel } from "./campaign";
import { ChainInfo, explorerAddress, explorerTx } from "./chains";
import { Disbursement, displayMemo, formatUnits, payoutUnit, to18 } from "./logs";
import {
  PayoutsUpdating,
  ShelterDeployment,
  deploymentToken,
  fetchDeployments,
  fetchNativeBalance,
  fetchTestnetDeployments,
  isTestnetDeployment,
  readErrorText,
  readPayouts,
  resolveChain,
} from "./rpc";
import { treatJarOpen } from "./treatChains";
import { CHIP, HEADLINE, Kicker, MEMO, PANEL, PILL, PinkCat } from "./ui";

// The pieces of /shelter-payouts that /impact shows too (the payouts feed, how it works, the give
// call to action) and the reads behind them, so both pages render the same code.

export const GIVE_URL = "/shelter-payouts/give";
// The Catnip Heist host page (task 4b); the old /heist/index.html redirects there.
export const HEIST_URL = "/heist";
export const IMPACT_URL = "/impact";

export type Result =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; items: Disbursement[]; updating?: PayoutsUpdating };

export type Page =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "done"; deployments: ShelterDeployment[] };


// Sum per symbol, in 18-decimal units, so Arc's native USDC (18 decimals) and ERC-20 USDC (6)
// add up while different coins never mix.
export function totalsBySymbol(
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

export const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;


/** Distinct chains in a deployment list: two contracts on one chain count once. */
export const chainCount = (deployments: Pick<ShelterDeployment, "chainId">[]) =>
  new Set(deployments.map((d) => d.chainId)).size;

/** Token symbols keep their case (pathUSD, mUSDC) inside the upper-case figure and chip styles. */
export const Sym = ({ children }: { children: ReactNode }) => <span className="normal-case">{children}</span>;


// Reads payouts and the contract balance of every deployment in a list, keyed by its index.
export function readDeployments(
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
    readPayouts(d)
      .then(({ items, updating }) => {
        if (!cancelled()) setResults((r) => ({ ...r, [i]: { status: "done", items, ...(updating ? { updating } : {}) } }));
      })
      .catch((err: unknown) => {
        if (!cancelled()) setResults((r) => ({ ...r, [i]: { status: "error", error: readErrorText(err) } }));
      });
  });
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

export const Addr = ({ explorer, value, kind }: { explorer?: string; value: string; kind: "address" | "tx" }) =>
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


export type Balance = { status: "loading" } | { status: "error" } | { status: "done"; wei: bigint };


/**
 * Tells apart contracts that share a chain and a payout coin (a redeploy: Base Sepolia USDC twice,
 * Avalanche Fuji USDC twice): "Deploy 1 of 2", "Deploy 2 of 2" in list order (the oldest first).
 * A contract alone on its chain and coin gets null; the coin chip already names the others.
 */
export function deployInstances(deployments: ShelterDeployment[]): (string | null)[] {
  const keyOf = (d: ShelterDeployment) => `${d.chainId}:${(resolveChain(d)?.symbol || "").toUpperCase()}`;
  const totals = new Map<string, number>();
  for (const d of deployments) totals.set(keyOf(d), (totals.get(keyOf(d)) || 0) + 1);
  const seen = new Map<string, number>();
  return deployments.map((d) => {
    const key = keyOf(d);
    const n = totals.get(key) || 1;
    const k = (seen.get(key) || 0) + 1;
    seen.set(key, k);
    return n > 1 ? `Deploy ${k} of ${n}` : null;
  });
}

export const chainLabel = (deployment: ShelterDeployment, chain: ChainInfo | null) =>
  `${chain?.name || `Chain ${deployment.chainId}`}${
    deployment.network && !(chain?.name || "").toLowerCase().includes(deployment.network.toLowerCase())
      ? ` ${deployment.network}`
      : ""
  }${
    // Two Arc cards differ only by coin: name the euro one in its title, not just in the chip.
    deploymentToken(deployment) === "EURC" ? " EURC" : ""
  }`;


export type FeedItem = { d: Disbursement; chain: ChainInfo | null; chainName: string; chainId: number };

/** The site's own receipt page for one payout transaction. */
export const receiptHref = (chainId: number, txHash: string) =>
  `/shelter-payouts/receipt?chain=${chainId}&tx=${txHash}`;

/** Every payout on every chain, newest block first within each chain. */
export const PayoutFeed = ({
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
    ? `${lead} From ${label} on, the USDC that comes in to the campaign wallet counts toward the goal: today, sponsored treats.`
    : `${lead} Payouts will start counting on ${label}.`;
}

/** Feed rows for a deployment list and its read results. */
export const feedItems = (deployments: ShelterDeployment[], results: Record<number, Result>): FeedItem[] =>
  deployments.flatMap((d, i) => {
    const r = results[i];
    if (r?.status !== "done") return [];
    const chain = resolveChain(d);
    return r.items.map((item) => ({ d: item, chain, chainName: chainLabel(d, chain), chainId: d.chainId }));
  });

/** "Oct 8, 11:50 UTC": when the index last read a contract the chain cannot be read for right now. */
export function indexedAtLabel(time: number): string {
  const d = new Date(time * 1000);
  if (!Number.isFinite(d.getTime())) return "";
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${d.getUTCDate()}, ${hh}:${mm} UTC`;
}

/** The small "updating" line of a contract shown from the index's last-known payouts. */
export const updatingText = (u: PayoutsUpdating): string => {
  const at = indexedAtLabel(u.time);
  return `Updating: payouts through ${at || `block ${u.block}`}. Newer ones may be missing; reload in a minute.`;
};

/** How many deployments in the list show the index's last-known payouts while their chain is busy. */
export const updatingCount = (deployments: unknown[], results: Record<number, Result>) =>
  deployments.filter((_, i) => {
    const r = results[i];
    return r?.status === "done" && !!r.updating;
  }).length;

/** True while any deployment in the list is still being read. */
export const stillReading = (deployments: unknown[], results: Record<number, Result>) =>
  deployments.some((_, i) => results[i]?.status !== "done" && results[i]?.status !== "error");

export interface PayoutsData {
  page: Page;
  results: Record<number, Result>;
  balances: Record<number, Balance>;
  /** The testnet proof: its own list and reads, never added to the mainnet figures. */
  testnet: ShelterDeployment[];
  tResults: Record<number, Result>;
  tBalances: Record<number, Balance>;
}

/**
 * Reads every mainnet deployment (and, unless `testnet: false`, the testnet proof list) from the
 * public RPCs: payouts and contract balances. One read per mount.
 */
export function usePayouts({ testnet: withTestnet = true }: { testnet?: boolean } = {}): PayoutsData {
  const [page, setPage] = useState<Page>({ status: "loading" });
  const [results, setResults] = useState<Record<number, Result>>({});
  const [balances, setBalances] = useState<Record<number, Balance>>({});
  const [testnet, setTestnet] = useState<ShelterDeployment[]>([]);
  const [tResults, setTResults] = useState<Record<number, Result>>({});
  const [tBalances, setTBalances] = useState<Record<number, Balance>>({});

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    Promise.all([
      fetchDeployments().then(
        (list) => ({ ok: true as const, list }),
        (err: Error) => ({ ok: false as const, error: err.message })
      ),
      withTestnet ? fetchTestnetDeployments() : Promise.resolve([] as ShelterDeployment[]),
    ]).then(([main, testList]) => {
      if (cancelled) return;
      // A testnet entry in the public list (e.g. the whole funding file copied over) moves to the
      // testnet section, so test money never shows up in the headline figures.
      const mainnet = main.ok ? main.list.filter((d) => !isTestnetDeployment(d)) : [];
      const seen = new Set(testList.map((d) => `${d.chainId}:${d.address.toLowerCase()}`));
      const tests = withTestnet
        ? [
            ...testList,
            ...(main.ok
              ? main.list.filter((d) => isTestnetDeployment(d) && !seen.has(`${d.chainId}:${d.address.toLowerCase()}`))
              : []),
          ]
        : [];
      setPage(main.ok ? { status: "done", deployments: mainnet } : { status: "error", error: main.error });
      setTestnet(tests);
      readDeployments(mainnet, setResults, setBalances, isCancelled);
      readDeployments(tests, setTResults, setTBalances, isCancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [withTestnet]);

  return { page, results, balances, testnet, tResults, tBalances };
}

/**
 * The treat jar (GET /shelter/donate/status): undefined while loading, null when the backend could
 * not be reached. `closed` once known and a treat cannot be sent now.
 */
export function useTreatJar(): { jar: DonateStatus | null | undefined; closed: boolean } {
  const [jar, setJar] = useState<DonateStatus | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    SHELTER_API.getDonateStatus().then((st) => !cancelled && setJar(st));
    return () => {
      cancelled = true;
    };
  }, []);
  // Open when any served network can take a treat now, not only the main chain (ux-1).
  return { jar, closed: jar !== undefined && !treatJarOpen(jar) };
}

/**
 * The give button. While the treat jar is closed, "SEND A TREAT" would lead to a disabled button, so
 * it points at the Heist instead (or, inside the Heist, says that the jar opens soon).
 */
export const TreatCta = ({
  jarClosed,
  embed = false,
  target,
  size,
}: {
  jarClosed: boolean;
  embed?: boolean;
  target?: string;
  size?: "md";
}) =>
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

/** The payouts feed panel: every mainnet payout, or the reading / empty line. */
export const FeedSection = ({
  feed,
  pending,
  shelterName,
  target,
  id,
}: {
  feed: FeedItem[];
  pending: boolean;
  shelterName: (addr: string) => string | null;
  target?: string;
  id?: string;
}) => (
  <section className={`${PANEL} scroll-mt-28`} id={id} data-testid="payouts-feed-section">
    <Kicker>Payouts feed</Kicker>
    <h2 className={HEADLINE}>
      Every treat, <span className="glow text-tt-cream">on the record.</span>
    </h2>
    <div className="mt-5 md:mt-7">
      {feed.length > 0 ? (
        <PayoutFeed items={feed} shelterName={shelterName} target={target} />
      ) : (
        <p className={pending ? "motion-safe:animate-pulse" : ""}>
          {pending ? "Reading payouts…" : "No payouts yet. The first one shows up here."}
        </p>
      )}
    </div>
  </section>
);

/** The steps, as on the Heist's payouts modal. */
export const HOW_IT_WORKS: readonly string[] = [
  // claim:fiction the first step is the in-game rescue, no money moves in the game itself
  "Free a shelter cat in Catnip Heist.",
  // claim: C-004, L-rail (the treat is Token Tails' own, and only while the rail is open)
  // Conditional, so it is true in every rail state (soon, paused, live, used up for today).
  "Tap the rescue treat: while treats are open, Token Tails sends Pink Paw a small treat in a stablecoin (USDC on most networks).",
  // claim: L-disbursed (every payout is a public chain event, listed here)
  "Every payout is a public chain event, listed here with a link to its transaction on the explorer.",

  // claim: C-001 (the goal counts the USDC that comes in to the campaign wallets; today, treats only)
  "The USDC that comes in to Pink Paw's wallet counts toward its goal: today, sponsored treats. Gifts, the match and x402 payments count once Pink Paw holds its own wallet.",
];

export const HowItWorks = ({ id }: { id?: string }) => (
  <section className={`${PANEL} scroll-mt-28`} id={id} data-testid="payouts-how">
    <Kicker>How it works</Kicker>
    <h2 className={HEADLINE}>
      From a heist <span className="glow text-tt-cream">to the shelter.</span>
    </h2>
    <ol className="mt-5 grid grid-cols-1 gap-3 md:mt-7 md:grid-cols-2 md:gap-4">
      {HOW_IT_WORKS.map((step, i) => (
        <li key={i} className="flex items-start gap-3 rounded-2xl border-2 border-tt-cream/40 bg-tt-night-900/70 p-3 md:p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-tt-gold-400 font-primary text-p3 leading-none text-tt-gold-400">
            {i + 1}
          </span>
          <span className="text-p5 md:text-p4 text-tt-cream/90">{step}</span>
        </li>
      ))}
    </ol>
  </section>
);

/** The closing call to action, like the landing's rescue hub. */
export const GiveCtaSection = ({
  jarClosed,
  embed = false,
  target,
}: {
  jarClosed: boolean;
  embed?: boolean;
  target?: string;
}) => (
  <section
    className={`${PANEL} flex flex-col items-center gap-5 text-center md:flex-row md:justify-between md:text-left`}
    data-testid="give-cta-section"
  >
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
    <span className="md:mr-6">
      <TreatCta jarClosed={jarClosed} embed={embed} target={target} />
    </span>
  </section>
);
