// copy-lint: web-only rendered only by the web ShelterPayouts (app builds show AppProofNotice)
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Celebration } from "./Celebration";
import { ChainInfo, explorerTx } from "./chains";
import { FACT, factLine } from "./factLine";
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
  findSettledGift,
  getInjectedProvider,
  giveNative,
  isUsdcNative,
  readPayoutWallets,
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

/** One network the try-it block can give on: a listed testnet router and its chain settings. */
export interface WalletChoice {
  chainId: number;
  chain: ChainInfo;
  router: RouterEntry;
}

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
  /** Try-it only: every testnet the donor may pick, the default one first. */
  choices?: WalletChoice[];
}) => {
  const [picked, setPicked] = useState<number | null>(null);
  const headingId = useId();
  const pickerId = useId();
  const short = shortShelterName(shelterName);
  const active = (picked !== null && choices.find((c) => c.chainId === picked)) || null;
  const activeId = active ? active.chainId : chainId;
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

  const useChain = active ? active.chain : chain;
  const useRouter = active ? active.router : router;
  if (!useChain || !useRouter) return null;
  const testnet = mode === "testnet";
  const meter = matchMeterCopy(status, factLine(FACT.matchCap));

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
      {testnet && choices.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={pickerId} className="text-tt-cream/85">
            Network
          </label>
          <select
            id={pickerId}
            value={activeId}
            onChange={(e) => setPicked(Number(e.target.value))}
            className="min-h-11 rounded-lg border-2 border-tt-cream/60 bg-tt-night-950 px-2 text-tt-cream"
            data-testid="wallet-network"
          >
            {choices.map((c) => (
              <option key={c.chainId} value={c.chainId}>
                {c.chain.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* The match meter only next to the chain the backend's match serves. */}
      {meter && status?.chainId === activeId && (
        <p className={`${CHIP} self-start !normal-case`} data-testid="match-meter">
          <span aria-hidden="true">🐾🐾</span> {meter}
        </p>
      )}
      <GiveBlock
        key={activeId}
        mode={mode}
        chainId={activeId}
        chain={useChain}
        router={useRouter}
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
  router,
  shelterName,
  relayStatus,
}: {
  mode: GiveMode;
  chainId: number;
  chain: ChainInfo;
  router: RouterEntry;
  shelterName: string;
  relayStatus: MatchStatus | null;
}) => {
  const amounts = giveAmounts(mode);
  const [amount, setAmount] = useState(amounts[1]);
  const [state, setState] = useState<State>({ status: "idle" });
  const [payees, setPayees] = useState<number | null>(null);
  const [custody, setCustody] = useState<CustodyGuard | null>(null);
  const short = shortShelterName(shelterName);
  const routerAddress = router.router;
  const rpcUrl = chain.rpc;

  // Who the split pays right now, read from the chain: the button names one shelter or "N shelters".
  useEffect(() => {
    if (!routerAddress || !rpcUrl || (mode !== "mainnet" && mode !== "testnet")) return;
    let cancelled = false;
    readPayoutWallets(readOnlyProvider({ rpc: rpcUrl } as ChainInfo), routerAddress, BigInt("1000000000000000000"))
      .then((w) => !cancelled && setPayees(w.length))
      .catch(() => !cancelled && setPayees(null));
    return () => {
      cancelled = true;
    };
  }, [routerAddress, rpcUrl, mode]);

  // Real money: the wallets the shelter claimed and Token Tails registered on this chain.
  useEffect(() => {
    if (mode !== "mainnet") return;
    let cancelled = false;
    getClaim().then((c) => {
      if (cancelled) return;
      setCustody(
        c && c.status === "rotated" && c.chainId === chainId
          ? { shelterWallets: [c.wallet], heldWallets: [...TOKEN_TAILS_HELD_WALLETS] }
          : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mode, chainId]);

  const testnet = mode === "testnet";
  const native = isUsdcNative(chain);
  const symbol = giftSymbol(chain, router);
  const to = payeeLabel(payees, short);
  const busy = state.status === "busy";
  const sent = state.status === "sent";
  // The gas relay serves this chain only when the backend says so for this very chain id.
  const relayLive = !!relayStatus && relayStatus.chainId === chainId && relayStatus.relay;
  // Without the relay, Arc's one-transaction native gift is the simpler path (one confirm, not two).
  const primary: "sign" | "native" = relayLive || !native ? "sign" : "native";

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

  const run = async (how: "sign" | "native" | "self") => {
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
  const feeCoin = chain.nativeSymbol || (chain.balanceToken ? "USD" : "ETH");

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
        {primary === "sign" ? "Sign once in your wallet." : "One transaction from your wallet."}
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
        {native && primary === "sign" && !busy && !sent && (
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
                {feeCoin} on {chain.name}, so it needs a little {feeCoin} first.
              </p>
              <button type="button" onClick={() => run("self")} className={`${PILL} self-start`} data-testid="relay-self-submit">
                Send it from my wallet (I pay the fee in {feeCoin})
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
          {state.smartAccount && native ? " Use “Or send it as one transaction” instead." : ""}
        </p>
      )}
    </>
  );
};

export default WalletDonate;
