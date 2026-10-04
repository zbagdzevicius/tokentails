// copy-lint: web-only app builds render AppProofNotice instead (the isAppBuild gate in ShelterReceipt)
import { isAppBuild } from "@/components/claims/build";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Campaign, fetchCampaign } from "./campaign";
import { ChainInfo, chainDisplayName, explorerAddress, explorerTx } from "./chains";
import { displayMemo, formatUnits, payoutUnit } from "./logs";
import { DecodedReceipt, ROUTER_PATH, RouterGift, TX_HASH, fetchReceipt, isVerifiedMatch, receiptChain } from "./receipt";
import { giftSymbol } from "./giveMode";
import { MATCH_FINAL, MatchPair, getMatchByDonor } from "./relayApi";
import { RouterEntry, fetchRouters } from "./routers";
import { AppProofNotice } from "./AppProofNotice";
import { isPinkPawWallet } from "./pinkPaw";
import { PinkPawStrip } from "./PinkPawShowcase";
import { ShelterDeployment, fetchDeployments, fetchTestnetDeployments } from "./rpc";
import { downloadShareCard } from "./shareCard";
import { CARD, CHIP, FIGURE, MEMO, GOLD_BUTTON, Kicker, NightStage, PANEL, PILL } from "./ui";

type State =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "done"; receipt: DecodedReceipt; chain: ChainInfo; chainId: number };

const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;

/**
 * A router gift's amount: the router's token (its symbol, the chain's token decimals) on the signature
 * and flush paths, the native coin on the native path.
 */
export function giftAmountLabel(
  g: Pick<RouterGift, "amount" | "path">,
  chain: ChainInfo,
  router: Pick<RouterEntry, "symbol"> | null = null
): string {
  return g.path === ROUTER_PATH.NATIVE
    ? `${formatUnits(g.amount, chain.nativeDecimals ?? 18)} ${chain.nativeSymbol || "native"}`
    : `${formatUnits(g.amount, chain.decimals ?? 6)} ${giftSymbol(chain, router)}`;
}

/**
 * The match transaction, read from the chain: true once it succeeded and paid a listed split with the
 * memo naming this gift. Null while unread or unknown; the receipt says "matched" only on true.
 */
function useVerifiedMatch(
  chain: ChainInfo | null,
  chainId: number,
  matchTx: string | null,
  donorTx: string | null,
  deployments: ShelterDeployment[]
): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!chain || !matchTx || !donorTx) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const tick = async () => {
      try {
        const r = await fetchReceipt(chain, matchTx, deployments, chainId);
        if (cancelled) return;
        if (r) {
          setOk(isVerifiedMatch(r, donorTx));
          return;
        }
      } catch {
        /* the chain could not be read: try again below */
      }
      tries += 1;
      if (!cancelled && tries < 6) timer = setTimeout(tick, MATCH_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [chain, chainId, matchTx, donorTx, deployments]);
  return ok;
}

/** How often, and for how long, the receipt asks whether Token Tails matched a gift. */
export const MATCH_POLL_MS = 5_000;
export const MATCH_POLL_TRIES = 36;

/**
 * Polls GET /shelter/match/by-donor/:tx until the match is final. Null until the backend answers
 * (or when it cannot be reached): the receipt then shows nothing about a match.
 */
function useMatchPair(txHash: string | null): MatchPair | null {
  const [pair, setPair] = useState<MatchPair | null>(null);
  useEffect(() => {
    if (!txHash) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const tick = async () => {
      const p = await getMatchByDonor(txHash);
      if (cancelled) return;
      if (p) setPair(p);
      tries += 1;
      if (p && (MATCH_FINAL.has(p.status) || p.status === "none")) {
        // "none" can mean the match has not been queued yet: ask a few more times, then stop.
        if (p.status !== "none" || tries >= 4) return;
      }
      if (!p && tries >= 3) return;
      if (tries < MATCH_POLL_TRIES) timer = setTimeout(tick, MATCH_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [txHash]);
  return pair;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

// /shelter-payouts/receipt?chain=<id>&tx=<hash>: reads the transaction straight from the chain's
// public RPC. Nothing here comes from Token Tails' servers.
export const ShelterReceipt = () =>
  isAppBuild() ? <AppProofNotice title="Rescue receipt" /> : <WebShelterReceipt />;

const WebShelterReceipt = () => {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [routers, setRouters] = useState<RouterEntry[]>([]);
  const [listedSplits, setListedSplits] = useState<ShelterDeployment[]>([]);

  const chainId = Number(first(router.query.chain));
  const tx = first(router.query.tx);
  const badLink = router.isReady && (!Number.isInteger(chainId) || chainId <= 0 || !TX_HASH.test(tx));

  useEffect(() => {
    if (!router.isReady || badLink) return;
    let cancelled = false;
    fetchCampaign().then((c) => !cancelled && setCampaign(c)).catch(() => undefined);
    (async () => {
      let deployments: ShelterDeployment[] = [];
      try {
        deployments = await fetchDeployments();
      } catch {
        // Unlisted is shown per payout below; the receipt itself still loads.
      }
      try {
        // The testnet contracts are listed too: a testnet payout is a listed payout, in test tokens.
        deployments = [...deployments, ...(await fetchTestnetDeployments())];
      } catch {
        /* no testnet list */
      }
      const routerList = await fetchRouters();
      if (!cancelled) {
        setRouters(routerList);
        setListedSplits(deployments);
      }
      const chain = receiptChain(chainId, deployments);
      if (!chain) {
        if (!cancelled) setState({ status: "invalid", message: `Chain ${chainId} is not supported here.` });
        return;
      }
      try {
        const receipt = await fetchReceipt(chain, tx, deployments, chainId, routerList);
        if (cancelled) return;
        setState(receipt ? { status: "done", receipt, chain, chainId } : { status: "pending" });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, badLink, chainId, tx]);

  const shelterName = (addr: string) =>
    campaign?.shelter.wallet && campaign.shelter.wallet === addr.toLowerCase()
      ? campaign.shelter.name
      : null;

  const done = state.status === "done" ? state : null;
  const gifts = done?.receipt.gifts || [];
  // A flush memo is set by whoever calls flush first, so it is never shown, here or on its payouts.
  const flushed = gifts.some((g) => g.path === ROUTER_PATH.FLUSH);
  const listedGift = gifts.find((g) => g.listed) || null;
  // Only a listed router's gift is matched; never ask about anything else.
  const match = useMatchPair(done && done.receipt.success && listedGift ? done.receipt.txHash : null);
  const claimedMatch = match?.status === "confirmed" && match.matchTxHash ? match.matchTxHash : null;
  // The backend's word is not enough: the match transaction itself is read from the chain.
  const matchOnChain = useVerifiedMatch(done?.chain || null, done?.chainId || 0, claimedMatch, done?.receipt.txHash || null, listedSplits);
  const matched = !!claimedMatch && matchOnChain === true;
  const giftRouter = listedGift ? routers.find((r) => r.router.toLowerCase() === listedGift.router) || null : null;
  const testnetGift = !!giftRouter && giftRouter.network === "testnet";
  const testnetCard = !!done?.chain.testnet || testnetGift;

  return (
    <NightStage className="min-h-screen">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 pt-24 pb-16 text-p5 md:pt-32 md:text-p4">
        <Kicker>Read from the chain</Kicker>
        <h1 className="text-center font-primary uppercase leading-none tracking-tight text-h5 md:text-h2 text-white drop-shadow-lg">
          Rescue <span className="glow text-tt-cream">Receipt</span>
        </h1>

        {badLink && (
          <p className={`${PANEL} text-center`} role="alert">
            This receipt link is missing a chain or transaction hash.
          </p>
        )}
        {!badLink && state.status === "loading" && (
          <p className="motion-safe:animate-pulse">Reading the receipt from the chain…</p>
        )}
        {state.status === "invalid" && (
          <p className={`${PANEL} text-center`} role="alert">
            {state.message}
          </p>
        )}
        {state.status === "pending" && (
          <p className={`${PANEL} text-center`}>
            The transaction is not on the chain yet. Give it a few seconds, then refresh.
          </p>
        )}
        {state.status === "error" && (
          <p className={`${PANEL} text-center text-tt-rust`} role="alert">
            Could not read the receipt: {state.message}
          </p>
        )}

        {done && (
          <section className={`${PANEL} flex flex-col gap-4`} data-testid="receipt-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`${CHIP} ${done.receipt.success ? "!border-tt-mint !text-tt-mint" : "!border-tt-rust !text-tt-rust"}`}>
                {done.receipt.success ? "✓ Confirmed" : "✕ Failed"}
              </span>
              <span className="text-p6 md:text-p5 text-tt-cream/80">
                {chainDisplayName(done.chain)} · block <strong className="text-tt-cream">{done.receipt.blockNumber}</strong>
              </span>
            </div>
            {done.chain.testnet && !testnetGift && (
              <p
                className={`${CHIP} self-start !border-tt-mint !text-tt-mint`}
                data-testid="receipt-testnet"
              >
                Testnet · test coins, no real money
              </p>
            )}
            {gifts.map((g) => (
              <div key={`gift-${g.logIndex}`} className={`${CARD} flex flex-col gap-2`} data-testid="receipt-gift">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`${FIGURE} text-h5 md:text-h4`}>
                    {giftAmountLabel(g, done.chain, routers.find((r) => r.router.toLowerCase() === g.router) || null)}
                  </span>
                  <span className="font-primary uppercase text-p4 md:text-p3 text-tt-cream">
                    {g.path === ROUTER_PATH.FLUSH ? "forwarded by the router" : "wallet gift through the router"}
                  </span>
                  {testnetGift && <span className={`${CHIP} !border-tt-mint !text-tt-mint`}>Testnet · no real money</span>}
                </p>
                <p className="flex flex-wrap items-center gap-2 break-words">
                  Memo: <span className={MEMO}>{g.path === ROUTER_PATH.FLUSH ? "not shown (set by whoever forwarded it)" : g.memo || "—"}</span>
                </p>
                {!g.listed && (
                  <p className="text-tt-rust">Warning: this gift did not come through a listed DonateRouter.</p>
                )}
              </div>
            ))}
            {listedGift && match && (match.status === "pending" || match.status === "sent" || (claimedMatch && matchOnChain === null)) && (
              <p className="motion-safe:animate-pulse text-tt-cream/90" data-testid="receipt-match-pending">
                Token Tails is matching this gift…
              </p>
            )}
            {listedGift && matched && claimedMatch && (
              <p
                className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-tt-mint/80 bg-tt-mint/10 px-3 py-2 text-tt-cream"
                data-testid="receipt-match"
              >
                <span aria-hidden="true">🐾🐾</span>
                <strong>Token Tails matched it.</strong>
                <a
                  href={explorerTx(done.chain.explorer, claimedMatch)}
                  target="_blank"
                  rel="noopener noreferrer"
                  // The `code` role: a tx hash (plan F4, G14).
                  // eslint-disable-next-line tt/no-raw-font
                  className="font-mono normal-case underline decoration-dotted underline-offset-2"
                >
                  Match {short(claimedMatch)}
                </a>
                <NextLink
                  href={`/shelter-payouts/receipt?chain=${done.chainId}&tx=${claimedMatch}`}
                  className="underline"
                >
                  Match receipt ›
                </NextLink>
              </p>
            )}
            {done.receipt.payouts.length === 0 && <p>This transaction has no shelter payouts.</p>}
            <ul className="flex flex-col gap-3">
              {done.receipt.payouts.map((p) => {
                const unit = payoutUnit(p.kind, p.tokenSymbol ? { ...done.chain, symbol: p.tokenSymbol, decimals: p.tokenDecimals ?? done.chain.decimals } : done.chain);
                const name = shelterName(p.shelter);
                return (
                  <li key={p.logIndex} className={`${CARD} flex flex-col gap-2`}>
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`${FIGURE} text-h5 md:text-h4`}>
                        {formatUnits(p.amount, unit.decimals)} <span className="normal-case">{unit.symbol}</span>
                      </span>
                      <span className="font-primary uppercase text-p4 md:text-p3 text-tt-cream">
                        to{" "}
                        {name || (
                          // The `code` role: a shelter address, kept lowercase (plan F4, G14).
                          // eslint-disable-next-line tt/no-raw-font
                          <span className="font-mono normal-case">{short(p.shelter)}</span>
                        )}
                      </span>
                    </p>
                    <p className="text-tt-cream/85">
                      Shelter wallet:{" "}
                      <a
                        href={explorerAddress(done.chain.explorer, p.shelter)}
                        target="_blank"
                        rel="noopener noreferrer"
                        // The `code` role: a shelter address (plan F4, G14).
                        // eslint-disable-next-line tt/no-raw-font
                        className="font-mono underline decoration-dotted underline-offset-2 hover:text-tt-gold-400"
                      >
                        {short(p.shelter)}
                      </a>
                    </p>
                    <p className="flex flex-wrap items-center gap-2 break-words">
                      Memo: <span className={MEMO}>{flushed ? "not shown (forwarded by the router)" : displayMemo(p.memo) || "—"}</span>
                    </p>
                    {!p.listed && (
                      <p className="text-tt-rust">Warning: this log did not come from a listed ShelterSplit contract.</p>
                    )}
                    {name && (
                      <p className="text-p6 md:text-p5 text-tt-cream/75">
                        Wallet held by Token Tails on the shelter&apos;s behalf until handover.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              {done.receipt.success && done.receipt.payouts.some((p) => p.listed) && (
                <button
                  type="button"
                  className={GOLD_BUTTON}
                  onClick={() => {
                    const listed = done.receipt.payouts.filter((p) => p.listed);
                    const p = listed.find((x) => shelterName(x.shelter)) || listed[0];
                    const unit = payoutUnit(p.kind, p.tokenSymbol ? { ...done.chain, symbol: p.tokenSymbol, decimals: p.tokenDecimals ?? done.chain.decimals } : done.chain);
                    // One payout: the card shows the whole gift. Several shelters: only this shelter's share.
                    const whole = listedGift && listed.length === 1;
                    downloadShareCard({
                      shelterName: shelterName(p.shelter) || "a cat shelter",
                      amount: whole
                        ? giftAmountLabel(listedGift, done.chain, giftRouter)
                        : `${formatUnits(p.amount, unit.decimals)} ${unit.symbol}`,
                      testnet: testnetCard,
                      chainName: chainDisplayName(done.chain),
                      blockNumber: done.receipt.blockNumber,
                      txHash: done.receipt.txHash,
                      variant: listedGift ? (matched ? "matched" : "gift") : "treat",
                    });
                  }}
                >
                  {matched ? "Share card: 1 became 2" : "Download share card"}
                </button>
              )}
              <a
                href={explorerTx(done.chain.explorer, done.receipt.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className={PILL}
              >
                Verify on explorer ›
              </a>
            </div>
          </section>
        )}

        <NextLink href={done?.chain.testnet ? "/shelter-payouts#testnet-proof" : "/shelter-payouts"} className={PILL}>
          {done?.chain.testnet ? "See every testnet payout ›" : "See every payout ›"}
        </NextLink>

        {/* Only when a payout in this receipt went to Pink Paw's own wallet: its logo and cats. */}
        {done && campaign && done.receipt.payouts.some((p) => isPinkPawWallet(p.shelter)) && (
          <div className="mt-6 w-full">
            <PinkPawStrip name={campaign.shelter.name} title="The cats behind this receipt" />
          </div>
        )}
      </div>
    </NightStage>
  );
};

export default ShelterReceipt;
