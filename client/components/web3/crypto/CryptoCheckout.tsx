// copy-lint: web-only the crypto checkout renders only in WebPayment, which app builds replace with AppCheckoutNotice
"use client";

import { PixelButton } from "@/components/shared/PixelButton";
import { getInjectedProvider } from "@/components/shelter-payouts/wallet";
import type { Eip1193 } from "@/components/shelter-payouts/wallet";
import { IMessage } from "@/models/cats";
import { CryptoPayConfig, CryptoPayConfirmResult, CryptoPayOption, CryptoPayOrder, CryptoPaySku, CryptoPayToken } from "@/models/crypto-pay";
import clsx from "clsx";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CRYPTO_PAY_API, CryptoPayApiError } from "./api";
import {
  ConfirmProgress,
  PendingPayment,
  WalletStage,
  clearPending,
  MIN_SECONDS_TO_PAY,
  configTokens,
  confirmUntilSettled,
  errorMessage,
  eurcNote,
  explorerTxUrl,
  isTxHash,
  loadPending,
  mmss,
  networkChoices,
  payWithWallet as sendFromWallet,
  paymentUri,
  pendingPayment,
  pickOption,
  quoteAmount,
  savePending,
  secondsLeft,
  shortHex,
  skuKey,
} from "./checkout";
import { chainIcon, tokenIcon } from "./icons";
import { PaymentQr } from "./PaymentQr";
import { serverPriceUsd } from "./useCryptoPayConfig";

type Phase =
  | { kind: "loading" }
  | { kind: "closed"; reason: string }
  | { kind: "pick" }
  | { kind: "creating" }
  | { kind: "order" }
  | { kind: "paying"; stage: WalletStage }
  | {
      kind: "confirming";
      txHash: string;
      chainId: number;
      progress: ConfirmProgress | null;
    }
  | {
      kind: "done";
      result: CryptoPayConfirmResult;
      txHash: string;
      chainId: number;
    }
  | { kind: "expired" };

export interface CryptoCheckoutProps {
  sku: CryptoPaySku;
  /** The price shown before the server prices the order (the order's price is what is charged). */
  priceUsd: number;
  discount?: string;
  onSuccess?: (response: IMessage) => void;
  /** True while a payment is being sent or confirmed (the host locks its close). */
  onProcessingChange?: (processing: boolean) => void;
  /** Tests inject a provider; the page reads window.ethereum. */
  provider?: Eip1193 | null;
}

const BOX =
  "rounded-2xl border-4 border-tt-gold-500 bg-gradient-to-b from-tt-night-700/95 to-tt-night-800/95 p-4 text-tt-cream shadow-[0_6px_0_rgb(var(--tt-night-950))]";
const LABEL = "font-primary text-p6 md:text-p5 uppercase tracking-wide text-tt-gold-400";
const NOTE = "font-sans text-p5 text-tt-cream/85";
const LINK =
  "underline decoration-tt-gold-400/60 underline-offset-4 hover:text-tt-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-gold-400 rounded";

const CHOICE =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-tt-cream/40 bg-tt-night-900/70 px-3 py-2 font-primary text-p5 uppercase tracking-wide text-tt-cream transition peer-checked:border-tt-gold-400 peer-checked:bg-tt-gold-400 peer-checked:text-tt-gold-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tt-cream hover:border-tt-gold-400 peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

function Choices<T extends string | number>({
  legend,
  name,
  value,
  items,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  value: T | null;
  items: { value: T; label: ReactNode; hint?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className={clsx(LABEL, "mb-2")}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <label key={String(item.value)} className="relative">
            <input type="radio" name={name} className="peer sr-only" checked={value === item.value} onChange={() => onChange(item.value)} />
            <span className={CHOICE}>
              {item.label}
              {item.hint && <span className="text-p6 normal-case opacity-80">{item.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Decorative brand mark; the visible name next to it is the label. */
const Mark = ({ src, size = 22, testId }: { src: string; size?: number; testId?: string }) => (
  <img src={src} alt="" aria-hidden="true" width={size} height={size} data-testid={testId} className="shrink-0 rounded-full" draggable={false} />
);

const NetworkLabel = ({ chainId, name, testnet }: { chainId: number; name: string; testnet?: boolean }) => (
  <span className="inline-flex items-center gap-2">
    <Mark src={chainIcon(chainId)} testId={`crypto-pay-chain-icon-${chainId}`} />
    <span>{name}</span>
    {/* CSS text, so the radio's name stays the network name ("Arc Testnet" already says it). */}
    {testnet && (
      <span
        aria-hidden="true"
        data-testid="crypto-pay-test-tag"
        className="rounded border border-current px-1 text-[0.6rem] leading-tight opacity-80 after:content-['TEST']"
      />
    )}
  </span>
);

const TokenLabel = ({ symbol }: { symbol: string }) => (
  <span className="inline-flex items-center gap-2 normal-case">
    <Mark src={tokenIcon(symbol)} size={20} testId={`crypto-pay-token-icon-${symbol}`} />
    <span>{symbol}</span>
  </span>
);

const CopyRow = ({ label, value, display, testId }: { label: string; value: string; display?: ReactNode; testId?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-tt-cream/30 bg-tt-night-950/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className={LABEL}>{label}</div>
        <div data-testid={testId} className="break-all font-sans text-p5 font-bold text-tt-cream">
          {display ?? value}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="min-h-11 min-w-16 shrink-0 rounded-lg border-2 border-tt-gold-400/70 px-2 font-primary text-p6 uppercase text-tt-gold-400 hover:bg-tt-gold-400 hover:text-tt-gold-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tt-cream"
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
};

const stageText = (stage: WalletStage): string => {
  if (stage.kind === "connecting") return "Open your wallet: approve the connection and the network switch.";
  if (stage.kind === "checking") return "Checking your balance…";
  if (stage.kind === "signing")
    return stage.of > 1 ? `Step ${stage.step} of ${stage.of}: ${stage.label.toLowerCase()} in your wallet.` : "Confirm the payment in your wallet.";
  return `Step ${stage.step} of ${stage.of} sent. Waiting for the network before the next step…`;
};

/** Opens this page inside a mobile wallet's browser, where the wallet is injected. */
export function walletBrowserLinks(href: string): { name: string; url: string }[] {
  const noScheme = href.replace(/^https?:\/\//, "");
  return [
    { name: "MetaMask", url: `https://metamask.app.link/dapp/${noScheme}` },
    {
      name: "Coinbase Wallet",
      url: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(href)}`,
    },
  ];
}

export const CryptoCheckout = ({ sku, priceUsd, discount, onSuccess, onProcessingChange, provider }: CryptoCheckoutProps) => {
  const key = skuKey(sku);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [config, setConfig] = useState<CryptoPayConfig | null>(null);
  const [order, setOrder] = useState<CryptoPayOrder | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [token, setToken] = useState<CryptoPayToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read on first render: this component only renders in the browser (WebPayment loads with ssr: false).
  const [pending, setPending] = useState<PendingPayment | null>(() => loadPending(key));
  const [manual, setManual] = useState(false);
  const [txInput, setTxInput] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [eth] = useState<Eip1193 | null>(() => (provider !== undefined ? provider : getInjectedProvider()));
  const [href] = useState(() => (typeof window === "undefined" ? "" : window.location.href));
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const processing = phase.kind === "paying" || phase.kind === "confirming" || phase.kind === "creating";
  const processingRef = useRef(onProcessingChange);
  useEffect(() => {
    processingRef.current = onProcessingChange;
  });
  useEffect(() => {
    processingRef.current?.(processing);
  }, [processing]);
  useEffect(() => () => processingRef.current?.(false), []);

  useEffect(() => {
    let live = true;
    CRYPTO_PAY_API.config()
      .then((cfg) => {
        if (!live) return;
        setConfig(cfg);
        if (!cfg.enabled || !cfg.chains.length) {
          setPhase({
            kind: "closed",
            reason: "Crypto checkout is not open yet. Card payment works now.",
          });
          return;
        }
        setChainId(cfg.chains[0].chainId);
        setToken(cfg.chains[0].tokens[0]?.token ?? "USDC");
        setPhase({ kind: "pick" });
      })
      .catch(() => {
        if (live)
          setPhase({
            kind: "closed",
            reason: "Crypto checkout could not load. Card payment still works.",
          });
      });
    return () => {
      live = false;
    };
  }, []);

  // The order countdown.
  const ticking = !!order && (phase.kind === "order" || phase.kind === "paying");
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  const left = order ? secondsLeft(order, now) : 0;
  // An unpaid order past its time is expired (derived, so no extra render pass).
  const expired = phase.kind === "expired" || (!!order && phase.kind === "order" && left === 0);
  // Too little time left to start a wallet payment: offer a new order instead.
  const closing = !!order && phase.kind === "order" && left > 0 && left < MIN_SECONDS_TO_PAY;

  // The quote before an order uses the server's list price when the config names it (a client copy
  // can differ: the Legendary pack card says $400, the server charges $350). A discounted price comes
  // from the caller, which applied the code to the server price already.
  const quoteUsd = discount ? priceUsd : serverPriceUsd(sku, config) ?? priceUsd;

  const accepted = useMemo(() => order?.accepted ?? [], [order]);
  const option: CryptoPayOption | null = order ? pickOption(accepted, chainId, token) : null;

  // Before the order: networks and coins from the config. After: the order's accepted options.
  const networks = useMemo(() => {
    if (order)
      return networkChoices(accepted).map((n) => ({
        chainId: n.chainId,
        name: n.name,
        testnet: n.testnet,
        tokens: n.options.map((o) => o.token),
      }));
    return (config?.chains || []).map((c) => ({
      chainId: c.chainId,
      name: c.name,
      testnet: c.testnet,
      tokens: c.tokens.map((t) => t.token),
    }));
  }, [order, accepted, config]);
  const network = networks.find((n) => n.chainId === chainId) || networks[0] || null;
  const tokensHere = network?.tokens || configTokens(config);

  const symbolOf = (t: CryptoPayToken) => {
    if (option && option.token === t) return option.symbol;
    const chain = config?.chains.find((c) => c.chainId === network?.chainId);
    return chain?.tokens.find((x) => x.token === t)?.symbol || t;
  };

  const selectNetwork = (id: number) => {
    setChainId(id);
    const n = networks.find((x) => x.chainId === id);
    if (n && token && !n.tokens.includes(token)) setToken(n.tokens[0] || null);
    setError(null);
  };

  const createOrder = useCallback(async () => {
    setError(null);
    setPhase({ kind: "creating" });
    try {
      const created = await CRYPTO_PAY_API.createOrder(sku, sku.kind === "PACK" ? discount : undefined);
      if (!alive.current) return;
      if (!created.accepted?.length) {
        setPhase({
          kind: "closed",
          reason: "No network can take this payment right now. Card payment still works.",
        });
        return;
      }
      setOrder(created);
      setNow(Date.now());
      const keep = pickOption(created.accepted, chainId, token);
      if (keep) {
        setChainId(keep.chainId);
        setToken(keep.token);
      }
      setPhase({ kind: "order" });
    } catch (err) {
      if (!alive.current) return;
      setError(errorMessage(err));
      setPhase({ kind: "pick" });
    }
  }, [sku, discount, chainId, token]);

  const settle = useCallback(
    async (orderId: string, payChainId: number, txHash: string) => {
      setError(null);
      setPhase({
        kind: "confirming",
        txHash,
        chainId: payChainId,
        progress: null,
      });
      try {
        const result = await confirmUntilSettled({
          orderId,
          chainId: payChainId,
          txHash,
          cancelled: () => !alive.current,
          onProgress: (progress) => {
            if (alive.current)
              setPhase({
                kind: "confirming",
                txHash,
                chainId: payChainId,
                progress,
              });
          },
        });
        if (!alive.current) return;
        clearPending(orderId);
        setPending(null);
        setPhase({ kind: "done", result, txHash, chainId: payChainId });
        if (result.status === "COMPLETE" && !result.replay) {
          onSuccess?.({
            success: !!result.success,
            message: result.message || "Payment confirmed",
            cat: result.cat as IMessage["cat"],
          });
        }
      } catch (err) {
        if (!alive.current) return;
        if (err instanceof CryptoPayApiError && err.code === "CRYPTO_PAY_EXPIRED") {
          clearPending(orderId);
          setPending(null);
          setError(
            `This order closed before the payment arrived. If coins were sent, they are recorded for a refund to the sending wallet; write to support with order ${orderId}.`
          );
          setPhase({ kind: "expired" });
          return;
        }
        const refused = err instanceof CryptoPayApiError && err.status >= 400 && err.status < 500 && err.status !== 429;
        if (refused) {
          clearPending(orderId);
          setPending(null);
        }
        setError(errorMessage(err));
        setPhase(order ? { kind: "order" } : { kind: "pick" });
      }
    },
    [onSuccess, order]
  );

  const payWithWallet = async () => {
    if (!order || !option || !eth) return;
    if (secondsLeft(order) < MIN_SECONDS_TO_PAY) {
      setError("This order closes too soon for a payment to arrive in time. Start a new order; nothing was sent.");
      return;
    }
    setError(null);
    try {
      const { txHash } = await sendFromWallet(eth, option, (stage) => alive.current && setPhase({ kind: "paying", stage }));
      const saved = pendingPayment(order.orderId, key, option.chainId, txHash);
      savePending(saved);
      setPending(saved);
      await settle(order.orderId, option.chainId, txHash);
    } catch (err) {
      if (!alive.current) return;
      setError(errorMessage(err));
      setPhase(secondsLeft(order) > 0 ? { kind: "order" } : { kind: "expired" });
    }
  };

  const confirmManual = async () => {
    if (!order || !option) return;
    const hash = txInput.trim();
    if (!isTxHash(hash)) {
      setError("That does not look like a transaction hash (0x followed by 64 characters).");
      return;
    }
    const saved = pendingPayment(order.orderId, key, option.chainId, hash);
    savePending(saved);
    setPending(saved);
    await settle(order.orderId, option.chainId, hash);
  };

  const resume = async () => {
    if (!pending) return;
    try {
      const restored = await CRYPTO_PAY_API.getOrder(pending.orderId);
      if (alive.current) {
        setOrder(restored);
        setChainId(pending.chainId);
        const opt = restored.accepted.find((o) => o.chainId === pending.chainId);
        if (opt) setToken(opt.token);
      }
    } catch {
      // The confirm below reports what is wrong.
    }
    await settle(pending.orderId, pending.chainId, pending.txHash);
  };

  const restart = () => {
    setOrder(null);
    setTxInput("");
    setError(null);
    setPhase(config?.enabled ? { kind: "pick" } : { kind: "loading" });
  };

  // ------------------------------------------------------------------ views

  if (phase.kind === "loading") {
    return (
      <div role="status" className="mx-auto w-[95%] max-w-[440px] text-center font-primary text-p5 text-tt-cream">
        Loading crypto checkout…
      </div>
    );
  }

  if (phase.kind === "closed") {
    return (
      <div
        role="status"
        data-testid="crypto-pay-closed"
        className="mx-auto w-[95%] max-w-[440px] rounded-lg border-2 border-tt-gold-500 bg-tt-night-800/95 px-3 py-2 text-center font-primary text-p6 md:text-p5 text-tt-cream"
      >
        {phase.reason}
      </div>
    );
  }

  if (phase.kind === "done") {
    const opt = accepted.find((o) => o.chainId === phase.chainId && (!order?.payment || o.token === order.payment.token)) || option;
    const granted = phase.result.status === "COMPLETE" && phase.result.success !== false;
    const link = opt ? explorerTxUrl(opt.explorer, phase.txHash) : "";
    return (
      <section data-testid="crypto-pay-receipt" aria-labelledby="crypto-receipt-title" className={clsx(BOX, "mx-auto w-[95%] max-w-[440px]")}>
        <h3 id="crypto-receipt-title" className={clsx("font-primary text-h6 uppercase", granted ? "text-tt-mint" : "text-tt-rust")}>
          {granted ? "Payment confirmed" : "Paid, not delivered"}
        </h3>
        <p className={clsx(NOTE, "mt-1")}>
          {granted
            ? phase.result.replay
              ? "This payment was already confirmed. Your item is in your collection."
              : phase.result.message || "Your item is in your collection."
            : `Your payment arrived, but the item could not be added (${
                phase.result.message || "no item left"
              }). A refund is due to the sending wallet; write to support with the order ID below.`}
        </p>
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 font-sans text-p5">
          <dt className="text-tt-muted">Order</dt>
          <dd className="break-all text-tt-cream">{order?.orderId || pending?.orderId}</dd>
          {order && (
            <>
              <dt className="text-tt-muted">Item</dt>
              <dd className="text-tt-cream">{itemName(order)}</dd>
              <dt className="text-tt-muted">Price</dt>
              <dd className="text-tt-cream">${order.priceUsd.toFixed(2)}</dd>
            </>
          )}
          {opt && (
            <>
              <dt className="text-tt-muted">Paid</dt>
              <dd className="text-tt-cream">
                {opt.amountDisplay} {opt.symbol}
              </dd>
              <dt className="text-tt-muted">Network</dt>
              <dd className="text-tt-cream">{opt.chainName}</dd>
            </>
          )}
          <dt className="text-tt-muted">Transaction</dt>
          <dd className="break-all text-tt-cream">
            {link ? (
              <a className={LINK} href={link} target="_blank" rel="noreferrer">
                {shortHex(phase.txHash, 10, 8)}
                <span className="sr-only"> (opens the network&apos;s explorer)</span>
              </a>
            ) : (
              shortHex(phase.txHash, 10, 8)
            )}
          </dd>
        </dl>
      </section>
    );
  }

  const busy = phase.kind === "creating" || phase.kind === "paying" || phase.kind === "confirming";
  const uri = option ? paymentUri(option) : null;
  // The browser-wallet panel (else the QR / pasted-hash panel, or "needs a wallet").
  const walletView = !!eth && (!manual || !uri);
  const testnet = config?.network === "testnet";

  return (
    <section data-testid="crypto-checkout" aria-label="Pay with crypto" className={clsx(BOX, "mx-auto flex w-[95%] max-w-[440px] flex-col gap-4")}>
      {testnet && (
        <p className="self-start rounded-lg border-2 border-tt-sky/70 bg-tt-sky/10 px-2 py-0.5 font-primary text-p6 uppercase tracking-wide text-tt-sky">
          Test network: test coins only
        </p>
      )}

      {pending && phase.kind !== "confirming" && (
        <div data-testid="crypto-pay-resume" className="flex flex-col gap-2 rounded-xl border-2 border-tt-gold-400 bg-tt-night-950/60 p-3">
          <p className={NOTE}>A payment you sent for this item is not confirmed yet ({shortHex(pending.txHash, 8, 6)}).</p>
          <PixelButton size="sm" text="CHECK AGAIN" onClick={() => void resume()} disabled={busy} />
        </div>
      )}

      <Choices
        legend="Network"
        name="crypto-pay-network"
        value={network?.chainId ?? null}
        disabled={busy}
        items={networks.map((n) => ({ value: n.chainId, label: <NetworkLabel chainId={n.chainId} name={n.name} testnet={n.testnet} /> }))}
        onChange={selectNetwork}
      />
      <Choices
        legend="Pay in"
        name="crypto-pay-coin"
        value={token}
        disabled={busy}
        // Symbols keep their case ("USDC.e", "pathUSD"), unlike the uppercase network names.
        items={tokensHere.map((t) => ({ value: t, label: <TokenLabel symbol={symbolOf(t)} /> }))}
        onChange={(t) => {
          setToken(t);
          setError(null);
        }}
      />

      {!order ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className={LABEL}>You pay about</span>
            <span data-testid="crypto-pay-quote" className="whitespace-nowrap font-primary text-h6 md:text-h5 text-tt-gold-400">
              {token ? `${quoteAmount(quoteUsd, token, config)} ${symbolOf(token)}` : `$${quoteUsd.toFixed(2)}`}
            </span>
          </div>
          {token === "EURC" && eurcNote(config) && (
            <p data-testid="crypto-pay-eurc-note" className={NOTE}>
              {eurcNote(config)}
            </p>
          )}
          <div className="flex justify-center">
            <PixelButton text={phase.kind === "creating" ? "PREPARING…" : "CONTINUE"} busy={phase.kind === "creating"} onClick={() => void createOrder()} />
          </div>
        </>
      ) : expired ? (
        <div data-testid="crypto-pay-expired" className="flex flex-col items-center gap-2 text-center">
          <p className={NOTE}>This order expired. Nothing more is needed if you did not send anything.</p>
          <PixelButton text="START A NEW ORDER" onClick={restart} />
        </div>
      ) : (
        option && (
          <>
            <div className="flex flex-col gap-2">
              <div data-testid="crypto-pay-summary" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-primary text-p5 uppercase tracking-wide text-tt-cream">
                <NetworkLabel chainId={option.chainId} name={option.chainName} testnet={network?.testnet} />
                <span aria-hidden="true" className="text-tt-cream/50">·</span>
                <TokenLabel symbol={option.symbol} />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className={LABEL}>Send exactly</span>
                <span className="font-primary text-p6 uppercase text-tt-muted" aria-live="off">
                  Order closes in <span data-testid="crypto-pay-countdown">{mmss(left)}</span>
                </span>
              </div>
              <CopyRow
                label="Amount"
                value={option.amountDisplay}
                testId="crypto-pay-amount"
                display={
                  // Long amounts (350.004173) step down a size and may wrap before the symbol, so the
                  // figure never runs under the COPY button.
                  <span
                    className={clsx(
                      "break-normal font-primary text-tt-gold-400",
                      option.amountDisplay.length > 8 ? "text-p3 md:text-h6" : "text-h6 md:text-h5"
                    )}
                  >
                    <span className="whitespace-nowrap">{option.amountDisplay}</span> <span className="whitespace-nowrap">{option.symbol}</span>
                  </span>
                }
              />
              <p className={NOTE}>
                {option.binding === "amount"
                  ? `On ${option.chainName}. The last digits tie the payment to this order, so a different amount can't be matched.`
                  : `On ${option.chainName}. Your wallet adds this order's note to the payment.`}
                {Math.abs(order.priceUsd - quoteUsd) >= 0.005 && ` Order price: $${order.priceUsd.toFixed(2)}.`}
              </p>
              {option.binding === "amount" && (
                <p data-testid="crypto-pay-own-wallet" className={clsx(NOTE, "text-tt-cream/75")}>
                  Send from your own wallet. Exchange withdrawals that take a fee will not match.
                </p>
              )}
            </div>

            {closing && (
              <div data-testid="crypto-pay-closing" className="flex flex-col items-center gap-2 text-center">
                <p className={NOTE}>
                  This order closes in under 2 minutes, too soon to start a payment.
                  {walletView ? "" : " Already sent one? Paste its transaction hash below."}
                </p>
                <PixelButton text="START A NEW ORDER" onClick={restart} />
              </div>
            )}

            {walletView ? (
              closing ? null : (
                <div className="flex flex-col items-center gap-2">
                  <PixelButton
                    text={phase.kind === "paying" ? "IN YOUR WALLET…" : option.steps.length > 1 ? "APPROVE AND PAY" : "PAY WITH WALLET"}
                    busy={busy}
                    onClick={() => void payWithWallet()}
                  />
                  {uri && (
                    <button type="button" className={clsx(LINK, "font-sans text-p5 text-tt-cream/85")} onClick={() => setManual(true)} disabled={busy}>
                      Pay from another device (QR)
                    </button>
                  )}
                </div>
              )
            ) : uri ? (
              <div data-testid="crypto-pay-manual" className="flex flex-col gap-3">
                <div className="flex justify-center">
                  <PaymentQr value={uri} label={`QR code: send ${option.amountDisplay} ${option.symbol} on ${option.chainName}`} />
                </div>
                <CopyRow label="To address" value={option.recipient} testId="crypto-pay-recipient" />
                <CopyRow label={`${option.symbol} contract`} value={option.tokenAddress} display={shortHex(option.tokenAddress, 10, 8)} />
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-sans text-p5">
                  <a className={LINK} href={uri}>
                    Open in a wallet app
                  </a>
                  {!eth &&
                    href &&
                    walletBrowserLinks(href).map((w) => (
                      <a key={w.name} className={LINK} href={w.url} rel="noreferrer">
                        Open in {w.name}
                      </a>
                    ))}
                  {eth && (
                    <button type="button" className={LINK} onClick={() => setManual(false)}>
                      Pay with this browser&apos;s wallet
                    </button>
                  )}
                </div>
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>After sending, paste the transaction hash</span>
                  <input
                    value={txInput}
                    onChange={(e) => setTxInput(e.target.value.slice(0, 80))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void confirmManual();
                      }
                    }}
                    disabled={busy}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="0x…"
                    className="min-h-11 w-full rounded-full border-2 border-tt-gold-500 bg-tt-night-900 px-3 font-sans text-p5 text-tt-cream placeholder:text-tt-muted outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
                  />
                </label>
                <div className="flex justify-center">
                  <PixelButton text="CHECK PAYMENT" busy={busy} disabled={!txInput.trim()} onClick={() => void confirmManual()} />
                </div>
              </div>
            ) : (
              <div data-testid="crypto-pay-needs-wallet" className="flex flex-col gap-2">
                <p className={NOTE}>
                  Paying on {option.chainName} needs a browser wallet, because the payment carries this order&apos;s note. Open this page in a wallet&apos;s
                  browser, or choose another network to pay by QR.
                </p>
                {href && (
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-sans text-p5">
                    {walletBrowserLinks(href).map((w) => (
                      <a key={w.name} className={LINK} href={w.url} rel="noreferrer">
                        Open in {w.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}

      {(phase.kind === "paying" || phase.kind === "confirming") && (
        <div
          role="status"
          aria-live="polite"
          data-testid="crypto-pay-status"
          className="flex items-start gap-2 rounded-xl border-2 border-tt-sky/60 bg-tt-night-950/60 p-3"
        >
          <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full bg-tt-sky motion-reduce:animate-none" />
          <p className={NOTE}>
            {phase.kind === "paying"
              ? stageText(phase.stage)
              : phase.progress && phase.progress.required
              ? `Payment sent. Confirming on the network: ${Math.min(phase.progress.confirmations, phase.progress.required)} of ${
                  phase.progress.required
                } blocks.`
              : "Payment sent. Waiting for the network to include it…"}
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          data-testid="crypto-pay-error"
          className="rounded-xl border-2 border-tt-rust bg-tt-night-950/70 px-3 py-2 font-sans text-p5 text-tt-cream"
        >
          {error}
        </p>
      )}
    </section>
  );
};

function itemName(order: CryptoPayOrder): string {
  const { sku } = order;
  if (sku.kind === "PACK") return `${sku.packType} pack`;
  if (sku.kind === "CAT") return `${sku.name || "Shelter cat"} (basic tier)`;
  return "Loot box";
}

export default CryptoCheckout;
