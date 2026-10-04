// copy-lint: web-only rendered only by the web ShelterPayouts (app builds show AppProofNotice)
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Celebration } from "./Celebration";
import { ChainPicker } from "./ChainPicker";
import { ChainInfo, explorerTx } from "./chains";
import { FACT, factLine } from "./factLine";
import { GOAL_REFRESH_EVENT } from "./goal";
import { GiveRail, feeCoin, isExtraCoinRail, railKey, railStepsLine, railSummary } from "./giveRails";
import {
  GiveMode,
  ONBOARD_URL,
  TOKEN_TAILS_HELD_WALLETS,
  faucetFor,
  giftSymbol,
  giveAmounts,
  matchMeterCopy,
  payeeLabel,
  shortShelterName,
} from "./giveMode";
import { MatchStatus, getClaim, getMatchStatus, getRelayStatus } from "./relayApi";
import type { RouterEntry } from "./routers";
import { rpcCall } from "./rpc";
import { downloadShareCard } from "./shareCard";
import { CARD, CHIP, GOLD_BUTTON, PILL } from "./ui";
import {
  CustodyGuard,
  Eip1193,
  GiveResult,
  RelayRefusedError,
  RevertedError,
  SignedGift,
  SmartAccountError,
  SplitStep,
  findSettledGift,
  getInjectedProvider,
  giveNative,
  giveNativeToSplit,
  giveToSplit,
  isUsdcNative,
  readPayoutWallets,
  readSplitPayoutWallets,
  selfSubmitGift,
  signAndGive,
  signedGiftExpired,
  waitForReceipt,
  walletErrorMessage,
} from "./wallet";

export { walletGiveMode, shortShelterName } from "./giveMode";

type State =
  | { status: "idle" }
  | { status: "busy"; step: string }
  | { status: "sent"; result: GiveResult; amount: string; blockNumber: number | null }
  | { status: "relay-refused"; message: string; signed: SignedGift; amount: string }
  | { status: "error"; message: string; smartAccount?: boolean };

/**
 * The button label: imperative, with the receiver (copy rule R3). `to` is the shelter when the split
 * pays one wallet, "N shelters" when it pays several, and null while the list is unread.
 */
// claim: fiction a button label (the donor's own action), not an impact figure
export const giveLabel = (amount: string, to: string | null, symbol = "USDC") =>
  to ? `Give ${amount} ${symbol} to ${to}` : `Give ${amount} ${symbol}`;

/** The chain's public RPC as the `rpc` function findSettledGift takes. */
const publicRpc =
  (chain: ChainInfo) =>
  <T,>(method: string, params: unknown[]) =>
    rpcCall<T>(chain.rpc, method, params);

/** A read-only EIP-1193 view of the chain's public RPC (no wallet needed to read the payout list). */
const readOnlyProvider = (chain: ChainInfo): Eip1193 => ({
  request: ({ method, params }) => rpcCall(chain.rpc, method, params || []),
});

/**
 * Whether a signed gift was paid by another transaction (front-run, or broadcast before the answer was
 * lost): the relay's record first, then the chain itself. Null when nothing paid it.
 */
async function settledBy(chain: ChainInfo, signed: SignedGift, relayTx: string | null): Promise<string | null> {
  if (relayTx) {
    const st = await getRelayStatus(relayTx);
    if (st?.settledTxHash) return st.settledTxHash;
  }
  try {
    return await findSettledGift(publicRpc(chain), signed);
  } catch {
    return null;
  }
}

/**
 * One network the block can give on (giveRails.GiveRail): a listed router, or the chain's ShelterSplit
 * when there is no router or its token has no EIP-3009.
 */
export type WalletChoice = GiveRail;

/** The one-chain block of a caller that passes no choices: a router rail from its props. */
const routerRail = (chainId: number, chain: ChainInfo | null, router: RouterEntry | null): GiveRail | null =>
  chain && router
    ? {
        chainId,
        chain,
        network: router.network,
        path: "router",
        router,
        split: null,
        symbol: router.symbol || chain.symbol,
        memo32: false,
        native: isUsdcNative(chain),
      }
    : null;

/**
 * The relay and match status for one chain (GET /shelter/match/status?chainId=). Null until read, or
 * when the backend cannot be reached: the block then never promises a paid fee or a match.
 */
function useChainStatus(chainId: number, active: boolean): MatchStatus | null {
  // Keyed by chain: after a network switch the previous chain's answer is never shown for the new one.
  const [read, setRead] = useState<{ chainId: number; status: MatchStatus | null } | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getMatchStatus(chainId).then((m) => !cancelled && setRead({ chainId, status: m }));
    return () => {
      cancelled = true;
    };
  }, [chainId, active]);
  return active && read?.chainId === chainId ? read.status : null;
}

export const WalletDonate = ({
  mode,
  chainId,
  chain,
  router,
  shelterName,
  choices = [],
}: {
  mode: GiveMode;
  chainId: number;
  chain: ChainInfo | null;
  router: RouterEntry | null;
  shelterName: string;
  /** Every network the donor may pick (the six chains that have a wallet path); `chainId` is the default. */
  choices?: WalletChoice[];
}) => {
  // railKey of the picked option: the chain id, or "<chainId>-EURC" for a second coin's router.
  const [picked, setPicked] = useState<string | null>(null);
  const headingId = useId();
  const short = shortShelterName(shelterName);
  // The picked chain, else the default (the campaign chain, or NEXT_PUBLIC_WALLET_DONATE_CHAIN).
  const active =
    (picked !== null && choices.find((c) => railKey(c) === picked)) ||
    choices.find((c) => c.chainId === chainId && !isExtraCoinRail(c)) ||
    choices.find((c) => c.chainId === chainId) ||
    choices[0] ||
    null;
  const activeId = active ? active.chainId : chainId;
  const activeKey = active ? railKey(active) : String(chainId);
  const status = useChainStatus(activeId, mode === "mainnet" || mode === "testnet");

  if (mode === "hidden") return null;

  if (mode === "awaiting-handover") {
    return (
      <section className={`${CARD} flex flex-col gap-2 text-p5`} data-testid="wallet-donate-awaiting" aria-labelledby={headingId}>
        <h3 id={headingId} className="font-primary uppercase text-p3 md:text-p2 leading-none text-tt-cream">
          Give from your wallet
        </h3>
        <p className="text-tt-cream" data-testid="wallet-donate-awaiting-copy">
          <span aria-hidden="true">🔑 </span>
          Opens when {short} holds its own key.
        </p>
        <p className="text-tt-cream/80">
          Until then the shelter&apos;s wallet is held by Token Tails, so there is no public button: a gift from
          your wallet should only ever land in a wallet the shelter controls.
        </p>
        <Link href={ONBOARD_URL} className={`${PILL} mt-2 self-start`} data-testid="wallet-donate-onboard-link">
          How the handover works ›
        </Link>
      </section>
    );
  }

  const rail = active || routerRail(chainId, chain, router);
  if (!rail) return null;
  const testnet = mode === "testnet";
  const meter = matchMeterCopy(status, factLine(FACT.matchCap));
  const relayLiveFor = (id: number) => !!status && status.chainId === id && status.relay;
  // The relay and the match serve the chain's own router only, never a second coin's (EURC) router.
  const extraCoin = isExtraCoinRail(rail);

  return (
    <section
      className={`${CARD} relative flex flex-col gap-2 text-p5 ${testnet ? "!border-dashed !border-tt-mint/80" : ""}`}
      data-testid={testnet ? "wallet-donate-testnet" : "wallet-donate"}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-primary uppercase text-p3 md:text-p2 leading-none text-tt-cream">
          {testnet ? "Try it live" : "Give from your wallet"}
        </h3>
        {testnet && (
          <span className={`${CHIP} !border-tt-mint !text-tt-mint`} data-testid="testnet-badge">
            Testnet
          </span>
        )}
      </div>
      {choices.length > 1 && (
        <ChainPicker rails={choices} value={activeKey} onChange={setPicked} relayLive={relayLiveFor} />
      )}
      {/* What the picked chain is for and what the giver spends there, in plain words. */}
      <p className="text-tt-cream/85" data-testid="wallet-chain-summary">
        {railSummary(rail, relayLiveFor(activeId) && !extraCoin)}
      </p>
      {/* The match meter only next to the chain the backend's match serves. */}
      {meter && status?.chainId === activeId && !extraCoin && (
        <p className={`${CHIP} self-start !normal-case`} data-testid="match-meter">
          <span aria-hidden="true">🐾🐾</span> {meter}
        </p>
      )}
      <GiveBlock
        key={activeKey}
        mode={mode}
        chainId={activeId}
        chain={rail.chain}
        rail={rail}
        shelterName={shelterName}
        relayStatus={status}
      />
    </section>
  );
};

/** The amounts, the button and the outcome for one chain; remounted when the donor picks another. */
const GiveBlock = ({
  mode,
  chainId,
  chain,
  rail,
  shelterName,
  relayStatus,
}: {
  mode: GiveMode;
  chainId: number;
  chain: ChainInfo;
  rail: GiveRail;
  shelterName: string;
  relayStatus: MatchStatus | null;
}) => {
  const router = rail.router;
  const amounts = giveAmounts(mode);
  const [amount, setAmount] = useState(amounts[1]);
  const [state, setState] = useState<State>({ status: "idle" });
  // A gift lands in the shelter wallet: tell the page's goal meter to read the wallet again (open
  // issue 2 in docs/plans/donations-STATUS.md), once now and once after the next blocks.
  useEffect(() => {
    if (state.status !== "sent") return;
    const ping = () => window.dispatchEvent(new Event(GOAL_REFRESH_EVENT));
    const timers = [window.setTimeout(ping, 1500), window.setTimeout(ping, 12000)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [state.status]);
  const [payees, setPayees] = useState<number | null>(null);
  const [custody, setCustody] = useState<CustodyGuard | null>(null);
  const short = shortShelterName(shelterName);
  const routerAddress = router?.router || null;
  const splitAddress = rail.split;
  const rpcUrl = chain.rpc;

  // Who the split pays right now, read from the chain: the button names one shelter or "N shelters".
  useEffect(() => {
    if ((!routerAddress && !splitAddress) || !rpcUrl || (mode !== "mainnet" && mode !== "testnet")) return;
    let cancelled = false;
    const eth = readOnlyProvider({ rpc: rpcUrl } as ChainInfo);
    const probe = BigInt("1000000000000000000");
    (routerAddress ? readPayoutWallets(eth, routerAddress, probe) : readSplitPayoutWallets(eth, splitAddress as string, probe))
      .then((w) => !cancelled && setPayees(w.length))
      .catch(() => !cancelled && setPayees(null));
    return () => {
      cancelled = true;
    };
  }, [routerAddress, splitAddress, rpcUrl, mode]);

  // Real money: the wallets the shelter claimed and Token Tails registered on this chain.
  useEffect(() => {
    if (mode !== "mainnet") return;
    let cancelled = false;
    getClaim().then((c) => {
      if (cancelled) return;
      // The claim is a personal_sign by the shelter's own key (an EOA), which is the same wallet on
      // every chain; the guard still reads this chain's payout list before anything is signed.
      setCustody(
        c && c.status === "rotated" ? { shelterWallets: [c.wallet], heldWallets: [...TOKEN_TAILS_HELD_WALLETS] } : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mode, chainId]);

  const testnet = mode === "testnet";
  // A second coin's router (EURC on Arc) is never a native gift: the native coin is USDC.
  const native = isUsdcNative(chain) && rail.native;
  const symbol = router ? giftSymbol(chain, router) : rail.symbol;
  const to = payeeLabel(payees, short);
  const busy = state.status === "busy";
  const sent = state.status === "sent";
  // The gas relay serves this chain only when the backend says so for this very chain id.
  const relayLive = !!relayStatus && relayStatus.chainId === chainId && relayStatus.relay && !isExtraCoinRail(rail);
  // Without the relay, Arc's one-transaction native gift is the simpler path (one confirm, not two).
  // Without a router: Arc's native gift into the split, else approve + disburse.
  const primary: "sign" | "native" | "split" =
    rail.path === "split" ? (native ? "native" : "split") : relayLive || !native ? "sign" : "native";

  const finish = async (eth: Eip1193, result: GiveResult, amt: string, signed: SignedGift | null) => {
    setState({ status: "busy", step: "Waiting for the block…" });
    let blockNumber: number | null = null;
    try {
      const receipt = await waitForReceipt(eth, result.txHash, { timeoutMs: 90_000 });
      blockNumber = receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : null;
    } catch (err) {
      // A slow block is not a failure: the receipt page keeps reading the chain. A revert is, unless
      // another transaction paid the same signed gift first (then the money did move).
      if (err instanceof RevertedError) {
        const other = signed ? await settledBy(chain, signed, result.txHash) : null;
        if (other) {
          setState({ status: "sent", result: { ...result, txHash: other, relayed: false }, amount: amt, blockNumber: null });
          return;
        }
        setState({ status: "error", message: walletErrorMessage(err) });
        return;
      }
    }
    setState({ status: "sent", result, amount: amt, blockNumber });
  };

  const splitStep = (s: SplitStep) =>
    setState({
      status: "busy",
      step: s === "check" ? "Checking the gift…" : s === "approve" ? `Allow ${symbol} in your wallet (1 of 2)…` : "Confirm the gift in your wallet…",
    });

  const run = async (how: "sign" | "native" | "split" | "self") => {
    const eth = getInjectedProvider();
    if (!eth) {
      setState({
        status: "error",
        message: testnet
          ? `No browser wallet found. Any wallet that can add ${chain.name} works.`
          : "No browser wallet found. Open this page in a wallet's browser, or install one.",
      });
      return;
    }
    const amt = how === "self" && state.status === "relay-refused" ? state.amount : amount;
    let signed: SignedGift | null = null;
    try {
      let result: GiveResult;
      if (how === "self" && state.status === "relay-refused") {
        signed = state.signed;
        setState({ status: "busy", step: "Confirm in your wallet…" });
        result = await selfSubmitGift(eth, chain, state.signed);
      } else if (how === "native" && rail.path === "split" && splitAddress) {
        setState({ status: "busy", step: "Confirm in your wallet…" });
        result = await giveNativeToSplit({ provider: eth, chainId, chain, split: splitAddress, amount: amt, custody });
      } else if (how === "split" && splitAddress) {
        result = await giveToSplit({
          provider: eth,
          chainId,
          chain,
          split: splitAddress,
          amount: amt,
          symbol,
          memo32: rail.memo32,
          custody,
          onStep: splitStep,
        });
      } else if (!router) {
        throw new Error("No way to give on this network yet.");
      } else if (how === "native") {
        setState({ status: "busy", step: "Confirm in your wallet…" });
        result = await giveNative({ provider: eth, chainId, chain, router: router.router, amount: amt, custody });
      } else {
        setState({ status: "busy", step: "Sign in your wallet…" });
        result = await signAndGive({
          provider: eth,
          chainId,
          chain,
          router: router.router,
          usdc: router.usdc,
          amount: amt,
          custody,
          // The relay does not serve this chain: skip the round trip and offer the self-submit at once.
          ...(relayLive
            ? {}
            : {
                relay: async () => ({
                  ok: false as const,
                  code: "RELAY_WRONG_CHAIN",
                  message: `Token Tails is not paying network fees on ${chain.name} right now.`,
                  httpStatus: null,
                }),
              }),
        });
      }
      await finish(eth, result, amt, signed);
    } catch (err) {
      if (err instanceof RelayRefusedError) {
        // No answer from the relay (code null): it may have broadcast the gift before the answer was
        // lost. Check the chain before offering to send it again.
        if (err.code === null) {
          setState({ status: "busy", step: "Checking the network…" });
          const other = await settledBy(chain, err.signed, null);
          if (other) {
            setState({ status: "sent", result: { txHash: other, from: err.signed.auth.from, memo: err.signed.auth.memo, relayed: true }, amount: amt, blockNumber: null });
            return;
          }
        }
        setState({ status: "relay-refused", message: err.message, signed: err.signed, amount: amt });
        return;
      }
      setState({ status: "error", message: walletErrorMessage(err), smartAccount: err instanceof SmartAccountError });
    }
  };

  const gasless = factLine(FACT.gaslessGive);
  const guard = factLine(FACT.routerGuard);
  const receiptHref = (tx: string) => `/shelter-payouts/receipt?chain=${chainId}&tx=${tx}`;
  const expired = state.status === "relay-refused" && signedGiftExpired(state.signed);
  // Circle's faucet serves only some testnets; the self-submit fee is paid in the chain's gas coin.
  const faucet = faucetFor(chainId);
  const fee = feeCoin(chain);

  return (
    <>
      {testnet && (
        <p className="text-tt-cream" data-testid="testnet-label">
          Test {symbol}, no real money.
          {faucet ? (
            <>
              {" "}Get some free from the{" "}
              <a href={faucet} target="_blank" rel="noopener noreferrer" className="underline">
                Circle faucet
              </a>{" "}
              ({chain.name}).
            </>
          ) : (
            <> ({chain.name})</>
          )}
        </p>
      )}
      <p className="text-tt-cream/80" data-testid="wallet-give-how">
        {railStepsLine(rail, primary)}
      </p>
      {/* Wallet-giving claims come only from published facts, and the gasless one only where the relay serves. */}
      {gasless && relayLive && <p className="text-tt-cream/80" data-testid="fact-gasless">{gasless}</p>}
      {guard && <p className="text-tt-cream/80" data-testid="fact-router-guard">{guard}</p>}

      <fieldset className="mt-3 flex flex-wrap items-center gap-2" disabled={busy || sent}>
        <legend className="sr-only">Amount in {symbol}</legend>
        {amounts.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAmount(a)}
            aria-pressed={amount === a}
            className={`${CHIP} min-h-11 px-3 ${amount === a ? "!bg-tt-cream !text-tt-gold-ink" : ""}`}
          >
            {a} {symbol}
          </button>
        ))}
      </fieldset>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => run(primary)}
          disabled={busy || sent}
          className={GOLD_BUTTON}
          data-testid="wallet-give"
        >
          {busy ? state.step : giveLabel(amount, to, symbol)}
        </button>
        {native && router && primary === "sign" && !busy && !sent && (
          <button
            type="button"
            onClick={() => run("native")}
            className="min-h-11 text-p5 text-tt-cream/85 underline decoration-dotted underline-offset-4 hover:text-tt-gold-400"
            data-testid="wallet-give-native"
          >
            Or send it as one transaction
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {busy ? state.step : sent ? "Gift confirmed." : ""}
      </p>

      {state.status === "relay-refused" && (
        <div className="mt-3 flex flex-col gap-2" role="alert" data-testid="relay-refused">
          <p className="text-tt-cream">{state.message}</p>
          {expired ? (
            <>
              <p className="text-tt-cream/85">The signature has expired, so sending it now would fail. Sign a fresh one.</p>
              <button type="button" onClick={() => run("sign")} className={`${PILL} self-start`}>
                Sign again
              </button>
            </>
          ) : (
            <>
              <p className="text-tt-cream/85" data-testid="relay-refused-fee">
                You can still send the same signed gift yourself. Your wallet then pays a small network fee in{" "}
                {fee} on {chain.name}, so it needs a little {fee} first.
              </p>
              <button type="button" onClick={() => run("self")} className={`${PILL} self-start`} data-testid="relay-self-submit">
                Send it from my wallet (I pay the fee in {fee})
              </button>
            </>
          )}
        </div>
      )}

      {state.status === "sent" && (
        <div className="mt-3 flex flex-col gap-3" data-testid="wallet-give-sent">
          <Celebration />
          <p className="text-tt-cream">
            <strong>Thank you!</strong>{" "}
            {state.blockNumber !== null
              ? `${state.amount} ${symbol} reached ${to || "the shelters"} in that transaction.`
              : `${state.amount} ${symbol} is on its way to ${to || "the shelters"}; the receipt shows it once the block lands.`}
            {state.result.relayed ? " Token Tails paid the network fee." : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={receiptHref(state.result.txHash)} className={PILL} data-testid="wallet-give-receipt">
              Your receipt ›
            </Link>
            <a
              href={explorerTx(chain.explorer, state.result.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View on explorer
            </a>
            {state.blockNumber !== null && payees === 1 && (
              <button
                type="button"
                className="underline"
                onClick={() =>
                  downloadShareCard({
                    shelterName,
                    amount: `${state.amount} ${symbol}`,
                    chainName: chain.name,
                    blockNumber: state.blockNumber as number,
                    txHash: state.result.txHash,
                    variant: "gift",
                    testnet,
                  })
                }
              >
                Download share card
              </button>
            )}
            <button
              type="button"
              className="underline"
              onClick={() => setState({ status: "idle" })}
              data-testid="wallet-give-again"
            >
              Give again
            </button>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <p className="mt-3 text-tt-rust" role="alert" data-testid="wallet-give-error">
          {state.message}
          {state.smartAccount && native && router ? " Use “Or send it as one transaction” instead." : ""}
        </p>
      )}
    </>
  );
};

export default WalletDonate;
